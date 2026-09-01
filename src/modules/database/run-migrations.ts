import { dataSource } from './data-source.js';

const target = `${dataSource.options.database as string} on ` +
  `${(dataSource.options as { host?: string }).host}:${(dataSource.options as { port?: number }).port}`;

try {
  const ds = await dataSource.initialize();
  const applied = await ds.runMigrations();
  console.log(applied.length
    ? `applied to ${target}: ${applied.map((m) => m.name).join(', ')}`
    : `nothing to apply — ${target} is up to date`);
  await ds.destroy();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`migration failed against ${target}\n  ${message}`);

  // Two failures account for almost every case, and both have a one-line fix.
  if (/does not exist/.test(message)) {
    console.error(
      '\n  POSTGRES_DB only takes effect the first time the data directory is\n' +
      '  created. If you changed DB_NAME after the container had already run,\n' +
      '  the old database is still there and the new one was never created.\n\n' +
      '  Either recreate the volume (this deletes the data):\n' +
      '    docker compose down -v && docker compose up -d\n\n' +
      '  or add the database to the existing one (this keeps it):\n' +
      `    docker compose exec postgres createdb -U postgres ${dataSource.options.database as string}`,
    );
  } else if (/ECONNREFUSED/.test(message)) {
    console.error(
      '\n  Nothing is listening there. Check the containers are up:\n' +
      '    docker compose ps\n' +
      '  and that .env exists — DB_PORT defaults to 5433, not 5432.',
    );
  }
  process.exit(1);
}
