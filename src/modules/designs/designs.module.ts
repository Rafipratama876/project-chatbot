import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { ArtworkModule } from '#/modules/artwork/artwork.module.js';
import { ProofsModule } from '#/modules/proofs/proofs.module.js';
import { PROOF_QUEUE } from '#/modules/queues/proof.queue.js';
import { DesignsService } from './designs.service.js';
import { DesignsController } from './designs.controller.js';
import { ExportService } from './export.service.js';

@Module({
  imports: [
    DatabaseModule,
    ArtworkModule,
    ProofsModule,
    // The queue itself is configured once in QueuesModule; registering the
    // name here only asks for a client to push onto it.
    BullModule.registerQueue({ name: PROOF_QUEUE }),
  ],
  controllers: [DesignsController],
  providers: [DesignsService, ExportService],
  exports: [DesignsService],
})
export class DesignsModule {}
