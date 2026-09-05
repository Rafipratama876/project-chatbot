import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIClient } from './openai.client.js';
import { FreeTextResolverService } from './free-text-resolver.service.js';
import { LogoComplexityService } from './logo-complexity.service.js';
import { CalloutWriterService } from './callout-writer.service.js';
import { RevisionPatchService } from './revision-patch.service.js';

/**
 * The four places the KB genuinely needs judgment, and nowhere else.
 *
 * Two of them (free-text resolution, CL-R-54) are ports the rule engine calls
 * through `EngineServices`; the engine does not import this module, and without
 * it those rules escalate rather than guess. The other two run after the engine
 * has finished — one rewrites disclosures the trace already decided on, one
 * turns a revision request into a patch to the *form* so every gate re-runs.
 *
 * The renderer is not in this list. It never calls a model.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    OpenAIClient,
    FreeTextResolverService,
    LogoComplexityService,
    CalloutWriterService,
    RevisionPatchService,
  ],
  exports: [
    OpenAIClient,
    FreeTextResolverService,
    LogoComplexityService,
    CalloutWriterService,
    RevisionPatchService,
  ],
})
export class LlmModule {}
