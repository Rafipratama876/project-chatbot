import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Which proof read which threshold, and at what value.
 *
 * §9.4 makes every proof footnote the `[DER]` values it depended on. This is
 * the other half of that: when a derived number is later corrected, this table
 * answers "which proofs did we already send that used the old one?"
 */
@Entity('cl_proof_threshold_read')
export class ThresholdReadEntity {
  @PrimaryColumn({ name: 'proof_id', type: 'uuid' })
  proofId!: string;

  @PrimaryColumn({ type: 'text' })
  key!: string;

  @Column({
    name: 'value_used',
    type: 'numeric',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  valueUsed!: number;
}
