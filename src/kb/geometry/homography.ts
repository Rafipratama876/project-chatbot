/**
 * The plane-to-plane map, and nothing else.
 *
 * Deliberately free of every import, including type-only ones: the wizard
 * aliases this exact file so the preview and the renderer compute a wall
 * position with the same arithmetic. Duplicating eight lines of linear algebra
 * across the two would drift, and the drift would show up as a sign that lands
 * somewhere other than where the customer dragged it — which is a defect with
 * no error message.
 */

export interface Pt { x: number; y: number }

export class HomographyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomographyError';
  }
}

/**
 * The 3×3 projective transform taking four source points to four destination
 * points, by the standard DLT with h33 fixed to 1.
 *
 * Returns [h11, h12, h13, h21, h22, h23, h31, h32]; h33 is implicitly 1.
 */
export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new HomographyError('a homography needs exactly four point correspondences');
  }

  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i]!;
    const d = dst[i]!;
    A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }
  return gaussianSolve(A, b);
}

export function applyHomography(h: number[], p: Pt): Pt {
  const [h11, h12, h13, h21, h22, h23, h31, h32] = h as [
    number, number, number, number, number, number, number, number,
  ];
  const w = h31 * p.x + h32 * p.y + 1;
  return { x: (h11 * p.x + h12 * p.y + h13) / w, y: (h21 * p.x + h22 * p.y + h23) / w };
}

/** Gaussian elimination with partial pivoting. */
function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivotRow]![col]!)) pivotRow = r;
    }
    [M[col], M[pivotRow]] = [M[pivotRow]!, M[col]!];

    const pivot = M[col]![col]!;
    if (Math.abs(pivot) < 1e-12) {
      throw new HomographyError('the four points are degenerate — three of them are collinear');
    }
    for (let c = col; c <= n; c++) M[col]![c] = M[col]![c]! / pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - factor * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Image points of a rectangle of known real size, clockwise from its top-left. */
export interface MarkedFacade {
  corners: Pt[];
  widthInches: number;
  heightInches: number;
}

/** Image pixels → inches on the wall plane, origin at the rectangle's top-left. */
export function imageToWall(facade: MarkedFacade): number[] {
  return solveHomography(facade.corners, [
    { x: 0, y: 0 },
    { x: facade.widthInches, y: 0 },
    { x: facade.widthInches, y: facade.heightInches },
    { x: 0, y: facade.heightInches },
  ]);
}

/** Inches on the wall plane → image pixels. */
export function wallToImage(facade: MarkedFacade): number[] {
  return solveHomography([
    { x: 0, y: 0 },
    { x: facade.widthInches, y: 0 },
    { x: facade.widthInches, y: facade.heightInches },
    { x: 0, y: facade.heightInches },
  ], facade.corners);
}

/**
 * How big an image-space rectangle really is, on the wall.
 *
 * The four corners are mapped individually and the extent taken across them,
 * because on an angled wall an axis-aligned image rectangle is not a rectangle
 * on the wall — its top edge and bottom edge are different lengths. Averaging
 * the two is the honest summary of a box someone dragged in image space, and
 * it is the number the sign is then built to.
 */
export function rectOnWall(
  facade: MarkedFacade,
  rect: { x: number; y: number; w: number; h: number },
): { widthInches: number; heightInches: number; centre: Pt } {
  const h = imageToWall(facade);
  const tl = applyHomography(h, { x: rect.x, y: rect.y });
  const tr = applyHomography(h, { x: rect.x + rect.w, y: rect.y });
  const br = applyHomography(h, { x: rect.x + rect.w, y: rect.y + rect.h });
  const bl = applyHomography(h, { x: rect.x, y: rect.y + rect.h });

  const top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const right = Math.hypot(br.x - tr.x, br.y - tr.y);

  return {
    widthInches: (top + bottom) / 2,
    heightInches: (left + right) / 2,
    centre: {
      x: (tl.x + tr.x + br.x + bl.x) / 4,
      y: (tl.y + tr.y + br.y + bl.y) / 4,
    },
  };
}

/**
 * The image-space box for a sign of a given real size, centred on a wall point.
 *
 * The inverse of `rectOnWall`, for the other direction of the same binding:
 * someone types "100 inches wide" and the box has to show what 100 inches
 * actually is on their building.
 */
export function wallRectToImage(
  facade: MarkedFacade,
  centre: Pt,
  widthInches: number,
  heightInches: number,
): { x: number; y: number; w: number; h: number } {
  const h = wallToImage(facade);
  const half = { w: widthInches / 2, h: heightInches / 2 };
  const corners = [
    applyHomography(h, { x: centre.x - half.w, y: centre.y - half.h }),
    applyHomography(h, { x: centre.x + half.w, y: centre.y - half.h }),
    applyHomography(h, { x: centre.x + half.w, y: centre.y + half.h }),
    applyHomography(h, { x: centre.x - half.w, y: centre.y + half.h }),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Whether a marked quad is a rectangle in the photograph — i.e. the wall was
 * shot square on, with no perspective to recover.
 *
 * The distinction decides whether the wall's height is information or noise.
 * A rectangle in the image, with square pixels, has its real aspect fixed by
 * its pixel aspect: a 240" wall drawn 848 x 522 px IS 147.8" tall and cannot
 * be anything else. Accepting a typed height there does not add knowledge, it
 * only introduces a contradiction — and the contradiction is not cosmetic,
 * because the renderer's recovered camera and the placement homography then
 * describe different walls and the sign lands somewhere else entirely.
 *
 * With real perspective the aspect is NOT fixed by the pixels, and the typed
 * height is the only thing that supplies it.
 */
export function isRectangularInImage(corners: Pt[], toleranceDeg = 1.5): boolean {
  if (corners.length !== 4) return false;
  const edge = (a: Pt, b: Pt): Pt => ({ x: b.x - a.x, y: b.y - a.y });
  const [tl, tr, br, bl] = corners as [Pt, Pt, Pt, Pt];

  const top = edge(tl, tr);
  const bottom = edge(bl, br);
  const left = edge(tl, bl);
  const right = edge(tr, br);

  const angleBetween = (u: Pt, v: Pt): number => {
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    if (lu < 1e-9 || lv < 1e-9) return 180;
    const cos = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / (lu * lv)));
    return (Math.acos(cos) * 180) / Math.PI;
  };

  // Opposite edges parallel, and adjacent edges square. Both are needed: a
  // parallelogram has the first and not the second, and its real aspect is
  // not recoverable from the pixels either.
  return angleBetween(top, bottom) < toleranceDeg
    && angleBetween(left, right) < toleranceDeg
    && Math.abs(angleBetween(top, left) - 90) < toleranceDeg;
}

/**
 * The height a rectangular marked quad must have, given its stated width.
 *
 * Null when the quad has perspective — there the pixels do not determine it
 * and the number has to come from someone who measured the wall.
 */
export function impliedHeightInches(corners: Pt[], widthInches: number): number | null {
  if (!isRectangularInImage(corners)) return null;
  const [tl, tr, br] = corners as [Pt, Pt, Pt, Pt];
  const wPx = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const hPx = Math.hypot(br.x - tr.x, br.y - tr.y);
  if (wPx < 1e-9) return null;
  return (widthInches * hPx) / wPx;
}
