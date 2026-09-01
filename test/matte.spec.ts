/**
 * Background knockout.
 *
 * The failure that matters is not "did it remove the background" — it is
 * whether the counter of an O survived. A global colour delete passes every
 * naive test and destroys every enclosed shape.
 */
import { describe, it, expect } from 'vitest';
import { removeFlatBackground } from '#/kb/geometry/matte.js';

/** A white field with a black ring on it — the ring's centre is white too. */
function ringOnWhite(size = 64): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4).fill(255);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r < size * 0.4 && r > size * 0.22) {
        const i = (y * size + x) * 4;
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
      }
    }
  }
  return { width: size, height: size, data };
}

const alphaAt = (r: ReturnType<typeof removeFlatBackground>, x: number, y: number) =>
  r.data[(y * r.width + x) * 4 + 3];

describe('removeFlatBackground', () => {
  it('clears the field outside the mark', () => {
    const result = removeFlatBackground(ringOnWhite());
    expect(alphaAt(result, 0, 0)).toBe(0);
    expect(alphaAt(result, 63, 63)).toBe(0);
  });

  it('leaves the mark itself opaque', () => {
    const result = removeFlatBackground(ringOnWhite());
    // On the ring: 32 - 0.31*64 ≈ 12 px above centre.
    expect(alphaAt(result, 32, 12)).toBe(255);
  });

  it('keeps the enclosed counter — the whole reason this is a flood fill', () => {
    // Same white as the background, unreachable from the border. A global
    // "delete white" would punch a hole through the middle of every O.
    const result = removeFlatBackground(ringOnWhite());
    expect(alphaAt(result, 32, 32)).toBe(255);
  });

  it('reports how much it took, so a silent no-op is visible', () => {
    const result = removeFlatBackground(ringOnWhite());
    expect(result.removed).toBeGreaterThan(0.3);
    expect(result.removed).toBeLessThan(0.8);
  });

  it('says so when it could remove almost nothing', () => {
    const size = 32;
    const data = new Uint8Array(size * size * 4).fill(0);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const result = removeFlatBackground({ width: size, height: size, data });
    // An all-black image: the border colour IS the image, so everything goes.
    expect(result.notes.join(' ')).toMatch(/Almost everything was removed/);
  });

  it('crosses photographic noise but not a letter edge', () => {
    const size = 48;
    const data = new Uint8Array(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // ±12 of jitter on the white, well inside the tolerance.
        const n = ((x * 7 + y * 13) % 25) - 12;
        data[i] = 255 + n - 12; data[i + 1] = 255 + n - 12; data[i + 2] = 255 + n - 12;
        if (x > 18 && x < 30) { data[i] = 20; data[i + 1] = 20; data[i + 2] = 20; }
      }
    }
    const result = removeFlatBackground({ width: size, height: size, data });
    expect(alphaAt(result, 2, 2)).toBe(0);    // noisy background: gone
    expect(alphaAt(result, 24, 24)).toBe(255); // the bar: kept
  });
});
