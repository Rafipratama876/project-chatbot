import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SignSpec } from '#/kb/domain/spec.js';
import type { RenderedPanel } from '#/kb/render/browser-entry.js';
import { verifyContract, buildRenderContract } from '#/kb/render/contract.js';
import { EnhanceService } from '#/modules/enhance/enhance.service.js';

export interface RenderedProofPanel {
  label: string;
  view: 'day' | 'night';
  camera: string;
  file: string;
  /** Inline copy, so a proof sheet is one self-contained file. */
  dataUrl?: string;
  /** Set when the panel could not use the customer's photograph, saying why. */
  note?: string | null;
  /**
   * The generative pass over this panel's neutral ground, when it ran.
   *
   * `file` above is always the deterministic render — the source of truth, the
   * thing the shop builds from. This is a presentation layer stored beside it,
   * never instead of it, so a model that produces something odd cannot lose
   * the design.
   */
  enhanced?: {
    file: string;
    dataUrl?: string;
    /** Plain language for §9.4 — what was altered, and what was not. */
    reason: string;
  } | null;
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

  constructor(
    private readonly config: ConfigService,
    private readonly enhance: EnhanceService,
  ) {}

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
        const base = Buffer.from(p.dataUrl.split(',')[1]!, 'base64');
        await fs.writeFile(file, base);

        const panel: RenderedProofPanel = {
          label: p.label, view: p.view, camera: p.camera, file,
          dataUrl: p.dataUrl, note: p.note ?? null, enhanced: null,
        };

        if (this.enhance.enabled) {
          const coverageUrl = p.protection?.coverageUrl ?? null;
          const outcome = await this.enhance.enhance({
            base,
            renderedCoverage: coverageUrl
              ? Buffer.from(coverageUrl.split(',')[1]!, 'base64')
              : null,
            onPhotograph: p.protection?.onPhotograph ?? false,
            view: p.view,
            spec,
          });
          if (outcome.applied) {
            const enhancedFile = path.join(
              outDir, `${spec.jobId}-${p.view}-${p.camera}-enhanced.png`,
            );
            await fs.writeFile(enhancedFile, outcome.png);
            panel.enhanced = {
              file: enhancedFile,
              dataUrl: `data:image/png;base64,${outcome.png.toString('base64')}`,
              reason: outcome.reason,
            };
          }
        }

        out.push(panel);
      }

      // An illustrative concept scene, when one is switched on. Deliberately
      // added after the contract check below has nothing to say about it: it
      // is not a proof panel, carries no dimensions, and never appears on the
      // sheet a customer signs.
      if (this.enhance.enabled) {
        const scene = await this.conceptScene(page, spec, outDir);
        if (scene) out.push(scene);
      }

      // §9.1: an illuminated sign needs both views. A renderer that quietly
      // produced one would ship a proof missing half its evidence.
      for (const view of contract.views) {
        // `camera !== 'concept'`: a concept scene carries a view but is not
        // evidence of one. Counting it would let a proof ship with an
        // illustration standing in for the panel §9.1 actually requires.
        if (!out.some((p) => p.view === view && p.camera !== 'concept')) {
          throw new Error(`§9.1 requires a ${view} view and none was produced`);
        }
      }

      this.logger.log(`${spec.jobId}: ${out.length} panel(s) → ${outDir}`);
      return out;
    } finally {
      await page.close();
    }
  }

  /**
   * The sign rendered alone, laid over a generated setting.
   *
   * The sign never goes to the model — it is rendered here and composited
   * afterwards, then checked pixel for pixel. That is what makes it impossible
   * for the result to contain a logo the model invented.
   */
  private async conceptScene(
    page: Page,
    spec: SignSpec,
    outDir: string,
  ): Promise<RenderedProofPanel | null> {
    // 1536 x 1024 is what the image endpoint produces, so the setting arrives
    // at exactly this size and never has to be resampled into place.
    const width = 1536;
    const height = 1024;
    const view: 'day' | 'night' = spec.renderContract?.views.includes('night') ? 'night' : 'day';

    try {
      const layerUrl = (await page.evaluate(
        ([s, o]) => (window as unknown as {
          __renderSignLayer: (spec: unknown, opts: unknown) => Promise<string>;
        }).__renderSignLayer(s, o),
        [spec, { width, height, view }] as const,
      )) as string;

      const result = await this.enhance.conceptScene({
        signLayer: Buffer.from(layerUrl.split(',')[1]!, 'base64'),
        view,
        spec,
        surface: spec.mountingSurface?.colour,
      });
      if (!result.png) return null;

      const file = path.join(outDir, `${spec.jobId}-concept-${view}.png`);
      await fs.writeFile(file, result.png);
      return {
        label: 'CONCEPT',
        view,
        camera: 'concept',
        file,
        dataUrl: `data:image/png;base64,${result.png.toString('base64')}`,
        note: result.reason,
        enhanced: null,
      };
    } catch (error) {
      // Never fatal. A concept scene is a sales picture; the proof does not
      // depend on it and must not fail with it.
      this.logger.warn(
        `concept scene skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
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
