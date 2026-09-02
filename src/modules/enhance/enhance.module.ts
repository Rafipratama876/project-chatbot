import { Module } from '@nestjs/common';
import { EnhanceService } from './enhance.service.js';

@Module({
  providers: [EnhanceService],
  exports: [EnhanceService],
})
export class EnhanceModule {}
