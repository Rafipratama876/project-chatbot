import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from '#/config/app.config.js';
import databaseConfig from '#/config/database.config.js';
import llmConfig from '#/config/llm.config.js';
import renderConfig from '#/config/render.config.js';
import queueConfig from '#/config/queue.config.js';
import storageConfig from '#/config/storage.config.js';
import enhanceConfig from '#/config/enhance.config.js';
import { DatabaseModule } from './database/database.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { EngineModule } from './engine/engine.module.js';
import { RenderModule } from './render/render.module.js';
import { LlmModule } from './llm/llm.module.js';
import { GraphModule } from './graph/graph.module.js';
import { ArtworkModule } from './artwork/artwork.module.js';
import { ProofsModule } from './proofs/proofs.module.js';
import { HealthModule } from './health/health.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { WallPresetsModule } from './wall-presets/wall-presets.module.js';
import { DesignsModule } from './designs/designs.module.js';
import { DLProofsModule } from './dl-proofs/dl-proofs.module.js';
import { SCProofsModule } from './sc-proofs/sc-proofs.module.js';

/**
 * Module graph:
 *
 *   Designs ─► Proofs ──► Graph ──► Engine ──► Knowledge (thresholds)
 *      │                     │          └────► Llm       (CL-R-54, §1.2/§7.1)
 *      │                     ├──► Render     (three.js, no model)
 *      │                     └──► Llm        (§9.4 wording, revision patches)
 *      └──► Storage, Uploads, WallPresets
 *
 * Designs is the wizard's own layer: editable intake, kept across sessions.
 * It never writes a spec — it builds a job and asks Proofs to run the gates,
 * so nothing reaches a customer that the 56 rules have not seen.
 *
 * `src/kb/` sits underneath all of it and imports none of it. That direction is
 * the point: the rule engine is a pure function over plain data, so the 56
 * rules stay testable without an application context.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        appConfig, databaseConfig, llmConfig, renderConfig, queueConfig,
        storageConfig, enhanceConfig,
      ],
      isGlobal: true,
      cache: true,
    }),
    DatabaseModule,
    KnowledgeModule,
    LlmModule,
    EngineModule,
    RenderModule,
    GraphModule,
    ArtworkModule,
    ProofsModule,
    QueuesModule,
    StorageModule,
    UploadsModule,
    WallPresetsModule,
    DesignsModule,
    // Dimensional Letters — a second, independent pipeline (src/kb/engine/dl/,
    // src/kb/output/dl-*.ts). Shares only the `Proof` output type and the
    // three.js renderer; no CL-R rule is imported by anything under this.
    DLProofsModule,
    // Sign Cabinets — a third, independent pipeline (src/kb/engine/sc/,
    // src/kb/output/sc-*.ts). Shares only the `Proof` output type and the
    // three.js renderer; no CL-R rule or DL rule is imported by anything
    // under this.
    SCProofsModule,
    HealthModule,
  ],
})
export class AppModule {}
