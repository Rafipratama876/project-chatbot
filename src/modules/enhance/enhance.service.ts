import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PNG } from 'pngjs';
import OpenAI, { toFile } from 'openai';
import {
  protectionMask, summarise, maskToRgba, restoreProtected, verifyProtected,
  verifyCompositedSign, logoColourLeakFraction, colourDriftFraction, ProtectionError,
} from '#/kb/render/protect.js';
import {
  contactOcclusion, lightSpill, integrate, applySpill, measureIlluminant, temper,
} from '#/kb/render/integrate.js';
import { resolveColour } from '#/kb/render/materials.js';
import type { SignSpec } from '#/kb/domain/spec.js';
import { TYPES } from '#/kb/domain/taxonomy.js';

export interface EnhanceInput {
  /** The deterministic panel, as PNG bytes. */
  base: Buffer;
  /**
   * Greyscale PNG of the renderer's own coverage — everything it drew, sign
   * and mounting surface alike. Null on a photographed panel, where the whole
   * frame is protected anyway.
   */
  renderedCoverage: Buffer | null;
  /**
   * Greyscale PNG of CL-P-01 alone — the copy/logo face. When present, this
   * is used INSTEAD of `renderedCoverage` to build the mask: only the mark's
   * own pixels are protected, and the returns, trim cap, backer and mounting
   * surface become editable for material, lighting and environment realism.
   * Null on a photographed panel, or wherever the renderer did not compute it
   * — then `renderedCoverage` is the fallback, protecting the whole render.
   */
  logoCoverage?: Buffer | null;
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

    // No mask, on the client's explicit, twice-confirmed instruction: the
    // whole panel — including the logo — is handed to the model as a
    // reference photo to reinterpret, and nothing about the result is
    // restored or verified afterward. This trades away the one guarantee
    // every other path in this file exists to keep. It is deliberately its
    // own branch rather than a flag threaded through the masked path below,
    // so that path's guarantee stays legible and this one's absence of a
    // guarantee is never accidentally inherited by it.
    if (!input.onPhotograph && (this.config.get<boolean>('enhance.fullAi') ?? false)) {
      return this.enhanceFullAi(input, base);
    }

    // The tighter mask wins when it exists: it protects only the mark itself
    // and opens everything else — returns, trim cap, backer, mounting surface
    // — to lighting, material and environment realism. Falling back to the
    // full coverage when it does not (an older render, or a photographed
    // panel skipped below) keeps the whole panel protected rather than
    // guessing at a silhouette nobody computed.
    const logoOnly = !!input.logoCoverage;
    const coverageSource = input.logoCoverage ?? input.renderedCoverage;
    const alpha = coverageSource ? PNG.sync.read(coverageSource) : null;

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

    // A logo-only mask sits right up against pixels the model is otherwise
    // free to reinvent, and an inpainting model asked to fill in next to a
    // sharp letterform tends to keep drawing it — a smudged, duplicated
    // "ghost" of the mark just outside the protected pixels. That is not a
    // protection-mask failure (every one of THOSE pixels is still restored
    // and verified below), but it is exactly the outcome the client asked
    // never to see, so the buffer around the mark is much wider than the
    // couple of antialiased pixels `enhance.margin` exists for elsewhere.
    const margin = logoOnly
      ? this.config.get<number>('enhance.logoMargin') ?? 40
      : this.config.get<number>('enhance.margin') ?? 12;

    const mask = protectionMask({
      width: base.width,
      height: base.height,
      renderedCoverage,
      onPhotograph: input.onPhotograph,
      margin,
      // Only meaningful for the logo-only pass, where the coverage includes
      // the halo's own soft fade. See `ProtectionInput.minAlpha` — a `> 0`
      // test there was locking the halo's entire, mostly-transparent reach
      // as one hard opaque block. 96 keeps the halo's visibly bright core
      // (and the face, always fully opaque) locked, and opens its fading
      // tail back up to the same relighting as everything else.
      minAlpha: logoOnly ? 96 : 1,
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
      const returnedCandidates = await this.callModel(input, base, mask, logoOnly);

      // No colour lock, no distance fade, on the client's explicit
      // instruction after those made the material and the ambient light
      // look constrained rather than photographic. What replaces them is not
      // a constraint on any one image but a choice between several: each
      // candidate is restored and verified independently — the mask is
      // exact, never negotiable, checked pixel for pixel every time — and
      // then scored for how much of the logo's own colour leaked into the
      // pixels it does not own. See `logoColourLeakFraction` — a ghosted
      // duplicate of the mark is the one recurring failure a wide-open
      // editable region actually produced, and it is exactly the mark's own
      // palette turning up somewhere it should not be.
      let best: { data: Uint8Array; changed: number; violations: number; worstViolation: number; leak: number } | null = null;
      let lastFailure: string | null = null;

      for (const candidate of returnedCandidates) {
        const restored = restoreProtected(base, candidate, mask);
        const final = restored.data;
        const check = verifyProtected(base, { width: base.width, height: base.height, data: final }, mask);
        if (!check.ok) {
          lastFailure = check.reason ?? 'protected pixels changed';
          continue;
        }
        const leak = logoColourLeakFraction(base, final, mask);
        if (!best || leak < best.leak) {
          best = { data: final, changed: restored.changed, violations: restored.violations, worstViolation: restored.worstViolation, leak };
        }
      }

      if (!best) {
        this.logger.error(`enhancement discarded: ${lastFailure ?? 'no candidate verified'}`);
        return {
          png: input.base,
          applied: false,
          reason: `enhancement discarded — ${lastFailure ?? 'no candidate verified'}`,
        };
      }

      const restored = best;
      const final = best.data;

      const out = new PNG({ width: base.width, height: base.height });
      out.data = Buffer.from(final);

      this.logger.log(
        `${input.view}: enhanced ${(area.editableFraction * 100).toFixed(0)}% of the panel `
        + `(best of ${returnedCandidates.length}, leak ${(best.leak * 100).toFixed(1)}%); `
        + `${restored.changed} px changed, ${restored.violations} px restored`,
      );

      return {
        png: PNG.sync.write(out),
        applied: restored.changed > 0,
        reason: logoOnly
          ? 'Everything except the logo — material, colour, lighting, reflection, the wall '
            + 'and its surroundings — was freely reinterpreted by a generative model for '
            + 'realism. The logo itself — its outline, size, position and colour — is the '
            + 'deterministic render, restored pixel for pixel and verified.'
          : 'The empty frame around the sign was rendered by a generative model. '
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

  /** Which night pipeline is configured. See `enhance.config.ts`. */
  get nightMode(): 'inpaint' | 'layered' {
    return this.config.get<'inpaint' | 'layered'>('enhance.nightMode') ?? 'inpaint';
  }

  /**
   * The night panel as three layers: rendered ground, model, rendered sign.
   *
   * The sign never goes to the model. It is rendered here, the ground is
   * rendered here too and only THAT is sent away, and the two are added back
   * together by this machine — so the finished picture cannot contain a logo,
   * a halo or a dimension a model invented. The composite is then verified
   * against the sign layer pixel for pixel, exactly as the concept scene is.
   *
   * The cost is one extra pair of renders and one call. What it buys is the
   * one thing the unmasked pass gives up: the sign in the picture is provably
   * the sign in the specification.
   */
  async layeredNight(input: {
    signLayer: Buffer;
    background: Buffer;
    view: 'day' | 'night';
    spec: SignSpec;
    /**
     * The background is the customer's own photograph, not a rendered wall.
     * It changes what the model is asked for — relight this building, do not
     * invent a wall — and what the proof is allowed to claim afterwards.
     */
    onPhotograph?: boolean;
    /**
     * Renders the sign again under a measured light. Optional, and the whole
     * difference between a composite and a cut-out: the model gives the wall
     * its own colour temperature, and a sign lit by a studio neutral in front
     * of a wall lit by a sodium lamp reads as pasted on however exactly it is
     * placed. Costs one more render and no extra call.
     */
    relight?: (gain: { r: number; g: number; b: number }) => Promise<Buffer>;
    /**
     * The halo, already rendered and blurred off the sign's own geometry —
     * see `blurredHalo` in browser-entry.ts. Null on a construction with no
     * halo shells (front-lit only). Passed through rather than left for the
     * ground pass to invent: a generative model redraws material and colour
     * temperature, not the shape of light behind a specific letterform, and
     * asked for one anyway it drew a generic radial wash centred on the frame
     * — the same failure a painted-on night wash always had, just moved to a
     * different stage of the pipeline.
     */
    haloGlow?: Buffer | null;
    /**
     * Greyscale PNG: the letters and returns alone, `sign`'s own alpha with
     * the backer panel (and the mounting surface) subtracted out — see its
     * own comment in `renderLayers`. On a direct-mounted sign with no backer
     * this is the same shape as `sign`'s alpha; the difference only shows up
     * once a backer makes the two diverge, which is exactly when it matters.
     * Optional so an older caller — `conceptScene`, which has no separate
     * halo pass to mask for — still works: `seatSign` falls back to `sign`'s
     * own alpha.
     */
    lettersMask?: Buffer | null;
    /**
     * The backer panel, isolated — transparent everywhere outside its own
     * footprint. Null on a construction with none. Given its own material
     * pass (see `enhanceBacker`) rather than being left inside `signLayer`:
     * it is a real, specified, physical plaque, the same category of object
     * the wall is, and it deserves the wall's own realism treatment rather
     * than sitting there as a flat, unlit slab lit only by the same lamps
     * that light the copy — which is what it was before this existed.
     */
    backerLayer?: Buffer | null;
  }): Promise<{ png: Buffer | null; reason: string }> {
    if (!this.enabled) return { png: null, reason: 'enhancement is switched off' };

    let sign = PNG.sync.read(input.signLayer);
    try {
      let ground = await this.enhanceGround(input, sign.width, sign.height);

      if (input.relight) {
        // Half the measured cast, not all of it: what is measured is the
        // wall's light AND the wall's own colour, and applying the lot dips
        // the sign in the paint of the building behind it.
        const measured = temper(
          measureIlluminant(ground.data, ground.width, ground.height),
          0.5,
        );
        try {
          sign = PNG.sync.read(await input.relight(measured.gain));
        } catch (error) {
          this.logger.warn(
            `relight skipped, using the neutral sign layer: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      let backerApplied = false;
      if (input.backerLayer) {
        const backerFinal = await this.enhanceBacker({
          backerLayer: input.backerLayer,
          ground,
          view: input.view,
          spec: input.spec,
        });
        backerApplied = backerFinal.ai;
        const backerAlpha = new Uint8Array(backerFinal.png.width * backerFinal.png.height);
        for (let i = 0; i < backerAlpha.length; i++) backerAlpha[i] = backerFinal.png.data[i * 4 + 3]!;

        // Same idea as the letters' own standoff below, at the backer's: how
        // far off the wall it stands sets how tight a contact shadow it
        // throws around its own edge.
        const backerStandoff = Math.max(input.spec.backer.depth, 0.25);
        const backerRadius = Math.max(
          2, Math.min(24, (ground.width / 90) * backerStandoff * 0.35),
        );
        const pasted = integrate(
          new Uint8ClampedArray(ground.data), new Uint8ClampedArray(backerFinal.png.data),
          ground.width, ground.height,
          {
            occlusion: contactOcclusion(
              backerAlpha, ground.width, ground.height, backerRadius,
              input.view === 'night' ? 0.28 : 0.45,
            ),
          },
        );
        const out = new PNG({ width: ground.width, height: ground.height });
        out.data = Buffer.from(pasted);
        ground = out;
      }

      const merged = this.seatSign(
        sign, ground, input.view, input.spec, input.haloGlow ?? null, input.lettersMask ?? null,
      );
      if (!merged.ok) {
        this.logger.error(`layered night discarded: ${merged.reason}`);
        return { png: null, reason: `layered night discarded — ${merged.reason}` };
      }

      this.logger.log(
        `layered night: ${merged.compared} sign pixels verified unchanged`,
      );
      return {
        png: merged.png,
        reason: 'The wall behind the sign was rendered here, then passed to a generative '
          + 'model for material and lighting realism. The sign itself never went to the '
          + 'model: it is the deterministic render, composited back over that wall by this '
          + 'machine and verified against the specification pixel for pixel. The glow it '
          + 'casts on the wall, and the light the wall casts back onto it, are computed '
          + 'rather than drawn.'
          + (input.backerLayer
            ? (backerApplied
              ? ' The backer panel was given its own material pass, clipped back to its exact '
                + 'shape afterwards — its outline is the deterministic render, its material is '
                + 'the model\'s.'
              : ' The backer panel\'s material pass was unavailable; it is shown as rendered, '
                + 'unlit.')
            : ''),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`layered night skipped: ${message}`);
      return { png: null, reason: 'a layered night panel was not available' };
    }
  }

  /**
   * Seats a rendered sign onto a ground and proves it survived.
   *
   * Ground, contact occlusion, sign — and the spill only AFTER the check. The
   * check asks one question, "did the ground alter the sign", and bloom falls
   * across the sign as well as around it, so adding it first would fail the
   * check on our own arithmetic rather than on anything the model did.
   */
  private seatSign(
    sign: PNG,
    ground: PNG,
    view: 'day' | 'night',
    spec: SignSpec,
    /** Pre-rendered off the sign's own halo geometry. Null when it has none. */
    haloGlow: Buffer | null,
    /**
     * Greyscale PNG, letters and returns only — the backer panel (and
     * mounting surface) subtracted out of `sign`'s own alpha. Falls back to
     * that full alpha when absent, which is only ever right on a sign with
     * no backer: with one, `sign` is opaque across its whole footprint, not
     * just the copy, so masking the glow by it holds the halo back exactly
     * where it is meant to land — on the backer's face, close around each
     * letter.
     */
    lettersMask: Buffer | null,
  ): { ok: true; png: Buffer; compared: number } | { ok: false; reason: string } {
    const alpha = new Uint8Array(sign.width * sign.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = sign.data[i * 4 + 3]!;

    const glowCoverage = lettersMask
      ? (() => {
          const mask = PNG.sync.read(lettersMask);
          const out = new Uint8Array(sign.width * sign.height);
          for (let i = 0; i < out.length; i++) out[i] = mask.data[i * 4]!;
          return out;
        })()
      : alpha;

    const standoff = Math.max(...spec.elements.map((e) => e.returnDepth ?? 5), 1);
    const radius = Math.max(3, Math.min(48, (sign.width / 90) * standoff * 0.35));

    const seated = integrate(
      new Uint8ClampedArray(ground.data),
      new Uint8ClampedArray(sign.data),
      sign.width,
      sign.height,
      { occlusion: contactOcclusion(alpha, sign.width, sign.height, radius, view === 'night' ? 0.28 : 0.45) },
    );

    const check = verifyCompositedSign(
      { width: sign.width, height: sign.height, data: sign.data },
      { width: sign.width, height: sign.height, data: seated },
    );
    if (!check.ok) return { ok: false, reason: check.reason ?? 'the sign did not survive the composite' };

    let merged: Uint8ClampedArray = seated;
    if (view === 'night' && haloGlow) {
      // The real thing, not an invention of this pass: `haloGlow` is the same
      // concentric-shell halo `render()` draws for a studio panel, rendered
      // off this sign's own geometry and blurred deterministically (see
      // `blurredHalo` in browser-entry.ts), tight against the letterform and
      // fading within a letter-height or so. Left to the ground pass instead,
      // it has no idea what shape the letters are and drew a generic warm
      // pool centred on the frame regardless — the failure this exists to
      // avoid.
      const glowPng = PNG.sync.read(haloGlow);
      const channel = (offset: number): Float32Array => {
        const out = new Float32Array(sign.width * sign.height);
        for (let i = 0; i < out.length; i++) out[i] = glowPng.data[i * 4 + offset]! / 255;
        return out;
      };
      merged = applySpill(
        seated, sign.width, sign.height,
        { r: channel(0), g: channel(1), b: channel(2) },
        glowCoverage,
      );
    } else if (view === 'night') {
      // No halo geometry on this construction (front-lit only), so `sign`
      // carries no shells for `haloGlow` to come from — see its own comment.
      // Whatever light reaches the wall around the letters has to come from
      // this spill instead, computed off the sign layer's own emissive
      // pixels. Sized off the standoff it used to stay a thin rim hugging the
      // return depth — correct for a tight halo, but a front-lit face throws
      // nothing else into the frame, so that rim was the sign's whole glow
      // and read as barely lit next to a real photograph of one. Sized off
      // the sign's width instead, so the bleed reads as light leaving the
      // face rather than as a shadow catching the standoff gap.
      merged = applySpill(seated, sign.width, sign.height, lightSpill(
        sign.data, sign.width, sign.height,
        {
          threshold: 130,
          tight: Math.max(4, Math.round(sign.width * 0.01)),
          wide: Math.max(24, Math.round(sign.width * 0.06)),
          strength: 0.4,
        },
      ), glowCoverage);
    }

    const out = new PNG({ width: sign.width, height: sign.height });
    out.data = Buffer.from(merged);
    return { ok: true, png: PNG.sync.write(out), compared: check.compared };
  }

  /**
   * The backer panel's own material pass.
   *
   * A dedicated call rather than a mask opened up on the full panel: the
   * backer is rendered here on its own, transparent everywhere outside its
   * footprint, so nothing else in the frame — the letters least of all — is
   * ever in the same picture a model sees. Whatever comes back is clipped
   * back to the backer's own deterministic alpha before it is trusted: the
   * mask tells the model roughly where to paint, but only pixels this
   * renderer itself decided are backer ever reach the frame, which is what
   * keeps a contour panel's precise cut from drifting under a no-mask edit.
   *
   * Several candidates are drawn from one call and scored by
   * `colourDriftFraction` against the backer's own specified colour, the
   * same way the logo-only pass scores its candidates by how much of the
   * mark leaked — a diffusion edit does not reliably keep a panel close to
   * the colour it was told, and the fix already proven here is another
   * draw, not a tighter prompt.
   *
   * Never throws. A failed call falls back to the deterministic, unlit
   * panel — the same picture this construction rendered before this pass
   * existed — because a presentation layer is never allowed to cost a proof
   * its backer.
   */
  private async enhanceBacker(input: {
    backerLayer: Buffer;
    /** The (already AI-enhanced) wall — context for the call only, discarded. */
    ground: PNG;
    view: 'day' | 'night';
    spec: SignSpec;
  }): Promise<{ png: PNG; ai: boolean }> {
    const backer = PNG.sync.read(input.backerLayer);
    const backerAlpha = new Uint8Array(backer.width * backer.height);
    for (let i = 0; i < backerAlpha.length; i++) backerAlpha[i] = backer.data[i * 4 + 3]!;

    try {
      const client = this.getClient();

      // Context for the call: the backer over the wall, opaque. The model
      // needs a real picture to react to, not a mostly-transparent canvas —
      // but this is scaffolding, not output. Everything outside the mask is
      // discarded on the way out, so it does not matter that this wall is
      // not the one the finished panel actually uses.
      const context = new PNG({ width: backer.width, height: backer.height });
      context.data = Buffer.from(integrate(
        new Uint8ClampedArray(input.ground.data), new Uint8ClampedArray(backer.data),
        backer.width, backer.height, {},
      ));

      const editable = new Uint8Array(backerAlpha.length);
      for (let i = 0; i < editable.length; i++) editable[i] = backerAlpha[i]! > 4 ? 1 : 0;
      const maskPng = new PNG({ width: backer.width, height: backer.height });
      maskPng.data = Buffer.from(maskToRgba(editable, backer.width, backer.height));

      const candidates = this.config.get<number>('enhance.candidates') ?? 2;
      const result = await client.images.edit(
        {
          model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
          image: await toFile(PNG.sync.write(context), 'backer.png', { type: 'image/png' }),
          mask: await toFile(PNG.sync.write(maskPng), 'mask.png', { type: 'image/png' }),
          prompt: this.backerPrompt(input),
          size: pickEditSize(backer.width, backer.height) as never,
          n: candidates,
        },
        { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
      );
      if (!result.data || result.data.length === 0) {
        throw new Error('the image endpoint returned no image');
      }

      // A neutral fallback on purpose, not the resolver's own default: a
      // backer colour this table does not recognise should score every
      // candidate as undrifted (an achromatic target always does, per
      // `colourDriftFraction`) rather than against a wrong hue it made up.
      const target = resolveColour(input.spec.backer.colour, '#808080');
      const targetRgb = { r: Math.round(target.r * 255), g: Math.round(target.g * 255), b: Math.round(target.b * 255) };

      let best: { png: PNG; drift: number } | null = null;
      for (const d of result.data) {
        if (!d.b64_json) continue;
        const raw = resample(PNG.sync.read(Buffer.from(d.b64_json, 'base64')), backer.width, backer.height);

        const clipped = new PNG({ width: backer.width, height: backer.height });
        for (let i = 0; i < backerAlpha.length; i++) {
          const o = i * 4;
          clipped.data[o] = raw.data[o]!;
          clipped.data[o + 1] = raw.data[o + 1]!;
          clipped.data[o + 2] = raw.data[o + 2]!;
          clipped.data[o + 3] = backerAlpha[i]!;
        }

        const drift = colourDriftFraction(clipped.data, editable, targetRgb);
        if (!best || drift < best.drift) best = { png: clipped, drift };
      }
      if (!best) throw new Error('the image endpoint returned no usable image');

      this.logger.log(
        `backer material pass: best of ${result.data.length}, `
        + `colour drift ${(best.drift * 100).toFixed(1)}%`,
      );
      return { png: best.png, ai: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`backer material pass skipped, using the deterministic panel: ${message}`);
      return { png: backer, ai: false };
    }
  }

  /**
   * What the model is told when it owns only the backer panel.
   *
   * The letters never appear in this picture — they are composited on top
   * afterwards, over the halo, which is also never in this picture — so the
   * prompt says as much rather than leaving the model to guess why a plaque
   * sits there with nothing mounted to it.
   */
  private backerPrompt(input: { view: 'day' | 'night'; spec: SignSpec }): string {
    const colour = input.spec.backer.colour;
    const night = input.view === 'night';
    return [
      `The masked area is a backer panel — a real, physical plaque that a sign's letters `
        + `mount to, specified in ${colour}.`,
      'Render it as a real object: a visible material that reads as that colour (brushed '
        + 'metal, painted aluminium composite, whatever suits it best), real screws or '
        + 'standoffs where it meets the wall, proper specular highlights and a touch of '
        + 'surface grain. It should read as something you could reach out and touch, not a '
        + 'flat colour swatch.',
      night
        ? 'It is night. The letters that mount to this panel, and the glow they throw close '
          + 'around themselves, are composited on afterwards and are not in this picture — '
          + 'keep the panel itself dark and believable for that: no light source of its own, '
          + 'no even studio lighting, no glow of any kind painted onto it.'
        : 'It is daytime: soft natural light and a believable material.',
      `Keep the panel close to its own specified colour, ${colour} — shift it for realistic `
        + 'material and light, not into a different colour altogether.',
      'The area outside the mask is scaffolding for this call only and is discarded '
        + 'afterwards — ignore it, and do not let anything you draw there guide what belongs '
        + 'inside the mask.',
    ].join('\n');
  }

  /**
   * The rendered wall, made real by a model.
   *
   * An edit call with no mask, on a picture with no sign in it — so there is
   * nothing in the frame for a model to redraw wrongly, and the prompt spends
   * its words on the wall instead of on protecting the copy. What comes back
   * is resampled to the panel and used as ground, never as sign.
   */
  private async enhanceGround(
    input: { background: Buffer; view: 'day' | 'night'; spec: SignSpec; onPhotograph?: boolean },
    width: number,
    height: number,
  ): Promise<PNG> {
    const client = this.getClient();
    const result = await client.images.edit(
      {
        model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
        image: await toFile(input.background, 'ground.png', { type: 'image/png' }),
        prompt: this.groundPrompt(input),
        size: pickEditSize(width, height) as never,
        n: 1,
      },
      { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
    );

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('the image endpoint returned no image');
    return resample(PNG.sync.read(Buffer.from(b64, 'base64')), width, height);
  }

  /**
   * What to say about a wall with nothing on it.
   *
   * The negatives carry most of the weight. Given an empty wall lit from one
   * side, a model's first instinct is to put something there — a sign, a
   * letter, a light fitting — because an empty frame reads as unfinished. The
   * sign is added afterwards, by this machine, and anything the model draws in
   * that space becomes a second sign behind the real one.
   */
  private groundPrompt(input: { view: 'day' | 'night'; spec: SignSpec; onPhotograph?: boolean }): string {
    const surface = input.spec.mountingSurface?.kind ?? 'wall';

    // A photograph is the customer's own building, and the job is to relight
    // it rather than to invent a wall. Everything that identifies the place —
    // its geometry, its materials, its openings — has to survive, or the proof
    // shows a night view of somewhere else.
    if (input.onPhotograph) {
      return [
        'This is a photograph of a real building, taken in daylight, with no sign on it yet.',
        input.view === 'night'
          ? 'Show the same building at night. Keep every architectural detail exactly as it is — '
            + 'the same geometry, the same openings, the same materials, the same framing and '
            + 'perspective, nothing moved, added or removed. Only the light changes: a dark, '
            + 'evenly lit facade under soft ambient street light, with the material texture still '
            + 'legible in the dark, believable falloff into the corners, and no daylight left in '
            + 'the sky or on the surfaces.'
          : 'Keep the building exactly as it is and only improve the realism of its light and '
            + 'material: true texture, believable ambient light and soft contact shadow.',
        'There is exactly one light in this scene and it is the sign itself, which is composited '
          + 'into the middle of the facade afterwards. So light the facade the way a lit sign '
          + 'standing there would light it: a soft, warm pool centred on the middle of the frame, '
          + 'brightest there and falling away smoothly to darkness at the edges, with the light '
          + 'clearly coming from the front and centre rather than from any side. Do not draw a '
          + 'second light source, a spotlight beam, a hotspot anywhere off-centre, or a visible '
          + 'light fitting — a second light fighting the sign is what makes a composite look fake.',
        'There must be NOTHING added to this building: no sign, no letters, no text, no numbers,',
        'no logo, no panel, plaque, frame, border or box, no lamp, no people, no vehicles. The',
        'building as photographed, at a different hour, is the correct and finished result.',
      ].join('\n');
    }

    return [
      `This is a render of an empty ${surface} with no sign on it. Make it look like a real`,
      'photograph of that surface: real material and grain, believable imperfection, real',
      'ambient light and colour temperature, natural falloff and soft shadowing.',
      input.view === 'night'
        ? 'It is night, and the only light in the scene is the sign that gets composited into the '
          + 'middle of the frame afterwards. Light the wall the way that sign would light it: a '
          + 'soft, warm pool centred in the frame, brightest at the centre and falling away to '
          + 'darkness at the edges, the light plainly coming from the front and centre. No second '
          + 'light source, no off-centre hotspot, no spotlight beam, no visible fitting.'
        : 'It is daytime: soft natural light and believable shadow.',
      'Keep the framing, perspective and proportions of the surface exactly as they are.',
      'There must be NOTHING on this surface: no sign, no letters, no text, no numbers, no logo,',
      'no panel, plaque, frame, border or box, no lamp or light fitting, no people. An empty',
      'surface is the correct and finished result.',
    ].join('\n');
  }

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
      // `signLayer` here comes from `__renderSignLayer`, not `__renderLayers`
      // — a single front-elevation render with no separate halo pass, so
      // there is no pre-blurred glow to hand in. Whatever halo shells the
      // sign has are already baked into its own pixels (see the comment on
      // `renderSignLayer`), and `seatSign` falls back to a spill off them.
      const merged = this.seatSign(sign, setting, input.view, input.spec, null, null);
      if (!merged.ok) {
        this.logger.error(`concept scene discarded: ${merged.reason}`);
        return { png: null, reason: `concept scene discarded — ${merged.reason}` };
      }
      this.logger.log(
        `concept scene (${input.view}): ${merged.compared} sign pixels verified unchanged`,
      );

      return {
        png: merged.png,
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

  /**
   * One call, several tries. The model's own randomness is what makes any
   * single attempt occasionally ghost a duplicate of the mark into the
   * glow — not a mask or prompt bug, a sampling draw — and the fix for a
   * sampling draw is another draw, not another sentence. `n` candidates come
   * back from one request; `enhance()` restores and verifies each and keeps
   * the one with the least of the logo's own colour leaking outside the
   * pixels it is allowed to be in.
   */
  private async callModel(
    input: EnhanceInput,
    base: PNG,
    mask: Uint8Array,
    logoOnly: boolean,
  ): Promise<Array<{ width: number; height: number; data: Uint8Array }>> {
    const client = this.getClient();

    const maskPng = new PNG({ width: base.width, height: base.height });
    maskPng.data = Buffer.from(maskToRgba(mask, base.width, base.height));

    // The edit endpoint only accepts a fixed set of output sizes — a proof
    // panel's own dimensions (e.g. 1600×1000) are not among them. Requesting
    // one and resampling the result back to the panel's size afterwards is
    // safe: the protected pixels are never taken from this image, only the
    // editable ones, and a slightly stretched background is a cosmetic cost,
    // not a correctness one. Compare `resample`, used the same way for the
    // concept scene's generated setting.
    const outSize = pickEditSize(base.width, base.height);
    const candidates = logoOnly ? this.config.get<number>('enhance.candidates') ?? 2 : 1;

    const result = await client.images.edit(
      {
        model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
        image: await toFile(input.base, 'panel.png', { type: 'image/png' }),
        mask: await toFile(PNG.sync.write(maskPng), 'mask.png', { type: 'image/png' }),
        prompt: logoOnly ? this.realismPrompt(input) : this.prompt(input),
        size: outSize as never,
        n: candidates,
      },
      { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
    );

    const out = (result.data ?? []).map((d) => {
      if (!d.b64_json) throw new Error('the image endpoint returned no image');
      const raw = PNG.sync.read(Buffer.from(d.b64_json, 'base64'));
      const returned = resample(raw, base.width, base.height);
      return { width: returned.width, height: returned.height, data: returned.data };
    });
    if (out.length === 0) throw new Error('the image endpoint returned no image');
    return out;
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

  /**
   * What the model is asked for when only CL-P-01 — the logo face — is
   * masked off.
   *
   * A plain-English framing plus a JSON constraint block naming the same
   * thing twice, in two forms a model parses differently. The block is not
   * enforcement — nothing here is; the mask and the restoration are what
   * actually guarantee the logo — but a diffusion model asked to "keep the
   * returns realistic" tends to also drift their colour, and naming the exact
   * value it arrived with (`returnColour: "Black"`, not "as rendered") is
   * cheap insurance against that drift, the way a spec line is cheaper than a
   * hope.
   */

  /**
   * Where the light is, when there is a panel behind the copy.
   *
   * A rear-illuminated element on a backer throws its light onto THAT backer:
   * a bright rim on the panel, tight around each letterform and falling away
   * from it. The panel itself is not a lamp and its outer edge does not glow.
   * Left unsaid, the model reads a dark plaque with bright copy on it as a
   * lightbox and lights the wall around the whole panel instead — which is a
   * different product, and one the spec block does not describe.
   */
  private haloPlacementNote(input: EnhanceInput): string | null {
    if (input.view !== 'night') return null;
    const rearLit = TYPES[input.spec.type].rearIlluminated;
    const hasBacker = input.spec.backer.present;
    if (!hasBacker) return null;

    return rearLit
      ? 'The light this sign throws sits BETWEEN the copy and the backer panel behind it. Show it '
        + 'as a halo on the face of that panel: brightest tight against each letterform, falling '
        + 'away within a few inches of it, and blocked by the letters themselves so each one reads '
        + 'as standing off the panel. The panel is not a lightbox and does not emit: it does not '
        + 'glow along its own outer edge, and the wall outside the panel stays dark except for what '
        + 'little spills past. A ring of light around the outside of the panel is wrong.'
      : 'The copy is lit through its own face; the backer panel behind it is not a lightbox and does '
        + 'not emit. Do not draw a glow around the outside of the panel — the panel takes only the '
        + 'light the letters spill onto it, and the wall outside it stays dark.';
  }

  private realismPrompt(input: EnhanceInput): string {
    const night = input.view === 'night';
    const hasBacker = input.spec.backer.present;

    return [
      'This is a product render of an illuminated channel-letter sign, and the goal is a',
      'genuinely photorealistic result — the quality of a real professional product photograph,',
      'not a CG-looking touch-up. You have full creative freedom over everything in the image',
      `except the logo lettering itself: reinterpret the returns, trim cap,${hasBacker ? ' backer panel,' : ''}`,
      'mounting surface, mounting hardware, wall material and texture, ambient light, reflections,',
      'shadows and atmosphere however makes it look most real. Real screws or standoffs, real',
      'brushed or painted metal with proper specular highlights, a real wall material with grain',
      'and imperfection, real bounce light and colour temperature are all encouraged.',
      night
        ? 'It is night: the sign is lit from within and casts a soft, warm, believable glow onto '
          + 'the wall behind it — the kind of glow a real LED-lit sign throws in a long-exposure '
          + 'photograph, not a flat CG bloom. Let the rest of the scene go genuinely dark around it.'
        : 'It is daytime: natural, soft ambient light, believable contact shadows and occlusion '
          + 'under the returns and trim cap.',
      this.haloPlacementNote(input),
      hasBacker
        ? 'The backer panel behind the letters is a real, physical plaque — render it as one: visible '
          + 'material (brushed metal, painted aluminium composite, whatever reads best), catching some of '
          + 'the sign\'s own glow and a little ambient bounce across its surface, with real screws or '
          + 'standoffs where it mounts to the wall. It should read as an object you could reach out and '
          + 'touch, not a flat black silhouette or a cut-out shadow shape sitting in front of the glow.'
        : 'There is no backer panel or plaque of any kind in this design — do not add one. The letters '
          + 'mount directly to the wall on their own standoffs or spacers, with the wall material and '
          + 'texture visible in the gaps between and around them, exactly like a real direct-mounted '
          + 'channel-letter installation. Do not invent a plate, panel, plaque, frame or border behind '
          + 'or around the letters — the wall itself is the only backdrop.',
      'The one hard rule: the logo lettering in the centre of the frame — its shape, proportions',
      'and colours — must not be redrawn, duplicated, echoed or altered in any way. It is masked',
      'and will be restored exactly regardless of what you produce there, so treat it as already',
      'finished and design everything else around it. The glow the sign casts is diffuse light with',
      'no shape of its own — it must never contain a second, faint or partial copy of the letters,',
      'a ghost outline, or anything that reads as a duplicate sign next to the real one.',
    ].filter(Boolean).join('\n');
  }

  /**
   * The unmasked pass. The panel goes to the model as a reference photo and
   * comes back as whatever the model made of it — logo included. Nothing
   * here is restored, nothing is verified, and `EnhanceOutcome.stats` is
   * left unset because there is nothing left that was actually checked.
   * `applied` is true whenever a usable image came back, not because the
   * result was confirmed correct in any sense the rest of this file means
   * by that word.
   */
  private async enhanceFullAi(input: EnhanceInput, base: PNG): Promise<EnhanceOutcome> {
    try {
      const client = this.getClient();
      const outSize = pickEditSize(base.width, base.height);

      const result = await client.images.edit(
        {
          model: this.config.get<string>('enhance.model') ?? 'gpt-image-1',
          image: await toFile(input.base, 'panel.png', { type: 'image/png' }),
          // No `mask` — the whole panel is editable, the logo included.
          prompt: this.fullAiPrompt(input),
          size: outSize as never,
          n: 1,
        },
        { timeout: this.config.get<number>('enhance.timeoutMs') ?? 90_000 },
      );

      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('the image endpoint returned no image');
      const raw = PNG.sync.read(Buffer.from(b64, 'base64'));
      const resized = resample(raw, base.width, base.height);

      const out = new PNG({ width: base.width, height: base.height });
      out.data = Buffer.from(resized.data);

      this.logger.warn(
        `${input.view}: full-AI pass returned an image — UNVERIFIED, logo not restored`,
      );

      return {
        png: PNG.sync.write(out),
        applied: true,
        reason: 'The entire image, including the logo, was regenerated by a generative '
          + 'model from a reference photo of the deterministic render. Nothing in this '
          + 'image is verified against the specification — dimensions, colours, outline '
          + 'and position may all differ from what was designed. Illustrative only.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`full-AI pass skipped: ${message}`);
      return {
        png: input.base,
        applied: false,
        reason: 'the full-AI pass was unavailable; the deterministic render is shown',
      };
    }
  }

  /**
   * What the model is told when it owns the whole frame, logo included.
   * Precise about what the mark actually says and is coloured, since there
   * is no mask to fall back on if the prompt is vague — this is the only
   * lever left.
   */
  private fullAiPrompt(input: EnhanceInput): string {
    const night = input.view === 'night';

    // Only typeset copy gets quoted to the model. A logo mark — uploaded
    // artwork rather than typed text — has no reliable text to quote: its
    // `content` is whatever the grouping step could infer, which for an
    // imported mark is a placeholder, and the design's `businessName` falls
    // back to the record's name, which is "Untitled Sign" until someone
    // renames it. Sent as "the sign reads: …", the model did exactly as it
    // was told and lettered the words "Untitled Sign" across the wall. The
    // reference photo already shows the mark; for artwork, saying nothing
    // about its content is strictly better than saying something wrong.
    const wordmarks = input.spec.elements.filter((e) => e.role !== 'CL-E-04');
    const quoted = wordmarks
      .map((e) => {
        const colours = e.colourBreaks?.length ? e.colourBreaks.join(', ') : null;
        return colours ? `"${e.content}" in exactly these colours: ${colours}` : `"${e.content}"`;
      })
      .join('; ');
    const palette = [...new Set(input.spec.elements.flatMap((e) => e.colourBreaks ?? []))];

    return [
      'This is a reference photo of an illuminated channel-letter sign, and the goal is a',
      'genuinely photorealistic reinterpretation of it — the quality of a real professional',
      'product photograph. You may reinterpret everything: the wall material and texture,',
      'the returns, trim cap, backer panel if any, mounting hardware, ambient light,',
      'reflections, shadows and atmosphere.',
      quoted
        ? `The sign reads: ${quoted}. Reproduce this text and these exact colours precisely, in `
          + 'the same layout, proportions and position as the reference photo.'
        : 'The sign face carries an existing logo mark, shown in the reference photo. Reproduce '
          + 'that mark exactly as it appears there — same shapes, same proportions, same position, '
          + `same colours${palette.length ? ` (${palette.join(', ')})` : ''}. Do not letter any `
          + 'words, do not add any text, and do not substitute a different logo: whatever the '
          + 'reference photo shows on the sign face is the mark, and it is already correct.',
      'This is the one part of the image that must not drift, be redrawn into a different font or',
      'shape, be duplicated, or shift in colour, even while everything around it is reinterpreted.',
      night
        ? 'It is night: the sign is lit from within and casts a soft, warm, believable glow onto '
          + 'the wall behind it, and the rest of the scene is genuinely dark around it.'
        : 'It is daytime: natural, soft ambient light and believable contact shadows.',
      this.haloPlacementNote(input),
    ].filter(Boolean).join('\n');
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    this.client = new OpenAI({ apiKey: this.config.getOrThrow<string>('enhance.apiKey') });
    return this.client;
  }
}

/**
 * The nearest of the edit endpoint's fixed output sizes to a panel's own
 * aspect ratio. There is no "auto to this exact size" option — 1024×1024,
 * 1024×1536 and 1536×1024 are the whole menu.
 */
function pickEditSize(width: number, height: number): '1024x1024' | '1024x1536' | '1536x1024' {
  const ratio = width / height;
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 1 / 1.2) return '1024x1536';
  return '1024x1024';
}

/**
 * Nearest-neighbour resample of a model's output back to a panel's own size.
 *
 * Safe here because it is only ever applied before the protected pixels are
 * overwritten from the deterministic base — moving THOSE by a fraction of a
 * pixel is exactly the class of error the verification exists to catch, and
 * this function never gets to decide what they end up being.
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
