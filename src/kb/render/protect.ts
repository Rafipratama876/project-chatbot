/**
 * What a generative model is allowed to touch, and the proof that it did not
 * touch anything else.
 *
 * The pipeline is: the deterministic renderer produces a panel, a model is
 * shown that panel with a mask, and whatever comes back has every protected
 * pixel forced back to the deterministic original and then CHECKED. The check
 * is the point. A mask is an instruction, and an instruction to a sampler is a
 * request; restoring the pixels makes it an outcome, and verifying afterwards
 * makes it an assertion that fails loudly when the plumbing is wrong.
 *
 * Two regions are protected, for different reasons:
 *
 *   Everything the deterministic renderer drew — because all of it is
 *   specified. The sign IS the design: its outline is what the shop cuts, its
 *   colours are §9.2's visual-truth contract, its size is what the customer
 *   signs. And the surface behind it is not backdrop either — it is CL-P-31's
 *   mounting surface, whose colour is a spec-block line. So the protected
 *   region is the renderer's own coverage, not a silhouette of the letters.
 *
 *   The customer's photograph — because it is evidence. A repainted facade is
 *   a picture of a building that does not exist, and every clearance, colour
 *   and fit read off it would describe that building instead of theirs. This
 *   is the part most "enhance the background" designs get wrong: they assume
 *   the background is a rendered asset. Here it is the site.
 *
 * What is left is whatever neither covers: empty frame. That is frequently
 * nothing at all, and then the enhancement is a no-op by construction. This
 * module is built so that outcome is reached honestly rather than by a model
 * quietly being trusted not to have repainted a specified colour.
 */

/** 8-bit RGBA, row-major, length = width × height × 4. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | Buffer;
}

export interface ProtectionSummary {
  /** Pixels a model may alter. */
  editable: number;
  /** Pixels it may not. */
  protected: number;
  total: number;
  /** 0–1. Zero means enhancement cannot change anything at all. */
  editableFraction: number;
}

/**
 * Grows the protected region outward by `margin` pixels.
 *
 * Without it a model may work right up to the antialiased edge of what was
 * rendered, where a halo of its own invention blends into the letterform and
 * reads as part of the mark. The margin is deliberately one-sided: it only
 * ever takes pixels away from the model, never gives them.
 */
export function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  margin: number,
): Uint8Array {
  if (margin <= 0) return mask.slice();
  // Two separable passes rather than a square kernel: a 16 px margin over a
  // 1600 × 1000 panel is 25 million kernel taps done naively, and this is on
  // the request path.
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let d = -margin; d <= margin && !hit; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < width && mask[row + xx]) hit = 1;
      }
      horizontal[row + x] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let d = -margin; d <= margin && !hit; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < height && horizontal[yy * width + x]) hit = 1;
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

export interface ProtectionInput {
  width: number;
  height: number;
  /**
   * The deterministic renderer's own coverage: non-zero wherever it drew
   * anything at all — the sign, and the mounting surface behind it. Not a
   * silhouette of the letterforms, because the surface is specified too.
   */
  renderedCoverage: Uint8Array;
  /**
   * True when the panel sits on the customer's photograph. Then the whole
   * frame is evidence and nothing is editable.
   */
  onPhotograph: boolean;
  /** Pixels of untouchable margin around the sign. */
  margin?: number;
  /**
   * Alpha value (0–255) a coverage pixel must clear to count as "the
   * renderer drew something opaque here" rather than 0, the previous test.
   * The halo is drawn as ~28 stacked, additively-blended shells fading
   * toward transparent at its own outer edge — real fade, meant to be seen
   * through — and their alpha buffer carries that same fade rather than
   * being 0 outside a hard edge. A `> 0` test caught the faintest trace of
   * the outermost shell and treated the entire reach of the halo as equally,
   * fully opaque, which is what a solid plaque looks like: a hard-edged
   * block, immune to any relighting, sized to the halo's full spread rather
   * than to anything actually opaque. Read on real output, not assumed.
   */
  minAlpha?: number;
}

/**
 * 1 where a model may write, 0 where it may not.
 */
export function protectionMask(input: ProtectionInput): Uint8Array {
  const { width, height, renderedCoverage, onPhotograph } = input;
  const size = width * height;
  const editable = new Uint8Array(size);

  // A photograph is protected end to end. Not "mostly", not "outside the
  // sign" — the building, the sky, the neighbouring units and the paving are
  // all things the customer can check against reality.
  if (onPhotograph) return editable;

  const minAlpha = input.minAlpha ?? 1;
  const solid = new Uint8Array(size);
  for (let i = 0; i < size; i++) solid[i] = renderedCoverage[i]! >= minAlpha ? 1 : 0;

  const grown = dilate(solid, width, height, input.margin ?? 12);
  for (let i = 0; i < size; i++) editable[i] = grown[i] ? 0 : 1;
  return editable;
}

/**
 * Confines the editable region to a padded box around what is protected,
 * instead of every pixel the panel has left over.
 *
 * The logo-only mask protects a small silhouette and opens the entire rest of
 * a 1600×1000 panel to the model — including corners hundreds of pixels from
 * the sign, with no subject there to ground anything it draws. Observed once
 * is enough to distrust the assumption that distance is safe: a run put an
 * unrelated blue ribbon shape in a far corner, nothing like the letterform
 * hallucination near the mask edge, just invention filling empty space
 * because it was allowed to. Real product photography does not have that
 * problem because a real camera frames the subject; this gives the model the
 * same restriction — a box around the protected silhouette, padded generously
 * for the wall and glow around it, with everything further out left exactly
 * as rendered.
 */
/**
 * Fades the model's contribution back to the deterministic base with
 * distance from the subject, instead of admitting or rejecting it by a hard
 * line.
 *
 * The first version of this drew a box: full editable weight inside it, zero
 * outside. That stopped a corner ribbon-shape invention from reaching the
 * far corners, but a binary box has an edge, and the model's output does not
 * agree with the untouched base at that edge — it is generally darker,
 * lighter, or a different colour temperature overall, because a diffusion
 * edit tends to grade the whole canvas it is given, not just the parts asked
 * for. The result was its own artefact: a visible rectangle, the model's mood
 * cut off against the render's, which is a worse tell than the thing it
 * replaced. A gradient has no edge to see.
 */
export function fadeToSubject(
  final: Uint8Array,
  base: Raster,
  mask: Uint8Array,
  width: number,
  height: number,
  /** Fraction of the panel that stays at full editable weight around the subject. */
  padFraction = 0.1,
  /** Fraction of the panel the fade takes to reach zero, beyond the pad. */
  featherFraction = 0.22,
): Uint8Array {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x]) continue; // Protected pixel — part of the subject.
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return final; // Nothing protected — nothing to fade around.

  const padX = width * padFraction;
  const padY = height * padFraction;
  const left = minX - padX;
  const right = maxX + padX;
  const top = minY - padY;
  const bottom = maxY + padY;
  const feather = Math.max(1, Math.min(width, height) * featherFraction);

  const out = new Uint8Array(final.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const o = i * 4;
      if (!mask[i]) {
        // Protected pixel — already exactly the base, and out of scope for
        // fading regardless: fading toward "base" here would be a no-op.
        out[o] = final[o]!; out[o + 1] = final[o + 1]!;
        out[o + 2] = final[o + 2]!; out[o + 3] = final[o + 3]!;
        continue;
      }
      const dx = x < left ? left - x : x > right ? x - right : 0;
      const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
      const dist = Math.hypot(dx, dy);
      const weight = dist <= 0 ? 1 : Math.max(0, 1 - dist / feather);
      if (weight >= 1) {
        out[o] = final[o]!; out[o + 1] = final[o + 1]!;
        out[o + 2] = final[o + 2]!; out[o + 3] = final[o + 3]!;
      } else {
        out[o] = base.data[o]! * (1 - weight) + final[o]! * weight;
        out[o + 1] = base.data[o + 1]! * (1 - weight) + final[o + 1]! * weight;
        out[o + 2] = base.data[o + 2]! * (1 - weight) + final[o + 2]! * weight;
        out[o + 3] = base.data[o + 3]! * (1 - weight) + final[o + 3]! * weight;
      }
    }
  }
  return out;
}

export function summarise(mask: Uint8Array): ProtectionSummary {
  let editable = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) editable++;
  return {
    editable,
    protected: mask.length - editable,
    total: mask.length,
    editableFraction: mask.length === 0 ? 0 : editable / mask.length,
  };
}

/**
 * The mask in the form an image-edit endpoint wants: RGBA where a TRANSPARENT
 * pixel marks a region to redraw and an opaque one marks a region to keep.
 */
export function maskToRgba(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = mask[i] ? 0 : 255;
  }
  return out;
}

export interface RestoreResult {
  data: Uint8Array;
  /** Pixels the model changed that it was allowed to change. */
  changed: number;
  /** Pixels it changed that it was NOT allowed to change, before restoration. */
  violations: number;
  /** Largest single-channel deviation inside the protected region. */
  worstViolation: number;
}

/**
 * Forces every protected pixel back to the deterministic original.
 *
 * Reports what it had to undo. A non-zero `violations` is not a failure on its
 * own — a diffusion model repaints the whole canvas and will differ everywhere
 * by a digit or two — but it is the number that says how much of the result is
 * the model's opinion rather than the renderer's output.
 */
export function restoreProtected(base: Raster, model: Raster, mask: Uint8Array): RestoreResult {
  if (base.width !== model.width || base.height !== model.height) {
    throw new ProtectionError(
      `the model returned ${model.width}×${model.height} for a ${base.width}×${base.height} panel; `
      + 'a resized result cannot be recombined pixel for pixel, so it is discarded',
    );
  }

  const size = base.width * base.height;
  const out = new Uint8Array(size * 4);
  let changed = 0;
  let violations = 0;
  let worstViolation = 0;

  for (let i = 0; i < size; i++) {
    const o = i * 4;
    let differs = 0;
    let delta = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(base.data[o + c]! - model.data[o + c]!);
      if (d > 0) differs = 1;
      if (d > delta) delta = d;
    }

    if (mask[i]) {
      // The model owns this pixel.
      out[o] = model.data[o]!;
      out[o + 1] = model.data[o + 1]!;
      out[o + 2] = model.data[o + 2]!;
      out[o + 3] = model.data[o + 3]!;
      if (differs) changed++;
    } else {
      out[o] = base.data[o]!;
      out[o + 1] = base.data[o + 1]!;
      out[o + 2] = base.data[o + 2]!;
      out[o + 3] = base.data[o + 3]!;
      if (differs) {
        violations++;
        if (delta > worstViolation) worstViolation = delta;
      }
    }
  }

  return { data: out, changed, violations, worstViolation };
}

/**
 * Locks every editable pixel's hue and saturation back to the deterministic
 * original, keeping only the model's lightness — blurred first, so a thin
 * hallucinated line survives no better than the colour did.
 *
 * The mask and `restoreProtected` guarantee the PROTECTED region is untouched
 * — the logo, byte for byte. They say nothing about the region the model IS
 * allowed into, and that region turned out to have its own two failure modes,
 * both observed on real output rather than assumed:
 *
 *   Colour drift — a diffusion model asked to relight aluminium returns often
 *   also recolours them, and no prompt reliably stops that. HSL fixes it:
 *   hue and saturation are pinned to the base colour at every editable pixel,
 *   and only lightness is taken from the model, so a return can be darkened
 *   or highlighted but not repainted a different colour.
 *
 *   Phantom structure — separately, and not fixed by the above: the model
 *   sometimes draws a faint secondary line near the letterforms — a ghost of
 *   an outline nobody asked for, sitting in the halo's own glow where the
 *   real render has none. It is achromatic, so it survives hue/saturation
 *   locking untouched; what marks it as an invention is that it is a sharp,
 *   thin feature, and the light this sign actually casts is not. Blurring
 *   the model's lightness before it is used costs the halo nothing — a glow
 *   is diffuse by definition — while a hairline trace, which is the opposite
 *   of diffuse, is smeared down into the smooth field around it.
 */
/**
 * Fraction of the editable region where the model's RAW, pre-restoration
 * output is implausibly saturated — a second, independent check, run before
 * any of the colour-locking above, on the model's actual opinion rather than
 * on what is left of it afterward.
 *
 * `preserveChroma` mathematically prevents an invented hue once the base
 * pixel it locks to is genuinely neutral, but that guarantee is only as good
 * as every base pixel actually being neutral where it is supposed to read as
 * neutral — and one was not (a "black" night backdrop that measured a real
 * ~29% blue at that darkness, invisible until something brightened it; see
 * the fill colour it came from). Rather than trust that every such source is
 * now fixed and stay silent if a future one is not, this looks at what the
 * model itself drew: real product-photo relighting stays in a moderate
 * saturation band — metal, paint, plaster, shadow — and a large solid patch
 * of vivid, high-saturation colour in what should be a wall or a return is
 * either a repaint or an invented object, not lighting.
 */
export function suspiciousSaturationFraction(
  model: Raster,
  mask: Uint8Array,
  threshold = 0.55,
): number {
  const size = model.width * model.height;
  let flagged = 0;
  let editable = 0;
  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue;
    editable++;
    const o = i * 4;
    const [, s, l] = rgbToHsl(model.data[o]!, model.data[o + 1]!, model.data[o + 2]!);
    // Excluded at the extremes on purpose: a near-black shadow or a
    // near-white highlight can register a spurious high "saturation" in HSL
    // even when it reads as neutral to the eye — the same effect that
    // produced the bug this function exists to catch, just at the opposite
    // end of the fix. Flagging only the mid-tones is what makes this a check
    // on the model's actual colour choice rather than on lighting contrast.
    if (s > threshold && l > 0.15 && l < 0.9) flagged++;
  }
  return editable === 0 ? 0 : flagged / editable;
}

/**
 * Fraction of the editable region whose colour matches the logo's OWN
 * palette — sampled from the protected pixels themselves, never hardcoded,
 * so this works for any mark, not just the one it was built against.
 *
 * The recurring defect on real output was never an arbitrary invented
 * colour; it was a ghost of the mark itself — a faint duplicate letter,
 * echoed in roughly its own purple or orange, sitting in the glow outside
 * the protected pixels. `suspiciousSaturationFraction` catches an unrelated
 * invented colour; this catches the specific, repeated failure of the mark
 * bleeding into territory that is supposed to be material and light, by
 * checking whether the editable region has started to look like the logo.
 */
export function logoColourLeakFraction(
  base: Raster,
  candidate: Uint8Array,
  mask: Uint8Array,
): number {
  const size = base.width * base.height;
  const buckets = new Set<number>();
  for (let i = 0; i < size; i++) {
    if (mask[i]) continue; // Only the protected pixels are "the logo".
    const o = i * 4;
    const [h, s, l] = rgbToHsl(base.data[o]!, base.data[o + 1]!, base.data[o + 2]!);
    if (s > 0.35 && l > 0.15 && l < 0.85) buckets.add(Math.round(h * 36));
  }
  if (buckets.size === 0) return 0; // An achromatic logo has no palette to leak.

  let leaked = 0;
  let editable = 0;
  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue;
    editable++;
    const o = i * 4;
    const [h, s, l] = rgbToHsl(candidate[o]!, candidate[o + 1]!, candidate[o + 2]!);
    if (s < 0.35 || l < 0.15 || l > 0.85) continue;
    const bucket = Math.round(h * 36);
    if (buckets.has(bucket) || buckets.has((bucket + 1) % 36) || buckets.has((bucket + 35) % 36)) {
      leaked++;
    }
  }
  return editable === 0 ? 0 : leaked / editable;
}

export function preserveChroma(
  base: Raster,
  working: Uint8Array,
  mask: Uint8Array,
  blurRadius = 0,
): Uint8Array {
  const { width, height } = base;
  const size = width * height;
  const out = new Uint8Array(working.length);
  out.set(working);

  // The lightness field, over the whole panel — not just the editable
  // pixels — so the blur has real neighbours to draw on right up to the
  // logo's own edge, where it should taper into the true render rather than
  // read from nothing.
  let lightness: Float32Array | null = null;
  if (blurRadius > 0) {
    lightness = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const o = i * 4;
      lightness[i] = rgbToHsl(working[o]!, working[o + 1]!, working[o + 2]!)[2];
    }
    lightness = boxBlur(lightness, width, height, blurRadius);
  }

  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue; // Protected pixels are already the base, untouched here.
    const o = i * 4;
    const [h, s, baseL] = rgbToHsl(base.data[o]!, base.data[o + 1]!, base.data[o + 2]!);
    // HSL saturation is a ratio, and near black or near white that ratio is
    // numerically unstable — RGB(0,1,5) is invisible from black to the eye
    // but computes to 100% saturation, because the denominator it is
    // measured against is itself almost zero. Locking that "colour" and then
    // handing it a bright lightness from the model is exactly how a night
    // panel whose darkest corners carry a few units of rounding noise turned
    // a subpixel tint into a solid blue disc — observed on real output, not
    // a hypothetical. Saturation is faded out toward true grey as the base
    // pixel it came from approaches black or white, so there is nothing left
    // to amplify once the model brightens or darkens it.
    const confidence = saturationConfidence(baseL);
    const l = lightness ? lightness[i]! : rgbToHsl(working[o]!, working[o + 1]!, working[o + 2]!)[2];
    const [r, g, b] = hslToRgb(h, s * confidence, l);
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = working[o + 3]!;
  }
  return out;
}

/**
 * 0 at pure black or pure white, ramping to 1 a short distance in. Applied to
 * saturation before it is locked, so a base pixel's hue only survives being
 * carried to a very different lightness if it was measured somewhere the
 * ratio meant something.
 */
function saturationConfidence(l: number): number {
  const floor = 0.06;
  const ceil = 0.94;
  if (l < floor) return l / floor;
  if (l > ceil) return (1 - l) / (1 - ceil);
  return 1;
}

/** Separable box blur — two passes, same trick as `dilate` above. */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let d = -radius; d <= radius; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < width) { sum += values[row + xx]!; n++; }
      }
      horizontal[row + x] = sum / n;
    }
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let d = -radius; d <= radius; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < height) { sum += horizontal[yy * width + x]!; n++; }
      }
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255),
  ];
}

export interface Verification {
  ok: boolean;
  /** Protected pixels that still differ from the deterministic render. */
  differing: number;
  reason?: string;
}

/**
 * Confirms, after the fact, that the protected region is byte-identical.
 *
 * `restoreProtected` already guarantees this by construction, so this is not
 * belt and braces on the model — it is belt and braces on us. It catches a
 * mask off by one row, a channel order swapped in a decoder, a resize slipped
 * in by an image library. Those produce a plausible picture with the sign
 * subtly wrong, which is the failure mode nobody notices until a shop cuts it.
 */
export function verifyProtected(base: Raster, result: Raster, mask: Uint8Array): Verification {
  if (base.width !== result.width || base.height !== result.height) {
    return { ok: false, differing: -1, reason: 'the result is not the size of the base render' };
  }
  const size = base.width * base.height;
  if (mask.length !== size) {
    return { ok: false, differing: -1, reason: 'the mask is not the size of the base render' };
  }

  let differing = 0;
  for (let i = 0; i < size; i++) {
    if (mask[i]) continue;
    const o = i * 4;
    if (
      base.data[o] !== result.data[o]
      || base.data[o + 1] !== result.data[o + 1]
      || base.data[o + 2] !== result.data[o + 2]
      || base.data[o + 3] !== result.data[o + 3]
    ) differing++;
  }

  return differing === 0
    ? { ok: true, differing: 0 }
    : {
        ok: false,
        differing,
        reason: `${differing} protected pixel(s) differ from the deterministic render`,
      };
}

export class ProtectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtectionError';
  }
}

/**
 * Confirms the sign in a composited scene is still the sign that was rendered.
 *
 * For a concept scene the base is not the whole panel — the setting underneath
 * is generated and is *supposed* to be the model's work. What must survive
 * untouched is the sign laid over it, so this compares only the pixels the
 * deterministic layer covers completely. Partially transparent pixels along
 * the antialiased edge legitimately blend with whatever is behind them and
 * cannot be compared byte for byte, so they are excluded rather than fudged
 * with a tolerance — a tolerance is where a real difference hides.
 */
export function verifyCompositedSign(
  signLayer: Raster,
  result: Raster,
): Verification & { compared: number } {
  if (signLayer.width !== result.width || signLayer.height !== result.height) {
    return {
      ok: false,
      differing: -1,
      compared: 0,
      reason: 'the scene is not the size of the sign layer',
    };
  }

  const size = signLayer.width * signLayer.height;
  let differing = 0;
  let compared = 0;

  for (let i = 0; i < size; i++) {
    const o = i * 4;
    if (signLayer.data[o + 3] !== 255) continue;
    compared++;
    if (
      signLayer.data[o] !== result.data[o]
      || signLayer.data[o + 1] !== result.data[o + 1]
      || signLayer.data[o + 2] !== result.data[o + 2]
    ) differing++;
  }

  if (compared === 0) {
    return {
      ok: false,
      differing: 0,
      compared: 0,
      reason: 'the sign layer is empty — there is nothing to verify',
    };
  }

  return differing === 0
    ? { ok: true, differing: 0, compared }
    : {
        ok: false,
        differing,
        compared,
        reason: `${differing} of ${compared} sign pixels differ from the deterministic render`,
      };
}
