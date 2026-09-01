import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ENTITIES, MIGRATIONS } from './data-source.js';

/**
 * Refuse to serve against a schema that is not there.
 *
 * Connectivity and schema are different failures, and only the first was being
 * checked. The app connected, booted, reported healthy and served for as long
 * as nobody wrote anything — then the first proof failed with
 * `relation "cl_proof" does not exist`, a request-time error for a condition
 * that was knowable at startup.
 *
 * A missing schema is almost always a fresh volume with no migration run, and
 * that has a one-line fix. Saying so at boot costs one query.
 */
@Injectable()
export class SchemaGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaGuard.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    const expected = ENTITIES.map((e) => this.dataSource.getMetadata(e).tableName);

    const rows = await this.dataSource.query<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'current_schema'
         OR schemaname = current_schema()`,
    );
    const present = new Set(rows.map((r) => r.tablename));
    const missing = expected.filter((t) => !present.has(t));

    if (missing.length === 0) {
      await this.warnOnPendingMigrations();
      return;
    }

    const db = this.dataSource.options.database as string;
    this.logger.error([
      '',
      `The database "${db}" is missing ${missing.length} of ${expected.length} tables:`,
      `  ${missing.join(', ')}`,
      '',
      present.size === 0
        ? 'It is empty — the schema has never been created here.'
        : 'It is partly created, which usually means a migration failed halfway.',
      '',
      'Run the migrations:',
      '    npm run migration:run',
      '',
      'This happens after `docker compose down -v`, or the first time a new',
      'DB_NAME is used: Postgres creates the database on first boot but nothing',
      'creates the tables.',
      '',
    ].join('\n'));

    // Failing here rather than on the first write: a server that accepts jobs
    // it cannot store is worse than one that will not start.
    process.exit(1);
  }

  /**
   * Tables present but migrations behind is the subtler case — the app works
   * until it touches a column the newest migration added.
   */
  private async warnOnPendingMigrations(): Promise<void> {
    try {
      const applied = await this.dataSource.query<Array<{ name: string }>>(
        'SELECT name FROM migrations',
      );
      const names = new Set(applied.map((m) => m.name));
      const pending = MIGRATIONS.map((m) => m.name).filter((n) => !names.has(n));

      if (pending.length > 0) {
        this.logger.warn(
          `${pending.length} migration(s) have not been applied: ${pending.join(', ')}. ` +
          'Run `npm run migration:run` — the schema is behind the code.',
        );
      }
    } catch {
      // No migrations table at all: the schema was created some other way.
      this.logger.warn('No migrations table found — the schema was not created by a migration.');
    }
  }
}
