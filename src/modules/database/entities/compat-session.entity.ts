import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import type { JobInput } from '#/kb/domain/spec.js';

@Entity('cl_compat_session')
export class CompatSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'text' })
  projectId!: string;

  @Column({ name: 'sign_detail_id', type: 'text' })
  signDetailId!: string;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'finalized';

  @Column({ name: 'project_json', type: 'jsonb' })
  projectJson!: Record<string, unknown>;

  @Column({ name: 'base_job', type: 'jsonb' })
  baseJob!: JobInput;

  @Column({ name: 'approved_proof_id', type: 'uuid', nullable: true })
  approvedProofId!: string | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('cl_compat_message')
export class CompatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'text' })
  role!: 'user' | 'assistant';

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'text', nullable: true })
  mode!: 'draft' | 'final' | 'text' | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'proof_id', type: 'uuid', nullable: true })
  proofId!: string | null;

  @Column({ name: 'version_label', type: 'text', nullable: true })
  versionLabel!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
