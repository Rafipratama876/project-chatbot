/**
 * Making a rendered sign sit in a photograph, deterministically.
 *
 * Everything here is arithmetic on pixels the renderer already produced. No
 * model, no sampling, no seed — the same spec and the same photograph give the
 * same output byte for byte, which is the property the whole proof rests on.
 *
 * Three effects, each answering a specific reason a composite reads as pasted
 * on. None of them repaints the sign: the face, the returns and the trim keep
 * the colours the spec block states.
 *
 *   Contact occlusion — a sign stood off a wall blocks the sky from the gap
 *   behind it, so the wall darkens close to the letters. Its absence is the
 *   single strongest tell, and no amount of shadow softening substitutes for
 *   it: at a 5″ standoff the sun's own penumbra is under a twentieth of an
 *   inch, so a real cast shadow IS sharp. What is missing is not softness.
 *
 *   Light spill — an illuminated sign at night throws light onto the wall
 *   around it. A night composite without it shows a bright shape on a dark
 *   wall, which is a picture of a sticker, not of a lit sign.
 *
 *   Illuminant — the photograph was taken under some light with a colour of
 *   its own. Measuring it lets the renderer light the sign the same way, so
 *   the pigment is shown under the scene's light rather than under a studio
 *   neutral that exists nowhere in the picture.
 */

export interface Rgb { r: number; g: number; b: number }

/** Rec. 709 luminance, 0–255. */
export const luma = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * A separable box blur, run three times to approximate a Gaussian.
 *
 * Three boxes are within a couple of percent of a true Gaussian and cost a
 * handful of operations per pixel instead of a kernel per pixel — which
 * matters at 1600 × 1000 on a request path.
 */
export function blur(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 3,
): Float32Array {
  // Rounded here, at the boundary, rather than trusted to every caller.
  //
  // A blur radius is a whole number of pixels by definition, and a fractional
  // one is silently catastrophic: the running-sum loops step by 1 from -r, so a
  // radius of 89.7 indexes the array at 12.3, reads `undefined`, and poisons
  // the accumulator with NaN. Every pixel then clamps to 0 on the way into a
  // Uint8ClampedArray and the whole frame comes out black — with no error, no
  // warning, and a plausible-looking file on disk.
  const r = Math.round(radius);
  if (r < 1) return source.slice();

  let current = source.slice();
  const scratch = new Float32Array(source.length);
  for (let p = 0; p < passes; p++) {
    boxH(current, scratch, width, height, r);
    boxV(scratch, current, width, height, r);
  }
  return current;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    // A running sum: each step adds one pixel and drops one, so the cost is
    // independent of the radius.
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + clampi(x, 0, w - 1)]!;
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum / span;
      sum -= src[row + clampi(x - r, 0, w - 1)]!;
      sum += src[row + clampi(x + r + 1, 0, w - 1)]!;
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const span = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += src[clampi(y, 0, h - 1) * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / span;
      sum -= src[clampi(y - r, 0, h - 1) * w + x]!;
      sum += src[clampi(y + r + 1, 0, h - 1) * w + x]!;
    }
  }
}

const clampi = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * How much the wall darkens near the sign, per pixel, 0–1.
 *
 * A blurred silhouette with the silhouette itself removed: what is left is a
 * gradient hugging the outside of the letters, strongest where they are
 * closest. That is the shape ambient occlusion takes when a flat object stands
 * a short distance off a flat wall, which is exactly this case.
 *
 * `radius` is in pixels and should follow the standoff — a deeper gap occludes
 * further. Passing a constant would make a 1″ spacer and an 8″ raceway darken
 * the wall identically, which is one of the things the depth is supposed to
 * show.
 */
export function contactOcclusion(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  strength = 0.55,
): Float32Array {
  const size = width * height;
  const solid = new Float32Array(size);
  for (let i = 0; i < size; i++) solid[i] = alpha[i]! / 255;

  const spread = blur(solid, width, height, Math.max(1, radius));
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    // Outside the silhouette only. Inside it the sign is drawn over the wall
    // anyway, and darkening there would dim the returns.
    const outside = Math.max(0, spread[i]! - solid[i]!);
    out[i] = Math.min(1, outside * strength);
  }
  return out;
}

/**
 * The light an illuminated sign throws onto its surroundings.
 *
 * Taken from the sign's own bright pixels, so the spill is the colour the sign
 * actually emits — a purple face throws purple light. Two radii are summed: a
 * tight one for the halation right at the letter edge and a wide one for the
 * general lift of the wall, which is how a real bloom falls off.
 */
export function lightSpill(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  opts: { threshold?: number; tight: number; wide: number; strength?: number } = {
    tight: 6, wide: 40,
  },
): { r: Float32Array; g: Float32Array; b: Float32Array } {
  const size = width * height;
  const threshold = opts.threshold ?? 90;
  const strength = opts.strength ?? 1;

  const channels: Float32Array[] = [
    new Float32Array(size), new Float32Array(size), new Float32Array(size),
  ];
  for (let i = 0; i < size; i++) {
    const o = i * 4;
    const a = rgba[o + 3]! / 255;
    // Brightest channel, NOT perceptual luminance. A saturated face is dim by
    // Rec. 709 and bright to a camera: FedEx purple is luma 41 against an
    // orange's 127, so a luminance threshold would have a lit purple face
    // throw no light at all while the orange beside it glowed. What is being
    // detected here is emission, and emission is per channel.
    const peak = Math.max(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!) * a;
    if (peak <= threshold) continue;
    const excess = (peak - threshold) / (255 - threshold);
    channels[0]![i] = (rgba[o]! / 255) * excess * a;
    channels[1]![i] = (rgba[o + 1]! / 255) * excess * a;
    channels[2]![i] = (rgba[o + 2]! / 255) * excess * a;
  }

  const combine = (c: Float32Array): Float32Array => {
    const tight = blur(c, width, height, opts.tight);
    const wide = blur(c, width, height, opts.wide);
    const out = new Float32Array(size);
    for (let i = 0; i < size; i++) out[i] = (tight[i]! * 0.65 + wide[i]! * 0.45) * strength;
    return out;
  };

  return { r: combine(channels[0]!), g: combine(channels[1]!), b: combine(channels[2]!) };
}

export interface Illuminant {
  /** Per-channel multipliers that take a neutral grey to the photo's grey. */
  gain: Rgb;
  /** Mean luminance of the photograph, 0–255. */
  level: number;
}

/**
 * The colour and level of the light in a photograph.
 *
 * Measured from the whole frame rather than a sampled patch: a patch might
 * land on the sky, a door or a tree, and the illuminant would then follow
 * whatever happened to be under it. The mean of everything is a crude grey-
 * world estimate, which is the right amount of cleverness here — a strong
 * white balance guess that is wrong looks far worse than a weak one.
 */
export function measureIlluminant(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  step = 4,
): Illuminant {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      r += rgba[o]!;
      g += rgba[o + 1]!;
      b += rgba[o + 2]!;
      n++;
    }
  }
  if (n === 0) return { gain: { r: 1, g: 1, b: 1 }, level: 128 };

  r /= n; g /= n; b /= n;
  const grey = (r + g + b) / 3 || 1;
  return {
    gain: { r: r / grey, g: g / grey, b: b / grey },
    level: luma(r, g, b),
  };
}

/**
 * Pulls an illuminant toward neutral by `keep`.
 *
 * The measured cast is the photograph's light AND its subject matter — a brick
 * facade reads warm because it is brick, not only because of the sun. Applying
 * the full estimate would tint the sign with the building's own colour, so
 * only a fraction is used. This is the knob that decides whether the sign
 * looks lit by the same light or dipped in the wall's paint.
 */
export function temper(illuminant: Illuminant, keep: number): Illuminant {
  const mix = (v: number): number => 1 + (v - 1) * keep;
  return {
    gain: {
      r: mix(illuminant.gain.r),
      g: mix(illuminant.gain.g),
      b: mix(illuminant.gain.b),
    },
    level: illuminant.level,
  };
}

/**
 * Adds emitted light over a finished composite.
 *
 * Separated from `integrate` so it can be applied AFTER a verification pass.
 * Spill legitimately falls across the sign as well as around it — that is what
 * bloom is — but it means the sign's pixels are no longer byte-identical to
 * the render. Where the point of the check is "did a generated setting alter
 * the sign", our own deterministic bloom must not be what makes it fail.
 */
export function applySpill(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  spill: { r: Float32Array; g: Float32Array; b: Float32Array },
  /**
   * Coverage of the sign, 0–255. Where the sign is solid the spill is held
   * back, because glow piled onto the face washes the specified colour out —
   * a saturated orange goes yellow, which is exactly the change the spec block
   * says did not happen. Real bloom does veil the object, but a proof that
   * misreports a face colour costs more than a slightly understated one.
   */
  coverage?: Uint8Array | Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const hold = coverage ? 1 - (coverage[i]! / 255) * 0.85 : 1;
    out[o] = rgba[o]! + spill.r[i]! * 255 * hold;
    out[o + 1] = rgba[o + 1]! + spill.g[i]! * 255 * hold;
    out[o + 2] = rgba[o + 2]! + spill.b[i]! * 255 * hold;
  }
  return out;
}

/**
 * Composites the deterministic layers into a finished panel.
 *
 * Order matters and follows the physics: the wall darkens where the sign
 * occludes the sky, the sign is drawn over it, and the light it emits spills
 * on top of both. Spill last because it is light arriving at the camera, not
 * paint on a surface.
 */
export function integrate(
  photo: Uint8ClampedArray,
  sign: Uint8ClampedArray,
  width: number,
  height: number,
  layers: {
    occlusion?: Float32Array;
    spill?: { r: Float32Array; g: Float32Array; b: Float32Array };
  },
): Uint8ClampedArray {
  const size = width * height;
  const out = new Uint8ClampedArray(size * 4);

  for (let i = 0; i < size; i++) {
    const o = i * 4;
    const shade = layers.occlusion ? 1 - layers.occlusion[i]! : 1;

    let r = photo[o]! * shade;
    let g = photo[o + 1]! * shade;
    let b = photo[o + 2]! * shade;

    const a = sign[o + 3]! / 255;
    if (a > 0) {
      r = sign[o]! * a + r * (1 - a);
      g = sign[o + 1]! * a + g * (1 - a);
      b = sign[o + 2]! * a + b * (1 - a);
    }

    if (layers.spill) {
      r += layers.spill.r[i]! * 255;
      g += layers.spill.g[i]! * 255;
      b += layers.spill.b[i]! * 255;
    }

    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Lens falloff toward the corners of a frame.
 *
 * A photograph darkens away from its axis because the lens collects less light
 * at the edge of its field, and every photograph of a sign carries it. A
 * perfectly even frame is something only a renderer produces.
 *
 * This is the one effect in this file that models the CAMERA rather than the
 * sign. It describes nothing about the product and changes no specified value
 * — it exists so a night panel reads as a photograph of a lit sign rather than
 * as a picture of one. Studio panels only: a composite sits on the customer's
 * own photograph, which already carries its camera's falloff, and a second one
 * would be vignetting something already vignetted.
 *
 * `strength` is what the extreme corner loses. `start` is where it begins, as
 * a fraction of the half-diagonal — inside that radius nothing changes, so the
 * sign itself is never dimmed by it.
 */
export function vignette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength = 0.34,
  start = 0.42,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  const cx = width / 2;
  const cy = height / 2;
  const half = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x - cx, y - cy) / half;
      if (r <= start) continue;
      // Squared ramp past the start radius. A linear one leaves a visible ring
      // where it begins, which is a worse artefact than the flatness it fixes.
      const t = (r - start) / (1 - start);
      const keep = 1 - strength * t * t;
      const o = (y * width + x) * 4;
      out[o] = rgba[o]! * keep;
      out[o + 1] = rgba[o + 1]! * keep;
      out[o + 2] = rgba[o + 2]! * keep;
    }
  }
  return out;
}
