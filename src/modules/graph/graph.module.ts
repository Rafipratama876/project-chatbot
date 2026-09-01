import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EngineModule } from '#/modules/engine/engine.module.js';
import { RenderModule } from '#/modules/render/render.module.js';
import { LlmModule } from '#/modules/llm/llm.module.js';
import { ProofGraph } from './proof.graph.js';

@Module({
  imports: [ConfigModule, EngineModule, RenderModule, LlmModule],
  providers: [ProofGraph],
  exports: [ProofGraph],
})
export class GraphModule {}
