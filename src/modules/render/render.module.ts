import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RenderService } from './render.service.js';
import { AiRenderService } from './ai-render.service.js';
import { BoardRendererService } from './board-renderer.service.js';
import { BoardService } from './board.service.js';

@Module({
  imports: [ConfigModule],
  providers: [RenderService, AiRenderService, BoardRendererService, BoardService],
  exports: [RenderService, BoardService],
})
export class RenderModule {}
