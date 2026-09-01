/**
 * Knocking a flat background out of a logo bitmap.
 *
 * A flood fill inward from the border, not a global "delete every pixel near
 * white": the counter of an O, the gap inside an A and the white of a knocked
 * out letter are all the same colour as the background and all have to stay.
 * Only what the border can reach without crossing the mark is background.
 *
 * This is a convenience on top of the trace, not a substitute for supplying
 * artwork with an alpha channel — and it changes what the tracer then measures,
 * so what it did is reported rather than assumed.
 */
import type { RasterImage } from './trace.js';

export interface MatteResult {
  /** RGBA, same dimensions as the input, background pixels at alpha 0. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Fraction of the image the fill claimed, 0–1. */
  removed: number;
  notes: string[];
}

/**
 * How far a pixel may differ from the background colour and still be
 * background, as a sum of channel differences (0–765).
 *
 * Generous enough to cross the JPEG noise and the vignetting in a photographed
 * white background; far too tight to cross into a letter, which differs from
 * its background by hundreds.
 */
const DEFAULT_TOLERANCE = 90;

export function removeFlatBackground(
  image: RasterImage,
  opts: { tolerance?: number } = {},
): MatteResult {
  const { width, height, data } = image;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const out = new Uint8Array(data.length);
  out.set(data);
  const notes: string[] = [];

  const seed = borderColour(image);
  const visited = new Uint8Array(width * height);
  // An explicit stack rather than recursion: a 4000×3000 photograph is twelve
  // million pixels, and a recursive fill overflows the stack long before it
  // finishes one.
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    const i = index * 4;
    const difference =
      Math.abs(data[i]! - seed.r) + Math.abs(data[i + 1]! - seed.g) + Math.abs(data[i + 2]! - seed.b);
    if (difference > tolerance) return;
    stack.push(index);
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  let removed = 0;
  while (stack.length > 0) {
    const index = stack.pop()!;
    out[index * 4 + 3] = 0;
    removed++;
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  const fraction = removed / (width * height);
  notes.push(
    `Removed the background colour rgb(${seed.r},${seed.g},${seed.b}) from the edges inward — `
    + `${(fraction * 100).toFixed(0)}% of the image.`,
  );
  // Two failures worth saying out loud, because both look like success in a
  // thumbnail: nothing was reachable (the mark runs to the edge, or the
  // background is a gradient), or nearly everything was (the mark was the same
  // colour as its background and went with it).
  if (fraction < 0.02) {
    notes.push(
      'Almost nothing was removed. The background may be a gradient or a photograph, '
      + 'or the artwork may already run to the edge of the file.',
    );
  } else if (fraction > 0.97) {
    notes.push(
      'Almost everything was removed. The mark is probably the same colour as its '
      + 'background — check the result before using it.',
    );
  }

  return { data: out, width, height, removed: fraction, notes };
}

/** The most common colour on the outer ring of pixels. */
function borderColour(image: RasterImage): { r: number; g: number; b: number } {
  const { width, height, data } = image;
  const counts = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    // Quantised to 5 bits per channel so photographic noise does not split one
    // background into a thousand distinct near-identical colours.
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
