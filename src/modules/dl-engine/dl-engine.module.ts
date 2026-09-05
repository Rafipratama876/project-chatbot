import { Module } from '@nestjs/common';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { DLEngineService } from './dl-engine.service.js';

@Module({
  imports: [LlmModule],
  providers: [DLEngineService],
  exports: [DLEngineService],
})
export class DLEngineModule {}
