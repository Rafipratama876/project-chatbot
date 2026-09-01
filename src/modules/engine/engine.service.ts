import { Injectable, Logger } from '@nestjs/common';
import { runEngine, type EngineResult } from '#/kb/engine/engine.js';
import type { EngineServices } from '#/kb/engine/rule.js';
import type { JobInput } from '#/kb/domain/spec.js';
import { placeholderConverter, type ColourConverter } from '#/kb/domain/materials.js';
import { ThresholdService } from '#/modules/knowledge/threshold.service.js';
import { AnthropicClient } from '#/modules/llm/anthropic.client.js';
import { FreeTextResolverService } from '#/modules/llm/free-text-resolver.service.js';
import { LogoComplexityService } from '#/modules/llm/logo-complexity.service.js';

export interface RunOptions {
  /** Per-job threshold overrides, e.g. a shop that stocks 4″ coil. */
  thresholdOverrides?: Record<string, number>;
  /** §4.7 CL-R-38/39. Without one, colours are named by system and marked indicative. */
  colourConverter?: ColourConverter;
  /** Force the deterministic path even when credentials are present. */
  deterministicOnly?: boolean;
}

/**
 * Thin wrapper. The engine itself is a pure function in `src/kb/` — this only
 * assembles its ports from DI and hands back what it returned.
 *
 * Deliberately thin: the moment engine logic starts living in a Nest service,
 * "does CL-R-51 fire at 4 inches?" stops being answerable without an
 * application context.
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly thresholds: ThresholdService,
    private readonly anthropic: AnthropicClient,
    private readonly freeText: FreeTextResolverService,
    private readonly logoComplexity: LogoComplexityService,
  ) {}

  async run(job: JobInput, options: RunOptions = {}): Promise<EngineResult> {
    const store = this.thresholds.createStore(options.thresholdOverrides ?? {});
    const useLlm = this.anthropic.enabled && !options.deterministicOnly;

    const services: EngineServices = {
      colourConverter: options.colourConverter ?? placeholderConverter,
      minConfidence: this.anthropic.minConfidence,
      ...(useLlm
        ? {
            resolveFreeText: this.freeText.resolve,
            logoComplexity: this.logoComplexity.forRun(store),
          }
        : {}),
    };

    const result = await runEngine(job, { thresholds: store, services });

    this.logger.log(
      `${job.jobId}: ${result.spec.elements.length} element(s), ` +
      `${result.trace.entries.length} trace entries, ${result.passes} validation pass(es)` +
      (result.spec.blocked ? ' — BLOCKED by CL-R-46' : '') +
      (result.spec.escalations.length ? ` — ${result.spec.escalations.length} escalation(s)` : ''),
    );

    return result;
  }
}
