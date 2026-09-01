import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WallPresetsService } from './wall-presets.service.js';
import type { WallPresetEntity } from '#/modules/database/entities/wall-preset.entity.js';

@ApiTags('wall-presets')
@Controller({ path: 'wall-presets', version: '1' })
export class WallPresetsController {
  constructor(private readonly presets: WallPresetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Stock walls to try a sign against.',
    description:
      'Convenience only. A preset is not the customer’s building, so nothing '
      + 'measured against it describes their site — the proof says so.',
  })
  async list(): Promise<WallPresetEntity[]> {
    return this.presets.list();
  }
}
