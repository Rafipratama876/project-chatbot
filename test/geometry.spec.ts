import { describe, it, expect } from 'vitest';
import { measureStroke, connectedShapes } from '#/kb/geometry/metrics.js';
import { offsetToStroke, offsetContours, dropTinyHoles } from '#/kb/geometry/offset.js';
import { inspectCounters, countersIn, hasCounterLetter } from '#/kb/geometry/counters.js';
import { sizeBox, boxUndersized } from '#/kb/geometry/boxSizing.js';
import { defaultThresholds } from '#/kb/domain/thresholds.js';
import { contourArea } from '#/kb/geometry/poly.js';
import type { Contour } from '#/kb/domain/spec.js';

const rect = (x: number, y: number, w: number, h: number, hole = false): Contour => ({
  hole,
  points: hole
    ? [{ x, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y }]
    : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});

describe('stroke measurement', () => {
  it('measures the narrow dimension of a stem, not the long one', () => {
    // A 1" × 20" stem: the narrowest stroke is 1", not 20".
    expect(measureStroke([rect(0, 0, 1, 20)]).narrowest).toBeCloseTo(1, 6);
  });

  it('measures the wall of a ring, not its outer size', () => {
    const ring = [rect(0, 0, 10, 10), rect(2, 2, 6, 6, true)];
    expect(measureStroke(ring).narrowest).toBeCloseTo(2, 6);
  });

  it('finds the thinnest part of a mixed shape', () => {
    // A thick block with a thin crossbar hanging off it.
    const shape = [rect(0, 0, 6, 20), rect(6, 9, 8, 0.4)];
    expect(measureStroke(shape).narrowest).toBeCloseTo(0.4, 3);
  });
});

describe('Offset Path (CL-R-01 … CL-R-03)', () => {
  it('thickens a stem to the target and reports the delta per side', () => {
    const r = offsetToStroke([rect(0, 0, 0.8, 20)], 1.5);
    expect(r.strokeBefore).toBeCloseTo(0.8, 3);
    expect(r.strokeAfter).toBeGreaterThanOrEqual(1.5 - 0.02);
    expect(r.delta).toBeCloseTo(0.35, 1);
    expect(r.converged).toBe(true);
  });

  it('is a no-op when the stroke already clears the minimum', () => {
    const r = offsetToStroke([rect(0, 0, 2, 20)], 1.5);
    expect(r.delta).toBe(0);
    expect(r.contours).toHaveLength(1);
  });

  it('grows area monotonically with a positive delta', () => {
    const before = contourArea([rect(0, 0, 4, 10)]);
    const after = contourArea(offsetContours([rect(0, 0, 4, 10)], 0.5));
    expect(after).toBeGreaterThan(before);
  });
});

describe('CL-R-05 counter closure', () => {
  it('detects a counter that closes, by counting holes rather than by eye', () => {
    // A ring with 0.6" walls and a 0.7" counter: offsetting to 1.5" fills it.
    const ring = [rect(0, 0, 1.9, 1.9), rect(0.6, 0.6, 0.7, 0.7, true)];
    expect(countersIn(ring)).toBe(1);
    const r = offsetToStroke(ring, 1.5);
    const insp = inspectCounters('O', r);
    expect(insp.closed).toBe(true);
    expect(insp.summary).toMatch(/counter/i);
  });

  it('reports counters that survive', () => {
    const ring = [rect(0, 0, 20, 20), rect(4, 4, 12, 12, true)];
    const r = offsetToStroke(ring, 1.5);
    expect(inspectCounters('D', r).closed).toBe(false);
  });

  it('lists only the KB letters A B D G R P Q', () => {
    expect(hasCounterLetter('NEON')).toBe(false);
    expect(hasCounterLetter('BLOOM')).toBe(true);
  });
});

describe('CL-R-45 tiny counters', () => {
  it('drops holes below the fabricable area and keeps the rest', () => {
    const shape = [rect(0, 0, 20, 20), rect(2, 2, 0.3, 0.3, true), rect(8, 8, 6, 6, true)];
    const { contours, dropped } = dropTinyHoles(shape, 2.25);
    expect(dropped).toBe(1);
    expect(countersIn(contours)).toBe(1);
  });
});

describe('§3.6 box sizing [DER]', () => {
  const th = defaultThresholds();

  it('uses max(cap + 2", 4")', () => {
    expect(sizeBox({ copyCapHeight: 4, copyBBox: { x: 0, y: 0, w: 40, h: 4 }, letterReturnDepth: 5, faceColour: 'White', returnColour: 'Black' }, th).box.h).toBe(6);
    // A 1" cap gives 3" from the formula, so the 4" minimum governs.
    const small = sizeBox({ copyCapHeight: 1, copyBBox: { x: 0, y: 0, w: 10, h: 1 }, letterReturnDepth: 5, faceColour: 'White', returnColour: 'Black' }, th);
    expect(small.box.h).toBe(4);
    expect(small.minimumGoverned).toBe(true);
  });

  it('matches the letter return depth so the faces are coplanar', () => {
    expect(sizeBox({ copyCapHeight: 4, copyBBox: { x: 0, y: 0, w: 40, h: 4 }, letterReturnDepth: 3, faceColour: 'White', returnColour: 'Black' }, th).box.depth).toBe(3);
  });

  it('reports which [DER] thresholds it read', () => {
    const s = sizeBox({ copyCapHeight: 4, copyBBox: { x: 0, y: 0, w: 40, h: 4 }, letterReturnDepth: 5, faceColour: 'White', returnColour: 'Black' }, th);
    expect(s.thresholdKeys).toContain('box.min_height');
    expect(th.unverifiedReads().map((t) => t.key)).toContain('box.min_height');
  });

  it('boxUndersized is the CL-R-55 predicate', () => {
    const box = sizeBox({ copyCapHeight: 4, copyBBox: { x: 0, y: 0, w: 40, h: 4 }, letterReturnDepth: 5, faceColour: 'W', returnColour: 'B' }, th).box;
    expect(boxUndersized(box, 4, th)).toBe(false);
    expect(boxUndersized({ ...box, h: 5 }, 4, th)).toBe(true);
  });
});

describe('stroke measurement across separate shapes', () => {
  const rect = (x: number, y: number, w: number, h: number, hole = false): Contour => ({
    hole,
    points: hole
      ? [{ x, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y }]
      : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
  });

  it('splits a mark into one component per outer contour', () => {
    const two = [rect(0, 0, 3, 20), rect(8, 0, 3, 20)];
    expect(connectedShapes(two)).toHaveLength(2);
  });

  it('keeps each counter with its own outer', () => {
    const rings = [
      rect(0, 0, 10, 10), rect(2, 2, 6, 6, true),
      rect(20, 0, 10, 10), rect(22, 2, 6, 6, true),
    ];
    const comps = connectedShapes(rings);
    expect(comps).toHaveLength(2);
    for (const c of comps) expect(c.filter((x) => x.hole)).toHaveLength(1);
    expect(measureStroke(rings).narrowest).toBeCloseTo(2, 4);
  });

  it('assigns a nested counter to the innermost outer that contains it', () => {
    // Ring inside a ring — a mark like a target, or an "O" with an inset.
    const nested = [
      rect(0, 0, 20, 20), rect(2, 2, 16, 16, true),
      rect(5, 5, 10, 10), rect(7, 7, 6, 6, true),
    ];
    const comps = connectedShapes(nested);
    expect(comps).toHaveLength(2);
    const inner = comps.find((c) => c[0]!.points.some((p) => p.x === 5))!;
    expect(inner.filter((x) => x.hole)).toHaveLength(1);
    expect(inner.filter((x) => x.hole)[0]!.points[0]!.x).toBe(7);
  });

  it('a real multi-path mark measures a stroke, not the gap between letters', async () => {
    // The FedEx-shaped fixture: five paths, two of which share an edge and one
    // of which overlaps its neighbour. Measured across the whole set, the
    // even-odd inside test flips at the overlap, the ray leaves the shape and
    // lands on the neighbour a few thousandths away — which reads as a zero
    // stroke and would send a buildable mark to CL-R-46.
    const fs = await import('node:fs');
    const { importSvg } = await import('#/kb/geometry/svg.js');
    const svg = fs.readFileSync('examples/assets/fedex.svg', 'utf8');

    const merged = importSvg(svg, { targetWidth: 37.115, name: 'FedEx' });
    const stroke = merged.items[0]!.narrowestStroke;
    expect(stroke).toBeGreaterThan(0.1);

    // And it agrees with the thinnest part measured shape by shape.
    const perShape = importSvg(svg, { targetWidth: 37.115, splitBy: 'colour' })
      .items.map((i) => i.narrowestStroke);
    expect(stroke).toBeCloseTo(Math.min(...perShape), 3);
  });
});
