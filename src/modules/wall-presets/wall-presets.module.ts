import { Module } from '@nestjs/common';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { WallPresetsService } from './wall-presets.service.js';
import { WallPresetsController } from './wall-presets.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WallPresetsController],
  providers: [WallPresetsService],
  exports: [WallPresetsService],
})
export class WallPresetsModule {}
