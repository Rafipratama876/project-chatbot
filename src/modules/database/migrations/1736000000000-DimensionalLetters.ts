import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dimensional Letters — a separate table (`dl_proof`), not a column added to
 * `cl_proof`. Same shape as the `cl_proof` migration in
 * `1735689600000-InitialSchema.ts` (job/spec/trace jsonb, spec block,
 * disclosure text, sheet html, panels, problems, escalations), so a
 * Dimensional Letters proof is queryable and rendered the same way a Channel
 * Letters one is — without either table's migration ever touching the other.
 */
export class DimensionalLetters1736000000000 implements MigrationInterface {
  name = 'DimensionalLetters1736000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS dl_proof (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id text NOT NULL,
        business_name text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        dl_version text NOT NULL,
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
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_dl_proof_job ON dl_proof (job_id)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_dl_proof_business_name ON dl_proof (business_name)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_dl_proof_created ON dl_proof (created_at DESC)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS dl_proof');
  }
}
