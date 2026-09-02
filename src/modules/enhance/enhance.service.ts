import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PNG } from 'pngjs';
import OpenAI, { toFile } from 'openai';
import {
  protectionMask, summarise, maskToRgba, restoreProtected, verifyProtected,
  verifyCompositedSign, ProtectionError,
} from '#/kb/render/protect.js';
import { contactOcclusion, lightSpill, integrate, applySpill } from '#/kb/render/integrate.js';
import type { SignSpec } from '#/kb/domain/spec.js';

export interface EnhanceInput {
  /** The deterministic panel, as PNG bytes. */
  base: Buffer;
  /**
   * Greyscale PNG of the renderer's own coverage — everything it drew, sign
   * and mounting surface alike. Null on a photographed panel, where the whole
   * frame is protected anyway.
   */
  renderedCoverage: Buffer | null;
  onPhotograph: boolean;
  view: 'day' | 'night';
  spec: SignSpec;
}

export interface EnhanceOutcome {
  /** PNG bytes. Identical to the base when nothing was or could be changed. */
  png: Buffer;
  applied: boolean;
  /** Plain language, headed for the proof's disclosures. */
  reason: string;
  stats?: {
    editableFraction: number;
    changedPixels: number;
    violations: number;
    worstViolation: number;
  };
}

/**
 * The one place a generative model touches a proof.
 *
 * It is confined by construction rather than by instruction. The model is
 * handed the panel and a mask, and whatever it returns has every protected
 * pixel copied back from the deterministic render and then verified byte for
 * byte. A model that ignores the mask entirely cannot change the outcome; a
 * bug in this file that misaligns the mask fails the verification and the
 * enhancement is thrown away.
 *
 * What it may touch is the neutral ground of a studio panel. It may never
 * touch the sign, because the sign is the design, and it may never touch the
 * customer's photograph, because that is the site. On a composited panel that
 * leaves nothing to do, and this returns the base unchanged — the honest
 * answer, since there is nothing to make more realistic about a photograph.
 */
@Injectable()
export class EnhanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnhanceService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    // Whether a generative model can touch a proof is worth one line at boot.
    // Left silent, "is it on?" is answered by reading a picture and guessing.
    if (!this.enabled) {
      const why = this.config.get<boolean>('enhance.enabled')
        ? 'no OPENAI_API_KEY'
        : 'ENHANCE_ENABLED is not true';
      this.logger.log(`generative ground pass: off (${why})`);
      return;
    }
    this.logger.log(
      `generative ground pass: ON (${this.config.get<string>('enhance.model')}) — `
      + 'the sign and any site photograph are protected and verified',
    );
  }

  get enabled(): boolean {
    return (this.config.get<boolean>('enhance.enabled') ?? false)
      && !!this.config.get<string>('enhance.apiKey');
  }

  async enhance(input: EnhanceInput): Promise<EnhanceOutcome> {
    if (!this.enabled) {
      return { png: input.base, applied: false, reason: 'enhancement is switched off' };
    }

    const base = PNG.sync.read(input.base);
    const alpha = input.renderedCoverage ? PNG.sync.read(input.renderedCoverage) : null;

    if (!input.onPhotograph && !alpha) {
      // Without the renderer's own coverage there is nothing to protect with,
      // and a guessed silhouette is worse than no enhancement at all.
      return {
        png: input.base,
        applied: false,
        reason: 'the render layer was not available, so nothing could be protected',
      };
    }

    const renderedCoverage = new Uint8Array(base.width * base.height);
    if (alpha) {
      for (let i = 0; i < renderedCoverage.length; i++) renderedCoverage[i] = alpha.data[i * 4]!;
    }

    const mask = protectionMask({
      width: base.width,
      height: base.height,
      renderedCoverage,
      onPhotograph: input.onPhotograph,
      margin: this.config.get<number>('enhance.margin') ?? 12,
    });
    const area = summarise(mask);

    const floor = this.config.get<number>('enhance.minEditableFraction') ?? 0.05;
    if (area.editableFraction < floor) {
      this.logger.log(
        `${input.view}/${input.onPhotograph ? 'photo' : 'studio'}: skipped — `
        + `${(area.editableFraction * 100).toFixed(0)}% editable`,
      );
      return {
        png: input.base,
        applied: false,
        reason: input.onPhotograph
          ? 'shown on the customer\'s own photograph, which is left exactly as taken'
          : 'every pixel of this panel is specified — the sign and the mounting '
            + 'surface — so there is nothing a model may alter',
      };
    }

    try {
      const returned = await this.callModel(input, base, mask);
      const restored = restoreProtected(base, returned, mask);

      const check = verifyProtected(
        base,
        { width: base.width, height: base.height, data: restored.data },
        mask,
      );
      if (!check.ok) {
        // Ours to fix, not the model's. Ship the deterministic render.
        this.logger.error(`enhancement discarded: ${check.reason}`);
        return {
          png: input.base,
          applied: false,
          reason: `enhancement discarded — ${check.reason}`,
        };
      }

      const out = new PNG({ width: base.width, height: base.height });
      out.data = Buffer.from(restored.data);

      this.logger.log(
        `${input.view}: enhanced ${(area.editableFraction * 100).toFixed(0)}% of the panel; `
        + `${restored.changed} px changed, ${restored.violations} px restored`,
      );

      return {
        png: PNG.sync.write(out),
        applied: restored.changed > 0,
        reason: 'The empty frame around the sign was rendered by a generative model. '
          + 'The sign, the mounting surface and every dimension are the '
          + 'deterministic render, restored pixel for pixel and verified.',
        stats: {
          editableFraction: area.editableFraction,
          changedPixels: restored.changed,
          violations: restored.violations,
          worstViolation: restored.worstViolation,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failed enhancement is never a failed proof. The base render is the
      // document; this pass is decoration on top of it.
      this.logger.warn(`enhancement skipped: ${message}`);
      return {
        png: input.base,
        applied: false,
        reason: error instanceof ProtectionError
          ? `enhancement discarded — ${message}`
          : 'enhancement was unavailable; the deterministic render is shown',
      };
    }
  }

  // ── Concept scene ───────────────────────────────────────────────────────

  /**
   * An illustrative image: a generated setting with the real sign on it.
   *
   * This is the one place the pipeline ChatGPT's plan describes actually
   * applies — because here the background genuinely IS a synthetic asset. On
   * the proof it is the customer's photograph, which is evidence, and that is
   * why the same idea is refused there.
   *
   * The sign is never given to the model. It is rendered by three.js, laid
   * over whatever comes back, and then checked pixel for pixel: a model cannot
   * produce a FedEx-like logo here because it is never asked to draw a logo.
   *
   * Not part of the proof. It carries no dimensions and nothing is read off
   * it — the label says so, and it is deliberately kept off the proof sheet,
   * which is the document a customer signs.
   */
  async conceptScene(input: {
    signLayer: Buffer;
    view: 'day' | 'night';
    spec: SignSpec;
    surface?: string;
  }): Promise<{ png: Buffer | null; reason: string }> {
    if (!this.enabled) return { png: null, reason: 'concept scenes are switched off' };

    const sign = PNG.sync.read(input.signLayer);
    try {
      const setting = await this.generateSetting(input, sign.width, sign.height);

      const alpha = new Uint8Array(sign.width * sign.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = sign.data[i * 4 + 3]!;

      // The same deterministic seating used on a real photograph: the wall
      // darkens where the sign occludes it, and at night the sign lights it.
      const standoff = Math.max(...input.spec.elements.map((e) => e.returnDepth ?? 5), 1);
      const radius = Math.max(3, Math.min(48, (sign.width / 90) * standoff * 0.35));

      // Setting, occlusion, sign — and NOT the spill yet. The check that
      // follows asks one question: did the generated setting alter the sign?
      // Bloom falls across the sign as well as around it, so adding it first
      // would make every sign pixel differ and the check would fail on our own
      // arithmetic rather than on anything the model did.
      const seated = integrate(
        new Uint8ClampedArray(setting.data),
        new Uint8ClampedArray(sign.data),
        sign.width,
        sign.height,
        {
          occlusion: contactOcclusion(alpha, sign.width, sign.height, radius,
            input.view === 'night' ? 0.28 : 0.45),
        },
      );

      const check = verifyCompositedSign(
        { width: sign.width, height: sign.height, data: sign.data },
        { width: sign.width, height: sign.height, data: seated },
      );
      if (!check.ok) {
        this.logger.error(`concept scene discarded: ${check.reason}`);
        return { png: null, reason: `concept scene discarded — ${check.reason}` };
      }

      // Verified. Now the sign may light its surroundings.
      const merged = input.view === 'night'
        ? applySpill(seated, sign.width, sign.height, lightSpill(
            sign.data, sign.width, sign.height,
            {
              tight: Math.max(4, radius * 0.5),
              wide: Math.max(16, radius * 3),
              strength: 0.55,
            },
          ), alpha)
        : seated;

      const out = new PNG({ width: sign.width, height: sign.height });
      out.data = Buffer.from(merged);
      this.logger.log(
        `concept scene (${input.view}): ${check.compared} sign pixels verified unchanged`,
      );

      return {
        png: PNG.sync.write(out),
        // Precise about the order of operations: the sign was verified against
        // the deterministic render BEFORE the glow was drawn over it, and the
        // glow is our own arithmetic rather than the model's. Claiming the
        // finished pixels are unchanged would be overstating it.
        reason: 'Illustrative only. The setting behind the sign is generated and is not '
          + 'the customer\'s site. The sign itself is the deterministic render — its '
          + 'outline, proportions and colours come from the specification, and were '
          + 'verified against it pixel for pixel before the glow was added. '
          + 'No dimension is taken from this image.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`concept scene skipped: ${message}`);
      return { png: null, reason: 'a concept scene was not available' };
    }
  }

  private async generateSetting(
    input: { view: 'day' | 'night'; surface?: string },
    width: number,
    height: number,
  ): Promise<PNG> {
    const client = this.getClient();
    // The endpoint offers a fixed set of sizes. The landscape one is generated
    // and then resampled to the panel — resampling a generated backdrop costs
    // nothing, whereas resampling the SIGN would move it, so the sign is
    // rendered at the final size instead of being scaled to meet it.
    const result = await client.images.generate(
      {
        model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
        prompt: this.settingPrompt(input),
        size: '1536x1024',
        // Explicitly opaque. The default is 'auto', and the model may decide a
        // prompt wants a transparent background — which arrives as a fully
        // transparent black PNG and composites to a solid black frame with the
        // sign invisible inside it. Nothing errors; the picture is just wrong.
        background: 'opaque',
        n: 1,
      },
      { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
    );

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('the image endpoint returned no image');

    const generated = PNG.sync.read(Buffer.from(b64, 'base64'));
    assertUsableSetting(generated);
    return resample(generated, width, height);
  }

  /**
   * What the setting should be.
   *
   * A blank wall and nothing else. Every exclusion here has a reason: other
   * signage or text would compete with the sign and could be read as part of
   * the design; a recognisable building would imply a site the proof does not
   * describe; people and vehicles date the image and raise questions nobody
   * asked. What is wanted is a surface and some light.
   */
  private settingPrompt(input: { view: 'day' | 'night'; surface?: string }): string {
    const night = input.view === 'night';
    return [
      'A photograph of a plain, blank exterior building wall, viewed straight on,',
      'filling the whole frame. Flat even surface with subtle real texture',
      `(${input.surface ?? 'painted render or smooth concrete'}).`,
      night
        ? 'Photographed at night: dark, with soft ambient street light and a deep blue sky tone.'
        : 'Photographed in soft overcast daylight, no harsh shadows.',
      'Absolutely no signage, no lettering, no logos, no numbers, no posters.',
      'No people, no vehicles, no windows or doors in the centre of the frame.',
      'Not a recognisable building or location. Plain architectural surface only.',
    ].join(' ');
  }

  private async callModel(
    input: EnhanceInput,
    base: PNG,
    mask: Uint8Array,
  ): Promise<{ width: number; height: number; data: Uint8Array }> {
    const client = this.getClient();

    const maskPng = new PNG({ width: base.width, height: base.height });
    maskPng.data = Buffer.from(maskToRgba(mask, base.width, base.height));

    const result = await client.images.edit(
      {
        model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
        image: await toFile(input.base, 'panel.png', { type: 'image/png' }),
        mask: await toFile(PNG.sync.write(maskPng), 'mask.png', { type: 'image/png' }),
        prompt: this.prompt(input),
        size: `${base.width}x${base.height}` as never,
        n: 1,
      },
      { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
    );

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('the image endpoint returned no image');

    const returned = PNG.sync.read(Buffer.from(b64, 'base64'));
    return { width: returned.width, height: returned.height, data: returned.data };
  }

  /**
   * What the model is asked for.
   *
   * Deliberately about the ground and the light, never about the sign. The
   * prompt is not what keeps the sign safe — the mask and the restoration do
   * that — but a prompt that invited the model to redraw the letterform would
   * waste the call producing pixels that are then thrown away.
   */
  private prompt(input: EnhanceInput): string {
    const night = input.view === 'night';
    return [
      'Replace only the flat backdrop behind the object with a plausible,',
      night
        ? 'dark studio environment: soft falloff, a subtle floor plane, and gentle bounce light consistent with a sign that emits its own light.'
        : 'neutral studio environment: soft even light, a subtle floor plane and a gentle gradient.',
      'Keep it abstract and non-specific — no buildings, no storefronts, no signage,',
      'no text, no logos, no people, no recognisable location.',
      'Do not add reflections or objects that imply a real place.',
      'The object in the centre must remain exactly as it is.',
    ].join(' ');
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    this.client = new OpenAI({ apiKey: this.config.getOrThrow<string>('enhance.apiKey') });
    return this.client;
  }
}

/**
 * Nearest-neighbour resample of a generated backdrop.
 *
 * Only ever applied to the generated setting, never to the sign: moving the
 * sign by a fraction of a pixel is exactly the class of error the verification
 * exists to catch, so the sign is rendered at the final size instead.
 */
function resample(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) return source;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / width));
      const from = (sy * source.width + sx) * 4;
      const to = (y * width + x) * 4;
      out.data[to] = source.data[from]!;
      out.data[to + 1] = source.data[from + 1]!;
      out.data[to + 2] = source.data[from + 2]!;
      out.data[to + 3] = 255;
    }
  }
  return out;
}

/**
 * Rejects a setting there is no point compositing onto.
 *
 * A blank frame is not an error anywhere upstream: the request succeeds, the
 * decode succeeds, the composite succeeds, and the verification passes
 * vacuously because black over black is unchanged. The result is a solid black
 * panel with the sign invisible inside it — which is exactly what happened the
 * first time this ran. Checking the pixels is the only place it shows up.
 */
function assertUsableSetting(image: PNG): void {
  let sum = 0;
  let peak = 0;
  const step = 16;
  let n = 0;
  for (let i = 0; i < image.width * image.height; i += step) {
    const o = i * 4;
    const l = Math.max(image.data[o]!, image.data[o + 1]!, image.data[o + 2]!);
    sum += l;
    if (l > peak) peak = l;
    n++;
  }
  const mean = n === 0 ? 0 : sum / n;
  if (peak < 12) {
    throw new Error(
      `the generated setting is blank (peak channel ${peak}) — most likely returned `
      + 'transparent; nothing would be visible behind the sign',
    );
  }
  if (mean < 6) {
    throw new Error(`the generated setting is almost entirely black (mean ${mean.toFixed(1)})`);
  }
}
