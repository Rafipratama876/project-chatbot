/**
 * The DL revision loop — same shape as CL's `RevisionPatchService`: a
 * customer's revision request becomes a patch to the intake FORM, and
 * `DLProofsService.revise` re-runs every DL gate over the patched form
 * rather than editing a stored spec. Reuses `OpenAIClient` (generic, no
 * Channel Letters vocabulary in it) — not CL's `RevisionPatchService`, whose
 * schema is the CL form's field list.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { OpenAIClient } from '#/modules/llm/openai.client.js';
import { DLJobFormSchema, type DLJobForm, type DLSpec } from '#/kb/domain/dl-spec.js';

/** Every field a DL revision is allowed to touch. Anything else escalates as "unsupported". */
const PATCHABLE = [
  'materialFamily', 'finish', 'colour', 'mountingMethod', 'mountingSurfaceColour',
  'mountingSurfaceTexture', 'depth', 'quantity', 'illuminated', 'ledColour',
  'additionalInformation',
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

export interface DLRevisionResult {
  form: DLJobForm;
  applied: Array<{ field: string; value: unknown; quote: string }>;
  unsupported: string[];
  confidence: number;
}

@Injectable()
export class DLRevisionPatchService {
  constructor(private readonly openai: OpenAIClient) {}

  async toPatch(currentForm: DLJobForm, spec: DLSpec, request: string): Promise<DLRevisionResult> {
    if (!this.openai.enabled) {
      return { form: currentForm, applied: [], unsupported: ['LLM nodes are disabled.'], confidence: 0 };
    }

    const response = await this.openai.sdk.responses.parse({
      model: this.openai.model,
      reasoning: { effort: 'medium' },
      instructions: `${OpenAIClient.FRAMING}

Turn the customer's revision request into edits to a Dimensional Letters intake form.
The rule engine then re-runs every gate over the edited form, so you do not need to
work out consequences — changing the material family is enough; the engine handles
whether the requested depth/finish/colour still makes sense for it and what the proof
must say about it.

Rules:
- Only the listed fields exist. Anything the request asks for that no field
  expresses goes in "unsupported" — do not approximate it with a field that
  means something else.
- materialFamily / mountingMethod are form labels (e.g. "Cast Metal", "Stud Mounted"),
  not ids.
- mountingSurfaceTexture is one of "smooth", "uneven" or "unspecified" only.
- depth is inches, as a number. quantity is a positive integer.
- illuminated is a boolean — only true when the request clearly asks for it to light up.
- Quote the words that justify each edit.
- Confidence below ${this.openai.minConfidence} sends the request to a human.`,
      input: `Current form:\n${JSON.stringify(currentForm, null, 2)}\n\n`
        + `Current sign: ${spec.materialFamily}, ${spec.elements.length} element(s): `
        + `${spec.elements.map((e) => `${e.id} "${e.content}" ${e.colour ?? ''}`).join('; ')}\n\n`
        + `Revision request:\n"""\n${request}\n"""`,
      text: { format: zodTextFormat(PatchSchema, 'dl_patch') },
    });

    const { value, refused } = this.openai.unwrap(response);
    if (refused || !value) {
      return { form: currentForm, applied: [], unsupported: ['Could not parse the revision request.'], confidence: 0 };
    }

    const next: Record<string, unknown> = { ...currentForm };
    const applied: DLRevisionResult['applied'] = [];
    for (const op of value.operations) {
      next[op.field] = op.value ?? undefined;
      applied.push({ field: op.field, value: op.value, quote: op.quote });
    }

    const parsed = DLJobFormSchema.safeParse(next);
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
