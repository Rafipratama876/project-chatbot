/**
 * The deterministic integration layers.
 *
 * Each test states the physical claim the effect makes, because that is what
 * makes these safe to apply to a proof: they are arithmetic with a reason, not
 * a filter chosen because it looked better.
 */
import { describe, it, expect } from 'vitest';
import {
  blur, contactOcclusion, lightSpill, measureIlluminant, temper, integrate,
  applySpill, vignette, luma,
} from '#/kb/render/integrate.js';

const W = 64;
const H = 48;
const BOX = { x0: 24, y0: 18, x1: 40, y1: 30 };
const inBox = (x: number, y: number) => x >= BOX.x0 && x < BOX.x1 && y >= BOX.y0 && y < BOX.y1;

function alphaBox(): Uint8Array {
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBox(x, y)) a[y * W + x] = 255;
  return a;
}

function rgbaBox(colour: [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (inBox(x, y)) {
        d[o] = colour[0]; d[o + 1] = colour[1]; d[o + 2] = colour[2]; d[o + 3] = 255;
      }
    }
  }
  return d;
}

const flat = (colour: [number, number, number]): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    d[i * 4] = colour[0]; d[i * 4 + 1] = colour[1]; d[i * 4 + 2] = colour[2]; d[i * 4 + 3] = 255;
  }
  return d;
};

describe('blur', () => {
  it('conserves total energy', () => {
    // A blur that loses or gains energy shows up as a bloom that dims or
    // blows out as the radius changes.
    const src = new Float32Array(W * H);
    src[24 * W + 32] = 100;
    const before = src.reduce((a, b) => a + b, 0);
    const after = blur(src, W, H, 5).reduce((a, b) => a + b, 0);
    expect(after).toBeCloseTo(before, 1);
  });

  it('accepts a fractional radius instead of producing NaN', () => {
    // A fractional radius made the running-sum loops index the array between
    // elements, read `undefined`, and poison every accumulator with NaN. The
    // result then clamped to 0 on its way into a Uint8ClampedArray, so a live
    // concept scene came out as a pure black 1536x1024 frame with nothing to
    // say it had gone wrong.
    const src = new Float32Array(W * H);
    src[24 * W + 32] = 100;
    const out = blur(src, W, H, 7.6);
    for (const v of out) expect(Number.isNaN(v)).toBe(false);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
  });

  it('every layer survives a fractional radius end to end', () => {
    // The path that actually broke: lightSpill passes its radii straight
    // through, and the caller computed them from a standoff in inches.
    const rgba = rgbaBox([255, 102, 0]);
    const spill = lightSpill(rgba, W, H, { tight: 5.5, wide: 13.9 });
    for (const v of spill.r) expect(Number.isNaN(v)).toBe(false);

    const occ = contactOcclusion(alphaBox(), W, H, 6.3);
    for (const v of occ) expect(Number.isNaN(v)).toBe(false);

    const out = integrate(flat([90, 95, 100]), rgba, W, H, { occlusion: occ, spill });
    let peak = 0;
    for (let i = 0; i < W * H; i++) peak = Math.max(peak, out[i * 4]!);
    expect(peak).toBeGreaterThan(0);
  });

  it('is a no-op below one pixel', () => {
    const src = new Float32Array(W * H);
    src[10] = 1;
    expect([...blur(src, W, H, 0)]).toEqual([...src]);
  });

  it('spreads a point outward', () => {
    const src = new Float32Array(W * H);
    src[24 * W + 32] = 100;
    const out = blur(src, W, H, 4);
    expect(out[24 * W + 32]!).toBeLessThan(100);
    expect(out[24 * W + 34]!).toBeGreaterThan(0);
  });
});

describe('contact occlusion', () => {
  const occ = contactOcclusion(alphaBox(), W, H, 6);

  it('darkens the wall just outside the sign', () => {
    // The claim: a sign stood off a wall blocks the sky from the gap behind
    // it. Its absence is the strongest tell that something was pasted on.
    expect(occ[24 * W + (BOX.x1 + 1)]!).toBeGreaterThan(0);
  });

  it('fades with distance', () => {
    const near = occ[24 * W + (BOX.x1 + 1)]!;
    const far = occ[24 * W + (BOX.x1 + 10)]!;
    expect(far).toBeLessThan(near);
  });

  it('leaves the far wall alone', () => {
    expect(occ[2 * W + 2]!).toBeCloseTo(0, 3);
  });

  it('does not darken under the sign, where the sign is drawn anyway', () => {
    // Darkening there would dim the returns rather than the wall.
    expect(occ[24 * W + 32]!).toBeCloseTo(0, 6);
  });

  it('reaches further for a deeper standoff', () => {
    // A 1" spacer and an 8" raceway must not darken the wall identically —
    // the depth is one of the things the picture is supposed to show.
    const shallow = contactOcclusion(alphaBox(), W, H, 3);
    const deep = contactOcclusion(alphaBox(), W, H, 12);
    const at = 24 * W + (BOX.x1 + 8);
    expect(deep[at]!).toBeGreaterThan(shallow[at]!);
  });
});

describe('light spill', () => {
  it('takes its colour from what the sign emits', () => {
    // A purple face throws purple light, not white.
    const spill = lightSpill(rgbaBox([200, 40, 255]), W, H, { tight: 4, wide: 16 });
    const at = 24 * W + (BOX.x1 + 3);
    expect(spill.b[at]!).toBeGreaterThan(spill.g[at]!);
    expect(spill.r[at]!).toBeGreaterThan(spill.g[at]!);
  });

  it('a saturated face emits — it is not dim just because Rec. 709 says so', () => {
    // FedEx purple is luma 41 against the orange's 127. Thresholding on
    // perceptual luminance had the purple half of the mark throwing no light
    // while the orange half glowed, which is not what a lit sign does.
    const purple = lightSpill(rgbaBox([77, 20, 140]), W, H, { tight: 4, wide: 16 });
    let total = 0;
    for (const v of purple.b) total += v;
    expect(total).toBeGreaterThan(0);
  });

  it('ignores anything below the threshold — a dark return must not glow', () => {
    const spill = lightSpill(rgbaBox([20, 20, 20]), W, H, { tight: 4, wide: 16 });
    let total = 0;
    for (const v of spill.r) total += v;
    expect(total).toBeCloseTo(0, 6);
  });

  it('falls off with distance from the sign', () => {
    const spill = lightSpill(rgbaBox([255, 255, 255]), W, H, { tight: 4, wide: 16 });
    const near = spill.r[24 * W + (BOX.x1 + 2)]!;
    const far = spill.r[24 * W + (BOX.x1 + 14)]!;
    expect(far).toBeLessThan(near);
    expect(near).toBeGreaterThan(0);
  });
});

describe('measuring the light in a photograph', () => {
  it('reads a warm photograph as warm', () => {
    const warm = measureIlluminant(flat([210, 170, 130]), W, H);
    expect(warm.gain.r).toBeGreaterThan(1);
    expect(warm.gain.b).toBeLessThan(1);
  });

  it('reads a neutral photograph as neutral', () => {
    const grey = measureIlluminant(flat([128, 128, 128]), W, H);
    expect(grey.gain.r).toBeCloseTo(1, 6);
    expect(grey.gain.g).toBeCloseTo(1, 6);
    expect(grey.gain.b).toBeCloseTo(1, 6);
  });

  it('reports the level as luminance', () => {
    expect(measureIlluminant(flat([128, 128, 128]), W, H).level).toBeCloseTo(luma(128, 128, 128), 3);
  });

  it('tempering pulls an estimate toward neutral', () => {
    // The measured cast is the light AND the subject matter — a brick facade
    // reads warm because it is brick. Using the whole estimate would dip the
    // sign in the wall's own colour.
    const measured = measureIlluminant(flat([210, 170, 130]), W, H);
    const half = temper(measured, 0.5);
    expect(half.gain.r).toBeLessThan(measured.gain.r);
    expect(half.gain.r).toBeGreaterThan(1);

    const none = temper(measured, 0);
    expect(none.gain.r).toBeCloseTo(1, 6);
    expect(none.gain.b).toBeCloseTo(1, 6);
  });
});

describe('integrate', () => {
  const photo = flat([120, 120, 120]);
  const sign = rgbaBox([255, 100, 0]);

  it('keeps the sign\'s own colours — the spec block states them', () => {
    const out = integrate(photo, sign, W, H, {});
    const o = (24 * W + 32) * 4;
    expect([out[o], out[o + 1], out[o + 2]]).toEqual([255, 100, 0]);
  });

  it('leaves the photograph alone where nothing reaches it', () => {
    const out = integrate(photo, sign, W, H, {
      occlusion: contactOcclusion(alphaBox(), W, H, 4),
    });
    const o = (2 * W + 2) * 4;
    expect([out[o], out[o + 1], out[o + 2]]).toEqual([120, 120, 120]);
  });

  it('darkens the wall beside the sign, not the sign', () => {
    const out = integrate(photo, sign, W, H, {
      occlusion: contactOcclusion(alphaBox(), W, H, 6),
    });
    const beside = (24 * W + (BOX.x1 + 1)) * 4;
    expect(out[beside]!).toBeLessThan(120);
    const onSign = (24 * W + 32) * 4;
    expect(out[onSign]).toBe(255);
  });

  it('adds spill on top of everything, because it is light not paint', () => {
    const dark = flat([10, 10, 10]);
    const lit = rgbaBox([255, 255, 255]);
    const plain = integrate(dark, lit, W, H, {});
    const withSpill = integrate(dark, lit, W, H, {
      spill: lightSpill(lit, W, H, { tight: 4, wide: 16 }),
    });
    const beside = (24 * W + (BOX.x1 + 2)) * 4;
    expect(withSpill[beside]!).toBeGreaterThan(plain[beside]!);
  });

  it('holds the spill back over the sign, so a face colour survives its own glow', () => {
    // Bloom piled onto the face washes the specified colour out — a saturated
    // orange goes yellow, which is the one change the spec block says did not
    // happen.
    const alpha = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) alpha[i] = sign[i * 4 + 3]!;
    const spill = lightSpill(sign, W, H, { tight: 4, wide: 16, strength: 2 });

    const onSign = (24 * W + 32) * 4;
    const free = applySpill(integrate(photo, sign, W, H, {}), W, H, spill);
    const held = applySpill(integrate(photo, sign, W, H, {}), W, H, spill, alpha);

    expect(held[onSign + 1]!).toBeLessThan(free[onSign + 1]!);

    // And the glow beside the sign is untouched by the hold-back.
    const beside = (24 * W + (BOX.x1 + 3)) * 4;
    expect(held[beside]).toBe(free[beside]);
  });

  it('is deterministic — the same inputs give the same bytes', () => {
    // The property the whole proof rests on. No sampling, no seed, no model.
    const once = integrate(photo, sign, W, H, {
      occlusion: contactOcclusion(alphaBox(), W, H, 6),
      spill: lightSpill(sign, W, H, { tight: 4, wide: 16 }),
    });
    const twice = integrate(photo, sign, W, H, {
      occlusion: contactOcclusion(alphaBox(), W, H, 6),
      spill: lightSpill(sign, W, H, { tight: 4, wide: 16 }),
    });
    expect([...once]).toEqual([...twice]);
  });
});

describe('vignette', () => {
  const even = flat([200, 200, 200]);

  it('darkens the corners', () => {
    const out = vignette(even, W, H);
    const corner = 0;
    expect(out[corner]!).toBeLessThan(200);
  });

  it('leaves the middle of the frame alone, so the sign is never dimmed', () => {
    const out = vignette(even, W, H);
    const centre = ((H / 2) * W + W / 2) * 4;
    expect(out[centre]).toBe(200);
  });

  it('falls off smoothly rather than starting with a ring', () => {
    // A linear ramp leaves a visible edge where it begins — a worse artefact
    // than the flatness it is fixing.
    const out = vignette(even, W, H);
    const along = (steps: number[]) => steps.map((x) => out[((H / 2) * W + x) * 4]!);
    const [a, b, c] = along([W / 2, W * 0.75, W - 1]);
    expect(b!).toBeLessThanOrEqual(a!);
    expect(c!).toBeLessThan(b!);
    // Each step down is bigger than the one before: accelerating, not linear.
    expect(b! - c!).toBeGreaterThan(a! - b!);
  });

  it('is a no-op at zero strength', () => {
    expect([...vignette(even, W, H, 0)]).toEqual([...even]);
  });

  it('never touches alpha', () => {
    const out = vignette(even, W, H);
    for (let i = 0; i < W * H; i++) expect(out[i * 4 + 3]).toBe(255);
  });
});
