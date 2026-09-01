/**
 * NODE 4 — the revision loop.
 *
 * "Make the letters 8 inches deep and the tagline red" becomes a JSON patch
 * against the form, and the engine re-runs from Gate 1. The model does not edit
 * the spec: a spec edited outside the gates has not been validated by them, and
 * the whole point of the rule engine is that nothing reaches a proof without
 * passing through it.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AnthropicClient } from './anthropic.client.js';
import { WolfStudioFormSchema, type WolfStudioForm, type SignSpec } from '#/kb/domain/spec.js';

/** Every field a revision is allowed to touch. Anything else escalates. */
const PATCHABLE = [
  'channelLetterType', 'installationMethod', 'backerPanelOption', 'quantity',
  'returnDepth', 'returnColour', 'trimCapColour', 'trimCapWidth', 'faceMaterial',
  'faceColour', 'ledColour', 'control', 'mountingSurfaceColour',
  'showSizesOnProof', 'showMaterialThickness', 'externalIllumination',
  'additionalInformation',
] as const;

const PatchSchema = z.object({
  operations: z.array(z.object({
    field: z.enum(PATCHABLE),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    quote: z.string(),
  })),
  /** Anything the request asked for that no form field expresses. */
  unsupported: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export interface RevisionResult {
  form: WolfStudioForm;
  applied: Array<{ field: string; value: unknown; quote: string }>;
  unsupported: string[];
  confidence: number;
}

@Injectable()
export class RevisionPatchService {
  constructor(private readonly anthropic: AnthropicClient) {}

  async toPatch(
    currentForm: WolfStudioForm,
    spec: SignSpec,
    request: string,
  ): Promise<RevisionResult> {
  if (!this.anthropic.enabled) {
    return { form: currentForm, applied: [], unsupported: ['LLM nodes are disabled.'], confidence: 0 };
  }

  const response = await this.anthropic.sdk.messages.parse({
    model: this.anthropic.model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(PatchSchema) },
    system: [
      {
        type: 'text',
        text: `${AnthropicClient.FRAMING}

Turn the customer's revision request into edits to the intake form. The rule
engine then re-runs every gate over the edited form, so you do not need to work
out consequences — changing the return depth is enough; the engine handles
whether that depth is stocked, whether it needs welded construction and what the
proof must say about it.

Rules:
- Only the listed fields exist. Anything the request asks for that no field
  expresses goes in "unsupported" — do not approximate it with a field that
  means something else.
- Depths and sizes are in inches, as numbers.
- Quote the words that justify each edit.
- Confidence below ${this.anthropic.minConfidence} sends the request to a human.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{
      role: 'user',
      content: `Current form:\n${JSON.stringify(currentForm, null, 2)}\n\nCurrent sign: ${spec.type}, ${spec.elements.length} element(s): ${spec.elements.map((e) => `${e.id} "${e.content}" ${e.construction}`).join('; ')}\n\nRevision request:\n"""\n${request}\n"""`,
    }],
  });

  const { value, refused } = this.anthropic.unwrap(response);
  if (refused || !value) {
    return { form: currentForm, applied: [], unsupported: ['Could not parse the revision request.'], confidence: 0 };
  }

  const next: Record<string, unknown> = { ...currentForm };
  const applied: RevisionResult['applied'] = [];
  for (const op of value.operations) {
    next[op.field] = op.value ?? undefined;
    applied.push({ field: op.field, value: op.value, quote: op.quote });
  }

  // The schema is the gate: a patch that produces an invalid form is rejected
  // whole, rather than half-applied.
  const parsed = WolfStudioFormSchema.safeParse(next);
  if (!parsed.success) {
    return {
      form: currentForm,
      applied: [],
      unsupported: [`Patch rejected: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`],
      confidence: 0,
    };
  }

    return { form: parsed.data, applied, unsupported: value.unsupported, confidence: value.confidence };
  }
}
