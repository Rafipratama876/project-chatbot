/**
 * Deterministic artwork without a font dependency.
 *
 * Each "glyph" is a block letterform with an exactly known narrowest stroke, so
 * a test asserting that CL-R-01 fires at 1.4″ and not at 1.6″ is testing the
 * rule rather than a font's metrics. `test/outline.spec.ts` covers the real
 * opentype path separately.
 */
import type { ArtworkItem, Contour } from '#/kb/domain/spec.js';

export interface BlockOptions {
  capHeight: number;
  /** The narrowest stroke the shape will measure at. */
  stroke: number;
  baselineY?: number;
  startX?: number;
  colour?: string;
  fontStyle?: ArtworkItem['fontStyle'];
  /** Adds an enclosed counter, like the bowl of an O. */
  counter?: boolean;
  gapAfter?: number;
}

const rect = (x: number, y: number, w: number, h: number, hole = false): Contour => ({
  hole,
  points: hole
    ? [{ x, y }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y }]
    : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});

/** An "I": a single vertical stem of exactly `stroke` width. */
function stemGlyph(x: number, o: BlockOptions): Contour[] {
  const y = o.baselineY ?? 0;
  return [rect(x, y, o.stroke, o.capHeight)];
}

/** An "O": a ring with `stroke`-wide walls and a real counter. */
function ringGlyph(x: number, o: BlockOptions): Contour[] {
  const y = o.baselineY ?? 0;
  const w = Math.max(o.stroke * 3, o.capHeight * 0.62);
  return [
    rect(x, y, w, o.capHeight),
    rect(x + o.stroke, y + o.stroke, w - 2 * o.stroke, o.capHeight - 2 * o.stroke, true),
  ];
}

export function blockWord(text: string, o: BlockOptions, idPrefix = 'I'): ArtworkItem[] {
  const items: ArtworkItem[] = [];
  const baselineY = o.baselineY ?? 0;
  let x = o.startX ?? 0;
  let n = 0;

  for (const ch of text) {
    if (ch === ' ') { x += o.capHeight * 0.45; continue; }
    const wantsCounter = o.counter ?? 'ABDGOPQR'.includes(ch.toUpperCase());
    const contours = wantsCounter ? ringGlyph(x, o) : stemGlyph(x, o);
    const xs = contours.flatMap((c) => c.points.map((p) => p.x));
    const w = Math.max(...xs) - Math.min(...xs);

    items.push({
      id: `${idPrefix}${++n}`,
      kind: 'glyph',
      char: ch,
      bbox: { x, y: baselineY, w, h: o.capHeight },
      capHeight: o.capHeight,
      baselineY,
      narrowestStroke: o.stroke,
      colour: o.colour,
      fontStyle: o.fontStyle,
      contours,
    });
    x += w + o.capHeight * 0.16;
  }
  return items;
}

/** A non-typographic mark — triggers the §3.5 step 1 branch. */
export function logoMark(opts: { x: number; y: number; size: number; counter?: boolean }): ArtworkItem {
  const { x, y, size } = opts;
  const contours: Contour[] = [rect(x, y, size, size)];
  if (opts.counter) contours.push(rect(x + size * 0.35, y + size * 0.35, size * 0.3, size * 0.3, true));
  return {
    id: 'LOGO',
    kind: 'shape',
    text: 'wing mark',
    bbox: { x, y, w: size, h: size },
    capHeight: size,
    baselineY: y,
    narrowestStroke: opts.counter ? size * 0.35 : size,
    contours,
  };
}
