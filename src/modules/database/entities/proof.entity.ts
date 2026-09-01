import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import type { JobInput, SignSpec } from '#/kb/domain/spec.js';
import type { RuleTrace, DefaultTrace, PrecedenceRefusal } from '#/kb/engine/trace.js';

export type ProofStatus = 'queued' | 'running' | 'ready' | 'blocked' | 'failed';

/**
 * A proof and everything that produced it.
 *
 * The trace is stored, not just the final spec. §9.4 requires the proof to
 * report every autofix, warning and defaulted field, and CL-R-47 requires each
 * in plain language — all of which is generated from the trace. Keeping it
 * means a proof can be re-explained, re-rendered or audited months later
 * without re-running the engine against a KB that has since moved.
 */
@Entity('cl_proof')
export class ProofEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'job_id', type: 'text' })
  jobId!: string;

  @Index()
  @Column({ name: 'business_name', type: 'text' })
  businessName!: string;

  @Column({ type: 'text', default: 'queued' })
  status!: ProofStatus;

  /** The KB version this proof was produced against. */
  @Column({ name: 'kb_version', type: 'text' })
  kbVersion!: string;

  @Column({ type: 'jsonb' })
  job!: JobInput;

  @Column({ type: 'jsonb', nullable: true })
  spec!: SignSpec | null;

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

  /** The rendered sheet, ready to serve or print. */
  @Column({ name: 'sheet_html', type: 'text', nullable: true })
  sheetHtml!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  panels!: Array<{
    label: string; view: string; camera: string; file: string;
    /** Set when the panel could not use the customer's photograph. */
    note?: string | null;
  }>;

  /** Non-empty means the proof failed its own output contract and must not ship. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  problems!: string[];

  /** CL-R-46 fired. */
  @Column({ type: 'boolean', default: false })
  blocked!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  escalations!: Array<{ ruleId: string; reason: string; question: string }>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /**
   * The design this proof was run from, when it came through the wizard.
   *
   * Nullable because the API accepts a job directly as well, and a proof is
   * meaningful without a design behind it — the design is the editable intake,
   * the proof is one immutable run of the gates against it.
   */
  @Index()
  @Column({ name: 'design_id', type: 'uuid', nullable: true })
  designId!: string | null;

  /** 1, 2, 3… within a design. What the review page's history counts. */
  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
