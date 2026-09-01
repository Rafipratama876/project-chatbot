import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * pgvector store — past proofs and design references, for "we did something
 * like this before". §9.5 design guidance is soft and advisory, which is
 * exactly the shape retrieval suits.
 *
 * This never feeds a rule. It surfaces prior work to a human, and to the
 * revision node as context for phrasing — never as a source of dimensions,
 * materials or constructions. Those come from the engine.
 */
@Entity('cl_design_reference')
export class DesignReferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'proof_id', type: 'uuid', nullable: true })
  proofId!: string | null;

  @Column({ name: 'business_name', type: 'text' })
  businessName!: string;

  /** A one-line description of the sign, which is what gets embedded. */
  @Column({ type: 'text' })
  summary!: string;

  @Index()
  @Column({ name: 'sign_type', type: 'text' })
  signType!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  constructions!: string[];

  @Column({ name: 'mount_method', type: 'text' })
  mountMethod!: string;

  @Column({ type: 'text', nullable: true })
  embedding!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
