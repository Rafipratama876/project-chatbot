/**
 * Raster artwork → contours.
 *
 * A PNG has no outline. It has pixels, and an outline has to be inferred from
 * them — which is a different kind of input to a vector file, and the proof has
 * to say so. §6.1 measures the narrowest stroke off whatever geometry it is
 * given; measured off a traced outline, that number inherits the trace's error,
 * and at low resolution the error is larger than the tolerance the rule is
 * testing against.
 *
 * So this returns a confidence alongside the geometry, and the caller decides
 * whether it is good enough. Nothing here silently upgrades a screenshot into a
 * fabrication drawing.
 *
 * Pipeline: background removal → colour quantisation → per-colour mask →
 * marching-squares boundary → Douglas-Peucker simplification.
 */
import type { Contour, Pt } from '../domain/spec.js';
import { orientContours } from './outline.js';

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface TraceOptions {
  /** Distinct fills to keep. A logo is rarely more than a handful. */
  maxColours?: number;
  /** Ignore regions smaller than this fraction of the image. */
  minRegionRatio?: number;
  /** Simplification tolerance, in source pixels. */
  tolerance?: number;
  /** Alpha below this is transparent. */
  alphaThreshold?: number;
  /**
   * Treat the colour that dominates the border as background. A JPEG has no
   * transparency, so the mark sits on a solid field; traced as-is the result is
   * one rectangle the size of the image.
   */
  dropBackground?: boolean;
}

export interface TraceQuality {
  /** Source pixels across the mark's own bounding box. */
  markWidthPx: number;
  markHeightPx: number;
  /** Distinct fills kept. */
  colours: number;
  /**
   * How many pixels deep the partial-alpha transition runs. Anti-aliasing on a
   * clean vector render is ~1; a blurred or rescaled bitmap is 3 or more.
   */
  edgeBandPx: number;
  /** 0–1. Below `MIN_TRACE_CONFIDENCE` the geometry should not drive §6.1. */
  confidence: number;
  notes: string[];
}

export interface TraceResult {
  contours: Contour[];
  colours: string[];
  quality: TraceQuality;
}

/**
 * Below this the traced outline is not a sound basis for a stroke minimum. The
 * threshold is set where a 1.5" stroke stops being more than a few pixels wide
 * in the source — past that, quantisation noise is the same size as the feature
 * being measured.
 */
export const MIN_TRACE_CONFIDENCE = 0.55;

interface Rgb { r: number; g: number; b: number }

export function traceImage(image: RasterImage, opts: TraceOptions = {}): TraceResult {
  const maxColours = opts.maxColours ?? 6;
  const minRegionRatio = opts.minRegionRatio ?? 0.0015;
  const tolerance = opts.tolerance ?? 1.2;
  const alphaThreshold = opts.alphaThreshold ?? 128;
  const { width, height, data } = image;
  const notes: string[] = [];

  // ── Background ──────────────────────────────────────────────────────────
  const opaque = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) opaque[i] = data[i * 4 + 3]! >= alphaThreshold ? 1 : 0;

  const hasAlpha = opaque.some((v) => v === 0);
  let background: Rgb | null = null;
  if (!hasAlpha && (opts.dropBackground ?? true)) {
    background = borderColour(image);
    notes.push(
      `No transparency; treating the border colour rgb(${background.r},${background.g},${background.b}) as background.`,
    );
  }

  // ── Quantise ────────────────────────────────────────────────────────────
  const samples: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    if (!opaque[i]) continue;
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    if (background && near({ r, g, b }, background, 26)) continue;
    samples.push({ r, g, b });
  }

  if (samples.length === 0) {
    return {
      contours: [],
      colours: [],
      quality: {
        markWidthPx: 0, markHeightPx: 0, colours: 0, edgeBandPx: 0, confidence: 0,
        notes: [...notes, 'Nothing left after removing the background — the whole image reads as one flat colour.'],
      },
    };
  }

  const palette = quantise(samples, maxColours);

  // ── Per-colour masks ────────────────────────────────────────────────────
  const label = new Int16Array(width * height).fill(-1);
  let markMinX = width, markMinY = height, markMaxX = -1, markMaxY = -1;

  for (let i = 0; i < width * height; i++) {
    if (!opaque[i]) continue;
    const px = { r: data[i * 4]!, g: data[i * 4 + 1]!, b: data[i * 4 + 2]! };
    if (background && near(px, background, 26)) continue;
    label[i] = nearestIndex(px, palette);
    const x = i % width;
    const y = (i / width) | 0;
    if (x < markMinX) markMinX = x;
    if (x > markMaxX) markMaxX = x;
    if (y < markMinY) markMinY = y;
    if (y > markMaxY) markMaxY = y;
  }

  const minArea = Math.max(4, width * height * minRegionRatio);
  const contours: Contour[] = [];
  const usedColours: string[] = [];
  const traceStats = { ribbonHolesDropped: 0 };

  palette.forEach((colour, index) => {
    const mask = new Uint8Array(width * height);
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (label[i] === index) { mask[i] = 1; count++; }
    }
    if (count < minArea) return;

    const traced = traceMask(mask, width, height, tolerance, minArea, traceStats);
    if (traced.length === 0) return;

    const hex = toHex(colour);
    usedColours.push(hex);
    for (const c of traced) contours.push({ ...c, colour: hex });
  });

  if (traceStats.ribbonHolesDropped > 0) {
    notes.push(
      `${traceStats.ribbonHolesDropped} thin enclosed line(s) inside the mark's own strokes were `
      + 'treated as a decorative inset or bevel rather than a real counter, and left filled — a '
      + 'genuine counter (a bowl, a hole) is not this narrow. Check the traced outline against the '
      + 'source if a letter should have an opening here.',
    );
  }

  // ── Quality ─────────────────────────────────────────────────────────────
  const markWidthPx = Math.max(0, markMaxX - markMinX + 1);
  const markHeightPx = Math.max(0, markMaxY - markMinY + 1);
  const edgeBandPx = measureEdgeBand(image, opaque, alphaThreshold);

  const quality = assessTrace({
    markWidthPx, markHeightPx, colours: usedColours.length, edgeBandPx, notes,
  });

  return { contours, colours: usedColours, quality };
}

function assessTrace(input: Omit<TraceQuality, 'confidence'>): TraceQuality {
  const notes = [...input.notes];
  let confidence = 1;

  // Resolution is what dominates. A mark 200 px wide traced for a 43" sign
  // gives ~4.6 px per inch, so a 1.5" minimum stroke is 7 px — and a 7 px
  // feature carries roughly ±15% of trace error, against a rule testing a
  // tolerance of 1/50".
  const px = Math.max(input.markWidthPx, input.markHeightPx);
  if (px < 200) { confidence -= 0.5; notes.push(`The mark is only ${px} px across. Outlines traced this coarsely are approximate.`); }
  else if (px < 600) { confidence -= 0.25; notes.push(`The mark is ${px} px across — usable, but a vector original would be exact.`); }
  else if (px < 1200) confidence -= 0.08;

  // A one-pixel transition is anti-aliasing and costs nothing. Deeper than
  // that means the source was rescaled or re-compressed, and the traced
  // boundary is a guess about where a hard edge used to be.
  if (input.edgeBandPx > 3) {
    confidence -= 0.25;
    notes.push(`Edges fade over about ${input.edgeBandPx.toFixed(1)} px — the image has been rescaled or re-compressed, so the outline is smoothed rather than exact.`);
  } else if (input.edgeBandPx > 1.8) {
    confidence -= 0.1;
  }

  if (input.colours === 0) { confidence = 0; notes.push('No fills were recovered.'); }
  else if (input.colours > 5) { confidence -= 0.15; notes.push(`${input.colours} fills were recovered — a photograph or a gradient traces into many colours and is not fabricable as separate cans.`); }

  return { ...input, notes, confidence: Math.max(0, Math.min(1, confidence)) };
}

// ── Background detection ───────────────────────────────────────────────────

/** The most common colour on the outer ring of pixels. */
function borderColour(image: RasterImage): Rgb {
  const { width, height, data } = image;
  const counts = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const key = (data[i]! >> 3 << 10) | (data[i + 1]! >> 3 << 5) | (data[i + 2]! >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y++) { add(0, y); add(width - 1, y); }

  let bestKey = 0;
  let best = -1;
  for (const [key, n] of counts) if (n > best) { best = n; bestKey = key; }
  return { r: ((bestKey >> 10) & 31) << 3, g: ((bestKey >> 5) & 31) << 3, b: (bestKey & 31) << 3 };
}

const near = (a: Rgb, b: Rgb, threshold: number): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < threshold * 3;

/**
 * Thickness of the alpha transition, in pixels.
 *
 * Counting the *fraction* of boundary pixels that are partially transparent
 * does not work: a clean anti-aliased vector render has partial alpha along
 * essentially its whole boundary, so that fraction is ~1 and every good PNG
 * gets marked as blurry. What separates anti-aliasing from damage is how DEEP
 * the transition runs — one pixel for anti-aliasing, several for a rescale or a
 * JPEG. So this measures the band, not the fraction.
 */
function measureEdgeBand(image: RasterImage, opaque: Uint8Array, alphaThreshold: number): number {
  const { width, height, data } = image;
  let partial = 0;
  let boundary = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const a = data[i * 4 + 3]!;
      if (a > 4 && a < 251) partial++;
      if (!opaque[i]) continue;
      if (!opaque[i - 1] || !opaque[i + 1] || !opaque[i - width] || !opaque[i + width]) boundary++;
    }
  }

  // A fully opaque image (a JPEG) has no alpha to read at all.
  if (boundary === 0) return partial === 0 ? 1 : 3;
  return partial / boundary;
}

// ── Colour quantisation ────────────────────────────────────────────────────

/**
 * Median cut. Deterministic, unlike k-means with a random seed — the same file
 * must always produce the same palette, or the same logo produces a different
 * spec block on Tuesday.
 */
function quantise(samples: Rgb[], maxColours: number): Rgb[] {
  const step = Math.max(1, Math.floor(samples.length / 40000));
  const pixels = step === 1 ? samples : samples.filter((_, i) => i % step === 0);

  let boxes: Rgb[][] = [pixels];
  while (boxes.length < maxColours) {
    let widest = -1;
    let widestRange = 0;
    let widestChannel: keyof Rgb = 'r';

    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (const ch of ['r', 'g', 'b'] as const) {
        let lo = 255;
        let hi = 0;
        for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
        if (hi - lo > widestRange) { widestRange = hi - lo; widest = i; widestChannel = ch; }
      }
    });

    // Stop splitting once the boxes are tight: further splits would separate
    // shades of one ink, not distinct fills.
    if (widest < 0 || widestRange < 34) break;

    const box = boxes[widest]!;
    const sorted = [...box].sort((a, b) => a[widestChannel] - b[widestChannel]);

    // At the channel's own midrange, not at the population median. A logo
    // mark is flat fills, not a photograph: a thin outline stroke in a
    // colour of its own (a red line around a mostly-black-and-white icon,
    // say) is a tiny fraction of the PIXEL COUNT next to the ink and fills
    // around it, so splitting at the point that puts equal PIXELS on each
    // side lands inside the dominant fill instead of at the boundary
    // between the two colours — the minority colour never gets its own box
    // and comes out of `average()` blended into a muddy in-between that is
    // neither. Splitting at the midpoint of the range instead draws the
    // line where the two colours actually are furthest apart, however
    // lopsided the pixel counts either side of it. Measured on real
    // output: a red rgb(117,14,18) outline against rgb(39,39,39) text
    // merged into rgb(55,34,35) at the population median; splitting at
    // R's own midrange (78) instead kept them as two separate colours.
    const lo = sorted[0]![widestChannel];
    const hi = sorted[sorted.length - 1]![widestChannel];
    const midValue = (lo + hi) / 2;
    let cut = sorted.findIndex((p) => p[widestChannel] > midValue);
    if (cut < 0) cut = sorted.length;
    cut = Math.min(sorted.length - 1, Math.max(1, cut));

    boxes = [...boxes.slice(0, widest), sorted.slice(0, cut), sorted.slice(cut), ...boxes.slice(widest + 1)];
  }

  return boxes.filter((b) => b.length > 0).map(average).sort(byLuminance);
}

const average = (box: Rgb[]): Rgb => {
  let r = 0, g = 0, b = 0;
  for (const p of box) { r += p.r; g += p.g; b += p.b; }
  return { r: Math.round(r / box.length), g: Math.round(g / box.length), b: Math.round(b / box.length) };
};

const byLuminance = (a: Rgb, b: Rgb): number =>
  (0.299 * a.r + 0.587 * a.g + 0.114 * a.b) - (0.299 * b.r + 0.587 * b.g + 0.114 * b.b);

function nearestIndex(px: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDistance = Infinity;
  palette.forEach((p, i) => {
    const d = (px.r - p.r) ** 2 + (px.g - p.g) ** 2 + (px.b - p.b) ** 2;
    if (d < bestDistance) { bestDistance = d; best = i; }
  });
  return best;
}

const toHex = (c: Rgb): string =>
  `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// ── Boundary tracing ───────────────────────────────────────────────────────

/**
 * Boundaries by crack following — walking the cracks *between* pixels rather
 * than the pixel centres.
 *
 * Every edge where a solid pixel meets an empty one is one unit segment, always
 * shared by exactly two grid corners. Chaining them can only produce closed
 * loops, so termination is a property of the construction: there is no step
 * limit to tune and no stopping criterion to get subtly wrong. Two earlier
 * attempts at neighbour-following either failed to close on a ring or ran to
 * their iteration cap and returned a truncated outline.
 *
 * Which loops are counters is then decided by containment, not by the sign of
 * their signed area. A winding convention depends on whether y grows up or down
 * and on which side the solid was kept, and getting it backwards inverts every
 * outline silently — the first version of this marked whole letters as holes.
 * Containment is the same test either way round.
 */
function traceMask(
  mask: Uint8Array, width: number, height: number, tolerance: number, minArea: number,
  stats: { ribbonHolesDropped: number },
): Contour[] {
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  // Corner (x, y) is the top-left of pixel (x, y); the grid is one wider and
  // one taller than the pixel array.
  const key = (x: number, y: number): number => y * (width + 1) + x;
  const next = new Map<number, Array<{ x: number; y: number }>>();
  const addEdge = (ax: number, ay: number, bx: number, by: number): void => {
    const from = key(ax, ay);
    const list = next.get(from);
    if (list) list.push({ x: bx, y: by });
    else next.set(from, [{ x: bx, y: by }]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y)) continue;
      // Solid on the left of travel: top runs right-to-left, left runs down,
      // bottom runs left-to-right, right runs up.
      if (!solid(x, y - 1)) addEdge(x + 1, y, x, y);
      if (!solid(x - 1, y)) addEdge(x, y, x, y + 1);
      if (!solid(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1);
      if (!solid(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y);
    }
  }

  const contours: Contour[] = [];
  while (next.size > 0) {
    const startKey = next.keys().next().value as number;
    const startX = startKey % (width + 1);
    const startY = (startKey / (width + 1)) | 0;

    const loop: Pt[] = [];
    let x = startX;
    let y = startY;

    // Each edge is consumed once, so the walk is bounded by the edge count.
    for (;;) {
      const list = next.get(key(x, y));
      if (!list || list.length === 0) break;
      const step = list.pop()!;
      if (list.length === 0) next.delete(key(x, y));

      loop.push({ x, y });
      x = step.x;
      y = step.y;
      if (x === startX && y === startY) break;
    }

    if (loop.length < 4) continue;
    const simplified = simplify(loop, tolerance);
    if (simplified.length < 3) continue;

    if (Math.abs(polygonArea(simplified)) < minArea) continue;
    contours.push({ points: simplified, hole: false });
  }

  // A loop nested inside an odd number of others is a counter.
  const oriented = orientContours(contours);

  // Not every enclosed loop is a counter. A "3D sticker" style mark draws an
  // inner highlight or bevel line just inside each stroke, in a colour of its
  // own — one colour's mask alone, that reads as a thin closed ring hugging
  // the inside of the letterform, topologically identical to a real counter.
  // Punched out as one, "I" and "J" come back with a sliver missing down
  // their own stroke — solid letters read as split in two, which is the
  // shape a real counter (R's bowl, O's centre) never takes: those are
  // chunky, not ribbons. Measured on a real "3D sticker" mark: R's genuine
  // bowl has a long:short bounding-box ratio of ~1.5; the bevel-line
  // artefacts inside "I" and "J" ran ~4.3 and ~5.0. Dropping a hole this
  // elongated keeps the letter solid instead of carving a decorative line
  // into it — the only thing a real fabricated letter could do with a groove
  // it cannot cut anyway.
  return oriented.filter((c) => {
    const drop = c.hole && isRibbonHole(c.points);
    if (drop) stats.ribbonHolesDropped++;
    return !drop;
  });
}

/** Long:short bounding-box ratio past which an enclosed loop reads as a thin decorative line rather than a real counter. */
const RIBBON_ASPECT_RATIO = 3;

function isRibbonHole(points: Pt[]): boolean {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const long = Math.max(w, h);
  const short = Math.max(1, Math.min(w, h));
  return long / short > RIBBON_ASPECT_RATIO;
}

/**
 * Douglas-Peucker.
 *
 * Iterative, because a long boundary would blow a recursive stack. Bounded,
 * because Douglas-Peucker is O(n²) in the worst case — a pixel-level zigzag
 * finely enough sampled that every point is a maximum-deviation point — and a
 * traced boundary comes from a file a customer uploaded. Past the bound it
 * falls back to uniform decimation, which is worse geometry but finishes.
 */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Each split scans its own span, so the total scanned is the work done.
  // 40× the point count is far beyond what any real outline needs.
  const budget = points.length * 40;
  let scanned = 0;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    scanned += last - first;
    if (scanned > budget) return decimate(points, tolerance);

    let maxDistance = 0;
    let index = first;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i]!, points[first]!, points[last]!);
      if (d > maxDistance) { maxDistance = d; index = i; }
    }
    if (maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Even sampling — the fallback when simplification would not terminate cheaply. */
function decimate(points: Pt[], tolerance: number): Pt[] {
  const step = Math.max(1, Math.round(tolerance));
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.x !== last.x || tail.y !== last.y) out.push(last);
  return out;
}

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.y - pts[i]!.x * pts[j]!.y;
  }
  return a / 2;
}
