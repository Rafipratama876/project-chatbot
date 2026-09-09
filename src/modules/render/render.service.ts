import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SignSpec } from '#/kb/domain/spec.js';
import type { RenderedPanel } from '#/kb/render/browser-entry.js';
import { verifyContract, buildRenderContract, type RenderContract } from '#/kb/render/contract.js';
import { EnhanceService } from '#/modules/enhance/enhance.service.js';
import { mapWithConcurrency, Semaphore } from './concurrency.js';

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
  /**
   * Caps total `render()` calls in flight at once, across every caller —
   * Channel Letters' queue worker, Dimensional Letters' and Sign Cabinets'
   * own queues. One shared `Browser` (software-rendered, see `headlessArgs`
   * in render.config.ts) means one product's burst can starve another's if
   * nothing bounds the total; each queue's own concurrency only bounds
   * itself. See `render.globalConcurrency`'s own doc comment.
   */
  private readonly renderGate: Semaphore;

  constructor(
    private readonly config: ConfigService,
    private readonly enhance: EnhanceService,
  ) {
    this.renderGate = new Semaphore(this.config.get<number>('render.globalConcurrency') ?? 2);
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async render(
    spec: SignSpec,
    outDir: string,
    /**
     * `conceptScene`: on by default — Channel Letters' own review page is the
     * only place one is ever shown (`conceptImageUrl` in
     * `modules/designs/dto.ts`), and every existing caller of `render()`
     * that doesn't pass this option keeps generating it exactly as before.
     * Dimensional Letters and Sign Cabinets pass `false` explicitly from
     * their own graphs: neither review page nor DTO ever surfaces a
     * `camera === 'concept'` panel (DL: none at all; SC: filters it out on
     * purpose), so paying its own ~30-40s generative pass on every one of
     * their jobs bought nothing anyone ever saw.
     */
    options: { conceptScene?: boolean } = {},
  ): Promise<RenderedProofPanel[]> {
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

    // Acquired before touching the browser at all: a caller waiting for a
    // slot must not hold an open Chromium page while it waits — that would
    // spend the exact resource the gate exists to ration.
    const release = await this.renderGate.acquire();
    try {
      return await this.renderInner(spec, outDir, contract, width, height, options);
    } finally {
      release();
    }
  }

  private async renderInner(
    spec: SignSpec,
    outDir: string,
    contract: RenderContract,
    width: number,
    height: number,
    options: { conceptScene?: boolean },
  ): Promise<RenderedProofPanel[]> {
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

      // The layered night path renders its own layers through THIS page
      // (`this.layeredNight` below calls `page.evaluate` again) — one
      // Playwright page is one WebGL context, so two of those can never run
      // at once against it. Every other panel — every day panel, and a night
      // panel too when `ENHANCE_NIGHT_MODE` is not `layered` — never touches
      // the page again after the batch render above: writing its file and
      // asking `EnhanceService.enhance` to redraw its ground is plain
      // Buffer/network work with nothing shared to race on, so those can run
      // several at once. Partitioned once here rather than decided inline
      // per panel so which panels are safe to overlap is one visible list,
      // not a fact buried in a shared `for` loop.
      const isLayeredNightPanel = (p: RenderedPanel): boolean =>
        this.enhance.enabled
        && this.enhance.nightMode === 'layered'
        && p.view === 'night'
        && !(p.protection?.onPhotograph ?? false);

      const buildPanel = async (p: RenderedPanel): Promise<RenderedProofPanel> => {
        const file = path.join(outDir, `${spec.jobId}-${p.view}-${p.camera}.png`);
        const base = Buffer.from(p.dataUrl.split(',')[1]!, 'base64');
        await fs.writeFile(file, base);

        const panel: RenderedProofPanel = {
          label: p.label, view: p.view, camera: p.camera, file,
          dataUrl: p.dataUrl, note: p.note ?? null, enhanced: null,
        };

        // 'perspective' is rendered for completeness but is not a panel any
        // reviewer is ever shown: `preferredPanel` (kb/render/panelPlan.ts)
        // and every review page/proof sheet's own copy of it always prefer
        // 'front-elevation' (day) or 'detail-perspective' (night), falling
        // back to 'perspective' only if the preferred camera is entirely
        // absent from the proof — something `panelsFor` (kb/render/views.ts)
        // never lets happen, since it always requests all three cameras for
        // a required view. Confirmed by grep: no other file in this
        // codebase selects camera === 'perspective'. Spending a ~60s
        // generative pass — the dominant cost of a layered night panel, or
        // real OpenAI cost either way — on an image nothing ever displays
        // is pure waste, so it is skipped here and only its deterministic
        // render is kept, exactly like a panel enhance already skips for
        // (rate limited, too little editable area, enhance disabled): the
        // fallback to the plain render (`panel.enhanced?.file ?? panel.file`
        // in every DTO that serves one) is not a new code path.
        if (p.camera === 'perspective') return panel;

        if (isLayeredNightPanel(p)) {
          const outcome = await this.layeredNight(page, spec, p.camera, outDir, p.view);
          if (outcome) panel.enhanced = outcome;
        } else if (this.enhance.enabled) {
          const coverageUrl = p.protection?.coverageUrl ?? null;
          const logoCoverageUrl = p.protection?.logoCoverageUrl ?? null;
          const outcome = await this.enhance.enhance({
            base,
            renderedCoverage: coverageUrl
              ? Buffer.from(coverageUrl.split(',')[1]!, 'base64')
              : null,
            logoCoverage: logoCoverageUrl
              ? Buffer.from(logoCoverageUrl.split(',')[1]!, 'base64')
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

        return panel;
      };

      const layeredNightPanels = panels.filter(isLayeredNightPanel);
      const independentPanels = panels.filter((p) => !isLayeredNightPanel(p));

      // Page-bound panels, exactly as before: one at a time.
      const layeredResults: RenderedProofPanel[] = [];
      for (const p of layeredNightPanels) layeredResults.push(await buildPanel(p));

      // Everything else, bounded — see `mapWithConcurrency`'s own comment for
      // why bounded and why a plain helper rather than RxJS.
      const concurrency = this.config.get<number>('render.panelEnhanceConcurrency') ?? 2;
      const independentResults = await mapWithConcurrency(independentPanels, concurrency, buildPanel);

      // Order doesn't matter downstream: every consumer looks a panel up by
      // its `view`/`camera` (`preferredPanel` in kb/render/panelPlan.ts, the
      // review pages' own `pickPanel`s), never by position in this array.
      const out: RenderedProofPanel[] = [...layeredResults, ...independentResults];

      // An illustrative concept scene, when one is switched on AND the caller
      // actually wants one — see this method's own `conceptScene` option
      // doc-comment. Deliberately added after the contract check below has
      // nothing to say about it: it is not a proof panel, carries no
      // dimensions, and never appears on the sheet a customer signs.
      if (this.enhance.enabled && (options.conceptScene ?? true)) {
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
  /**
   * A night panel built from three layers instead of one image.
   *
   * Renders the sign and the wall separately through the same camera, sends
   * only the wall away, composites here and verifies the sign afterwards. A
   * failure at any step returns null and the deterministic panel stands — a
   * presentation layer is never allowed to cost a proof its evidence.
   */
  private async layeredNight(
    page: Page,
    spec: SignSpec,
    camera: string,
    outDir: string,
    view: 'day' | 'night',
  ): Promise<RenderedProofPanel['enhanced']> {
    const width = this.config.get<number>('render.width') ?? 1600;
    const height = this.config.get<number>('render.height') ?? 1000;

    try {
      const layers = (await page.evaluate(
        ([s, o]) => (window as unknown as {
          __renderLayers: (spec: unknown, opts: unknown) => Promise<{ sign: string; background: string; halo: string | null; lettersMask: string; backer: string | null }>;
        }).__renderLayers(s, o),
        [spec, { width, height, view, camera }] as const,
      )) as { sign: string; background: string; halo: string | null; lettersMask: string; backer: string | null };

      const result = await this.enhance.layeredNight({
        signLayer: Buffer.from(layers.sign.split(',')[1]!, 'base64'),
        background: Buffer.from(layers.background.split(',')[1]!, 'base64'),
        haloGlow: layers.halo ? Buffer.from(layers.halo.split(',')[1]!, 'base64') : null,
        lettersMask: Buffer.from(layers.lettersMask.split(',')[1]!, 'base64'),
        backerLayer: layers.backer ? Buffer.from(layers.backer.split(',')[1]!, 'base64') : null,
        view,
        spec,
        // The second render: the same sign under the light measured off the
        // finished wall, so the two layers agree about where the light is.
        relight: async (illuminant) => {
          const relit = (await page.evaluate(
            ([s, o]) => (window as unknown as {
              __renderLayers: (spec: unknown, opts: unknown) => Promise<{ sign: string }>;
            }).__renderLayers(s, o),
            [spec, { width, height, view, camera, illuminant, signOnly: true }] as const,
          )) as { sign: string };
          return Buffer.from(relit.sign.split(',')[1]!, 'base64');
        },
      });
      if (!result.png) return null;

      const file = path.join(outDir, `${spec.jobId}-${view}-${camera}-layered.png`);
      await fs.writeFile(file, result.png);
      return {
        file,
        dataUrl: `data:image/png;base64,${result.png.toString('base64')}`,
        reason: result.reason,
      };
    } catch (error) {
      this.logger.warn(
        `layered night skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

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
