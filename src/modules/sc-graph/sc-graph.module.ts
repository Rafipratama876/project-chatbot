import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SCEngineModule } from '#/modules/sc-engine/sc-engine.module.js';
import { RenderModule } from '#/modules/render/render.module.js';
import { SCProofGraph } from './sc-proof.graph.js';

@Module({
  imports: [ConfigModule, SCEngineModule, RenderModule],
  providers: [SCProofGraph],
  exports: [SCProofGraph],
})
export class SCGraphModule {}
