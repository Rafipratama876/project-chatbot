import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DLProofsService } from '#/modules/dl-proofs/dl-proofs.service.js';
import { DL_PROOF_QUEUE, type DLProofJobData } from './dl-proof.queue.js';

/**
 * The Dimensional Letters equivalent of `proof.processor.ts` — same reasons:
 * a render holds a Chromium page, doing that inline would tie a customer's
 * proof to the HTTP connection that asked for it, and the actual rasterising
 * bottleneck (software-rendered Chromium) wants a concurrency cap, not the
 * unbounded "every request its own render" DL had before this queue existed.
 *
 * `PROOF_CONCURRENCY` (shared with CL's own processor — same env var, same
 * number) only bounds how many jobs THIS queue's own worker dequeues at
 * once. Read from `process.env` directly, not `ConfigService`: `@Processor`
 * is evaluated at class-definition time, before Nest's DI container exists
 * to inject anything into — the same reason CL's own processor does this.
 * The cross-product cap that actually matters (CL, DL and SC all share one
 * `RenderService`/`Browser`) is `RenderService`'s own semaphore, sized by
 * `render.globalConcurrency`.
 */
@Processor(DL_PROOF_QUEUE, { concurrency: Number(process.env.PROOF_CONCURRENCY ?? 2) })
export class DLProofProcessor extends WorkerHost {
  private readonly logger = new Logger(DLProofProcessor.name);

  constructor(private readonly proofs: DLProofsService) {
    super();
  }

  async process(job: Job<DLProofJobData>): Promise<{ proofId: string; status: string }> {
    const { proofId, job: input, skipRender, deterministicOnly } = job.data;
    this.logger.log(`${job.id}: running ${input.jobId} → dl proof ${proofId}`);

    const result = await this.proofs.runInto(proofId, input, {
      skipRender: skipRender ?? false,
      deterministicOnly: deterministicOnly ?? false,
    });

    // A blocked job (SC-R-01-style escalation, DL's own) is a completed job,
    // not a failed one — same reasoning as CL's own processor. Retrying it
    // would run the same gates over the same job to the same conclusion.
    return { proofId, status: result.status };
  }
}
