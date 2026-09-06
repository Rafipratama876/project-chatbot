import { Module } from '@nestjs/common';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { SCEngineService } from './sc-engine.service.js';

@Module({
  imports: [LlmModule],
  providers: [SCEngineService],
  exports: [SCEngineService],
})
export class SCEngineModule {}
