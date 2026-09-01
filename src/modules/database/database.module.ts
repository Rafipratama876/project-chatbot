import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES, MIGRATIONS } from './data-source.js';
import { SchemaGuard } from './schema.guard.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.database'),
        entities: ENTITIES,
        migrations: MIGRATIONS,
        // The schema is owned by migrations. `synchronize` would silently drop
        // the pgvector column types and the HNSW indexes on every boot.
        synchronize: config.get<boolean>('database.synchronize') ?? false,
        logging: config.get<boolean>('database.logging') ?? false,
      }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: [SchemaGuard],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
