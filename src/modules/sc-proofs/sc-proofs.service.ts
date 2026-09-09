import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import { SCProofEntity, SCProofMessageEntity } from '#/modules/database/entities/sc-proof.entity.js';
import { SCProofGraph, type SCGraphRunOptions } from '#/modules/sc-graph/sc-proof.graph.js';
import { SCRevisionPatchService } from './sc-revision-patch.service.js';
import type { SCJobInput } from '#/kb/domain/sc-spec.js';
import { SC_VERSION } from '#/kb/domain/sc-boilerplate.js';
import { SC_PROOF_QUEUE, type SCProofJobData } from '#/modules/queues/sc-proof.queue.js';

/**
 * Persistence for Sign Cabinet proofs — the SC equivalent of
 * `ProofsService`/`DLProofsService`, against `sc_proof` rather than
 * `cl_proof`/`dl_proof`.
 *
 * The revision loop mirrors DL's: `revise` is the low-level, proof-to-proof
 * operation (patch the form, re-run every gate, new row); `chat` is the
 * conversational layer (logs the exchange and resolves "the current proof"
 * from `rootProofId`).
 *
 * `enqueue()` is what the wizard, `revise` and `regenerate` all actually use
 * — the SC equivalent of `DesignsService.render()`'s own reserve-then-queue
 * shape. `create()` is left as the synchronous, blocking implementation
 * (Gate 1→6 AND the render AND any enhance call, all before returning) — it
 * still exists deliberately, as what the raw, lower-level `POST /sc-proofs`
 * endpoint uses, the same way CL's own `/proofs` defaults to synchronous.
 * Nothing customer-facing calls `create()` any more.
 */
@Injectable()
export class SCProofsService {
  private readonly logger = new Logger(SCProofsService.name);

  constructor(
    @InjectRepository(SCProofEntity) private readonly proofs: Repository<SCProofEntity>,
    @InjectRepository(SCProofMessageEntity) private readonly messages: Repository<SCProofMessageEntity>,
    private readonly graph: SCProofGraph,
    private readonly revisions: SCRevisionPatchService,
    @InjectQueue(SC_PROOF_QUEUE) private readonly queue: Queue<SCProofJobData>,
  ) {}

  async create(
    job: SCJobInput,
    options: SCGraphRunOptions = {},
    lineage?: { rootProofId: string; version: number },
  ): Promise<SCProofEntity> {
    const record = await this.reserve(job, lineage);
    return this.runInto(record.id, job, options);
  }

  /**
   * Reserves the row and hands the actual gates+render+enhance work to
   * `SCProofProcessor`, returning the moment the row exists — the id the
   * caller polls from, not a finished proof. `SCReviewPage` already derives
   * `inFlight` from `status` and already polls every 2s while it is
   * `queued`/`running`, so nothing on the frontend had to change for this.
   */
  async enqueue(
    job: SCJobInput,
    options: SCGraphRunOptions = {},
    lineage?: { rootProofId: string; version: number },
  ): Promise<SCProofEntity> {
    const reserved = await this.reserve(job, lineage);
    await this.queue.add('render', {
      proofId: reserved.id, job,
      skipRender: options.skipRender, deterministicOnly: options.deterministicOnly,
    }, { jobId: reserved.id });
    return reserved;
  }

  async reserve(
    job: SCJobInput,
    lineage?: { rootProofId: string; version: number },
  ): Promise<SCProofEntity> {
    const row = await this.proofs.save(this.proofs.create({
      jobId: job.jobId,
      businessName: job.form.businessName,
      status: 'queued',
      scVersion: SC_VERSION,
      job,
      version: lineage?.version ?? 1,
      rootProofId: lineage?.rootProofId ?? null,
    }));
    if (!lineage) {
      row.rootProofId = row.id;
      await this.proofs.update(row.id, { rootProofId: row.id });
    }
    return row;
  }

  async runInto(proofId: string, job: SCJobInput, options: SCGraphRunOptions = {}): Promise<SCProofEntity> {
    await this.proofs.update(proofId, { status: 'running' });
    try {
      const state = await this.graph.run(job, options);
      return await this.persist(proofId, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`sc proof ${proofId} failed: ${message}`);
      await this.proofs.update(proofId, { status: 'failed', errorMessage: message });
      throw error;
    }
  }

  async findOne(id: string): Promise<SCProofEntity> {
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw new NotFoundException(`sc proof ${id} not found`);
    return proof;
  }

  async findByJob(jobId: string): Promise<SCProofEntity[]> {
    return this.proofs.find({ where: { jobId }, order: { createdAt: 'DESC' } });
  }

  // ── Revision chain (rootProofId) ────────────────────────────────────────

  async seriesOf(rootProofId: string): Promise<SCProofEntity[]> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rootProofId)) {
      throw new NotFoundException(`no sc proof series rooted at ${rootProofId}`);
    }
    const rows = await this.proofs.find({ where: { rootProofId }, order: { version: 'DESC' } });
    if (rows.length === 0) throw new NotFoundException(`no sc proof series rooted at ${rootProofId}`);
    return rows;
  }

  async latestInSeries(rootProofId: string): Promise<SCProofEntity> {
    return (await this.seriesOf(rootProofId))[0]!;
  }

  /**
   * The low-level revision: patch the FORM, re-run every gate, a new row.
   * The stored spec is never edited in place — a spec changed outside the
   * gates has not been validated by them, same reasoning as CL's/DL's own
   * `revise`. Enqueued, not awaited to completion — the chat "send message"
   * action that calls this (via `chat()` below) must not block on a render.
   */
  async revise(id: string, request: string): Promise<SCProofEntity> {
    const previous = await this.findOne(id);
    if (!previous.spec) throw new NotFoundException(`sc proof ${id} has no spec to revise`);

    const patch = await this.revisions.toPatch(previous.job.form, previous.spec, request);
    if (patch.applied.length === 0) {
      throw new BadRequestException(
        `revision could not be applied: ${patch.unsupported.join('; ') || 'unclear request'}`,
      );
    }

    const rootProofId = previous.rootProofId ?? previous.id;
    const version = await this.nextVersion(rootProofId);
    const jobId = `${previous.jobId}-r${version}`;
    return this.enqueue(
      { ...previous.job, jobId, form: patch.form },
      {},
      { rootProofId, version },
    );
  }

  /** Re-runs the exact same job as a new version — "Render ulang", no form change. Enqueued, same reasoning as `revise`. */
  async regenerate(rootProofId: string): Promise<SCProofEntity> {
    const latest = await this.latestInSeries(rootProofId);
    const version = await this.nextVersion(rootProofId);
    const jobId = `${latest.jobId}-re${version}`;
    return this.enqueue({ ...latest.job, jobId }, {}, { rootProofId, version });
  }

  async approve(id: string): Promise<SCProofEntity> {
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

  // ── Chat (sc_proof_message, keyed by rootProofId) ───────────────────────

  async messagesOf(rootProofId: string): Promise<SCProofMessageEntity[]> {
    return this.messages.find({ where: { rootProofId }, order: { createdAt: 'ASC' } });
  }

  private say(rootProofId: string, content: string): Promise<SCProofMessageEntity> {
    return this.messages.save(this.messages.create({ rootProofId, role: 'AGENT', content }));
  }

  async chat(rootProofId: string, message: string): Promise<{
    agentMessage: SCProofMessageEntity;
    proof: SCProofEntity | null;
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

    let revised: SCProofEntity;
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

    // `revised` is the just-reserved row (status 'queued') — `revise()` now
    // enqueues rather than waits, so whether it ends up blocked isn't known
    // yet. The review page already polls `status` every 2s and switches to
    // the blocked/ready UI itself once the queue worker finishes; this
    // message only has to say the request was accepted.
    const summary = `Applied — rendering version ${revised.version} now, this page will update automatically.`;

    return {
      agentMessage: await this.say(rootProofId, summary),
      proof: revised,
      specChanged: true,
    };
  }

  private async persist(
    id: string,
    state: Awaited<ReturnType<SCProofGraph['run']>>,
  ): Promise<SCProofEntity> {
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
