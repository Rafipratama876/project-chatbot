import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { SignSpec } from '#/kb/domain/spec.js';
import {
  renderBoard, nightLabel, BOARD_WIDTH, BOARD_HEIGHT, BOARD_SELECTOR,
  type BoardPanelImage,
} from '#/kb/output/board.js';
import type { RenderedProofPanel } from './render.service.js';
import { AiRenderService, type ScenePanelKind } from './ai-render.service.js';
import { BoardRendererService } from './board-renderer.service.js';

export interface ScenePanel {
  kind: ScenePanelKind;
  /** Data URL of the delivered panel. */
  dataUrl: string;
  /** How it was produced. `render` means the AI stage was off or unavailable. */
  engine: 'ai' | 'render';
  /** Digest of the three.js capture behind it, for reuse across revisions. */
  seedHash: string;
  note?: string | null;
}

export interface BoardResult {
  /** The screenshotted board, as a data URL. */
  dataUrl: string;
  html: string;
  panels: ScenePanel[];
}

/**
 * Composes the board.
 *
 * The three.js panels are the canonical sign: they are rendered once per
 * validated spec and are the geometry every scene panel is edited from. The
 * model never sees the spec, only the render, so the sign in the picture is the
 * sign the rules produced.
 *
 * On a revision the two scene panels are cheap to keep: a panel whose seed has
 * not changed and whose look was not what the customer asked about is reused
 * byte for byte, so a wording change costs no image calls at all.
 */
@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);

  constructor(
    private readonly ai: AiRenderService,
    private readonly renderer: BoardRendererService,
  ) {}

  /** Digest of the three.js capture a scene panel was built from. */
  static seedHash(dataUrl: string): string {
    return createHash('sha256').update(dataUrl).digest('hex').slice(0, 16);
  }

  async compose(input: {
    spec: SignSpec;
    panels: RenderedProofPanel[];
    problems?: string[];
    /** Free-text revision intent. Applied to the scene panels only. */
    intent?: string | null;
    /** Panels from the previous version, reused when their seed is unchanged. */
    previous?: ScenePanel[];
    /** Which scene panels the revision actually affects. */
    regenerate?: ScenePanelKind[];
  }): Promise<BoardResult> {
    const seeds = this.seeds(input.spec, input.panels);
    const regenerate = new Set(input.regenerate ?? ['day', 'night']);

    const panels = await Promise.all(
      seeds.map((seed) => this.scenePanel(input.spec.jobId, seed, {
        intent: input.intent,
        previous: input.previous?.find((p) => p.kind === seed.kind),
        regenerate: regenerate.has(seed.kind),
      })),
    );

    const html = renderBoard({
      spec: input.spec,
      day: toBoardPanel(panels.find((p) => p.kind === 'day')),
      night: toBoardPanel(panels.find((p) => p.kind === 'night')),
      problems: input.problems,
    });

    const shot = await this.renderer.render(html, {
      width: BOARD_WIDTH, height: BOARD_HEIGHT, selector: BOARD_SELECTOR,
    });
    this.logger.log(`${input.spec.jobId}: board composed from ${panels.length} scene panel(s)`);

    return { dataUrl: `data:image/png;base64,${shot.toString('base64')}`, html, panels };
  }

  /**
   * The two captures the board is built from.
   *
   * The day panel is the elevation on the customer's photograph — what the sign
   * looks like on the building. The night panel is the 3/4, the only angle
   * showing return depth, standoff and halo at once; on a non-lit sign it is
   * the same angle in daylight, which is why the board relabels it.
   */
  private seeds(spec: SignSpec, panels: RenderedProofPanel[]) {
    const pick = (view: 'day' | 'night', ...cameras: string[]) => {
      for (const camera of cameras) {
        const found = panels.find((p) => p.view === view && p.camera === camera);
        if (found) return found;
      }
      return panels.find((p) => p.view === view);
    };

    const lit = nightLabel(spec) === 'NIGHT VIEW';
    const day = pick('day', 'front-elevation', 'perspective');
    const second = lit
      ? pick('night', 'detail-perspective', 'perspective', 'front-elevation')
      : pick('day', 'detail-perspective', 'perspective');

    return [
      { kind: 'day' as const, panel: day },
      { kind: 'night' as const, panel: second },
    ].filter((s): s is { kind: ScenePanelKind; panel: RenderedProofPanel } => Boolean(s.panel));
  }

  private async scenePanel(
    jobId: string,
    seed: { kind: ScenePanelKind; panel: RenderedProofPanel },
    options: { intent?: string | null; previous?: ScenePanel; regenerate: boolean },
  ): Promise<ScenePanel> {
    const render = seed.panel.dataUrl ?? '';
    const seedHash = BoardService.seedHash(render);
    const note = seed.panel.note ?? null;

    // Same geometry, and nothing asked of this panel: the previous image is
    // still the right answer, and regenerating it would only add drift.
    if (options.previous && options.previous.seedHash === seedHash && !options.regenerate) {
      return { ...options.previous, note };
    }

    if (!this.ai.enabled || !render) {
      return { kind: seed.kind, dataUrl: render, engine: 'render', seedHash, note };
    }

    try {
      const out = await this.ai.scene({
        render: dataUrlToBuffer(render),
        kind: seed.kind,
        jobId,
        intent: options.intent ?? null,
        previous: options.previous && options.regenerate
          ? dataUrlToBuffer(options.previous.dataUrl)
          : null,
      });
      return {
        kind: seed.kind,
        dataUrl: `data:image/png;base64,${out.toString('base64')}`,
        engine: 'ai',
        seedHash,
        note,
      };
    } catch (error) {
      // A failed realism pass is not a failed proof. The three.js capture is
      // already a correct picture of the sign — less photographic, fully
      // truthful — so the board ships with it rather than not at all.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${jobId}: ${seed.kind} panel fell back to the render — ${message}`);
      return {
        kind: seed.kind,
        dataUrl: render,
        engine: 'render',
        seedHash,
        note: note ?? 'Shown as the rendered view; the photorealistic pass did not complete.',
      };
    }
  }
}

/**
 * Which scene panels a look-only request is about.
 *
 * Word-matching, not judgment: a request that names one view regenerates that
 * view, and anything else regenerates both. Being wrong here costs an image
 * call, never a wrong sign — the geometry is settled before this runs — so the
 * ambiguous case deliberately falls back to doing the work.
 *
 * ponytail: keyword scope. If customers routinely phrase this in ways the words
 * miss, move it to the revision model alongside `RevisionService.toPatch`.
 */
export function scopeFromIntent(intent?: string | null): ScenePanelKind[] {
  const text = (intent ?? '').toLowerCase();
  const day = /\b(day|daytime|daylight|afternoon|morning|sunny|sun|noon)\b/.test(text);
  const night = /\b(night|nighttime|dusk|evening|dark|after hours|lit|illuminat\w*|glow\w*|halo)\b/.test(text);
  if (day === night) return ['day', 'night'];
  return day ? ['day'] : ['night'];
}

const toBoardPanel = (panel?: ScenePanel): BoardPanelImage | undefined =>
  panel ? { src: panel.dataUrl, note: panel.note } : undefined;

const dataUrlToBuffer = (dataUrl: string): Buffer =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
