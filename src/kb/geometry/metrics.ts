/**
 * Narrowest stroke measurement. §6.1 tests `S = narrowest stroke` on every
 * CL-C-01 element, so the number has to come from the outline, not from a
 * model's opinion about the outline.
 *
 * Method: sample along every outline edge, cast a ray along that edge's inward
 * perpendicular, and take the distance to the first opposing edge. The minimum
 * across all samples is the narrowest stroke — the same measurement a
 * fabricator takes with calipers across the thinnest stem, crossbar or serif.
 *
 * Rays stay inside one connected shape. A letter set is many separate cans, and
 * a ray crossing from the "d" to the "E" measures the gap between them, not a
 * stroke — on a mark whose letters touch or overlap that reads as zero, which
 * would send a perfectly buildable logo to CL-R-46 as unbuildable.
 */
import type { Contour, Pt } from '../domain/spec.js';
import { raySegmentHit, segments, pointInContours } from './poly.js';

export interface StrokeMeasurement {
  narrowest: number;
  /** Where it was measured — lets a callout say "the crossbar of the e". */
  at: Pt;
  /** Every sample under `flagBelow`, for CL-R-04 small-detail reporting. */
  thinPoints: Array<{ pt: Pt; width: number }>;
}

const norm = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

export function measureStroke(contours: Contour[], flagBelow = Infinity): StrokeMeasurement {
  let narrowest = Infinity;
  let at: Pt = { x: 0, y: 0 };
  const thin: Array<{ pt: Pt; width: number }> = [];

  for (const component of connectedShapes(contours)) {
    const result = measureComponent(component, flagBelow);
    thin.push(...result.thinPoints);
    if (result.narrowest > 0 && result.narrowest < narrowest) {
      narrowest = result.narrowest;
      at = result.at;
    }
  }

  return {
    narrowest: Number.isFinite(narrowest) ? narrowest : 0,
    at,
    thinPoints: thin.sort((a, b) => a.width - b.width).slice(0, 32),
  };
}

/**
 * One outer contour plus the holes inside it — one fabricated can.
 *
 * A hole belongs to the smallest outer that contains it, so a counter inside a
 * counter lands in the right place rather than in whichever shape was listed
 * first.
 */
export function connectedShapes(contours: Contour[]): Contour[][] {
  const outers = contours.filter((c) => !c.hole);
  const holes = contours.filter((c) => c.hole);
  if (outers.length === 0) return contours.length > 0 ? [contours] : [];

  const bySize = outers
    .map((c) => ({ contour: c, area: Math.abs(signedArea(c.points)) }))
    .sort((a, b) => a.area - b.area);

  const groups = new Map<Contour, Contour[]>(outers.map((c) => [c, [c]]));
  for (const hole of holes) {
    const probe = hole.points[0];
    if (!probe) continue;
    const owner = bySize.find(({ contour }) => pointInContours(probe, [contour]));
    if (owner) groups.get(owner.contour)!.push(hole);
  }
  return [...groups.values()];
}

const signedArea = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.y - pts[i]!.x * pts[j]!.y;
  }
  return a / 2;
};

function measureComponent(contours: Contour[], flagBelow: number): StrokeMeasurement {
  const segs = segments(contours);
  let narrowest = Infinity;
  let at: Pt = { x: 0, y: 0 };
  const thin: Array<{ pt: Pt; width: number }> = [];

  for (const s of segs) {
    const ex = s.b.x - s.a.x;
    const ey = s.b.y - s.a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;

    // Perpendicular to THIS edge, not to an average across a vertex. At a
    // right-angle corner the averaged tangent points diagonally, and a ray
    // along it crosses a 2" wall in 2·√2" — measuring the diagonal instead of
    // the wall. A fabricator's calipers sit square to the edge, so this does.
    //
    // Inside-ness is tested against THIS component only. Tested against the
    // whole mark, an overlap between two letters flips the normal outward, the
    // ray leaves the shape, and the first thing it meets is the neighbouring
    // letter a few thousandths away.
    let nrm: Pt = { x: -ey / len, y: ex / len };
    const mid: Pt = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    if (!pointInContours({ x: mid.x + nrm.x * 1e-5, y: mid.y + nrm.y * 1e-5 }, contours)) {
      nrm = { x: -nrm.x, y: -nrm.y };
    }

    // Long edges get several samples: a stem can be parallel-sided for most of
    // its length and pinch at one end.
    const samples = Math.min(Math.max(Math.ceil(len / 0.25), 1), 12);
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples;
      const origin: Pt = { x: s.a.x + ex * t, y: s.a.y + ey * t };

      let best = Infinity;
      for (const other of segs) {
        if (other === s) continue;
        const d = raySegmentHit(origin, nrm, other);
        if (d < best) best = d;
      }
      if (!Number.isFinite(best)) continue;
      if (best < flagBelow) thin.push({ pt: origin, width: best });
      if (best < narrowest) { narrowest = best; at = origin; }
    }
  }

  return {
    narrowest: Number.isFinite(narrowest) ? narrowest : 0,
    at,
    thinPoints: thin.sort((a, b) => a.width - b.width).slice(0, 32),
  };
}

/** Cap height = distance from the baseline to the top of the outline. */
export function capHeightOf(contours: Contour[], baselineY: number): number {
  let maxY = -Infinity;
  for (const c of contours) for (const p of c.points) if (p.y > maxY) maxY = p.y;
  return Number.isFinite(maxY) ? maxY - baselineY : 0;
}
