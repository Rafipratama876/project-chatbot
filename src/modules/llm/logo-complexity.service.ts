import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnthropicClient } from './anthropic.client.js';
import type { SignElement } from '#/kb/domain/spec.js';
import type { ThresholdStore } from '#/kb/domain/thresholds.js';
import { measureStroke } from '#/kb/geometry/metrics.js';
import { countersIn } from '#/kb/geometry/counters.js';
import { bounds, contourArea } from '#/kb/geometry/poly.js';

/**
 * NODE 2 — CL-R-54 / §3.5 step 1.
 *
 * "Does the mark have fine detail, enclosed counters, or colour breaks that
 * cannot be separate cans?"
 *
 * The one rule in Layer 6 that no measurement settles. Counter count and
 * minimum stroke ARE computable and are supplied as input, so the model is only
 * asked the part that is genuinely a fabrication judgment. Below the confidence
 * threshold it escalates rather than quietly picking logo box or channel shape.
 */
const JudgmentSchema = z.object({
  complex: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  criteria: z.array(z.enum(['fine-detail', 'enclosed-counters', 'colour-breaks'])),
});

export interface LogoJudgment { complex: boolean; confidence: number; reason: string }

@Injectable()
export class LogoComplexityService {
  constructor(private readonly anthropic: AnthropicClient) {}

  /**
   * Bound to a threshold store because the minimum stroke is one of the facts
   * the judgment rests on, and that number is per-run.
   */
  forRun(thresholds: ThresholdStore, image?: { data: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' }) {
    return async (el: SignElement): Promise<LogoJudgment> => {
      if (!this.anthropic.enabled) {
        return { complex: false, confidence: 0, reason: 'LLM nodes are disabled.' };
      }

      const minStroke = thresholds.get('stroke.min.illuminated');
      const m = measureStroke(el.contours, minStroke);
      const b = bounds(el.contours);
      const facts = {
        elementContent: el.content,
        capHeightIn: round(el.capHeight),
        widthIn: round(b.w),
        heightIn: round(b.h),
        narrowestStrokeIn: round(m.narrowest),
        minimumStrokeIn: minStroke,
        pointsBelowMinimum: m.thinPoints.length,
        enclosedCounters: countersIn(el.contours),
        solidAreaSqIn: round(contourArea(el.contours)),
        separateColours: el.colourBreaks ?? [],
      };

      const content: Array<Record<string, unknown>> = [];
      if (image) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mediaType, data: image.data },
        });
      }
      content.push({
        type: 'text',
        text: `Measured facts for this mark:\n${JSON.stringify(facts, null, 2)}\n\nDecide the §3.5 step 1 question.`,
      });

      const response = await this.anthropic.sdk.messages.parse({
        model: this.anthropic.model,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: zodOutputFormat(JudgmentSchema) },
        system: [{
          type: 'text',
          text: `${AnthropicClient.FRAMING}

Question (KB §3.5 step 1, rule CL-R-54): does this logo mark have fine detail,
enclosed counters, or colour breaks that cannot be built as separate fabricated
cans?

- complex = true  → the mark becomes CL-C-03, a logo box cut to its silhouette.
- complex = false → the mark is built as an individual channel shape, same type
  as the sign.

The measurements are already computed and are authoritative; do not re-estimate
them. Judge only what they cannot settle: whether the shapes could plausibly be
built as separate cans at this size. A mark whose narrowest stroke is at or
above the minimum, with few or no enclosed counters and a single colour, is
normally NOT complex.

Return a confidence below ${this.anthropic.minConfidence} whenever the answer is
genuinely arguable. That routes the decision to a human, which is a correct
outcome.`,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{ role: 'user', content: content as never }],
      });

      const { value, refused, reason } = this.anthropic.unwrap(response);
      if (refused || !value) return { complex: false, confidence: 0, reason: reason ?? 'no parsed output' };

      return {
        complex: value.complex,
        confidence: value.confidence,
        reason: `${value.reason} [${value.criteria.join(', ')}]`,
      };
    };
  }
}

const round = (v: number): number => Math.round(v * 100) / 100;
