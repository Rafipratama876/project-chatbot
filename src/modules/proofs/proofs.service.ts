import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import { ThresholdReadEntity } from '#/modules/database/entities/threshold-read.entity.js';
import { ProofGraph, type GraphRunOptions } from '#/modules/graph/proof.graph.js';
import { DesignReferenceService } from '#/modules/knowledge/design-reference.service.js';
import { RevisionPatchService } from '#/modules/llm/revision-patch.service.js';
import { EngineService } from '#/modules/engine/engine.service.js';
import type { JobInput } from '#/kb/domain/spec.js';
import { KB_VERSION } from '#/kb/domain/boilerplate.js';

@Injectable()
export class ProofsService {
  private readonly logger = new Logger(ProofsService.name);

  constructor(
    @InjectRepository(ProofEntity) private readonly proofs: Repository<ProofEntity>,
    private readonly dataSource: DataSource,
    private readonly graph: ProofGraph,
    private readonly designRefs: DesignReferenceService,
    private readonly revisions: RevisionPatchService,
    private readonly engine: EngineService,
  ) {}

  /** Creates the row, then runs the pipeline into it. */
  async create(job: JobInput, options: GraphRunOptions = {}): Promise<ProofEntity> {
    const record = await this.reserve(job);
    return this.runInto(record.id, job, options);
  }

  /**
   * Reserve a row before the work starts, so an async caller has an id to poll
   * the moment it enqueues rather than after the render finishes.
   */
  async reserve(job: JobInput): Promise<ProofEntity> {
    return this.proofs.save(this.proofs.create({
      jobId: job.jobId,
      businessName: job.form.businessName,
      status: 'queued',
      kbVersion: KB_VERSION,
      job,
    }));
  }

  async runInto(
    proofId: string,
    job: JobInput,
    options: GraphRunOptions = {},
  ): Promise<ProofEntity> {
    await this.proofs.update(proofId, { status: 'running' });
    try {
      const state = await this.graph.run(job, options);
      return await this.persist(proofId, state, job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`proof ${proofId} failed: ${message}`);
      await this.proofs.update(proofId, { status: 'failed', errorMessage: message });
      throw error;
    }
  }

  /**
   * A revision re-runs every gate over a patched FORM. The stored proof is
   * never edited in place: §9.4's disclosures are derived from the trace, so a
   * spec changed after the fact would carry a disclosure list describing
   * decisions that no longer match it. A revision is a new proof row.
   */
  async revise(id: string, request: string): Promise<ProofEntity> {
    const previous = await this.findOne(id);
    if (!previous.spec) throw new NotFoundException(`proof ${id} has no spec to revise`);

    const patch = await this.revisions.toPatch(previous.job.form, previous.spec, request);
    if (patch.applied.length === 0) {
      throw new NotFoundException(
        `revision could not be applied: ${patch.unsupported.join('; ') || 'unclear request'}`,
      );
    }

    return this.create({ ...previous.job, form: patch.form });
  }

  async findOne(id: string): Promise<ProofEntity> {
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw new NotFoundException(`proof ${id} not found`);
    return proof;
  }

  async findByJob(jobId: string): Promise<ProofEntity[]> {
    return this.proofs.find({ where: { jobId }, order: { createdAt: 'DESC' } });
  }

  /** Every proof whose trace contains a given rule — the post-mortem query. */
  async findByRule(ruleId: string, limit = 50): Promise<ProofEntity[]> {
    return this.proofs
      .createQueryBuilder('p')
      .where(`p.trace @> :probe::jsonb`, { probe: JSON.stringify([{ ruleId }]) })
      .orderBy('p.created_at', 'DESC')
      .limit(limit)
      .getMany();
  }

  private async persist(
    id: string,
    state: Awaited<ReturnType<ProofGraph['run']>>,
    job: JobInput,
  ): Promise<ProofEntity> {
    const { spec, trace, proof, panels, unverified } = state;
    if (!spec || !trace || !proof) {
      await this.proofs.update(id, { status: 'failed', errorMessage: 'pipeline produced no proof' });
      return this.findOne(id);
    }

    await this.dataSource.transaction(async (manager) => {
      // Loaded and saved rather than `update`d: the jsonb columns hold the
      // trace, whose `before`/`after` are `unknown` by design, and TypeORM's
      // partial-update type cannot express that.
      const row = await manager.findOneByOrFail(ProofEntity, { id });
      row.status = spec.blocked ? 'blocked' : 'ready';
      row.spec = spec;
      row.trace = trace.entries;
      row.traceDefaults = trace.defaults;
      row.traceRefusals = trace.refusals;
      row.specBlock = proof.specBlock;
      row.disclosureText = proof.disclosureText;
      // File paths only. The data URLs are megabytes each and the sheet is
      // regenerated on demand from them.
      row.panels = panels.map(({ label, view, camera, file, note }) => ({ label, view, camera, file, note }));
      row.sheetHtml = proof.sheetHtml;
      row.problems = proof.problems;
      row.blocked = spec.blocked;
      row.escalations = spec.escalations;
      await manager.save(row);

      // §9.4 footnotes the [DER] values a proof used; this is the other half —
      // when one is later corrected, which proofs already went out on the old
      // number?
      if (unverified.length > 0) {
        await manager.delete(ThresholdReadEntity, { proofId: id });
        await manager.save(
          unverified.map((t) => manager.create(ThresholdReadEntity, {
            proofId: id, key: t.key, valueUsed: t.value,
          })),
        );
      }
    });

    // Advisory only — this feeds "we did something like this before", never a rule.
    if (!spec.blocked) {
      await this.designRefs.record(spec, id).catch((error: unknown) => {
        this.logger.warn(`design reference not recorded for ${id}: ${String(error)}`);
      });
    }

    return this.findOne(id);
  }

  /** Re-runs the engine without persisting — used by the dry-run endpoint. */
  async preview(job: JobInput) {
    return this.engine.run(job, { deterministicOnly: true });
  }
}
