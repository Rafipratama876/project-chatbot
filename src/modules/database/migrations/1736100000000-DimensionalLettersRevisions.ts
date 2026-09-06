import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feature parity with Channel Letters' revision loop: a chat-driven revise,
 * a version history, an "approve" marker and PDF export — without adding a
 * `dl_design` draft table. `dl_proof` gains `root_proof_id` (the first proof
 * in a revision chain — a revised proof points at the same root as its
 * parent, so the review page's URL and its chat thread stay stable across
 * revisions) and `version`; `dl_proof_message` is the DL equivalent of
 * `cl_design_message`, keyed to that root instead of a design id.
 */
export class DimensionalLettersRevisions1736100000000 implements MigrationInterface {
  name = 'DimensionalLettersRevisions1736100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE dl_proof ADD COLUMN IF NOT EXISTS root_proof_id uuid');
    await q.query('ALTER TABLE dl_proof ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1');
    await q.query('ALTER TABLE dl_proof ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false');
    // Existing rows (created before this migration) are each their own root.
    await q.query('UPDATE dl_proof SET root_proof_id = id WHERE root_proof_id IS NULL');
    await q.query('CREATE INDEX IF NOT EXISTS idx_dl_proof_root ON dl_proof (root_proof_id, version DESC)');

    await q.query(`
      CREATE TABLE IF NOT EXISTS dl_proof_message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        root_proof_id uuid NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_dl_proof_message_root ON dl_proof_message (root_proof_id, created_at)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS dl_proof_message');
    await q.query('DROP INDEX IF EXISTS idx_dl_proof_root');
    await q.query('ALTER TABLE dl_proof DROP COLUMN IF EXISTS approved');
    await q.query('ALTER TABLE dl_proof DROP COLUMN IF EXISTS version');
    await q.query('ALTER TABLE dl_proof DROP COLUMN IF EXISTS root_proof_id');
  }
}
