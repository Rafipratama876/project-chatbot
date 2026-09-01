import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProofSheet1735776000000 implements MigrationInterface {
  name = 'ProofSheet1735776000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_proof ADD COLUMN IF NOT EXISTS sheet_html text');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE cl_proof DROP COLUMN IF EXISTS sheet_html');
  }
}
