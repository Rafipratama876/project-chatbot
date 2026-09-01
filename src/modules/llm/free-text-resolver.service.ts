import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnthropicClient } from './anthropic.client.js';
import type { FreeTextRequest, FreeTextResolution } from '#/kb/engine/rule.js';

/**
 * NODE 1 — §1.2 "Custom" and §7.1 "Other".
 *
 * The only free-text fields in the Wolf Studio form. The KB is explicit about
 * the failure mode: "Cannot resolve → escalate." So this returns a confidence
 * and the engine discards anything under the threshold. It never picks the
 * nearest option to keep the pipeline moving.
 */
const ResolutionSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  /** Quoted from the customer's own text, so the answer is auditable. */
  evidence: z.string(),
});

@Injectable()
export class FreeTextResolverService {
  private readonly logger = new Logger(FreeTextResolverService.name);

  constructor(private readonly anthropic: AnthropicClient) {}

  readonly resolve = async (req: FreeTextRequest): Promise<FreeTextResolution> => {
    if (!this.anthropic.enabled) {
      return { value: null, confidence: 0, reason: 'LLM nodes are disabled.' };
    }
    if (!req.text.trim()) {
      return { value: null, confidence: 0, reason: 'Additional Information is empty.' };
    }

    const options = req.allowed.map((id) => `  ${id} — ${req.labels[id] ?? id}`).join('\n');

    const response = await this.anthropic.sdk.messages.parse({
      model: this.anthropic.model,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(ResolutionSchema) },
      system: [{
        type: 'text',
        text: `${AnthropicClient.FRAMING}

The customer selected a catch-all value for "${req.field}". Resolve it to exactly
one of the options below, using only what the Additional Information field says.

Options:
${options}

Rules:
- Return the option ID verbatim, or null.
- Return null with low confidence when the text does not clearly indicate one of
  these. Escalating to a human is the correct outcome, not a failure.
- Quote the words you relied on in "evidence". If you cannot quote anything, the
  confidence is below 0.5.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: `Additional Information:\n"""\n${req.text}\n"""` }],
    });

    const { value, refused, reason } = this.anthropic.unwrap(response);
    if (refused || !value) return { value: null, confidence: 0, reason: reason ?? 'no parsed output' };

    // The closed set is enforced here, not trusted from the model. A returned
    // ID outside `allowed` is a wrong answer, not a new option.
    const ok = value.value !== null && req.allowed.includes(value.value);
    if (!ok && value.value !== null) {
      this.logger.warn(`resolver returned "${value.value}", outside the allowed set for ${req.field}`);
    }

    return {
      value: ok ? value.value : null,
      confidence: ok ? value.confidence : 0,
      reason: ok
        ? `${value.reason} (evidence: "${value.evidence}")`
        : `Returned "${value.value}", which is not an allowed option.`,
    };
  };
}
