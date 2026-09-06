import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sign Cabinets — a third, separate table (`sc_proof`), not a column added to
 * `cl_proof` or `dl_proof`. Same shape as the `dl_proof` migrations combined
 * (`1736000000000-DimensionalLetters.ts` + `1736100000000-DimensionalLettersRevisions.ts`):
 * job/spec/trace jsonb, spec block, disclosure text, sheet html, panels,
 * problems, escalations, plus the revision-chain columns (`root_proof_id`,
 * `version`, `approved`) from day one — no follow-up migration needed. Pure
 * `CREATE TABLE IF NOT EXISTS`; cannot touch `cl_proof`/`dl_proof`.
 */
export class SignCabinets1736200000000 implements MigrationInterface {
  name = 'SignCabinets1736200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS sc_proof (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id text NOT NULL,
        business_name text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        sc_version text NOT NULL,
        job jsonb NOT NULL,
        spec jsonb,
        trace jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_defaults jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_refusals jsonb NOT NULL DEFAULT '[]'::jsonb,
        spec_block text,
        disclosure_text text,
        sheet_html text,
        panels jsonb NOT NULL DEFAULT '[]'::jsonb,
        problems jsonb NOT NULL DEFAULT '[]'::jsonb,
        blocked boolean NOT NULL DEFAULT false,
        escalations jsonb NOT NULL DEFAULT '[]'::jsonb,
        error_message text,
        root_proof_id uuid,
        version integer NOT NULL DEFAULT 1,
        approved boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_sc_proof_job ON sc_proof (job_id)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_sc_proof_business_name ON sc_proof (business_name)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_sc_proof_created ON sc_proof (created_at DESC)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_sc_proof_root ON sc_proof (root_proof_id, version DESC)');

    await q.query(`
      CREATE TABLE IF NOT EXISTS sc_proof_message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        root_proof_id uuid NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_sc_proof_message_root ON sc_proof_message (root_proof_id, created_at)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS sc_proof_message');
    await q.query('DROP TABLE IF EXISTS sc_proof');
  }
}
