import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { SCProofProcessor } from '#/modules/queues/sc-proof.processor.js';
import type { SCProofJobData } from '#/modules/queues/sc-proof.queue.js';
import type { SCProofEntity } from '#/modules/database/entities/sc-proof.entity.js';
import type { SCJobInput } from '#/kb/domain/sc-spec.js';

/**
 * Thin, same shape as `dl-proof.processor.spec.ts`: the processor is a
 * one-line adapter (`job.data` → `SCProofsService.runInto`), so what's worth
 * asserting is the adapter's wiring, not `runInto`'s own behaviour.
 */
describe('SCProofProcessor', () => {
  it('calls SCProofsService.runInto with the job data, defaulting skipRender/deterministicOnly to false', async () => {
    const runInto = vi.fn(async () => ({ status: 'ready' }) as unknown as SCProofEntity);
    const processor = new SCProofProcessor({ runInto } as unknown as ConstructorParameters<typeof SCProofProcessor>[0]);

    const job = {
      id: 'job-1',
      data: {
        proofId: 'proof-1',
        job: { jobId: 'sc-test' } as unknown as SCJobInput,
      } as SCProofJobData,
    } as Job<SCProofJobData>;

    const result = await processor.process(job);

    expect(runInto).toHaveBeenCalledWith('proof-1', job.data.job, {
      skipRender: false, deterministicOnly: false,
    });
    expect(result).toEqual({ proofId: 'proof-1', status: 'ready' });
  });

  it('passes through explicit skipRender/deterministicOnly rather than always defaulting', async () => {
    const runInto = vi.fn(async () => ({ status: 'blocked' }) as unknown as SCProofEntity);
    const processor = new SCProofProcessor({ runInto } as unknown as ConstructorParameters<typeof SCProofProcessor>[0]);

    const job = {
      id: 'job-2',
      data: {
        proofId: 'proof-2',
        job: { jobId: 'sc-test-2' } as unknown as SCJobInput,
        skipRender: true,
        deterministicOnly: true,
      } as SCProofJobData,
    } as Job<SCProofJobData>;

    const result = await processor.process(job);

    expect(runInto).toHaveBeenCalledWith('proof-2', job.data.job, {
      skipRender: true, deterministicOnly: true,
    });
    // A blocked job is a completed job, not a thrown error — the processor
    // must not translate it into a BullMQ retry.
    expect(result).toEqual({ proofId: 'proof-2', status: 'blocked' });
  });
});
