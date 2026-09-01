import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThresholdEntity } from '#/modules/database/entities/threshold.entity.js';
import {
  MemoryThresholdStore, THRESHOLD_SEED, type Threshold, type ThresholdStore,
} from '#/kb/domain/thresholds.js';

/**
 * Thresholds, loaded from Postgres and cached in memory.
 *
 * The engine takes a `ThresholdStore` per run, not a shared singleton, because
 * the store records which keys were read — that read set becomes the `[DER]`
 * footnote §9.4 requires on the proof. A shared instance would mix one job's
 * reads into another's.
 *
 * So this service owns the *values* and hands out a fresh recording store per
 * job. A `[DER]` correction is an UPDATE plus `refresh()`, with no deploy.
 */
@Injectable()
export class ThresholdService implements OnModuleInit {
  private readonly logger = new Logger(ThresholdService.name);
  private values: Threshold[] = THRESHOLD_SEED;

  constructor(
    @InjectRepository(ThresholdEntity)
    private readonly repo: Repository<ThresholdEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const rows = await this.repo.find();
      if (rows.length === 0) {
        this.logger.warn('cl_threshold is empty — using the compiled seed. Run migrations.');
        this.values = THRESHOLD_SEED;
        return;
      }
      const loaded = rows.map((r) => ({
        key: r.key,
        value: Number(r.value),
        unit: r.unit,
        source: r.source,
        kbRef: r.kbRef,
        verified: r.verified,
        note: r.note ?? undefined,
      })) as Threshold[];

      // A key the code reads but the table lacks would throw mid-run, midway
      // through a job, with a proof half built. Fail loudly at boot instead.
      const missing = THRESHOLD_SEED.filter((s) => !loaded.some((l) => l.key === s.key));
      if (missing.length > 0) {
        throw new Error(
          `cl_threshold is missing ${missing.length} key(s) the rules read: ${missing.map((m) => m.key).join(', ')}`,
        );
      }

      this.values = loaded;
      this.logger.log(`loaded ${loaded.length} thresholds (${loaded.filter((t) => !t.verified).length} unverified)`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('cl_threshold is missing')) throw error;
      this.logger.warn(`threshold load failed, using the compiled seed: ${String(error)}`);
      this.values = THRESHOLD_SEED;
    }
  }

  /** A fresh recording store for one job. */
  createStore(overrides: Record<string, number> = {}): ThresholdStore {
    return new MemoryThresholdStore(this.values, overrides);
  }

  all(): Threshold[] {
    return this.values.map((t) => ({ ...t }));
  }

  /** Everything a fabricator still has to confirm. */
  unverified(): Threshold[] {
    return this.all().filter((t) => !t.verified);
  }

  /**
   * Correct a derived value. Returns the proofs that used the old one, because
   * that is invariably the next question.
   */
  async correct(
    key: string,
    value: number,
    updatedBy: string,
    opts: { verified?: boolean; note?: string } = {},
  ): Promise<{ threshold: Threshold; affectedProofIds: string[] }> {
    const row = await this.repo.findOneBy({ key });
    if (!row) throw new Error(`unknown threshold: ${key}`);

    const affected = await this.repo.manager.query<Array<{ proof_id: string }>>(
      'SELECT DISTINCT proof_id FROM cl_proof_threshold_read WHERE key = $1 AND value_used <> $2',
      [key, value],
    );

    row.value = value;
    row.updatedBy = updatedBy;
    if (opts.verified !== undefined) row.verified = opts.verified;
    if (opts.note !== undefined) row.note = opts.note;
    await this.repo.save(row);
    await this.refresh();

    return {
      threshold: this.values.find((t) => t.key === key)!,
      affectedProofIds: affected.map((a) => a.proof_id),
    };
  }
}
