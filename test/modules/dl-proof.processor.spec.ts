import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { DLProofProcessor } from '#/modules/queues/dl-proof.processor.js';
import type { DLProofJobData } from '#/modules/queues/dl-proof.queue.js';
import type { DLProofEntity } from '#/modules/database/entities/dl-proof.entity.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';

/**
 * Thin, same shape as `proof.processor.ts`'s own lack of a dedicated test:
 * the processor is a one-line adapter (`job.data` → `DLProofsService.runInto`),
 * so what is worth asserting is that adapter's wiring — the right arguments
 * reach `runInto`, and its result becomes the job's own result — not
 * `runInto`'s own behaviour, which `test/sc-engine.spec.ts`-style tests and
 * the live queue already cover elsewhere.
 */
describe('DLProofProcessor', () => {
  it('calls DLProofsService.runInto with the job data, defaulting skipRender/deterministicOnly to false', async () => {
    const runInto = vi.fn(async () => ({ status: 'ready' }) as unknown as DLProofEntity);
    const processor = new DLProofProcessor({ runInto } as unknown as ConstructorParameters<typeof DLProofProcessor>[0]);

    const job = {
      id: 'job-1',
      data: {
        proofId: 'proof-1',
        job: { jobId: 'dl-test' } as unknown as DLJobInput,
      } as DLProofJobData,
    } as Job<DLProofJobData>;

    const result = await processor.process(job);

    expect(runInto).toHaveBeenCalledWith('proof-1', job.data.job, {
      skipRender: false, deterministicOnly: false,
    });
    expect(result).toEqual({ proofId: 'proof-1', status: 'ready' });
  });

  it('passes through explicit skipRender/deterministicOnly rather than always defaulting', async () => {
    const runInto = vi.fn(async () => ({ status: 'blocked' }) as unknown as DLProofEntity);
    const processor = new DLProofProcessor({ runInto } as unknown as ConstructorParameters<typeof DLProofProcessor>[0]);

    const job = {
      id: 'job-2',
      data: {
        proofId: 'proof-2',
        job: { jobId: 'dl-test-2' } as unknown as DLJobInput,
        skipRender: true,
        deterministicOnly: true,
      } as DLProofJobData,
    } as Job<DLProofJobData>;

    const result = await processor.process(job);

    expect(runInto).toHaveBeenCalledWith('proof-2', job.data.job, {
      skipRender: true, deterministicOnly: true,
    });
    // A blocked job is a completed job, not a thrown error — the processor
    // must not translate it into a BullMQ retry.
    expect(result).toEqual({ proofId: 'proof-2', status: 'blocked' });
  });
});
