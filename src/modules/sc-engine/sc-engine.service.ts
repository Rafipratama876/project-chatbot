import { Injectable, Logger } from '@nestjs/common';
import { runSCEngine, type SCEngineResult } from '#/kb/engine/sc/sc-engine.js';
import type { SCEngineServices } from '#/kb/engine/sc/sc-rule.js';
import type { SCJobInput } from '#/kb/domain/sc-spec.js';
import { placeholderConverter, type ColourConverter } from '#/kb/domain/materials.js';
import { OpenAIClient } from '#/modules/llm/openai.client.js';
import { FreeTextResolverService } from '#/modules/llm/free-text-resolver.service.js';

export interface SCRunOptions {
  colourConverter?: ColourConverter;
  deterministicOnly?: boolean;
}

/**
 * Thin wrapper — the SC engine itself is a pure function in `src/kb/`, same
 * separation as `EngineService`/`runEngine` and `DLEngineService`/`runDLEngine`.
 * Reuses `FreeTextResolverService`/`OpenAIClient` (generic Nest LLM ports, no
 * Channel Letters or Dimensional Letters vocabulary baked into either) for
 * SC's own `Custom`/`Other` free-text resolution — does not call
 * `EngineService`/`DLEngineService` and does not import `ALL_RULES`/`DL_ALL_RULES`.
 */
@Injectable()
export class SCEngineService {
  private readonly logger = new Logger(SCEngineService.name);

  constructor(
    private readonly openai: OpenAIClient,
    private readonly freeText: FreeTextResolverService,
  ) {}

  async run(job: SCJobInput, options: SCRunOptions = {}): Promise<SCEngineResult> {
    const useLlm = this.openai.enabled && !options.deterministicOnly;

    const services: SCEngineServices = {
      colourConverter: options.colourConverter ?? placeholderConverter,
      minConfidence: this.openai.minConfidence,
      ...(useLlm ? { resolveFreeText: this.freeText.resolve } : {}),
    };

    const result = await runSCEngine(job, { services });

    this.logger.log(
      `${job.jobId}: cabinet ${result.spec.faceMaterial}, `
      + `${result.trace.entries.length} trace entries`
      + (result.spec.blocked ? ' — BLOCKED' : '')
      + (result.spec.escalations.length ? ` — ${result.spec.escalations.length} escalation(s)` : ''),
    );

    return result;
  }
}
