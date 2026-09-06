import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import type { SCJobInput, SCSpec } from '#/kb/domain/sc-spec.js';
import type { RuleTrace, DefaultTrace, PrecedenceRefusal } from '#/kb/engine/trace.js';

export type SCProofStatus = 'queued' | 'running' | 'ready' | 'blocked' | 'failed';

/**
 * A Sign Cabinet proof — own table (`sc_proof`), not a row in `cl_proof` or
 * `dl_proof`. Same column shape as `ProofEntity`/`DLProofEntity` on purpose
 * (so `SCProofResponseDto` reads exactly like the other two), but a
 * physically separate table: a migration or a query against one can never
 * touch the others.
 */
@Entity('sc_proof')
export class SCProofEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'job_id', type: 'text' })
  jobId!: string;

  @Index()
  @Column({ name: 'business_name', type: 'text' })
  businessName!: string;

  @Column({ type: 'text', default: 'queued' })
  status!: SCProofStatus;

  @Column({ name: 'sc_version', type: 'text' })
  scVersion!: string;

  @Column({ type: 'jsonb' })
  job!: SCJobInput;

  @Column({ type: 'jsonb', nullable: true })
  spec!: SCSpec | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  trace!: RuleTrace[];

  @Column({ name: 'trace_defaults', type: 'jsonb', default: () => "'[]'::jsonb" })
  traceDefaults!: DefaultTrace[];

  @Column({ name: 'trace_refusals', type: 'jsonb', default: () => "'[]'::jsonb" })
  traceRefusals!: PrecedenceRefusal[];

  @Column({ name: 'spec_block', type: 'text', nullable: true })
  specBlock!: string | null;

  @Column({ name: 'disclosure_text', type: 'text', nullable: true })
  disclosureText!: string | null;

  @Column({ name: 'sheet_html', type: 'text', nullable: true })
  sheetHtml!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  panels!: Array<{
    label: string; view: string; camera: string; file: string;
    note?: string | null;
    enhanced?: { file: string; reason: string } | null;
  }>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  problems!: string[];

  @Column({ type: 'boolean', default: false })
  blocked!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  escalations!: Array<{ ruleId: string; reason: string; question: string }>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /**
   * The first proof in this revision chain — itself, for a proof created
   * fresh from the wizard. A revision points its `rootProofId` at its
   * parent's, so the review page's URL and its chat thread
   * (`sc_proof_message`, also keyed by `rootProofId`) stay put across
   * versions — same mechanism as `dl_proof`.
   */
  @Index()
  @Column({ name: 'root_proof_id', type: 'uuid', nullable: true })
  rootProofId!: string | null;

  /** 1, 2, 3… within a revision chain. What the review page's version chips count. */
  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'boolean', default: false })
  approved!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** One turn of the SC revision conversation — the SC equivalent of `cl_design_message`/`dl_proof_message`. */
@Entity('sc_proof_message')
export class SCProofMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'root_proof_id', type: 'uuid' })
  rootProofId!: string;

  @Column({ type: 'text' })
  role!: 'USER' | 'AGENT';

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
