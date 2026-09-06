import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import path from 'node:path';
import type { SCJobInput, SCSpec } from '#/kb/domain/sc-spec.js';
import type { TraceLog } from '#/kb/engine/trace.js';
import type { Threshold } from '#/kb/domain/thresholds.js';
import { assembleSCProof, type SCAssembleOptions } from '#/kb/output/sc-proof.js';
import type { Proof } from '#/kb/output/proof.js';
import { compileSCSpecToSignSpec } from '#/kb/render/sc-compile.js';
import { SCEngineService } from '#/modules/sc-engine/sc-engine.service.js';
import { RenderService, type RenderedProofPanel } from '#/modules/render/render.service.js';

/**
 * Orchestration for a Sign Cabinet job:
 *
 *   validate ──► draw ──► assemble ──► END
 *
 * Same shape as `ProofGraph` (CL) / `DLProofGraph` minus the `revise` loop —
 * revision goes through `SCProofsService.revise`, which re-runs this whole
 * graph as a new proof, same as DL. `draw` compiles the finished `SCSpec`
 * into a `SignSpec` via `compileSCSpecToSignSpec` and hands it to the same,
 * unmodified `RenderService` the Channel Letters and Dimensional Letters
 * graphs use — the renderer cannot tell a compiled SC job from a CL or DL one.
 */
const SCProofState = Annotation.Root({
  job: Annotation<SCJobInput>(),
  spec: Annotation<SCSpec | null>({ reducer: (_, b) => b, default: () => null }),
  trace: Annotation<TraceLog | null>({ reducer: (_, b) => b, default: () => null }),
  unverified: Annotation<Threshold[]>({ reducer: (_, b) => b, default: () => [] }),
  panels: Annotation<RenderedProofPanel[]>({ reducer: (_, b) => b, default: () => [] }),
  proof: Annotation<Proof | null>({ reducer: (_, b) => b, default: () => null }),
  renderError: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
});

export type SCProofGraphState = typeof SCProofState.State;

export interface SCGraphRunOptions {
  skipRender?: boolean;
  deterministicOnly?: boolean;
  outDir?: string;
}

@Injectable()
export class SCProofGraph {
  private readonly logger = new Logger(SCProofGraph.name);

  constructor(
    private readonly config: ConfigService,
    private readonly engine: SCEngineService,
    private readonly render: RenderService,
  ) {}

  build(options: SCGraphRunOptions = {}) {
    const baseDir = options.outDir ?? this.config.get<string>('app.proofDir') ?? './storage/proofs';

    const graph = new StateGraph(SCProofState)
      .addNode('validate', async (s) => {
        const result = await this.engine.run(s.job, { deterministicOnly: options.deterministicOnly ?? false });
        return { spec: result.spec, trace: result.trace, unverified: result.unverifiedThresholds, renderError: null };
      })

      .addNode('draw', async (s) => {
        if (options.skipRender || !s.spec || s.spec.blocked) return { panels: [] };
        try {
          const compiled = compileSCSpecToSignSpec(s.spec);
          const panels = await this.render.render(compiled, path.join(baseDir, `sc-${s.spec.jobId}`));
          return { panels };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`render failed for ${s.job.jobId}: ${message}`);
          return { panels: [], renderError: message };
        }
      })

      .addNode('assemble', async (s) => {
        if (!s.spec || !s.trace) return {};
        const opts: SCAssembleOptions = {
          panels: options.skipRender ? undefined : s.panels,
          unverifiedThresholds: s.unverified,
        };
        let proof = assembleSCProof(s.spec, s.trace, opts);
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

  async run(job: SCJobInput, options: SCGraphRunOptions = {}): Promise<SCProofGraphState> {
    const app = this.build(options);
    return app.invoke(
      { job },
      { configurable: { thread_id: `sc-${job.jobId}` }, recursionLimit: 10 },
    ) as Promise<SCProofGraphState>;
  }
}
