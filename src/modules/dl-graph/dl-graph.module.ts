import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DLEngineModule } from '#/modules/dl-engine/dl-engine.module.js';
import { RenderModule } from '#/modules/render/render.module.js';
import { DLProofGraph } from './dl-proof.graph.js';

@Module({
  imports: [ConfigModule, DLEngineModule, RenderModule],
  providers: [DLProofGraph],
  exports: [DLProofGraph],
})
export class DLGraphModule {}
