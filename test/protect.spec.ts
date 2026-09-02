/**
 * The guarantee around the generative step.
 *
 * A mask handed to a sampler is a request. What makes the sign safe is that
 * every protected pixel is copied back from the deterministic render and then
 * verified — so these tests are the feature, not a check on it.
 */
import { describe, it, expect } from 'vitest';
import {
  protectionMask, summarise, maskToRgba, dilate,
  restoreProtected, verifyProtected, verifyCompositedSign, ProtectionError,
} from '#/kb/render/protect.js';
import { integrate, applySpill, lightSpill, contactOcclusion } from '#/kb/render/integrate.js';

const W = 40;
const H = 30;

/** What the renderer drew: a block in the middle of an otherwise empty panel. */
function coverage(x0 = 15, y0 = 12, w = 10, h = 6): Uint8Array {
  const a = new Uint8Array(W * H);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) a[y * W + x] = 255;
  return a;
}

function raster(fill: (i: number) => [number, number, number, number]) {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b, a] = fill(i);
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width: W, height: H, data };
}

describe('what a model may touch', () => {
  it('nothing at all, on a panel that sits on the photograph', () => {
    // The building, the sky, the neighbouring units and the paving are all
    // things the customer can check against reality. None of it is decoration.
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: coverage(), onPhotograph: true,
    });
    expect(summarise(mask).editable).toBe(0);
    expect(summarise(mask).editableFraction).toBe(0);
  });

  it('the neutral ground, on a studio panel', () => {
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: coverage(), onPhotograph: false, margin: 0,
    });
    const s = summarise(mask);
    expect(s.editable).toBe(W * H - 10 * 6);
    expect(s.protected).toBe(10 * 6);
  });

  it('never anything the renderer drew', () => {
    const alpha = coverage();
    const mask = protectionMask({ width: W, height: H, renderedCoverage: alpha, onPhotograph: false });
    for (let i = 0; i < alpha.length; i++) {
      if (alpha[i]! > 0) expect(mask[i], `pixel ${i} is part of the sign`).toBe(0);
    }
  });

  it('nor a margin around it — a model must not work up to the letterform', () => {
    // Without the margin a glow of the model's own invention blends into the
    // antialiased edge and reads as part of the mark.
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: coverage(), onPhotograph: false, margin: 3,
    });
    // Three pixels to the left of the sign's left edge (x = 15).
    expect(mask[12 * W + 13]).toBe(0);
    expect(mask[12 * W + 11]).toBe(1);
  });

  it('the margin only ever takes pixels away from the model', () => {
    const alpha = coverage();
    const tight = summarise(protectionMask({
      width: W, height: H, renderedCoverage: alpha, onPhotograph: false, margin: 0,
    }));
    const loose = summarise(protectionMask({
      width: W, height: H, renderedCoverage: alpha, onPhotograph: false, margin: 4,
    }));
    expect(loose.editable).toBeLessThan(tight.editable);
  });
});

describe('dilate', () => {
  it('grows a single pixel into a square of the requested radius', () => {
    const m = new Uint8Array(W * H);
    m[10 * W + 10] = 1;
    const grown = dilate(m, W, H, 2);
    let count = 0;
    for (let i = 0; i < grown.length; i++) if (grown[i]) count++;
    expect(count).toBe(5 * 5);
  });

  it('is a no-op at zero', () => {
    const m = new Uint8Array(W * H);
    m[5] = 1;
    expect([...dilate(m, W, H, 0)]).toEqual([...m]);
  });

  it('does not run off the edges of the panel', () => {
    const m = new Uint8Array(W * H);
    m[0] = 1;
    const grown = dilate(m, W, H, 3);
    let count = 0;
    for (let i = 0; i < grown.length; i++) if (grown[i]) count++;
    expect(count).toBe(4 * 4);
  });
});

describe('the mask handed to the endpoint', () => {
  it('is transparent where the model may draw and opaque where it may not', () => {
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: coverage(), onPhotograph: false, margin: 0,
    });
    const rgba = maskToRgba(mask, W, H);
    const signPixel = 12 * W + 16;
    const groundPixel = 0;
    expect(rgba[signPixel * 4 + 3]).toBe(255);
    expect(rgba[groundPixel * 4 + 3]).toBe(0);
  });
});

describe('restoring the protected region', () => {
  const base = raster(() => [10, 20, 30, 255]);
  const mask = protectionMask({
    width: W, height: H, renderedCoverage: coverage(), onPhotograph: false, margin: 0,
  });

  it('keeps what the model did where it was allowed', () => {
    const model = raster(() => [200, 100, 50, 255]);
    const out = restoreProtected(base, model, mask);
    const ground = 0;
    expect(out.data[ground * 4]).toBe(200);
    expect(out.changed).toBe(W * H - 60);
  });

  it('undoes what it did where it was not', () => {
    // A diffusion model repaints the whole canvas; it does not respect a mask
    // as a hard boundary. This is the step that makes it one.
    const model = raster(() => [200, 100, 50, 255]);
    const out = restoreProtected(base, model, mask);
    const inSign = (12 * W + 16) * 4;
    expect(out.data[inSign]).toBe(10);
    expect(out.data[inSign + 1]).toBe(20);
    expect(out.violations).toBe(60);
    expect(out.worstViolation).toBe(190);
  });

  it('reports nothing to undo when the model respected the mask', () => {
    const model = raster((i) => (mask[i] ? [200, 100, 50, 255] : [10, 20, 30, 255]));
    expect(restoreProtected(base, model, mask).violations).toBe(0);
  });

  it('refuses a resized result rather than recombining misaligned pixels', () => {
    // Silently accepting this shifts the sign by however much the resize moved
    // it — a plausible picture of the wrong sign.
    const resized = { width: W + 4, height: H, data: new Uint8Array((W + 4) * H * 4) };
    expect(() => restoreProtected(base, resized, mask)).toThrow(ProtectionError);
    expect(() => restoreProtected(base, resized, mask)).toThrow(/discarded/);
  });
});

describe('verifying afterwards', () => {
  const base = raster((i) => [i % 256, (i * 3) % 256, (i * 7) % 256, 255]);
  const mask = protectionMask({
    width: W, height: H, renderedCoverage: coverage(), onPhotograph: false, margin: 0,
  });

  it('passes on the output of a correct restoration', () => {
    const model = raster(() => [1, 2, 3, 255]);
    const restored = restoreProtected(base, model, mask);
    const check = verifyProtected(base, { width: W, height: H, data: restored.data }, mask);
    expect(check.ok).toBe(true);
    expect(check.differing).toBe(0);
  });

  it('catches a mask that is off by one row — our bug, not the model\'s', () => {
    // The failure this exists for: a plausible picture with the sign subtly
    // wrong, which nobody notices until a shop cuts it.
    const shifted = new Uint8Array(mask.length);
    shifted.set(mask.subarray(W), 0);
    const model = raster(() => [1, 2, 3, 255]);
    const restored = restoreProtected(base, model, shifted);
    const check = verifyProtected(base, { width: W, height: H, data: restored.data }, mask);
    expect(check.ok).toBe(false);
    expect(check.differing).toBeGreaterThan(0);
  });

  it('catches a result of the wrong size', () => {
    const wrong = { width: W, height: H + 1, data: new Uint8Array(W * (H + 1) * 4) };
    expect(verifyProtected(base, wrong, mask).ok).toBe(false);
  });

  it('on a photographed panel nothing can pass verification but the base itself', () => {
    const photoMask = protectionMask({
      width: W, height: H, renderedCoverage: coverage(), onPhotograph: true,
    });
    const model = raster(() => [9, 9, 9, 255]);
    expect(verifyProtected(base, model, photoMask).ok).toBe(false);

    const restored = restoreProtected(base, model, photoMask);
    expect(restored.changed).toBe(0);
    expect(verifyProtected(base, { width: W, height: H, data: restored.data }, photoMask).ok)
      .toBe(true);
  });
});

describe('the mounting surface is not backdrop', () => {
  // The discovery that shaped this module: on a studio panel the surface
  // behind the sign is CL-P-31's mounting surface, and its colour is a
  // spec-block line. It arrives in the coverage exactly like the sign does, so
  // it is protected exactly like the sign — and a panel the renderer filled
  // edge to edge leaves a model nothing to do, which is the correct answer
  // rather than a bug.
  it('a fully covered panel is fully protected', () => {
    const everything = new Uint8Array(W * H).fill(255);
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: everything, onPhotograph: false,
    });
    expect(summarise(mask).editable).toBe(0);
  });

  it('only genuinely empty frame is ever editable', () => {
    // The sign, plus a surface filling the left half. What is left is the
    // right half minus the margin — nothing that was specified.
    const c = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) c[y * W + x] = 255;
    const mask = protectionMask({
      width: W, height: H, renderedCoverage: c, onPhotograph: false, margin: 0,
    });
    expect(mask[10 * W + 5]).toBe(0);
    expect(mask[10 * W + 30]).toBe(1);
    expect(summarise(mask).editable).toBe((W / 2) * H);
  });
});

describe('the sign in a concept scene', () => {
  // Here the setting underneath IS the model's work and is meant to be. What
  // has to survive is the sign laid over it.
  const layer = (() => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 12; y < 18; y++) {
      for (let x = 15; x < 25; x++) {
        const o = (y * W + x) * 4;
        d[o] = 255; d[o + 1] = 102; d[o + 2] = 0; d[o + 3] = 255;
      }
    }
    return { width: W, height: H, data: d };
  })();
  const setting = (() => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      d[i * 4] = 90; d[i * 4 + 1] = 95; d[i * 4 + 2] = 100; d[i * 4 + 3] = 255;
    }
    return d;
  })();

  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = layer.data[i * 4 + 3]!;

  it('passes when the sign is laid over a generated setting unchanged', () => {
    const seated = integrate(setting, layer.data as Uint8ClampedArray, W, H, {
      occlusion: contactOcclusion(alpha, W, H, 4),
    });
    const check = verifyCompositedSign(layer, { width: W, height: H, data: seated });
    expect(check.ok).toBe(true);
    expect(check.compared).toBe(10 * 6);
  });

  it('fails when anything has altered the sign', () => {
    const seated = integrate(setting, layer.data as Uint8ClampedArray, W, H, {});
    seated[(14 * W + 20) * 4] = 3;
    const check = verifyCompositedSign(layer, { width: W, height: H, data: seated });
    expect(check.ok).toBe(false);
    expect(check.differing).toBe(1);
  });

  it('bloom over the sign is why the check runs BEFORE the spill', () => {
    // The bug this caught: spill legitimately falls across the sign as well as
    // around it, so verifying afterwards failed on our own arithmetic — all
    // 612473 sign pixels at once — rather than on anything the model did.
    const seated = integrate(setting, layer.data as Uint8ClampedArray, W, H, {});
    expect(verifyCompositedSign(layer, { width: W, height: H, data: seated }).ok).toBe(true);

    const bloomed = applySpill(seated, W, H, lightSpill(layer.data, W, H, { tight: 3, wide: 9 }));
    expect(verifyCompositedSign(layer, { width: W, height: H, data: bloomed }).ok).toBe(false);
  });

  it('refuses an empty sign layer rather than passing vacuously', () => {
    const empty = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
    const check = verifyCompositedSign(empty, { width: W, height: H, data: setting });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/nothing to verify/);
  });
});
