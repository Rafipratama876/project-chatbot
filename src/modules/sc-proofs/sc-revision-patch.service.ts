/**
 * The SC revision loop — same shape as CL's `RevisionPatchService`/DL's
 * `DLRevisionPatchService`: a customer's revision request becomes a patch to
 * the intake FORM, and `SCProofsService.revise` re-runs every SC gate over
 * the patched form rather than editing a stored spec. Reuses `OpenAIClient`
 * (generic, no product-specific vocabulary in it).
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { OpenAIClient } from '#/modules/llm/openai.client.js';
import { SCJobFormSchema, type SCJobForm, type SCSpec } from '#/kb/domain/sc-spec.js';

/** Every field an SC revision is allowed to touch. Anything else escalates as "unsupported". */
const PATCHABLE = [
  'faceMaterial', 'faceColour', 'illuminated', 'ledColour', 'extrusionDepth',
  'cornerStyle', 'cornerRadius', 'retainerType', 'mountingMethod',
  'mountingSurfaceColour', 'mountingSurfaceTexture', 'attachmentDetail',
  'quantity', 'additionalInformation',
] as const;

const PatchSchema = z.object({
  operations: z.array(z.object({
    field: z.enum(PATCHABLE),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    quote: z.string(),
  })),
  unsupported: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export interface SCRevisionResult {
  form: SCJobForm;
  applied: Array<{ field: string; value: unknown; quote: string }>;
  unsupported: string[];
  confidence: number;
}

@Injectable()
export class SCRevisionPatchService {
  constructor(private readonly openai: OpenAIClient) {}

  async toPatch(currentForm: SCJobForm, spec: SCSpec, request: string): Promise<SCRevisionResult> {
    if (!this.openai.enabled) {
      return { form: currentForm, applied: [], unsupported: ['LLM nodes are disabled.'], confidence: 0 };
    }

    const response = await this.openai.sdk.responses.parse({
      model: this.openai.model,
      reasoning: { effort: 'medium' },
      instructions: `${OpenAIClient.FRAMING}

Turn the customer's revision request into edits to a Sign Cabinet intake form.
The rule engine then re-runs every gate over the edited form, so you do not need to
work out consequences — changing the face material is enough; the engine handles
whether the requested depth/retainer/colour still makes sense for it and what the
proof must say about it.

Rules:
- Only the listed fields exist. Anything the request asks for that no field
  expresses goes in "unsupported" — do not approximate it with a field that
  means something else.
- faceMaterial / mountingMethod are form labels (e.g. "Pan Face", "Wall Mounted"),
  not ids.
- cornerStyle is "square" or "radius" only. mountingSurfaceTexture is one of
  "smooth", "uneven" or "unspecified" only.
- extrusionDepth and cornerRadius are inches, as numbers. quantity is a positive integer.
- illuminated is a boolean — only true when the request clearly asks for it to light up.
- Quote the words that justify each edit.
- Confidence below ${this.openai.minConfidence} sends the request to a human.`,
      input: `Current form:\n${JSON.stringify(currentForm, null, 2)}\n\n`
        + `Current sign: ${spec.faceMaterial}, ${spec.cabinet.faceColour ?? ''}, `
        + `${spec.cabinet.lit ? 'illuminated' : 'non-illuminated'}\n\n`
        + `Revision request:\n"""\n${request}\n"""`,
      text: { format: zodTextFormat(PatchSchema, 'sc_patch') },
    });

    const { value, refused } = this.openai.unwrap(response);
    if (refused || !value) {
      return { form: currentForm, applied: [], unsupported: ['Could not parse the revision request.'], confidence: 0 };
    }

    const next: Record<string, unknown> = { ...currentForm };
    const applied: SCRevisionResult['applied'] = [];
    for (const op of value.operations) {
      next[op.field] = op.value ?? undefined;
      applied.push({ field: op.field, value: op.value, quote: op.quote });
    }

    const parsed = SCJobFormSchema.safeParse(next);
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
