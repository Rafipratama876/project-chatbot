import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { SCGraphModule } from '#/modules/sc-graph/sc-graph.module.js';
import { ArtworkModule } from '#/modules/artwork/artwork.module.js';
import { WallPresetsModule } from '#/modules/wall-presets/wall-presets.module.js';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { SCProofEntity, SCProofMessageEntity } from '#/modules/database/entities/sc-proof.entity.js';
import { SCProofsService } from './sc-proofs.service.js';
import { SCProofsController } from './sc-proofs.controller.js';
import { SCKnowledgeController } from './sc-knowledge.controller.js';
import { SCJobBuilderService } from './sc-job-builder.service.js';
import { SCRevisionPatchService } from './sc-revision-patch.service.js';
import { SCExportService } from './sc-export.service.js';

@Module({
  imports: [
    DatabaseModule, SCGraphModule, ArtworkModule, WallPresetsModule, LlmModule,
    TypeOrmModule.forFeature([SCProofEntity, SCProofMessageEntity]),
  ],
  controllers: [SCProofsController, SCKnowledgeController],
  providers: [SCProofsService, SCJobBuilderService, SCRevisionPatchService, SCExportService],
  exports: [SCProofsService],
})
export class SCProofsModule {}
