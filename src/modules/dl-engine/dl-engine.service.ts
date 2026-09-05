import { Injectable, Logger } from '@nestjs/common';
import { runDLEngine, type DLEngineResult } from '#/kb/engine/dl/dl-engine.js';
import type { DLEngineServices } from '#/kb/engine/dl/dl-rule.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';
import { placeholderConverter, type ColourConverter } from '#/kb/domain/materials.js';
import { AnthropicClient } from '#/modules/llm/anthropic.client.js';
import { FreeTextResolverService } from '#/modules/llm/free-text-resolver.service.js';

export interface DLRunOptions {
  colourConverter?: ColourConverter;
  deterministicOnly?: boolean;
}

/**
 * Thin wrapper — the DL engine itself is a pure function in `src/kb/`, same
 * separation as `EngineService`/`runEngine`. Reuses `FreeTextResolverService`
 * / `AnthropicClient` (generic Nest LLM ports, no Channel Letters vocabulary
 * baked into either) for DL's own `Custom`/`Other` free-text resolution —
 * does not call `EngineService` and does not import `ALL_RULES`.
 */
@Injectable()
export class DLEngineService {
  private readonly logger = new Logger(DLEngineService.name);

  constructor(
    private readonly anthropic: AnthropicClient,
    private readonly freeText: FreeTextResolverService,
  ) {}

  async run(job: DLJobInput, options: DLRunOptions = {}): Promise<DLEngineResult> {
    const useLlm = this.anthropic.enabled && !options.deterministicOnly;

    const services: DLEngineServices = {
      colourConverter: options.colourConverter ?? placeholderConverter,
      minConfidence: this.anthropic.minConfidence,
      ...(useLlm ? { resolveFreeText: this.freeText.resolve } : {}),
    };

    const result = await runDLEngine(job, { services });

    this.logger.log(
      `${job.jobId}: ${result.spec.elements.length} DL element(s), `
      + `${result.trace.entries.length} trace entries`
      + (result.spec.blocked ? ' — BLOCKED' : '')
      + (result.spec.escalations.length ? ` — ${result.spec.escalations.length} escalation(s)` : ''),
    );

    return result;
  }
}
