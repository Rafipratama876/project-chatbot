import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { DLGraphModule } from '#/modules/dl-graph/dl-graph.module.js';
import { ArtworkModule } from '#/modules/artwork/artwork.module.js';
import { WallPresetsModule } from '#/modules/wall-presets/wall-presets.module.js';
import { DLProofEntity } from '#/modules/database/entities/dl-proof.entity.js';
import { DLProofsService } from './dl-proofs.service.js';
import { DLProofsController } from './dl-proofs.controller.js';
import { DLKnowledgeController } from './dl-knowledge.controller.js';
import { DLJobBuilderService } from './dl-job-builder.service.js';

@Module({
  imports: [
    DatabaseModule, DLGraphModule, ArtworkModule, WallPresetsModule,
    TypeOrmModule.forFeature([DLProofEntity]),
  ],
  controllers: [DLProofsController, DLKnowledgeController],
  providers: [DLProofsService, DLJobBuilderService],
  exports: [DLProofsService],
})
export class DLProofsModule {}
