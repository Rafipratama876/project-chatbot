import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { ProofsService } from '#/modules/proofs/proofs.service.js';
import { DesignsService } from '#/modules/designs/designs.service.js';
import { PROOF_QUEUE, type ProofJobData } from './proof.queue.js';

/**
 * A proof render holds a Chromium page for a few seconds. Doing that inline
 * would tie up a request thread and, worse, tie the proof's fate to the HTTP
 * connection — a customer refreshing the page must not restart the engine.
 *
 * Concurrency is deliberately low: each concurrent job is a live browser page,
 * and the bottleneck is GPU-less rasterisation, not I/O.
 */
@Processor(PROOF_QUEUE, { concurrency: Number(process.env.PROOF_CONCURRENCY ?? 2) })
export class ProofProcessor extends WorkerHost {
  private readonly logger = new Logger(ProofProcessor.name);

  constructor(
    private readonly proofs: ProofsService,
    private readonly designs: DesignsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ProofJobData>): Promise<{ proofId: string; status: string }> {
    const { proofId, job: input, skipRender, deterministicOnly } = job.data;
    this.logger.log(`${job.id}: running ${input.jobId} → proof ${proofId}`);

    const result = await this.proofs.runInto(proofId, input, {
      skipRender: skipRender ?? false,
      deterministicOnly: deterministicOnly ?? false,
    });

    // The design's own status follows the render it was waiting on. Done here
    // rather than derived on read because APPROVED has to survive a later
    // re-render, and a derived status would silently revoke it.
    if (result.designId) {
      await this.designs.onRenderSettled(result.designId, result.status);
    }

    // A blocked job (CL-R-46) is a completed job, not a failed one. Retrying it
    // would run the same rules over the same artwork to the same conclusion;
    // what it needs is a human, and the escalation already says so.
    return { proofId, status: result.status };
  }
}
