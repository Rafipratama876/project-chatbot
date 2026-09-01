import type { MigrationInterface, QueryRunner } from 'typeorm';
import { THRESHOLD_SEED } from '#/kb/domain/thresholds.js';

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

export class InitialSchema1735689600000 implements MigrationInterface {
  name = 'InitialSchema1735689600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS "vector"');
    await q.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // ── Thresholds ────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE cl_threshold (
        key        text PRIMARY KEY,
        value      numeric NOT NULL,
        unit       text NOT NULL CHECK (unit IN ('in','ft','pct','count','sqft')),
        source     text NOT NULL CHECK (source IN ('DER','AVG','SP','EXT','KB')),
        kb_ref     text NOT NULL,
        verified   boolean NOT NULL DEFAULT false,
        note       text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text
      )
    `);

    // Seed from the same constant the in-memory store uses, so a fresh
    // database and a unit test start from identical numbers.
    for (const t of THRESHOLD_SEED) {
      await q.query(
        `INSERT INTO cl_threshold (key, value, unit, source, kb_ref, verified, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [t.key, t.value, t.unit, t.source, t.kbRef, t.verified, t.note ?? null],
      );
    }

    // ── Proofs ────────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE cl_proof (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id          text NOT NULL,
        business_name   text NOT NULL,
        status          text NOT NULL DEFAULT 'queued',
        kb_version      text NOT NULL,
        job             jsonb NOT NULL,
        spec            jsonb,
        trace           jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_defaults  jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_refusals  jsonb NOT NULL DEFAULT '[]'::jsonb,
        spec_block      text,
        disclosure_text text,
        panels          jsonb NOT NULL DEFAULT '[]'::jsonb,
        problems        jsonb NOT NULL DEFAULT '[]'::jsonb,
        blocked         boolean NOT NULL DEFAULT false,
        escalations     jsonb NOT NULL DEFAULT '[]'::jsonb,
        error_message   text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX idx_cl_proof_job_id ON cl_proof (job_id)');
    await q.query('CREATE INDEX idx_cl_proof_business ON cl_proof (business_name)');
    await q.query('CREATE INDEX idx_cl_proof_status ON cl_proof (status)');
    // Finding every proof that fired a given rule is the audit question that
    // gets asked when a rule turns out to be wrong.
    await q.query("CREATE INDEX idx_cl_proof_trace ON cl_proof USING gin (trace jsonb_path_ops)");

    await q.query(`
      CREATE TABLE cl_proof_threshold_read (
        proof_id   uuid NOT NULL REFERENCES cl_proof(id) ON DELETE CASCADE,
        key        text NOT NULL REFERENCES cl_threshold(key),
        value_used numeric NOT NULL,
        PRIMARY KEY (proof_id, key)
      )
    `);
    await q.query('CREATE INDEX idx_threshold_read_key ON cl_proof_threshold_read (key)');

    // ── pgvector stores ───────────────────────────────────────────────────
    // Appendix A/B and design history only. The rules live in code — see the
    // entity docblocks for why.
    await q.query(`
      CREATE TABLE cl_vendor_reference (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        section    text NOT NULL,
        vendor     text,
        title      text NOT NULL,
        content    text NOT NULL,
        provenance text NOT NULL,
        kb_version text NOT NULL,
        embedding  vector(${EMBEDDING_DIMENSIONS}),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX idx_vendor_section ON cl_vendor_reference (section)');
    await q.query('CREATE INDEX idx_vendor_vendor ON cl_vendor_reference (vendor)');
    // Full text is the fallback when no embedding provider is configured, so a
    // deployment without one still gets useful vendor lookup.
    await q.query(`
      CREATE INDEX idx_vendor_fts ON cl_vendor_reference
      USING gin (to_tsvector('english', title || ' ' || content))
    `);
    await q.query(`
      CREATE INDEX idx_vendor_embedding ON cl_vendor_reference
      USING hnsw (embedding vector_cosine_ops)
    `);

    await q.query(`
      CREATE TABLE cl_design_reference (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        proof_id      uuid REFERENCES cl_proof(id) ON DELETE SET NULL,
        business_name text NOT NULL,
        summary       text NOT NULL,
        sign_type     text NOT NULL,
        constructions jsonb NOT NULL DEFAULT '[]'::jsonb,
        mount_method  text NOT NULL,
        embedding     vector(${EMBEDDING_DIMENSIONS}),
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX idx_design_sign_type ON cl_design_reference (sign_type)');
    await q.query(`
      CREATE INDEX idx_design_embedding ON cl_design_reference
      USING hnsw (embedding vector_cosine_ops)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS cl_design_reference');
    await q.query('DROP TABLE IF EXISTS cl_vendor_reference');
    await q.query('DROP TABLE IF EXISTS cl_proof_threshold_read');
    await q.query('DROP TABLE IF EXISTS cl_proof');
    await q.query('DROP TABLE IF EXISTS cl_threshold');
  }
}
