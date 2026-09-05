import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * The only text/vision model client in the application — paired with
 * `EnhanceModule`'s own `OpenAI` client (image generation, `gpt-image-1`) as
 * the other half of the single OpenAI "hole" this app calls out to. Four
 * nodes use this one, and none of them is the renderer:
 *   1. §1.2 / §7.1 free-text resolution  → FreeTextResolverService
 *   2. CL-R-54 logo-mark judgment        → LogoComplexityService
 *   3. §9.4 customer-facing callouts     → CalloutWriterService
 *   4. Revision request → form patch     → RevisionPatchService
 *
 * The 56 rules, the decision tree, the offsets, the geometry and the lighting
 * are deterministic and stay that way.
 */
@Injectable()
export class OpenAIClient {
  private readonly logger = new Logger(OpenAIClient.name);
  private client: OpenAI | null = null;

  readonly model: string;
  readonly minConfidence: number;
  private readonly featureEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.model = config.get<string>('llm.model') ?? 'gpt-5.1';
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
    return Boolean(process.env.OPENAI_API_KEY);
  }

  get sdk(): OpenAI {
    if (!this.enabled) {
      throw new Error('LLM nodes are disabled — check `enabled` before calling.');
    }
    // Same OPENAI_API_KEY the image-enhancement client reads — one credential
    // for both halves of the app's one AI provider.
    this.client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this.client;
  }

  /**
   * Shared framing, passed as `instructions` on every Responses API call.
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
   * A safety refusal on the Responses API is a `refusal` content block inside
   * an otherwise-200 response, not a thrown error — so it would otherwise read
   * as an empty parsed answer.
   */
  unwrap<T>(response: {
    output_parsed?: T | null;
    output?: Array<{ type: string; content?: Array<{ type: string; refusal?: string }> }>;
  }): { value: T | null; refused: boolean; reason?: string } {
    const refusal = response.output
      ?.flatMap((item) => item.content ?? [])
      .find((c) => c.type === 'refusal');
    if (refusal) {
      this.logger.warn(`request refused: ${refusal.refusal ?? 'no explanation given'}`);
      return { value: null, refused: true, reason: refusal.refusal };
    }
    return { value: response.output_parsed ?? null, refused: false };
  }
}
