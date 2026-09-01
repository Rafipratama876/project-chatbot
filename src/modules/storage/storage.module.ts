import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/**
 * Global because three unrelated modules read the same files: uploads writes
 * them, designs turns them into engine input, and the export renders them
 * into a PDF. Threading one stateless path resolver through each module's
 * imports would say less than this does.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
