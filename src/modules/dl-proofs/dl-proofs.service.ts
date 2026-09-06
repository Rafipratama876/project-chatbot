import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DLProofEntity, DLProofMessageEntity } from '#/modules/database/entities/dl-proof.entity.js';
import { DLProofGraph, type DLGraphRunOptions } from '#/modules/dl-graph/dl-proof.graph.js';
import { DLRevisionPatchService } from './dl-revision-patch.service.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';
import { DL_VERSION } from '#/kb/domain/dl-boilerplate.js';

/**
 * Persistence for Dimensional Letters proofs — the DL equivalent of
 * `ProofsService`, against `dl_proof` rather than `cl_proof`. No BullMQ
 * queue: DL jobs run synchronously, which is enough for the wizard's
 * submit-and-wait flow.
 *
 * The revision loop mirrors CL's split across two layers, just without a
 * separate `dl_design` draft table: `revise` is the low-level, proof-to-proof
 * operation (patch the form, re-run every gate, new row) that
 * `ProofsService.revise` also does; `chat` is the conversational layer
 * (`DesignsService.revise` for CL) that logs the exchange and resolves
 * "the current proof" from `rootProofId` instead of a design id.
 */
@Injectable()
export class DLProofsService {
  private readonly logger = new Logger(DLProofsService.name);

  constructor(
    @InjectRepository(DLProofEntity) private readonly proofs: Repository<DLProofEntity>,
    @InjectRepository(DLProofMessageEntity) private readonly messages: Repository<DLProofMessageEntity>,
    private readonly graph: DLProofGraph,
    private readonly revisions: DLRevisionPatchService,
  ) {}

  async create(
    job: DLJobInput,
    options: DLGraphRunOptions = {},
    lineage?: { rootProofId: string; version: number },
  ): Promise<DLProofEntity> {
    const record = await this.reserve(job, lineage);
    return this.runInto(record.id, job, options);
  }

  async reserve(
    job: DLJobInput,
    lineage?: { rootProofId: string; version: number },
  ): Promise<DLProofEntity> {
    const row = await this.proofs.save(this.proofs.create({
      jobId: job.jobId,
      businessName: job.form.businessName,
      status: 'queued',
      dlVersion: DL_VERSION,
      job,
      version: lineage?.version ?? 1,
      // Set below once we have an id, for a fresh (non-revision) proof.
      rootProofId: lineage?.rootProofId ?? null,
    }));
    if (!lineage) {
      row.rootProofId = row.id;
      await this.proofs.update(row.id, { rootProofId: row.id });
    }
    return row;
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

  // ── Revision chain (rootProofId) ────────────────────────────────────────

  async seriesOf(rootProofId: string): Promise<DLProofEntity[]> {
    // A malformed id (not a route the UI ever sends, but reachable directly)
    // hits Postgres as an "invalid input syntax for type uuid" 500 rather
    // than the 404 a bad id should be — checked here so every caller
    // (latestInSeries, the controller's /versions, /latest, /regenerate,
    // /messages, /chat) gets the same clean error.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rootProofId)) {
      throw new NotFoundException(`no dl proof series rooted at ${rootProofId}`);
    }
    const rows = await this.proofs.find({ where: { rootProofId }, order: { version: 'DESC' } });
    if (rows.length === 0) throw new NotFoundException(`no dl proof series rooted at ${rootProofId}`);
    return rows;
  }

  async latestInSeries(rootProofId: string): Promise<DLProofEntity> {
    return (await this.seriesOf(rootProofId))[0]!;
  }

  /**
   * The low-level revision: patch the FORM, re-run every gate, a new row.
   * The stored spec is never edited in place — a spec changed outside the
   * gates has not been validated by them, same reasoning as CL's own
   * `ProofsService.revise`.
   */
  async revise(id: string, request: string): Promise<DLProofEntity> {
    const previous = await this.findOne(id);
    if (!previous.spec) throw new NotFoundException(`dl proof ${id} has no spec to revise`);

    const patch = await this.revisions.toPatch(previous.job.form, previous.spec, request);
    if (patch.applied.length === 0) {
      throw new BadRequestException(
        `revision could not be applied: ${patch.unsupported.join('; ') || 'unclear request'}`,
      );
    }

    const rootProofId = previous.rootProofId ?? previous.id;
    const version = await this.nextVersion(rootProofId);
    const jobId = `${previous.jobId}-r${version}`;
    return this.create(
      { ...previous.job, jobId, form: patch.form },
      {},
      { rootProofId, version },
    );
  }

  /** Re-runs the exact same job as a new version — "Render ulang", no form change. */
  async regenerate(rootProofId: string): Promise<DLProofEntity> {
    const latest = await this.latestInSeries(rootProofId);
    const version = await this.nextVersion(rootProofId);
    const jobId = `${latest.jobId}-re${version}`;
    return this.create({ ...latest.job, jobId }, {}, { rootProofId, version });
  }

  async approve(id: string): Promise<DLProofEntity> {
    await this.proofs.update(id, { approved: true });
    return this.findOne(id);
  }

  private async nextVersion(rootProofId: string): Promise<number> {
    const { max } = await this.proofs
      .createQueryBuilder('p')
      .select('MAX(p.version)', 'max')
      .where('p.root_proof_id = :rootProofId', { rootProofId })
      .getRawOne<{ max: number | null }>() ?? { max: null };
    return (max ?? 0) + 1;
  }

  // ── Chat (dl_proof_message, keyed by rootProofId) ───────────────────────

  async messagesOf(rootProofId: string): Promise<DLProofMessageEntity[]> {
    return this.messages.find({ where: { rootProofId }, order: { createdAt: 'ASC' } });
  }

  private say(rootProofId: string, content: string): Promise<DLProofMessageEntity> {
    return this.messages.save(this.messages.create({ rootProofId, role: 'AGENT', content }));
  }

  /**
   * The conversational layer — logs the exchange and resolves "the current
   * proof" from the chain rather than a design id, then calls the same
   * `revise` a direct API caller would.
   */
  async chat(rootProofId: string, message: string): Promise<{
    agentMessage: DLProofMessageEntity;
    proof: DLProofEntity | null;
    specChanged: boolean;
  }> {
    await this.messages.save(this.messages.create({ rootProofId, role: 'USER', content: message }));

    const latest = await this.latestInSeries(rootProofId).catch(() => null);
    if (!latest?.spec) {
      return {
        agentMessage: await this.say(rootProofId, 'There is no completed proof to revise yet.'),
        proof: null,
        specChanged: false,
      };
    }

    let revised: DLProofEntity;
    try {
      revised = await this.revise(latest.id, message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        agentMessage: await this.say(rootProofId, `I could not apply that: ${reason}`),
        proof: null,
        specChanged: false,
      };
    }

    const summary = revised.blocked
      ? 'Applied — but the result is blocked and needs a human. See the escalations on the proof.'
      : `Applied. Version ${revised.version} is ready.`;

    return {
      agentMessage: await this.say(rootProofId, summary),
      proof: revised,
      specChanged: true,
    };
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
