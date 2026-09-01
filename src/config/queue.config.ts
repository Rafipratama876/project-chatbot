import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  /** A render holds a Chromium page; more than a few per worker thrashes. */
  concurrency: Number(process.env.PROOF_CONCURRENCY ?? 2),
  attempts: Number(process.env.PROOF_ATTEMPTS ?? 2),
}));
