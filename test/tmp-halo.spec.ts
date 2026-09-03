import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { runEngine } from '#/kb/engine/engine.js';
import { buildRenderContract } from '#/kb/render/contract.js';
import { contactOcclusion, lightSpill, integrate, applySpill } from '#/kb/render/integrate.js';
import type { JobInput } from '#/kb/domain/spec.js';
const OUT = process.env.SHOT_DIR!;
const TAG = process.env.TAG ?? 'x';

describe('halo look', () => {
  it('renders', async () => {
    const base = JSON.parse(readFileSync('examples/fedex-backer.json', 'utf8')) as JobInput;
    const job: JobInput = { ...base, form: { ...base.form, backerPanelOption: 'No Backer', installationMethod: 'Direct Mounted with Spacers' } };
    const { spec } = await runEngine(job);
    spec.renderContract = buildRenderContract(spec);
    const bundle = await build({ entryPoints: ['src/kb/render/browser-entry.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent' });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const layers = await page.evaluate(
      ([s, o]) => (window as never as { __renderLayers: (a: unknown, b: unknown) => Promise<{ sign: string; background: string }> }).__renderLayers(s, o),
      [spec, { width: 1200, height: 750, view: 'night', camera: 'detail-perspective' }] as const,
    );
    const sign = PNG.sync.read(Buffer.from(layers.sign.split(',')[1]!, 'base64'));
    const ground = PNG.sync.read(Buffer.from(layers.background.split(',')[1]!, 'base64'));
    const alpha = new Uint8Array(sign.width * sign.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = sign.data[i * 4 + 3]!;
    const radius = Math.max(3, Math.min(48, (sign.width / 90) * 5 * 0.35));
    const seated = integrate(new Uint8ClampedArray(ground.data), new Uint8ClampedArray(sign.data), sign.width, sign.height,
      { occlusion: contactOcclusion(alpha, sign.width, sign.height, radius, 0.28) });
    const merged = applySpill(seated, sign.width, sign.height, lightSpill(sign.data, sign.width, sign.height,
      { tight: Math.max(4, radius * 0.4), wide: Math.max(12, radius * 1.8), strength: 0.45 }), alpha);
    const out = new PNG({ width: sign.width, height: sign.height });
    out.data = Buffer.from(merged);
    writeFileSync(`${OUT}/halo-${TAG}.png`, PNG.sync.write(out));
    console.log('WROTE', TAG);
    await browser.close();
  }, 180_000);
});
