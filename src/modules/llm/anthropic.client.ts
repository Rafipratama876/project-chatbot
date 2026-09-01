import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/**
 * The only Anthropic client in the application.
 *
 * Four nodes use it, and none of them is the renderer:
 *   1. §1.2 / §7.1 free-text resolution  → FreeTextResolverService
 *   2. CL-R-54 logo-mark judgment        → LogoComplexityService
 *   3. §9.4 customer-facing callouts     → CalloutWriterService
 *   4. Revision request → form patch     → RevisionPatchService
 *
 * The 56 rules, the decision tree, the offsets, the geometry and the lighting
 * are deterministic and stay that way.
 */
@Injectable()
export class AnthropicClient {
  private readonly logger = new Logger(AnthropicClient.name);
  private client: Anthropic | null = null;

  readonly model: string;
  readonly minConfidence: number;
  private readonly featureEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.model = config.get<string>('llm.model') ?? 'claude-opus-5';
    this.minConfidence = config.get<number>('llm.minConfidence') ?? 0.75;
    this.featureEnabled = config.get<boolean>('llm.enabled') ?? false;
  }

  /**
   * False is a supported state, not a degraded one. The engine runs all 56
   * rules either way; the two decision points escalate instead of guessing,
   * which is what KB §1.2 and §3.5 ask for.
   */
  get enabled(): boolean {
    if (!this.featureEnabled) return false;
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  get sdk(): Anthropic {
    if (!this.enabled) {
      throw new Error('LLM nodes are disabled — check `enabled` before calling.');
    }
    // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login`
    // profile. No key is hardcoded here.
    this.client ??= new Anthropic();
    return this.client;
  }

  /**
   * Shared framing, cached as a system block.
   *
   * The KB is 53 KB and fits in context whole, so it is never chunked into a
   * vector store: a retrieval miss on a rule means the rule silently did not
   * run, and nothing would surface that. Retrieval is for Appendix A/B and past
   * proofs — see KnowledgeModule.
   */
  static readonly FRAMING = [
    'You are assisting a pre-sales channel-letter proof engine for Sign Pack.',
    'A deterministic rule engine has already made every geometric, material and',
    'lighting decision. You are being asked for one bounded judgment at a time.',
    'Never invent dimensions, materials, colours or rule IDs.',
    'When the evidence does not support a confident answer, say so — a low',
    'confidence score routes the job to a human, which is the correct outcome.',
  ].join(' ');

  /**
   * A safety refusal returns HTTP 200 with `stop_reason: "refusal"`, so it does
   * not throw and would otherwise read as an empty answer.
   */
  unwrap<T>(response: {
    stop_reason?: string | null;
    stop_details?: unknown;
    parsed_output?: T | null;
  }): { value: T | null; refused: boolean; reason?: string } {
    if (response.stop_reason === 'refusal') {
      const details = response.stop_details as { category?: string; explanation?: string } | null;
      const reason = details?.explanation ?? details?.category ?? 'refusal';
      this.logger.warn(`request refused: ${reason}`);
      return { value: null, refused: true, reason };
    }
    return { value: response.parsed_output ?? null, refused: false };
  }
}
