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

  const solid = new Uint8Array(size);
  for (let i = 0; i < size; i++) solid[i] = renderedCoverage[i]! > 0 ? 1 : 0;

  const grown = dilate(solid, width, height, input.margin ?? 12);
  for (let i = 0; i < size; i++) editable[i] = grown[i] ? 0 : 1;
  return editable;
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
