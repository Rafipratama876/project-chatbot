import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Designs, wall presets and the revision conversation.
 *
 * A design is the editable intake; a proof stays what it was — one immutable
 * run of the gates. `cl_proof` gains a design and a version so a design's
 * history is the proofs it produced, in order, rather than a spec that was
 * edited behind the gates' backs.
 */
export class Designs1735862400000 implements MigrationInterface {
  name = 'Designs1735862400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS cl_wall_preset (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        image_url text NOT NULL,
        description text,
        image_width integer NOT NULL,
        image_height integer NOT NULL,
        image_width_inches double precision NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS cl_design (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        status text NOT NULL DEFAULT 'DRAFT',
        logo_url text,
        logo_text text,
        wall_preset_id uuid REFERENCES cl_wall_preset(id) ON DELETE SET NULL,
        custom_wall_image_url text,
        position_x double precision,
        position_y double precision,
        scale double precision,
        width_inches double precision,
        height_inches double precision,
        area_sq_ft double precision,
        max_sign_area_allowed double precision,
        facade_rect jsonb,
        wall_image_width integer,
        wall_image_height integer,
        spec jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_design_wall_preset ON cl_design (wall_preset_id)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_design_updated ON cl_design (updated_at DESC)');

    await q.query(`
      CREATE TABLE IF NOT EXISTS cl_design_message (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        design_id uuid NOT NULL REFERENCES cl_design(id) ON DELETE CASCADE,
        role text NOT NULL,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query('CREATE INDEX IF NOT EXISTS idx_design_message_design ON cl_design_message (design_id, created_at)');

    await q.query('ALTER TABLE cl_proof ADD COLUMN IF NOT EXISTS design_id uuid');
    await q.query('ALTER TABLE cl_proof ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1');
    await q.query('CREATE INDEX IF NOT EXISTS idx_proof_design ON cl_proof (design_id, version DESC)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IF EXISTS idx_proof_design');
    await q.query('ALTER TABLE cl_proof DROP COLUMN IF EXISTS version');
    await q.query('ALTER TABLE cl_proof DROP COLUMN IF EXISTS design_id');
    await q.query('DROP TABLE IF EXISTS cl_design_message');
    await q.query('DROP TABLE IF EXISTS cl_design');
    await q.query('DROP TABLE IF EXISTS cl_wall_preset');
  }
}
