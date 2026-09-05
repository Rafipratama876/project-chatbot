import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck, HealthCheckService, TypeOrmHealthIndicator, HealthIndicatorResult,
} from '@nestjs/terminus';
import { ThresholdService } from '#/modules/knowledge/threshold.service.js';
import { OpenAIClient } from '#/modules/llm/openai.client.js';
import { EmbeddingService } from '#/modules/knowledge/embedding.service.js';
import { KB_RULE_IDS, implementedRuleIds } from '#/kb/engine/rules/index.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly thresholds: ThresholdService,
    private readonly openai: OpenAIClient,
    private readonly embeddings: EmbeddingService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.ruleCoverage(),
      () => this.optionalFeatures(),
    ]);
  }

  /**
   * A missing rule is not a warning. It means a KB constraint silently never
   * runs, which is exactly the failure this system is built to make impossible.
   */
  private ruleCoverage(): HealthIndicatorResult {
    const implemented = implementedRuleIds();
    const missing = KB_RULE_IDS.filter((id) => !implemented.has(id));
    return {
      rules: {
        status: missing.length === 0 ? 'up' : 'down',
        declared: KB_RULE_IDS.length,
        covered: KB_RULE_IDS.length - missing.length,
        missing,
      },
    };
  }

  /**
   * The LLM nodes and the embedding provider being off is a supported
   * configuration, not a degraded one — reported, never failed.
   */
  private optionalFeatures(): HealthIndicatorResult {
    return {
      features: {
        status: 'up',
        llmNodes: this.openai.enabled ? 'enabled' : 'disabled (judgments escalate)',
        embeddings: this.embeddings.enabled ? 'enabled' : 'disabled (vendor search uses full text)',
        unverifiedThresholds: this.thresholds.unverified().length,
      },
    };
  }
}
