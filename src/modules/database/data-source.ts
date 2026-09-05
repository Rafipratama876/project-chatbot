import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { ThresholdEntity } from './entities/threshold.entity.js';
import { ThresholdReadEntity } from './entities/threshold-read.entity.js';
import { ProofEntity } from './entities/proof.entity.js';
import { VendorReferenceEntity } from './entities/vendor-reference.entity.js';
import { DesignReferenceEntity } from './entities/design-reference.entity.js';
import { DesignEntity, DesignMessageEntity } from './entities/design.entity.js';
import { WallPresetEntity } from './entities/wall-preset.entity.js';
import { DLProofEntity } from './entities/dl-proof.entity.js';
import { InitialSchema1735689600000 } from './migrations/1735689600000-InitialSchema.js';
import { ProofSheet1735776000000 } from './migrations/1735776000000-ProofSheet.js';
import { Designs1735862400000 } from './migrations/1735862400000-Designs.js';
import { SignBoxHeight1735880000000 } from './migrations/1735880000000-SignBoxHeight.js';
import { DimensionalLetters1736000000000 } from './migrations/1736000000000-DimensionalLetters.js';

export const ENTITIES = [
  ThresholdEntity,
  ThresholdReadEntity,
  ProofEntity,
  VendorReferenceEntity,
  DesignReferenceEntity,
  DesignEntity,
  DesignMessageEntity,
  WallPresetEntity,
  // Dimensional Letters — its own table (dl_proof); see
  // migrations/1736000000000-DimensionalLetters.ts. Nothing above this line
  // is touched by it.
  DLProofEntity,
];

export const MIGRATIONS = [
  InitialSchema1735689600000,
  ProofSheet1735776000000,
  Designs1735862400000,
  SignBoxHeight1735880000000,
  DimensionalLetters1736000000000,
];

// The Nest app loads .env through ConfigModule, but the migration CLI never
// boots Nest — it reads process.env directly. Without this it silently falls
// back to the defaults and connects to port 5432 instead of the container on
// 5433, which surfaces as ECONNREFUSED or, worse, as a successful connection to
// an unrelated Postgres.
if (existsSync('.env')) loadEnv({ path: '.env' });

/** Used by the migration CLI; the app builds its own from ConfigService. */
export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'ai_channel_letters',
  entities: ENTITIES,
  migrations: MIGRATIONS,
  synchronize: false,
});
