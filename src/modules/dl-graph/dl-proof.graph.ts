import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import path from 'node:path';
import type { DLJobInput, DLSpec } from '#/kb/domain/dl-spec.js';
import type { TraceLog } from '#/kb/engine/trace.js';
import type { Threshold } from '#/kb/domain/thresholds.js';
import { assembleDLProof, type DLAssembleOptions } from '#/kb/output/dl-proof.js';
import type { Proof } from '#/kb/output/proof.js';
import { compileDLSpecToSignSpec } from '#/kb/render/dl-compile.js';
import { DLEngineService } from '#/modules/dl-engine/dl-engine.service.js';
import { RenderService, type RenderedProofPanel } from '#/modules/render/render.service.js';

/**
 * Orchestration for a Dimensional Letters job:
 *
 *   validate ──► draw ──► assemble ──► END
 *
 * Same shape as `ProofGraph` (CL) minus the `revise` loop (v1 scope limit —
 * no `/dl-proofs/:id/revise` yet). `draw` compiles the finished `DLSpec` into
 * a `SignSpec` via `compileDLSpecToSignSpec` and hands it to the same,
 * unmodified `RenderService` the Channel Letters graph uses — the renderer
 * cannot tell a compiled DL job from a CL one, which is the whole point.
 */
const DLProofState = Annotation.Root({
  job: Annotation<DLJobInput>(),
  spec: Annotation<DLSpec | null>({ reducer: (_, b) => b, default: () => null }),
  trace: Annotation<TraceLog | null>({ reducer: (_, b) => b, default: () => null }),
  unverified: Annotation<Threshold[]>({ reducer: (_, b) => b, default: () => [] }),
  panels: Annotation<RenderedProofPanel[]>({ reducer: (_, b) => b, default: () => [] }),
  proof: Annotation<Proof | null>({ reducer: (_, b) => b, default: () => null }),
  renderError: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
});

export type DLProofGraphState = typeof DLProofState.State;

export interface DLGraphRunOptions {
  skipRender?: boolean;
  deterministicOnly?: boolean;
  outDir?: string;
}

@Injectable()
export class DLProofGraph {
  private readonly logger = new Logger(DLProofGraph.name);

  constructor(
    private readonly config: ConfigService,
    private readonly engine: DLEngineService,
    private readonly render: RenderService,
  ) {}

  build(options: DLGraphRunOptions = {}) {
    const baseDir = options.outDir ?? this.config.get<string>('app.proofDir') ?? './storage/proofs';

    const graph = new StateGraph(DLProofState)
      .addNode('validate', async (s) => {
        const result = await this.engine.run(s.job, { deterministicOnly: options.deterministicOnly ?? false });
        return { spec: result.spec, trace: result.trace, unverified: result.unverifiedThresholds, renderError: null };
      })

      .addNode('draw', async (s) => {
        if (options.skipRender || !s.spec || s.spec.blocked) return { panels: [] };
        try {
          const compiled = compileDLSpecToSignSpec(s.spec);
          const panels = await this.render.render(compiled, path.join(baseDir, `dl-${s.spec.jobId}`));
          return { panels };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`render failed for ${s.job.jobId}: ${message}`);
          return { panels: [], renderError: message };
        }
      })

      .addNode('assemble', async (s) => {
        if (!s.spec || !s.trace) return {};
        const opts: DLAssembleOptions = {
          panels: options.skipRender ? undefined : s.panels,
          unverifiedThresholds: s.unverified,
        };
        let proof = assembleDLProof(s.spec, s.trace, opts);
        if (s.renderError) {
          proof = { ...proof, problems: [...proof.problems, `render failed: ${s.renderError}`] };
        }
        return { proof };
      })

      .addEdge(START, 'validate')
      .addConditionalEdges('validate', (s) => (s.spec?.blocked ? 'assemble' : 'draw'), {
        draw: 'draw', assemble: 'assemble',
      })
      .addEdge('draw', 'assemble')
      .addEdge('assemble', END);

    return graph.compile({ checkpointer: new MemorySaver() });
  }

  async run(job: DLJobInput, options: DLGraphRunOptions = {}): Promise<DLProofGraphState> {
    const app = this.build(options);
    return app.invoke(
      { job },
      { configurable: { thread_id: `dl-${job.jobId}` }, recursionLimit: 10 },
    ) as Promise<DLProofGraphState>;
  }
}
