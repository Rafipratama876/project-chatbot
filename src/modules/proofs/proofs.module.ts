import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { GraphModule } from '#/modules/graph/graph.module.js';
import { KnowledgeModule } from '#/modules/knowledge/knowledge.module.js';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { EngineModule } from '#/modules/engine/engine.module.js';
import { AuthModule } from '#/modules/auth/auth.module.js';
import { ProofsService } from './proofs.service.js';
import { ProofsController } from './proofs.controller.js';
import { PROOF_QUEUE } from '#/modules/queues/proof.queue.js';

@Module({
  imports: [
    DatabaseModule, GraphModule, KnowledgeModule, LlmModule, EngineModule, AuthModule,
    // Registered here as well as in QueuesModule: the controller needs the
    // producer, the worker lives elsewhere. registerQueue is idempotent.
    BullModule.registerQueue({ name: PROOF_QUEUE }),
  ],
  controllers: [ProofsController],
  providers: [ProofsService],
  exports: [ProofsService],
})
export class ProofsModule {}
