import { Module } from '@nestjs/common';
import { DatabaseModule } from '#/modules/database/database.module.js';
import { ThresholdService } from './threshold.service.js';
import { EmbeddingService } from './embedding.service.js';
import { VendorReferenceService } from './vendor-reference.service.js';
import { DesignReferenceService } from './design-reference.service.js';
import { KnowledgeController } from './knowledge.controller.js';

/**
 * Everything the KB needs from outside the code.
 *
 * Two very different things live here on purpose, and the split is the point:
 *
 *   ThresholdService        — the numbers the 56 rules read. Exact lookup by
 *                             key, loaded at boot, fails loudly if a key is
 *                             missing. Never retrieved by similarity.
 *   Vendor/DesignReference  — Appendix A/B and past work. Retrieved by
 *                             similarity, safe to miss, never feeds a rule.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [KnowledgeController],
  providers: [ThresholdService, EmbeddingService, VendorReferenceService, DesignReferenceService],
  exports: [ThresholdService, EmbeddingService, VendorReferenceService, DesignReferenceService],
})
export class KnowledgeModule {}
