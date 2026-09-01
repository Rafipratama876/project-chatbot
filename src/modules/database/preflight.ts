import { Logger } from '@nestjs/common';
import { createConnection } from 'node:net';

export interface Endpoint { label: string; host: string; port: number; hint: string }

/**
 * Check the services are reachable before Nest starts wiring modules.
 *
 * TypeORM's own failure is `AggregateError [ECONNREFUSED]` with no host, no
 * port and no hint, repeated ten times over thirty seconds. It is technically
 * accurate and practically useless: the two things a developer needs to know —
 * *where* it tried and *what to do* — are the two things it does not say.
 *
 * A refused TCP connect is almost always one of three things, and all three
 * have a one-line fix.
 */
export async function preflight(endpoints: Endpoint[]): Promise<void> {
  const logger = new Logger('preflight');
  const down: Endpoint[] = [];

  for (const endpoint of endpoints) {
    const reachable = await canConnect(endpoint.host, endpoint.port);
    if (!reachable) down.push(endpoint);
  }

  if (down.length === 0) return;

  const lines = [
    '',
    'Cannot reach ' + down.map((d) => `${d.label} (${d.host}:${d.port})`).join(' or ') + '.',
    '',
    ...down.map((d) => `  ${d.label}: ${d.hint}`),
    '',
    'Most likely the containers are not running:',
    '    docker compose up -d',
    '',
    'If they are, check .env against compose.yaml — compose reads DB_PORT and',
    'REDIS_PORT from the same file the app does, so a value edited in one place',
    'moves both. `docker compose ps` shows what is actually bound.',
    '',
  ];
  logger.error(lines.join('\n'));
  process.exit(1);
}

function canConnect(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}
