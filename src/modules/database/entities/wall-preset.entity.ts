import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A stock wall to try a sign against.
 *
 * Convenience only, and the proof says so: a preset is not the customer's
 * building, so nothing measured against it — fit, clearances, the surrounding
 * colours, the permitted area — describes their site. It exists so someone
 * with no photo to hand can still see the sign, not so they can sign it off.
 */
@Entity('cl_wall_preset')
export class WallPresetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  /** Relative storage path, same as an uploaded wall. */
  @Column({ name: 'image_url', type: 'text' })
  imageUrl!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'image_width', type: 'integer' })
  imageWidth!: number;

  @Column({ name: 'image_height', type: 'integer' })
  imageHeight!: number;

  /**
   * A known real dimension in the image, so a preset calibrates like a photo
   * does instead of guessing. Stored as the width in inches of the whole
   * image at the wall plane.
   */
  @Column({ name: 'image_width_inches', type: 'double precision' })
  imageWidthInches!: number;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
