import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The presentation board, and the scene panels it was composed from.
 *
 * The panels are stored with the digest of the three.js capture behind each so
 * a revision can tell "same sign, same look" from "same sign, new look" and
 * only pay the image model for the second.
 */
export class ProofBoard1736052800000 implements MigrationInterface {
  name = 'ProofBoard1736052800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_proof ADD COLUMN IF NOT EXISTS board_file text');
    await q.query(`ALTER TABLE cl_proof ADD COLUMN IF NOT EXISTS scene_panels jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_proof DROP COLUMN IF EXISTS scene_panels');
    await q.query('ALTER TABLE cl_proof DROP COLUMN IF EXISTS board_file');
  }
}
