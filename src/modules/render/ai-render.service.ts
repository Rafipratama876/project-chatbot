import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The photorealism pass.
 *
 * The three.js capture is the authoritative input and the only geometry the
 * model is allowed to keep: what it may change is light, material response and
 * how the sign sits in the photograph. Everything that can be measured —
 * lettering, construction, colours, proportions, placement, canvas — is locked
 * by the prompt, because those are the parts the 56 rules decided and there is
 * no gate downstream of a picture.
 *
 * One call per scene panel. Both panels edit the same canonical render rather
 * than chaining, so a mistake in the day view cannot propagate into the night
 * view — they disagree with the render, never with each other.
 */
export type ScenePanelKind = 'day' | 'night';

const SHARED = `You are the final photorealism pass for a fabrication-accurate channel-letter proof.
The supplied render is authoritative and already correct. Improve only photographic realism:
material response, surface finish, ambient and direct light, shadow, reflection, and how the sign
integrates with the wall behind it.

Never change: letterforms, spelling, logo contours, artwork colours, sign construction, return
depth, trim cap, backer, raceway or wireway geometry, mounting method, standoff, proportions,
position, scale, framing, camera angle, crop, or image dimensions.
Never add: labels, callouts, dimension lines, borders, watermarks, text, people, vehicles, or
foliage that is not already in the photograph.
Output the same scene at the same framing, as a photograph.`;

const DAY = `${SHARED}

This is the daytime elevation on the customer's own building. Keep the existing daylight direction
and the building exactly as photographed. The sign must read as fabricated aluminium and acrylic
mounted on that wall, not as an overlay.`;

const NIGHT = `${SHARED}

This is the night/perspective view. Illuminated faces and halo light come only from the sign's own
LEDs, at the colour already shown in the render. Unlit components stay unlit — a backer, raceway or
wireway is never a light source. Light falls on the wall realistically and falls off with distance.`;

type ImageCall = { type?: string; result?: string };

@Injectable()
export class AiRenderService {
  private readonly logger = new Logger(AiRenderService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('render.aiEnabled') ?? false;
  }

  /**
   * One scene panel. `previous` is set only on a revision: the model then edits
   * the panel it produced last time, with the canonical render still supplied
   * as the geometry it must not drift from.
   */
  async scene(input: {
    render: Buffer;
    kind: ScenePanelKind;
    jobId: string;
    /** Free-text revision intent, already validated upstream. */
    intent?: string | null;
    previous?: Buffer | null;
  }): Promise<Buffer> {
    const apiKey = this.config.get<string>('render.aiApiKey') ?? '';
    if (!apiKey) throw new Error('AI_RENDER_ENABLED=true requires OPENAI_API_KEY');

    const baseUrl = (this.config.get<string>('render.aiBaseUrl') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const textModel = this.config.get<string>('render.aiTextModel') ?? 'gpt-5.1';
    const imageModel = this.config.get<string>('render.aiImageModel') ?? 'gpt-image-2';
    const timeoutMs = this.config.get<number>('render.aiTimeoutMs') ?? 180_000;
    const started = performance.now();

    // The canonical render goes first: it is the authority on what the sign is.
    // A previous panel, when there is one, is context for the revision only.
    const images = [input.render, ...(input.previous ? [input.previous] : [])];
    const ask = input.previous
      ? 'Apply the requested change to the previous panel (image 2) while matching the sign in image 1 exactly.'
      : 'Produce the photorealistic panel from this render.';

    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: textModel,
        instructions: input.kind === 'day' ? DAY : NIGHT,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: input.intent
                ? `${ask}\n\nCustomer request, applied only to how the scene looks: ${input.intent}`
                : ask,
            },
            ...images.map((buffer) => ({
              type: 'input_image' as const,
              image_url: `data:image/png;base64,${buffer.toString('base64')}`,
            })),
          ],
        }],
        tools: [{
          type: 'image_generation',
          model: imageModel,
          action: 'edit',
          size: '1536x1024',
          quality: 'high',
          output_format: 'png',
        }],
        tool_choice: { type: 'image_generation' },
      }),
    });

    const body = await response.json() as { output?: ImageCall[]; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(`OpenAI image edit failed (${response.status}): ${body.error?.message ?? 'unknown error'}`);
    }
    // A response may carry several image calls; an empty earlier one must not
    // mask a later success.
    const result = body.output?.find((item) => item.type === 'image_generation_call' && item.result)?.result;
    if (!result) throw new Error('OpenAI image edit returned no image');

    this.logger.log(`${input.jobId}: ${input.kind} panel in ${Math.round(performance.now() - started)} ms`);
    return Buffer.from(result, 'base64');
  }
}
