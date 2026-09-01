import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { Provenance } from '#/kb/domain/thresholds.js';

/**
 * KB §-tagged tunable values. A `[DER]` value is derived and not vendor-
 * confirmed — it is a guess until a fabricator says otherwise, so it has to be
 * correctable by editing a row rather than by shipping a release.
 *
 * `cl_proof_threshold_read` records which proofs read which value, so when a
 * `[DER]` number is corrected you can find the proofs it would have changed.
 */
@Entity('cl_threshold')
export class ThresholdEntity {
  @PrimaryColumn({ type: 'text' })
  key!: string;

  @Column({ type: 'numeric', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  value!: number;

  @Column({ type: 'text' })
  unit!: 'in' | 'ft' | 'pct' | 'count' | 'sqft';

  @Column({ type: 'text' })
  source!: Provenance;

  @Column({ name: 'kb_ref', type: 'text' })
  kbRef!: string;

  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'text', nullable: true })
  updatedBy!: string | null;
}
