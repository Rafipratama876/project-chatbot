import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RenderService } from './render.service.js';
import { EnhanceModule } from '#/modules/enhance/enhance.module.js';

@Module({
  imports: [ConfigModule, EnhanceModule],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}
