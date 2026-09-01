import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WallPresetEntity } from '#/modules/database/entities/wall-preset.entity.js';
import { StorageService } from '#/modules/storage/storage.service.js';
import { Canvas, PRESETS, PRESET_HEIGHT, PRESET_WIDTH } from './wall-preset.seed.js';

@Injectable()
export class WallPresetsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WallPresetsService.name);

  constructor(
    @InjectRepository(WallPresetEntity) private readonly presets: Repository<WallPresetEntity>,
    private readonly storage: StorageService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed().catch((error: unknown) => {
      // A missing preset gallery is a worse first run, not a broken one: every
      // real job uploads a photograph of its own building.
      this.logger.warn(`wall presets not seeded: ${String(error)}`);
    });
  }

  async list(): Promise<WallPresetEntity[]> {
    return this.presets.find({ order: { sortOrder: 'ASC' } });
  }

  /**
   * Draws and stores any preset that is not already there.
   *
   * Keyed on the name so a new preset appears on the next boot without
   * redrawing (and re-storing) the ones already present.
   */
  private async seed(): Promise<void> {
    const existing = new Set((await this.presets.find()).map((p) => p.name));
    const missing = PRESETS.filter((p) => !existing.has(p.name));
    if (missing.length === 0) return;

    for (const [index, spec] of PRESETS.entries()) {
      if (existing.has(spec.name)) continue;
      const canvas = new Canvas(PRESET_WIDTH, PRESET_HEIGHT);
      spec.draw(canvas);
      const stored = await this.storage.save('presets', canvas.toPng(), 'image/png');

      await this.presets.save(this.presets.create({
        name: spec.name,
        description: spec.description,
        imageUrl: stored.url,
        imageWidth: PRESET_WIDTH,
        imageHeight: PRESET_HEIGHT,
        imageWidthInches: spec.imageWidthInches,
        sortOrder: index,
      }));
    }
    this.logger.log(`seeded ${missing.length} wall preset(s)`);
  }
}
