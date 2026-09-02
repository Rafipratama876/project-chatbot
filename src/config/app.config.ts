import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  /** Where rendered proof panels are written. */
  proofDir: process.env.PROOF_DIR ?? './storage/proofs',
  /** Origin used in image URLs returned to external TSP clients. */
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
}));
