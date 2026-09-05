import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DLProofEntity } from '#/modules/database/entities/dl-proof.entity.js';
import { DLProofGraph, type DLGraphRunOptions } from '#/modules/dl-graph/dl-proof.graph.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';
import { DL_VERSION } from '#/kb/domain/dl-boilerplate.js';

/**
 * Persistence for Dimensional Letters proofs — the DL equivalent of
 * `ProofsService`, against `dl_proof` rather than `cl_proof`. No revise loop
 * in v1 (see `DLProofGraph`'s comment) and no BullMQ queue: DL jobs run
 * synchronously, which is enough for the wizard's own submit-and-wait flow.
 */
@Injectable()
export class DLProofsService {
  private readonly logger = new Logger(DLProofsService.name);

  constructor(
    @InjectRepository(DLProofEntity) private readonly proofs: Repository<DLProofEntity>,
    private readonly graph: DLProofGraph,
  ) {}

  async create(job: DLJobInput, options: DLGraphRunOptions = {}): Promise<DLProofEntity> {
    const record = await this.reserve(job);
    return this.runInto(record.id, job, options);
  }

  async reserve(job: DLJobInput): Promise<DLProofEntity> {
    return this.proofs.save(this.proofs.create({
      jobId: job.jobId,
      businessName: job.form.businessName,
      status: 'queued',
      dlVersion: DL_VERSION,
      job,
    }));
  }

  async runInto(proofId: string, job: DLJobInput, options: DLGraphRunOptions = {}): Promise<DLProofEntity> {
    await this.proofs.update(proofId, { status: 'running' });
    try {
      const state = await this.graph.run(job, options);
      return await this.persist(proofId, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`dl proof ${proofId} failed: ${message}`);
      await this.proofs.update(proofId, { status: 'failed', errorMessage: message });
      throw error;
    }
  }

  async findOne(id: string): Promise<DLProofEntity> {
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw new NotFoundException(`dl proof ${id} not found`);
    return proof;
  }

  async findByJob(jobId: string): Promise<DLProofEntity[]> {
    return this.proofs.find({ where: { jobId }, order: { createdAt: 'DESC' } });
  }

  private async persist(
    id: string,
    state: Awaited<ReturnType<DLProofGraph['run']>>,
  ): Promise<DLProofEntity> {
    const { spec, trace, proof, panels } = state;
    if (!spec || !trace || !proof) {
      await this.proofs.update(id, { status: 'failed', errorMessage: 'pipeline produced no proof' });
      return this.findOne(id);
    }

    const row = await this.proofs.findOneByOrFail({ id });
    row.status = spec.blocked ? 'blocked' : 'ready';
    row.spec = spec;
    row.trace = trace.entries;
    row.traceDefaults = trace.defaults;
    row.traceRefusals = trace.refusals;
    row.specBlock = proof.specBlock;
    row.disclosureText = proof.disclosureText;
    row.panels = panels.map(({ label, view, camera, file, note, enhanced }) => ({
      label, view, camera, file, note,
      enhanced: enhanced ? { file: enhanced.file, reason: enhanced.reason } : null,
    }));
    row.sheetHtml = proof.sheetHtml;
    row.problems = proof.problems;
    row.blocked = spec.blocked;
    row.escalations = spec.escalations;
    await this.proofs.save(row);

    return this.findOne(id);
  }
}
