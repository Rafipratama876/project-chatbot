import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import path from 'node:path';
import type { JobInput, SignSpec, WolfStudioForm } from '#/kb/domain/spec.js';
import type { TraceLog } from '#/kb/engine/trace.js';
import type { Threshold } from '#/kb/domain/thresholds.js';
import { assembleProof, type Proof } from '#/kb/output/proof.js';
import { EngineService } from '#/modules/engine/engine.service.js';
import { RenderService, type RenderedProofPanel } from '#/modules/render/render.service.js';
import { BoardService, type ScenePanel } from '#/modules/render/board.service.js';
import type { ScenePanelKind } from '#/modules/render/ai-render.service.js';
import { CalloutWriterService } from '#/modules/llm/callout-writer.service.js';
import { RevisionPatchService } from '#/modules/llm/revision-patch.service.js';
import { AnthropicClient } from '#/modules/llm/anthropic.client.js';

/**
 * Orchestration.
 *
 *   validate ──► draw ──► compose ──► assemble ──┬──► END
 *      ▲                                         │
 *      └───────────────── revise ◄───────────────┘
 *
 * LangGraph sequences the stages and carries the revision loop. It does not
 * draw the sign and it does not decide anything the KB decides — `validate` is
 * one call into a pure function, `draw` is three.js, and `board` is the
 * photorealism pass over that render plus the HTML page it is placed on.
 *
 * `draw` and `board` are separate nodes because they have different costs and
 * different reasons to re-run. Three.js is cheap and re-runs whenever the spec
 * changes; the image model is slow and paid, and re-runs only for the panels a
 * revision actually affects.
 *
 * The revision edge is the reason this is a graph rather than a promise chain:
 * a revision goes back to the FORM and re-enters at `validate`, so every gate
 * runs again. Patching the spec directly would produce a spec no gate had
 * validated, which is the one thing the rule engine exists to prevent.
 *
 * Node names differ from state channel names (`validate`/`draw`/`compose`/
 * `assemble` vs `spec`/`panels`/`board`/`proof`) because LangGraph rejects a
 * collision between them.
 */
const ProofState = Annotation.Root({
  job: Annotation<JobInput>(),
  spec: Annotation<SignSpec | null>({ reducer: (_, b) => b, default: () => null }),
  trace: Annotation<TraceLog | null>({ reducer: (_, b) => b, default: () => null }),
  unverified: Annotation<Threshold[]>({ reducer: (_, b) => b, default: () => [] }),
  panels: Annotation<RenderedProofPanel[]>({ reducer: (_, b) => b, default: () => [] }),
  /** The delivered board, and the scene panels it was composed from. */
  board: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  scenePanels: Annotation<ScenePanel[]>({ reducer: (_, b) => b, default: () => [] }),
  proof: Annotation<Proof | null>({ reducer: (_, b) => b, default: () => null }),
  revisionRequest: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  revisionLog: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  renderError: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
});

export type ProofGraphState = typeof ProofState.State;

export interface GraphRunOptions {
  skipRender?: boolean;
  deterministicOnly?: boolean;
  maxRevisions?: number;
  outDir?: string;
  /** Skip the board — the rules-only paths (CLI preview, tests) do not need it. */
  skipBoard?: boolean;
  /** Free-text intent for the scene panels, on a revision. */
  intent?: string | null;
  /** Scene panels from the previous version, reused where the seed is unchanged. */
  previousScenePanels?: ScenePanel[];
  /** Which scene panels this revision affects. Defaults to both. */
  regenerateScenePanels?: ScenePanelKind[];
}

@Injectable()
export class ProofGraph {
  private readonly logger = new Logger(ProofGraph.name);

  constructor(
    private readonly config: ConfigService,
    private readonly engine: EngineService,
    private readonly render: RenderService,
    private readonly board: BoardService,
    private readonly callouts: CalloutWriterService,
    private readonly revisions: RevisionPatchService,
    private readonly anthropic: AnthropicClient,
  ) {}

  build(options: GraphRunOptions = {}) {
    const baseDir = options.outDir ?? this.config.get<string>('app.proofDir') ?? './storage/proofs';

    const graph = new StateGraph(ProofState)
      .addNode('validate', async (s) => {
        const result = await this.engine.run(s.job, {
          deterministicOnly: options.deterministicOnly ?? false,
        });
        return {
          spec: result.spec,
          trace: result.trace,
          unverified: result.unverifiedThresholds,
          renderError: null,
        };
      })

      .addNode('draw', async (s) => {
        if (options.skipRender || !s.spec || s.spec.blocked) return { panels: [] };
        try {
          const panels = await this.render.render(s.spec, path.join(baseDir, s.spec.jobId));
          return { panels };
        } catch (error) {
          // A render failure must not lose the spec and the trace — those are
          // the parts a human can still act on.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`render failed for ${s.job.jobId}: ${message}`);
          return { panels: [], renderError: message };
        }
      })

      .addNode('compose', async (s) => {
        if (options.skipBoard || !s.spec || s.spec.blocked || s.panels.length === 0) return {};
        try {
          const result = await this.board.compose({
            spec: s.spec,
            panels: s.panels,
            intent: options.intent,
            previous: options.previousScenePanels,
            regenerate: options.regenerateScenePanels,
          });
          return { board: result.dataUrl, scenePanels: result.panels };
        } catch (error) {
          // The board is how the proof is delivered, not what it says. A
          // failure here leaves the spec, the trace and the panels intact.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`board failed for ${s.job.jobId}: ${message}`);
          return { renderError: s.renderError ?? message };
        }
      })

      .addNode('assemble', async (s) => {
        if (!s.spec || !s.trace) return {};
        let proof = assembleProof(s.spec, s.trace, {
          // `undefined` means "not rendered on purpose"; `[]` means the
          // renderer ran and produced nothing, which §9.1 must catch.
          panels: options.skipRender ? undefined : s.panels,
          unverifiedThresholds: s.unverified,
        });

        if (this.anthropic.enabled && !s.spec.blocked) {
          // Wording only. What gets disclosed was decided by the trace.
          const disclosures = await this.callouts.rewrite(s.spec, proof.disclosures);
          proof = { ...proof, disclosures };
        }
        if (s.renderError) {
          proof = { ...proof, problems: [...proof.problems, `render failed: ${s.renderError}`] };
        }
        if (s.board) proof = { ...proof, board: s.board };
        return { proof };
      })

      .addNode('revise', async (s) => {
        if (!s.revisionRequest || !s.spec) return { revisionRequest: null };
        if (!this.anthropic.enabled) {
          return {
            revisionRequest: null,
            revisionLog: ['Revision requested but the LLM nodes are disabled.'],
          };
        }

        const patch = await this.revisions.toPatch(
          s.job.form as WolfStudioForm, s.spec, s.revisionRequest,
        );
        if (patch.confidence < this.anthropic.minConfidence) {
          return {
            revisionRequest: null,
            revisionLog: [
              `Revision not applied (confidence ${patch.confidence.toFixed(2)}): ` +
              `${patch.unsupported.join('; ') || 'unclear request'}`,
            ],
          };
        }

        return {
          job: { ...s.job, form: patch.form },
          revisionRequest: null,
          revisionLog: [
            ...patch.applied.map((a) => `${a.field} → ${String(a.value)} ("${a.quote}")`),
            ...patch.unsupported.map((u) => `unsupported: ${u}`),
          ],
        };
      })

      .addEdge(START, 'validate')
      // A blocked job (CL-R-46) skips the renderer: there is nothing buildable
      // to draw, and a picture of an unbuildable sign is the worst output.
      .addConditionalEdges('validate', (s) => (s.spec?.blocked ? 'assemble' : 'draw'), {
        draw: 'draw', assemble: 'assemble',
      })
      .addEdge('draw', 'compose')
      .addEdge('compose', 'assemble')
      .addConditionalEdges('assemble', (s) => (s.revisionRequest ? 'revise' : END), {
        revise: 'revise', [END]: END,
      })
      .addEdge('revise', 'validate');

    return graph.compile({ checkpointer: new MemorySaver() });
  }

  async run(job: JobInput, options: GraphRunOptions = {}): Promise<ProofGraphState> {
    const app = this.build(options);
    return app.invoke(
      { job },
      {
        configurable: { thread_id: job.jobId },
        recursionLimit: 10 + (options.maxRevisions ?? 3) * 4,
      },
    ) as Promise<ProofGraphState>;
  }
}
