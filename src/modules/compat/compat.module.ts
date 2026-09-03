import { Module } from '@nestjs/common';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { ArtworkModule } from '#/modules/artwork/artwork.module.js';
import { ProofsModule } from '#/modules/proofs/proofs.module.js';
import { AuthModule } from '#/modules/auth/auth.module.js';
import { CompatController } from './compat.controller.js';
import { CompatService } from './compat.service.js';
import { RenderBundleService } from './render-bundle.service.js';

@Module({
  imports: [DatabaseModule, ArtworkModule, ProofsModule, AuthModule],
  controllers: [CompatController],
  providers: [CompatService, RenderBundleService],
})
export class CompatModule {}
