import { Module } from '@nestjs/common';
import { KnowledgeModule } from '#/modules/knowledge/knowledge.module.js';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { EngineService } from './engine.service.js';

@Module({
  imports: [KnowledgeModule, LlmModule],
  providers: [EngineService],
  exports: [EngineService],
})
export class EngineModule {}
