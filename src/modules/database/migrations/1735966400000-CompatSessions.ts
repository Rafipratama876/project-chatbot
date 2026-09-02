import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompatSessions1735966400000 implements MigrationInterface {
  name = 'CompatSessions1735966400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE cl_compat_session (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id text NOT NULL,
        sign_detail_id text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        project_json jsonb NOT NULL,
        base_job jsonb NOT NULL,
        approved_proof_id uuid REFERENCES cl_proof(id) ON DELETE SET NULL,
        finalized_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, sign_detail_id)
      )
    `);
    await q.query('CREATE INDEX idx_compat_session_project ON cl_compat_session (project_id)');
    await q.query(`
      CREATE TABLE cl_compat_message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES cl_compat_session(id) ON DELETE CASCADE,
        role text NOT NULL,
        text text NOT NULL,
        mode text,
        image_url text,
        proof_id uuid REFERENCES cl_proof(id) ON DELETE SET NULL,
        version_label text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX idx_compat_message_session ON cl_compat_message (session_id, created_at)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS cl_compat_message');
    await q.query('DROP TABLE IF EXISTS cl_compat_session');
  }
}
