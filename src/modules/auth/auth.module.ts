import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';

/**
 * The shared-secret guard, provided once.
 *
 * `@UseGuards(ApiKeyGuard)` instantiates through the DI container, so every
 * module whose controllers carry it has to be able to resolve it — exporting it
 * from one place beats repeating the provider in each.
 */
@Module({
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
