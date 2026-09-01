import { Module } from '@nestjs/common';
import { ArtworkService } from './artwork.service.js';
import { RasterService } from './raster.service.js';
import { ArtworkController } from './artwork.controller.js';

@Module({
  controllers: [ArtworkController],
  providers: [ArtworkService, RasterService],
  exports: [ArtworkService, RasterService],
})
export class ArtworkModule {}
