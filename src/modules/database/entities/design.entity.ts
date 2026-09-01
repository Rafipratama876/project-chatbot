import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { WallPresetEntity } from './wall-preset.entity.js';

export type DesignStatus = 'DRAFT' | 'RENDERING' | 'READY' | 'APPROVED';

/**
 * What the customer is building, as they filled it in.
 *
 * A design is the intake, kept editable across sessions; a proof is one
 * immutable run of the gates against it. They are deliberately separate rows:
 * the wizard has to let someone come back tomorrow and change the return
 * depth, and §8 forbids editing a validated spec in place — so a change makes
 * a new proof rather than mutating the old one. That is also what makes the
 * version history on the review page real rather than cosmetic.
 */
@Entity('cl_design')
export class DesignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: 'DRAFT' })
  status!: DesignStatus;

  // ── Step 1: the artwork ────────────────────────────────────────────────

  /** Relative storage path ("/static/logos/…"), never an absolute URL. */
  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'logo_text', type: 'text', nullable: true })
  logoText!: string | null;

  // ── Step 2: the wall ───────────────────────────────────────────────────

  @Index()
  @Column({ name: 'wall_preset_id', type: 'uuid', nullable: true })
  wallPresetId!: string | null;

  @ManyToOne(() => WallPresetEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'wall_preset_id' })
  wallPreset!: WallPresetEntity | null;

  @Column({ name: 'custom_wall_image_url', type: 'text', nullable: true })
  customWallImageUrl!: string | null;

  /** Centre of the sign box, as a fraction of the wall image. */
  @Column({ name: 'position_x', type: 'double precision', nullable: true })
  positionX!: number | null;

  @Column({ name: 'position_y', type: 'double precision', nullable: true })
  positionY!: number | null;

  /** The box's width as a fraction of the wall image. */
  @Column({ type: 'double precision', nullable: true })
  scale!: number | null;

  /**
   * The box's height as a fraction of the wall image.
   *
   * Stored rather than reconstructed from the stated proportions. On a marked
   * wall face the real size is derived from this box, so reconstructing the box
   * from the size would be circular — and on an angled wall the box's aspect in
   * the photograph is not the sign's aspect on the wall anyway. Nullable for
   * designs saved before this column existed; those fall back to the ratio.
   */
  @Column({ name: 'scale_y', type: 'double precision', nullable: true })
  scaleY!: number | null;

  @Column({ name: 'width_inches', type: 'double precision', nullable: true })
  widthInches!: number | null;

  @Column({ name: 'height_inches', type: 'double precision', nullable: true })
  heightInches!: number | null;

  @Column({ name: 'area_sq_ft', type: 'double precision', nullable: true })
  areaSqFt!: number | null;

  /** Zoning/permit ceiling. Flagged for review when exceeded, never asserted
   *  as compliant — the engine does not know the jurisdiction. */
  @Column({ name: 'max_sign_area_allowed', type: 'double precision', nullable: true })
  maxSignAreaAllowed!: number | null;

  /**
   * The wall face the customer marked, in image pixels, clockwise from its
   * top-left, plus its real size.
   *
   * This is what lets the renderer stand where the photographer stood, so the
   * night three-quarter is the customer's own building at an angle rather than
   * a studio card. Optional: without it both views still composite, but the
   * three-quarter falls back and the proof says so.
   */
  @Column({ name: 'facade_rect', type: 'jsonb', nullable: true })
  facadeRect!: {
    corners: Array<{ x: number; y: number }>;
    widthInches: number;
    heightInches: number;
  } | null;

  /** Pixel size of the wall image, needed to turn the fractions above back
   *  into the pixel coordinates the engine calibrates against. */
  @Column({ name: 'wall_image_width', type: 'integer', nullable: true })
  wallImageWidth!: number | null;

  @Column({ name: 'wall_image_height', type: 'integer', nullable: true })
  wallImageHeight!: number | null;

  // ── Step 3: the specification ──────────────────────────────────────────

  /** The intake form, as the customer left it. Not a validated spec — the
   *  gates produce that, per proof. */
  @Column({ type: 'jsonb', nullable: true })
  spec!: Record<string, unknown> | null;

  @OneToMany(() => DesignMessageEntity, (m) => m.design)
  messages!: DesignMessageEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** One turn of the revision conversation. */
@Entity('cl_design_message')
export class DesignMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'design_id', type: 'uuid' })
  designId!: string;

  @ManyToOne(() => DesignEntity, (d) => d.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'design_id' })
  design!: DesignEntity;

  @Column({ type: 'text' })
  role!: 'USER' | 'AGENT';

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
