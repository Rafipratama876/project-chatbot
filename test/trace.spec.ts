import { describe, it, expect } from 'vitest';
import { traceImage, simplify, MIN_TRACE_CONFIDENCE, type RasterImage } from '#/kb/geometry/trace.js';
import { bounds, absArea } from '#/kb/geometry/poly.js';
import { measureStroke } from '#/kb/geometry/metrics.js';

/** Draws shapes into an RGBA buffer so the expected answer is known exactly. */
function canvas(width: number, height: number, background?: [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (background) {
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = background[0]; data[i * 4 + 1] = background[1];
      data[i * 4 + 2] = background[2]; data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

function fillRect(img: RasterImage, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
  }
}

describe('raster tracing', () => {
  it('recovers a solid rectangle at close to its true size', () => {
    const img = canvas(800, 400);
    fillRect(img, 100, 80, 600, 240, [77, 20, 140]);

    const r = traceImage(img);
    expect(r.contours.filter((c) => !c.hole)).toHaveLength(1);
    const b = bounds(r.contours);
    // Boundary following walks pixel corners, so ±2 px is the honest tolerance.
    expect(b.w).toBeGreaterThan(596);
    expect(b.w).toBeLessThan(604);
    expect(b.h).toBeGreaterThan(236);
    expect(b.h).toBeLessThan(244);
  });

  it('traces a counter as a hole, not as a second solid', () => {
    // A ring: fabricated as one can with an opening, not as a plug.
    const img = canvas(600, 600);
    fillRect(img, 100, 100, 400, 400, [0, 0, 0]);
    // Punch the middle back out to transparent.
    for (let y = 200; y < 400; y++) {
      for (let x = 200; x < 400; x++) img.data[(y * 600 + x) * 4 + 3] = 0;
    }

    const r = traceImage(img);
    expect(r.contours.filter((c) => !c.hole).length).toBeGreaterThanOrEqual(1);
    expect(r.contours.filter((c) => c.hole)).toHaveLength(1);
  });

  it('separates two fills and tags each contour with its colour', () => {
    const img = canvas(800, 300);
    fillRect(img, 50, 50, 300, 200, [77, 20, 140]);
    fillRect(img, 450, 50, 300, 200, [255, 102, 0]);

    const r = traceImage(img);
    expect(r.colours).toHaveLength(2);
    expect(new Set(r.contours.map((c) => c.colour)).size).toBe(2);
    for (const c of r.contours) expect(c.colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('drops an opaque background instead of tracing the whole frame', () => {
    // A JPEG has no alpha: the mark sits on a solid field. Traced as-is the
    // result is one rectangle the size of the image.
    const img = canvas(800, 400, [255, 255, 255]);
    fillRect(img, 200, 100, 400, 200, [200, 0, 0]);

    const r = traceImage(img);
    const b = bounds(r.contours);
    expect(b.w).toBeLessThan(500);
    expect(b.h).toBeLessThan(300);
    expect(r.quality.notes.join(' ')).toMatch(/background/i);
  });

  it('is deterministic — the same image always gives the same palette', () => {
    // Median cut, not k-means with a random seed: the same logo must not
    // produce a different spec block on a different day.
    const img = canvas(400, 400, [255, 255, 255]);
    fillRect(img, 40, 40, 150, 320, [77, 20, 140]);
    fillRect(img, 210, 40, 150, 320, [255, 102, 0]);

    const a = traceImage(img);
    const b = traceImage(img);
    expect(a.colours).toEqual(b.colours);
    expect(JSON.stringify(a.contours)).toEqual(JSON.stringify(b.contours));
  });

  it('does not penalise ordinary anti-aliasing', () => {
    // A clean vector render has partial alpha along essentially its whole
    // boundary. Scoring that as "blurred" marks every good PNG as damaged.
    const img = canvas(1200, 500);
    fillRect(img, 100, 100, 1000, 300, [0, 0, 0]);
    // One pixel of anti-aliasing around the edge.
    for (let x = 99; x < 1101; x++) {
      for (const y of [99, 400]) img.data[(y * 1200 + x) * 4 + 3] = 128;
    }
    const r = traceImage(img);
    expect(r.quality.edgeBandPx).toBeLessThan(1.8);
    expect(r.quality.confidence).toBeGreaterThan(0.85);
  });

  it('penalises a genuinely blurred edge', () => {
    const img = canvas(1200, 500);
    fillRect(img, 100, 100, 1000, 300, [0, 0, 0]);
    // A five-pixel gradient, as a rescale or a JPEG produces.
    for (let d = 1; d <= 5; d++) {
      for (let x = 100 - d; x < 1100 + d; x++) {
        for (const y of [100 - d, 399 + d]) {
          if (y < 0 || y >= 500 || x < 0 || x >= 1200) continue;
          img.data[(y * 1200 + x) * 4 + 3] = Math.round(255 * (1 - d / 6));
        }
      }
    }
    const r = traceImage(img);
    expect(r.quality.edgeBandPx).toBeGreaterThan(1.8);
  });

  it('reports low confidence for a small mark, and says why', () => {
    const small = canvas(120, 60);
    fillRect(small, 10, 10, 100, 40, [0, 0, 0]);
    const r = traceImage(small);

    expect(r.quality.confidence).toBeLessThan(MIN_TRACE_CONFIDENCE);
    expect(r.quality.notes.join(' ')).toMatch(/px across/);
  });

  it('reports usable confidence for a large clean mark', () => {
    const big = canvas(1600, 700);
    fillRect(big, 100, 100, 1400, 500, [0, 0, 0]);
    expect(traceImage(big).quality.confidence).toBeGreaterThan(MIN_TRACE_CONFIDENCE);
  });

  it('a traced outline still measures a sane stroke', () => {
    // A 60 px wall on a 600 px ring: the stroke must come back near 60, not
    // near zero and not near the outer size.
    const img = canvas(700, 700);
    fillRect(img, 50, 50, 600, 600, [0, 0, 0]);
    for (let y = 110; y < 590; y++) {
      for (let x = 110; x < 590; x++) img.data[(y * 700 + x) * 4 + 3] = 0;
    }
    const r = traceImage(img);
    const stroke = measureStroke(r.contours).narrowest;
    expect(stroke).toBeGreaterThan(54);
    expect(stroke).toBeLessThan(66);
  });

  it('returns nothing, with a reason, for a flat image', () => {
    const flat = canvas(400, 400, [255, 255, 255]);
    const r = traceImage(flat);
    expect(r.contours).toHaveLength(0);
    expect(r.quality.confidence).toBe(0);
    expect(r.quality.notes.join(' ')).toMatch(/one flat colour/i);
  });
});

describe('simplify', () => {
  it('keeps the ends and drops collinear points', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(line, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0 }]);
  });

  it('keeps a corner', () => {
    const corner = [
      ...Array.from({ length: 25 }, (_, i) => ({ x: i, y: 0 })),
      ...Array.from({ length: 25 }, (_, i) => ({ x: 24, y: i })),
    ];
    expect(simplify(corner, 0.5).length).toBeGreaterThanOrEqual(3);
  });

  it('handles a boundary long enough to overflow a recursive implementation', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => ({ x: i, y: i % 2 }));
    expect(() => simplify(many, 1.2)).not.toThrow();
  });

  it('finishes on the pathological case instead of running O(n²)', () => {
    // A zigzag sampled finely enough that every point is a maximum-deviation
    // point. Unbounded Douglas-Peucker takes 4·10^10 operations on this.
    const zigzag = Array.from({ length: 120_000 }, (_, i) => ({ x: i, y: i % 2 }));
    const started = Date.now();
    const result = simplify(zigzag, 0.1);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.length).toBeGreaterThan(2);
  });
});
