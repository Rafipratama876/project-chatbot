import { describe, it, expect } from 'vitest';
import { importSvg, parsePathData } from '#/kb/geometry/svg.js';
import {
  calibrate, placementSize, fitArtwork, checkCalibration, anchorPx,
  solveHomography, applyHomography, artworkExtent, CalibrationError,
} from '#/kb/geometry/calibration.js';
import { measureStroke } from '#/kb/geometry/metrics.js';
import { bounds, absArea } from '#/kb/geometry/poly.js';

describe('SVG import', () => {
  it('reads a rectangle and scales it to the requested height', () => {
    const svg = '<svg><rect x="0" y="0" width="200" height="50" fill="#4d148c"/></svg>';
    const r = importSvg(svg, { targetHeight: 13.3 });

    expect(r.items).toHaveLength(1);
    const b = r.items[0]!.bbox;
    expect(b.h).toBeCloseTo(13.3, 6);
    expect(b.w).toBeCloseTo(13.3 * 4, 6);
    expect(r.colours).toEqual(['#4d148c']);
  });

  it('keeps a counter as a hole, not as a second shape', () => {
    // An "O": outer ring and an inner subpath, the way a font exports it.
    const svg = `<svg><path d="M0,0 H100 V100 H0 Z M20,20 V80 H80 V20 Z" fill="black"/></svg>`;
    const r = importSvg(svg);
    const contours = r.items[0]!.contours;

    expect(contours.filter((c) => !c.hole)).toHaveLength(1);
    expect(contours.filter((c) => c.hole)).toHaveLength(1);
    // The wall is 20 units all round, so that is the narrowest stroke.
    expect(measureStroke(contours).narrowest).toBeCloseTo(20, 4);
  });

  it('flattens cubic and quadratic curves', () => {
    const cubic = parsePathData('M0,0 C0,50 100,50 100,0 Z', 24);
    const quad = parsePathData('M0,0 Q50,50 100,0 Z', 24);
    expect(cubic[0]!.points.length).toBeGreaterThan(20);
    expect(quad[0]!.points.length).toBeGreaterThan(20);
    // A curve that bulges to y=37.5 at its peak, not a straight line.
    expect(Math.max(...cubic[0]!.points.map((p) => p.y))).toBeGreaterThan(30);
  });

  it('handles relative commands and shorthand continuations', () => {
    const absolute = parsePathData('M0,0 L100,0 L100,100 L0,100 Z', 8);
    const relative = parsePathData('m0,0 l100,0 l0,100 l-100,0 z', 8);
    expect(absArea(relative[0]!.points)).toBeCloseTo(absArea(absolute[0]!.points), 6);

    // An implicit repeat after M must be treated as L, not as another M.
    const implicit = parsePathData('M0,0 100,0 100,100 0,100 Z', 8);
    expect(implicit).toHaveLength(1);
    expect(absArea(implicit[0]!.points)).toBeCloseTo(10000, 6);
  });

  it('converts arcs rather than skipping them', () => {
    // A rounded corner drawn as an arc is common in logo exports.
    const withArc = parsePathData('M0,0 H80 A20,20 0 0 1 100,20 V100 H0 Z', 16);
    expect(withArc).toHaveLength(1);
    const b = bounds([{ points: withArc[0]!.points, hole: false }]);
    expect(b.w).toBeCloseTo(100, 0);
    expect(b.h).toBeCloseTo(100, 0);
  });

  it('flips y so the model is y-up', () => {
    // Two bars: in SVG the first is on top; in inches it must be the higher y.
    const svg = `<svg>
      <rect x="0" y="0" width="100" height="10" fill="red"/>
      <rect x="0" y="90" width="100" height="10" fill="blue"/>
    </svg>`;
    const r = importSvg(svg, { targetHeight: 100, splitBy: 'colour' });
    const red = r.items.find((i) => i.colour === 'red')!;
    const blue = r.items.find((i) => i.colour === 'blue')!;
    expect(red.bbox.y).toBeGreaterThan(blue.bbox.y);
  });

  it('a whole logo file is ONE mark, with colour breaks noted (§3.2)', () => {
    // §3.2: "a two-colour word stays one element with a colour break noted".
    // §3.5 step 1 then asks whether THE MARK has colour breaks that cannot be
    // separate cans — a question about one element, not one per fill.
    const svg = `<svg>
      <rect x="0" y="0" width="100" height="40" fill="#4d148c"/>
      <rect x="110" y="0" width="100" height="40" fill="#ff6600"/>
    </svg>`;
    const r = importSvg(svg, { targetHeight: 13.3, name: 'FedEx' });

    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.text).toBe('FedEx');
    expect(r.items[0]!.colourBreaks).toEqual(['#4d148c', '#ff6600']);
    // Both fills are in the one item's geometry.
    expect(r.items[0]!.contours).toHaveLength(2);
  });

  it('splits by colour only when asked, for genuinely separate cans', () => {
    const svg = `<svg>
      <rect x="0" y="0" width="100" height="40" fill="#4d148c"/>
      <rect x="110" y="0" width="100" height="40" fill="#ff6600"/>
    </svg>`;
    const r = importSvg(svg, { splitBy: 'colour' });
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.colour)).toEqual(['#4d148c', '#ff6600']);
    expect(r.items[0]!.colourBreaks).toBeUndefined();
  });

  it('treats every shape as non-typographic so §3.5 asks about the mark', () => {
    // Nothing in an SVG says which glyph a shape was, and §3.5 branches on
    // exactly that. Guessing would send a mark down the typographic path.
    const r = importSvg('<svg><rect x="0" y="0" width="10" height="10" fill="black"/></svg>');
    expect(r.items[0]!.kind).toBe('shape');
  });

  it('reports what it could not parse instead of dropping it silently', () => {
    const r = importSvg('<svg><path d="" fill="black"/><rect width="10" height="10" fill="red"/></svg>');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.items).toHaveLength(1);
  });

  it('reads fill from a style attribute as well as an attribute', () => {
    const r = importSvg('<svg><rect width="10" height="10" style="fill:#ff6600;stroke:none"/></svg>');
    expect(r.colours).toEqual(['#ff6600']);
  });

  it('skips fill="none" shapes', () => {
    const r = importSvg('<svg><rect width="10" height="10" fill="none"/><rect width="10" height="10" fill="black"/></svg>');
    expect(r.items).toHaveLength(1);
  });
});

describe('photo calibration', () => {
  // The numbers from the worked example: a 52" garage door measured across
  // 260 px, and a logo placed at 43.31 × 13.3 inches.
  const reference = { a: { x: 100, y: 800 }, b: { x: 360, y: 800 }, inches: 52, label: 'garage door width' };
  const cal = calibrate(reference, 1600, 1000);

  it('derives pixels per inch from the reference', () => {
    expect(cal.pixelsPerInch).toBeCloseTo(5, 6);
  });

  it('converts a placement box into real dimensions', () => {
    const placement = { calibration: cal, rect: { x: 700, y: 500, w: 43.31 * 5, h: 13.3 * 5 } };
    const size = placementSize(placement);
    expect(size.width).toBeCloseTo(43.31, 4);
    expect(size.height).toBeCloseTo(13.3, 4);
  });

  it('fits artwork without distorting it (§9.2 do not re-proportion)', () => {
    const placement = { calibration: cal, rect: { x: 0, y: 0, w: 400, h: 200 } };
    // Artwork is 4:1; the box is 2:1. Width governs, and the aspect is kept.
    const fit = fitArtwork({ w: 400, h: 100 }, placement);
    expect(fit.width / fit.height).toBeCloseTo(4, 6);
    expect(fit.width).toBeCloseTo(80, 6);
    expect(fit.letterboxed).toBe('width');
  });

  it('warns when the box and the mark disagree about aspect', () => {
    const placement = { calibration: cal, rect: { x: 0, y: 0, w: 400, h: 200 } };
    const codes = checkCalibration(placement, 4).map((w) => w.code);
    expect(codes).toContain('aspect-mismatch');
  });

  it('warns when the reference is too short to trust', () => {
    const shortRef = calibrate({ a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, inches: 52 }, 1600, 1000);
    const codes = checkCalibration(
      { calibration: shortRef, rect: { x: 0, y: 0, w: 100, h: 30 } }, 3.3,
    ).map((w) => w.code);
    expect(codes).toContain('short-reference');
  });

  it('warns when the placement is below the 2" dimensional minimum', () => {
    const placement = { calibration: cal, rect: { x: 0, y: 0, w: 100, h: 5 } };
    expect(checkCalibration(placement, 20).map((w) => w.code)).toContain('tiny-placement');
  });

  it('rejects a reference with no length rather than dividing by zero', () => {
    expect(() => calibrate({ a: { x: 10, y: 10 }, b: { x: 10, y: 10 }, inches: 52 }, 100, 100))
      .toThrow(CalibrationError);
    expect(() => calibrate({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, inches: 0 }, 100, 100))
      .toThrow(CalibrationError);
  });

  it('anchors the sign bottom-left, centred in the placement box', () => {
    const placement = { calibration: cal, rect: { x: 700, y: 500, w: 200, h: 100 } };
    const anchor = anchorPx({ width: 40, height: 10 }, placement);
    // 40" × 5 ppi = 200 px wide → fills the box; 10" × 5 = 50 px tall → centred.
    expect(anchor.x).toBeCloseTo(700, 6);
    expect(anchor.y).toBeCloseTo(575, 6);
  });

  it('solves a homography that round-trips its own corners', () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    const dst = [{ x: 10, y: 20 }, { x: 210, y: 5 }, { x: 200, y: 130 }, { x: 20, y: 110 }];
    const h = solveHomography(src, dst);
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(h, src[i]!);
      expect(mapped.x).toBeCloseTo(dst[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(dst[i]!.y, 6);
    }
  });

  it('rejects collinear points instead of returning a silent NaN transform', () => {
    const collinear = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    expect(() => solveHomography(collinear, collinear)).toThrow(CalibrationError);
  });

  it('artworkExtent spans every item', () => {
    expect(artworkExtent([
      { bbox: { x: 0, y: 0, w: 10, h: 10 } },
      { bbox: { x: 20, y: 5, w: 10, h: 10 } },
    ])).toEqual({ w: 30, h: 15 });
  });
});
