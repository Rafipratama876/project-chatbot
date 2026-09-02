/**
 * Offset Path — CL-R-01, CL-R-02, CL-R-03, CL-R-04, CL-R-43, CL-R-45.
 *
 * This is polygon offsetting, not image generation. Thickening a stem to the
 * 1.5″ minimum means insetting the outline by (target − current)/2 on each
 * side, which is exactly what Clipper's ClipperOffset does. The result is the
 * geometry that gets extruded, so what the customer sees and what the shop
 * builds are the same polygon.
 */
import ClipperLib from 'clipper-lib';
import type { Contour } from '../domain/spec.js';
import { CLIPPER_SCALE } from '../domain/units.js';
import { toClipper, fromClipper, contourArea } from './poly.js';
import { measureStroke } from './metrics.js';

/**
 * Measured geometry never lands exactly on a threshold: an offset targeting
 * 1.5″ converges to 1.49999…, and a strict `>=` would then reject a stroke the
 * shop would call 1-1/2″. 1/50″ is finer than any fabrication process resolves,
 * so it is the tolerance everything that compares a stroke to a minimum uses.
 * One constant, so the decision tree and the offset cannot disagree about
 * whether the same letterform passed.
 */
export const STROKE_TOLERANCE = 0.02;

export interface OffsetResult {
  contours: Contour[];
  /** Per-side offset actually applied, inches. */
  delta: number;
  strokeBefore: number;
  strokeAfter: number;
  holesBefore: number;
  holesAfter: number;
  holeAreaBefore: number;
  holeAreaAfter: number;
  /** True when at least one counter vanished — CL-R-05 evidence. */
  countersClosed: boolean;
  /** True when the offset could not reach the target (self-intersection). */
  converged: boolean;
}

const holeStats = (cs: Contour[]) => {
  const holes = cs.filter((c) => c.hole);
  const a = holes.reduce((s, h) => s + Math.abs(polyArea(h.points)), 0);
  return { count: holes.length, area: a };
};

const polyArea = (pts: { x: number; y: number }[]): number => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.y - pts[i]!.x * pts[j]!.y;
  }
  return a / 2;
};

/** Raw offset by `delta` inches per side (positive grows the solid). */
export function offsetContours(
  contours: Contour[],
  delta: number,
  joinRound = true,
  /**
   * How far a round join may deviate from a true arc, in inches.
   *
   * 1/4″ is right for a fabrication outline: it is well inside the tolerance
   * anything is cut to, and a coarser polygon keeps `measureStroke` — which is
   * quadratic in segment count — from crawling.
   *
   * It is far too coarse for anything drawn as light. A halo offset several
   * inches out has its arcs approximated to a quarter inch, and the result is
   * visibly faceted: the stepped edge on a night render was this number, not
   * the shell count.
   */
  arcTolerance = 0.25,
): Contour[] {
  if (delta === 0) return contours.map((c) => ({ ...c, points: [...c.points] }));
  const co = new ClipperLib.ClipperOffset(2, arcTolerance * CLIPPER_SCALE);
  co.AddPaths(
    toClipper(contours),
    joinRound ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon,
  );
  const solution: ClipperLib.IntPoint[][] = [];
  co.Execute(solution, delta * CLIPPER_SCALE);
  return fromClipper(ClipperLib.Clipper.SimplifyPolygons(solution, ClipperLib.PolyFillType.pftNonZero));
}

/**
 * Thicken until the narrowest stroke reaches `targetStroke`.
 * A single δ = (target − current)/2 is correct for a parallel-sided stem; where
 * the letterform is not parallel-sided it under- or over-shoots, so the result
 * is re-measured and nudged. Bounded, and reports non-convergence rather than
 * looping — CL-R-46 needs to know the difference between "fixed" and "cannot".
 */
export function offsetToStroke(
  contours: Contour[],
  targetStroke: number,
  opts: { maxIterations?: number; tolerance?: number } = {},
): OffsetResult {
  const maxIterations = opts.maxIterations ?? 6;
  const tolerance = opts.tolerance ?? STROKE_TOLERANCE;

  const before = measureStroke(contours).narrowest;
  const hb = holeStats(contours);

  if (before >= targetStroke - tolerance) {
    return {
      contours, delta: 0, strokeBefore: before, strokeAfter: before,
      holesBefore: hb.count, holesAfter: hb.count,
      holeAreaBefore: hb.area, holeAreaAfter: hb.area,
      countersClosed: false, converged: true,
    };
  }

  let delta = (targetStroke - before) / 2;
  let best = offsetContours(contours, delta);
  let bestStroke = measureStroke(best).narrowest;

  for (let i = 0; i < maxIterations && bestStroke < targetStroke - tolerance; i++) {
    if (contourArea(best) <= 0) break;
    delta += (targetStroke - bestStroke) / 2;
    best = offsetContours(contours, delta);
    bestStroke = measureStroke(best).narrowest;
  }

  const ha = holeStats(best);
  return {
    contours: best,
    delta,
    strokeBefore: before,
    strokeAfter: bestStroke,
    holesBefore: hb.count,
    holesAfter: ha.count,
    holeAreaBefore: hb.area,
    holeAreaAfter: ha.area,
    countersClosed: ha.count < hb.count || (hb.area > 0 && ha.area < hb.area * 0.35),
    converged: bestStroke >= targetStroke - tolerance,
  };
}

/**
 * CL-R-45 — remove unnecessary tiny counters or holes at extreme sizes.
 * Deterministic: drop any hole whose area is below `minHoleArea` sq in.
 */
export function dropTinyHoles(contours: Contour[], minHoleArea: number): { contours: Contour[]; dropped: number } {
  const kept = contours.filter((c) => !c.hole || Math.abs(polyArea(c.points)) >= minHoleArea);
  return { contours: kept, dropped: contours.length - kept.length };
}

/**
 * CL-P-03 trim cap and CL-P-04 retainer geometry: the band BETWEEN the outline
 * and the outline grown by `width`.
 *
 * Not the grown outline itself — that is a solid the size of the whole letter,
 * and extruding it puts an opaque slab over the face. §9.2 calls the trim cap
 * "a thin outline", and this is that outline: grown contours as the perimeter,
 * the original contours punched out as holes.
 */
export function ringAround(contours: Contour[], width: number): Contour[] {
  if (width <= 0) return [];
  const grown = offsetContours(contours, width);

  // Grown MINUS original, as one boolean difference. Assembling the ring by
  // hand — grown as the outer, the original reversed as holes — depends on
  // getting every winding right, and gets it wrong around a counter, where the
  // band has to run on the INSIDE of the hole. Clipper already solves this.
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(toClipper(grown), ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(toClipper(contours), ClipperLib.PolyType.ptClip, true);
  const solution: ClipperLib.IntPoint[][] = [];
  clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return fromClipper(solution);
}

/**
 * CL-R-43 — the "bubble" route. A large outward offset then an equal inward
 * one produces a simplified silhouette per letter; the original artwork is then
 * specified as face vinyl.
 */
export function bubbleSilhouette(contours: Contour[], radius: number): Contour[] {
  const grown = offsetContours(contours, radius, true);
  return offsetContours(grown, -radius * 0.85, true);
}
