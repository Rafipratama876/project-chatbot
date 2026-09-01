import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SignSpec } from '#/kb/domain/spec.js';
import type { RenderedPanel } from '#/kb/render/browser-entry.js';
import { verifyContract, buildRenderContract } from '#/kb/render/contract.js';

export interface RenderedProofPanel {
  label: string;
  view: 'day' | 'night';
  camera: string;
  file: string;
  /** Inline copy, so a proof sheet is one self-contained file. */
  dataUrl?: string;
  /** Set when the panel could not use the customer's photograph, saying why. */
  note?: string | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_ENTRY = path.resolve(here, '../../kb/render/browser-entry.ts');

/**
 * Headless three.js capture.
 *
 * The browser and the bundle are built once and reused. Chromium launch is
 * ~300 ms and the esbuild pass ~1 s; paying both per proof would dominate the
 * render itself.
 *
 * The bundle is compiled from the same TypeScript the Node side imports, so the
 * scene in the PNG is built by the identical code path `test/render.spec.ts`
 * asserts against. A renderer that drifts from its own contract test is exactly
 * the failure this architecture is meant to rule out.
 */
@Injectable()
export class RenderService implements OnModuleDestroy {
  private readonly logger = new Logger(RenderService.name);
  private browser: Browser | null = null;
  private bundle: string | null = null;
  private bundling: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async render(spec: SignSpec, outDir: string): Promise<RenderedProofPanel[]> {
    // §9.2 is checked before a pixel is drawn. Rendering a spec that violates
    // its own contract produces a convincing picture of the wrong sign.
    const contract = spec.renderContract ?? buildRenderContract(spec);
    const violations = verifyContract(spec, contract);
    if (violations.length > 0) {
      throw new Error(
        `spec violates its §9.2 render contract: ${violations.map((v) => `${v.requirement} — ${v.detail}`).join('; ')}`,
      );
    }

    const width = this.config.get<number>('render.width') ?? 1600;
    const height = this.config.get<number>('render.height') ?? 1000;

    const code = await this.getBundle();
    const browser = await this.getBrowser();
    const page = await browser.newPage({ viewport: { width, height } });

    try {
      await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0">');
      await page.addScriptTag({ content: code });

      const panels = (await page.evaluate(
        ([s, o]) => (window as unknown as {
          __renderSign: (spec: unknown, opts: unknown) => Promise<unknown>;
        }).__renderSign(s, o),
        [spec, { width, height }] as const,
      )) as RenderedPanel[];

      await fs.mkdir(outDir, { recursive: true });
      const out: RenderedProofPanel[] = [];
      for (const p of panels) {
        const file = path.join(outDir, `${spec.jobId}-${p.view}-${p.camera}.png`);
        await fs.writeFile(file, Buffer.from(p.dataUrl.split(',')[1]!, 'base64'));
        out.push({
          label: p.label, view: p.view, camera: p.camera, file,
          dataUrl: p.dataUrl, note: p.note ?? null,
        });
      }

      // §9.1: an illuminated sign needs both views. A renderer that quietly
      // produced one would ship a proof missing half its evidence.
      for (const view of contract.views) {
        if (!out.some((p) => p.view === view)) {
          throw new Error(`§9.1 requires a ${view} view and none was produced`);
        }
      }

      this.logger.log(`${spec.jobId}: ${out.length} panel(s) → ${outDir}`);
      return out;
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const args = this.config.get<string[]>('render.headlessArgs') ?? [];
    this.browser = await chromium.launch({ args });
    return this.browser;
  }

  private getBundle(): Promise<string> {
    if (this.bundle) return Promise.resolve(this.bundle);
    // Concurrent jobs on a cold worker must not each start their own esbuild.
    this.bundling ??= build({
      entryPoints: [BROWSER_ENTRY],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    }).then((result) => {
      this.bundle = result.outputFiles[0]!.text;
      this.bundling = null;
      return this.bundle;
    });
    return this.bundling;
  }
}
