/**
 * Artwork → measured items. Turns a font + copy, or an imported vector path,
 * into the `ArtworkItem[]` the rest of the pipeline consumes.
 *
 * Beziers are flattened here, once, so every downstream stage (offset, stroke
 * measurement, extrusion) works on the same polygon. Two stages flattening
 * independently is how a render stops matching its own spec block.
 */
import opentype from 'opentype.js';
import type { ArtworkItem, Contour, Pt } from '../domain/spec.js';
import { measureStroke } from './metrics.js';
import { bounds } from './poly.js';

export interface OutlineOptions {
  /** Target cap height in inches; the font is scaled to hit it. */
  capHeight: number;
  baselineY?: number;
  startX?: number;
  colour?: string;
  fontStyle?: ArtworkItem['fontStyle'];
  /** Curve flattening — segments per bezier. 24 holds ±0.001″ at sign sizes. */
  curveSegments?: number;
  idPrefix?: string;
}

export async function loadFont(path: string): Promise<opentype.Font> {
  return opentype.load(path);
}

/** One ArtworkItem per glyph — §3.2 groups them back up afterwards. */
export function itemsFromText(
  font: opentype.Font,
  text: string,
  opts: OutlineOptions,
): ArtworkItem[] {
  const segs = opts.curveSegments ?? 24;
  const baselineY = opts.baselineY ?? 0;
  const prefix = opts.idPrefix ?? 'I';

  // Scale so that the font's cap height lands on the requested inches.
  const unitsPerEm = font.unitsPerEm;
  const capUnits = (font.tables as any)?.os2?.sCapHeight ?? unitsPerEm * 0.7;
  const fontSize = (opts.capHeight * unitsPerEm) / capUnits;

  const items: ArtworkItem[] = [];
  let x = opts.startX ?? 0;
  let index = 0;

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const advance = ((glyph.advanceWidth ?? 0) / unitsPerEm) * fontSize;

    if (ch.trim() === '') { x += advance; continue; }

    const path = glyph.getPath(x, baselineY, fontSize);
    // opentype's y grows downward; flip so the model is y-up in inches.
    const contours = flattenPath(path, segs).map((c) => ({
      hole: c.hole,
      points: c.points.map((p) => ({ x: p.x, y: 2 * baselineY - p.y })),
    }));
    const oriented = orientContours(contours);

    if (oriented.length > 0) {
      const bbox = bounds(oriented);
      items.push({
        id: `${prefix}${++index}`,
        kind: 'glyph',
        char: ch,
        bbox,
        capHeight: bbox.y + bbox.h - baselineY,
        baselineY,
        narrowestStroke: round4(measureStroke(oriented).narrowest),
        colour: opts.colour,
        fontStyle: opts.fontStyle,
        contours: oriented,
      });
    }
    x += advance;
  }
  return items;
}

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** opentype path commands → closed polylines. */
export function flattenPath(path: opentype.Path, segments: number): Contour[] {
  const out: Contour[] = [];
  let cur: Pt[] = [];
  let start: Pt | null = null;
  let last: Pt = { x: 0, y: 0 };

  const push = (p: Pt) => {
    if (cur.length === 0 || Math.hypot(p.x - cur[cur.length - 1]!.x, p.y - cur[cur.length - 1]!.y) > 1e-9) {
      cur.push(p);
    }
    last = p;
  };
  const close = () => {
    if (cur.length >= 3) out.push({ points: cur, hole: false });
    cur = [];
  };

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        close();
        start = { x: cmd.x, y: cmd.y };
        push(start);
        break;
      case 'L':
        push({ x: cmd.x, y: cmd.y });
        break;
      case 'Q': {
        const p0 = last;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const mt = 1 - t;
          push({
            x: mt * mt * p0.x + 2 * mt * t * cmd.x1 + t * t * cmd.x,
            y: mt * mt * p0.y + 2 * mt * t * cmd.y1 + t * t * cmd.y,
          });
        }
        break;
      }
      case 'C': {
        const p0 = last;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const mt = 1 - t;
          push({
            x: mt ** 3 * p0.x + 3 * mt * mt * t * cmd.x1 + 3 * mt * t * t * cmd.x2 + t ** 3 * cmd.x,
            y: mt ** 3 * p0.y + 3 * mt * mt * t * cmd.y1 + 3 * mt * t * t * cmd.y2 + t ** 3 * cmd.y,
          });
        }
        break;
      }
      case 'Z':
        if (start) push(start);
        close();
        break;
    }
  }
  close();
  return out;
}

/**
 * Decide which contours are counters. A contour fully inside another is a hole;
 * the winding in the source font is not reliable across foundries.
 */
export function orientContours(contours: Contour[]): Contour[] {
  const withBounds = contours.map((c) => ({ c, b: bounds([c]) }));
  return withBounds.map(({ c, b }) => {
    const containers = withBounds.filter(({ c: o, b: ob }) =>
      o !== c && ob.x <= b.x && ob.y <= b.y && ob.x + ob.w >= b.x + b.w && ob.y + ob.h >= b.y + b.h,
    );
    return { ...c, points: c.points, hole: containers.length % 2 === 1 };
  });
}
