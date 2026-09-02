import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import { ThresholdReadEntity } from '#/modules/database/entities/threshold-read.entity.js';
import { ProofGraph, type GraphRunOptions } from '#/modules/graph/proof.graph.js';
import { DesignReferenceService } from '#/modules/knowledge/design-reference.service.js';
import { RevisionPatchService } from '#/modules/llm/revision-patch.service.js';
import { EngineService } from '#/modules/engine/engine.service.js';
import { scopeFromIntent } from '#/modules/render/board.service.js';
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
    private readonly config: ConfigService,
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

    // The previous scene panels come along so the board can reuse the ones this
    // revision does not touch. Which panels it does touch is decided by whether
    // their three.js seed moved: a form change that alters the sign produces a
    // different render, and a different render is never reused.
    return this.create({ ...previous.job, form: patch.form }, {
      intent: request,
      previousScenePanels: previous.scenePanels,
    });
  }

  /**
   * A look-only revision: the sign is unchanged, so no rule re-runs and no new
   * three.js capture is taken. Only the scene panels are edited.
   */
  async reviseAppearance(id: string, request: string, panels?: Array<'day' | 'night'>): Promise<ProofEntity> {
    const previous = await this.findOne(id);
    return this.create(previous.job, {
      intent: request,
      previousScenePanels: previous.scenePanels,
      // A request that names one view only pays for that view; the other is
      // reused byte for byte, which also keeps it from drifting.
      regenerateScenePanels: panels ?? scopeFromIntent(request),
    });
  }

  async findOne(id: string): Promise<ProofEntity> {
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw new NotFoundException(`proof ${id} not found`);
    return proof;
  }

  async findByJob(jobId: string): Promise<ProofEntity[]> {
    return this.proofs.find({ where: { jobId }, order: { createdAt: 'DESC' } });
  }

  async findByJobPrefix(prefix: string): Promise<ProofEntity[]> {
    return this.proofs
      .createQueryBuilder('p')
      .where('p.job_id LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('p.created_at', 'DESC')
      .getMany();
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
    const { spec, trace, proof, panels, unverified, board, scenePanels } = state;
    if (!spec || !trace || !proof) {
      await this.proofs.update(id, { status: 'failed', errorMessage: 'pipeline produced no proof' });
      return this.findOne(id);
    }

    // The board is written beside the panels it was composed from, so a proof
    // is one directory on disk rather than a row with megabytes of base64 in it.
    const boardFile = board ? await this.writeBoard(job.jobId, board) : null;

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
      row.boardFile = boardFile;
      row.scenePanels = scenePanels;
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

  private async writeBoard(jobId: string, dataUrl: string): Promise<string> {
    const baseDir = this.config.get<string>('app.proofDir') ?? './storage/proofs';
    const dir = path.join(baseDir, jobId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${jobId}-board.png`);
    await fs.writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    return file;
  }

  /** Re-runs the engine without persisting — used by the dry-run endpoint. */
  async preview(job: JobInput) {
    return this.engine.run(job, { deterministicOnly: true });
  }
}
