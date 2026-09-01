import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { KnowledgeModule } from '#/modules/knowledge/knowledge.module.js';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, KnowledgeModule, LlmModule],
  controllers: [HealthController],
})
export class HealthModule {}
