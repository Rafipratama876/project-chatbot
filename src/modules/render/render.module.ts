import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RenderService } from './render.service.js';

@Module({
  imports: [ConfigModule],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}
