import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The sign box's height, stored rather than reconstructed.
 *
 * It used to be rebuilt from the stated proportions, which is circular once a
 * marked wall face is present: on that path the real size is DERIVED from the
 * box, so deriving the box from the size leaves nothing anchored. It is also
 * wrong on an angled wall, where the box's aspect in the photograph is not the
 * sign's aspect on the wall.
 *
 * Nullable, and read as such: designs saved before this column existed fall
 * back to the ratio, which is what they were actually built from.
 */
export class SignBoxHeight1735880000000 implements MigrationInterface {
  name = 'SignBoxHeight1735880000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_design ADD COLUMN IF NOT EXISTS scale_y double precision');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_design DROP COLUMN IF EXISTS scale_y');
  }
}
