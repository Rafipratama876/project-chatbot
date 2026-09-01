/**
 * NODE 3 — §9.4 items 1 and 2, in customer language.
 *
 * The KB's own worked example is the target:
 *
 *   "'Crepes and Waffles' is 4″ tall — too small to build as individual channel
 *    letters, where the minimum is 8″. We've shown it as an illuminated capsule
 *    with the copy reversed out, so it lights the same way the letters do at
 *    night and stays crisp at that size."
 *
 * That is a rewrite of structured data, which is what a model is genuinely good
 * at. What it must not do is decide WHAT gets disclosed — that comes from the
 * trace. Every callout already has deterministic wording; this replaces the
 * phrasing and nothing else, and anything that fails the Layer 2 vocabulary
 * check is discarded in favour of the deterministic text.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnthropicClient } from './anthropic.client.js';
import { lintCallout } from '#/kb/domain/anatomy.js';
import type { DisclosureBundle } from '#/kb/output/disclosures.js';
import type { SignSpec } from '#/kb/domain/spec.js';

const CalloutsSchema = z.object({
  callouts: z.array(z.object({
    ruleId: z.string(),
    elementId: z.string().nullable(),
    text: z.string(),
  })),
});

export interface WriteCalloutsOptions {
  /** Discard a rewrite that names a part outside KB Layer 2. Default true. */
  enforceVocabulary?: boolean;
}

@Injectable()
export class CalloutWriterService {
  constructor(private readonly anthropic: AnthropicClient) {}

  async rewrite(
    spec: SignSpec,
    bundle: DisclosureBundle,
    opts: WriteCalloutsOptions = {},
  ): Promise<DisclosureBundle> {
  if (!this.anthropic.enabled) return bundle;
  const targets = [...bundle.criticals, ...bundle.autofixes];
  if (targets.length === 0) return bundle;

  const payload = targets.map((c) => ({
    ruleId: c.ruleId,
    elementId: c.elementId ?? null,
    kind: c.kind,
    engineText: c.text,
    element: c.elementId
      ? (() => {
          const el = spec.elements.find((e) => e.id === c.elementId);
          return el ? { content: el.content, role: el.role, construction: el.construction, capHeight: el.capHeight, copyTreatment: el.copyTreatment } : null;
        })()
      : null,
  }));

  const response = await this.anthropic.sdk.messages.parse({
    model: this.anthropic.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(CalloutsSchema) },
    system: [
      {
        type: 'text',
        text: `${AnthropicClient.FRAMING}

Rewrite each engine message as one or two sentences a small-business owner would
understand, addressed to them. This is a pre-sales proof, not a shop drawing.

Hard constraints:
- Say what changed, why it had to change, and what they get instead. In that order.
- Keep every number exactly as given. Do not add, round or invent any dimension.
- Return one entry per input, with the same ruleId and elementId.
- Never name fabrication hardware: no rivets, studs, drivers, conduit, clips.
- Use only these part words when a part must be named: face, return, trim cap,
  retainer, backer panel, pill box, logo box, raceway, wireway, bottom rail,
  spacer, standoff, flat cut letter, copy vinyl, mounting surface.
- No apologies, no hedging, no sales language.

Model answer for a construction substitution:
"'Crepes and Waffles' is 4" tall — too small to build as individual channel
letters, where the minimum is 8". We've shown it as an illuminated capsule with
the copy reversed out, so it lights the same way the letters do at night and
stays crisp at that size."`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{
      role: 'user',
      content: `Business: ${spec.businessName}\nSign type: ${spec.type}\n\nMessages to rewrite:\n${JSON.stringify(payload, null, 2)}`,
    }],
  });

  const { value, refused } = this.anthropic.unwrap(response);
  if (refused || !value) return bundle;

  const enforce = opts.enforceVocabulary ?? true;
  const byKey = new Map(value.callouts.map((c) => [`${c.ruleId}|${c.elementId ?? ''}`, c.text]));

  const apply = (list: typeof bundle.criticals): typeof bundle.criticals => list.map((c) => {
    const rewritten = byKey.get(`${c.ruleId}|${c.elementId ?? ''}`);
    if (!rewritten) return c;
    if (enforce) {
      const lint = lintCallout(rewritten, { forbidHardware: true });
      // A rewrite that breaks Layer 2 is dropped, not repaired. The
      // deterministic text is always correct, only less friendly.
      if (!lint.ok) return c;
    }
    return { ...c, customerText: rewritten };
  });

    return { ...bundle, criticals: apply(bundle.criticals), autofixes: apply(bundle.autofixes) };
  }
}
