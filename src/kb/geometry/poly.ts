/** Polygon primitives shared by the offset, counter and metric passes. */
import type { Contour, Pt, Rect } from '../domain/spec.js';
import { CLIPPER_SCALE } from '../domain/units.js';
import type { IntPoint } from 'clipper-lib';

export const area = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const p = pts[i]!;
    const q = pts[j]!;
    a += q.x * p.y - p.x * q.y;
  }
  return a / 2;
};

export const absArea = (pts: Pt[]): number => Math.abs(area(pts));

export const contourArea = (cs: Contour[]): number =>
  cs.reduce((sum, c) => sum + (c.hole ? -absArea(c.points) : absArea(c.points)), 0);

export function bounds(cs: Contour[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cs) {
    for (const p of c.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function translate(cs: Contour[], dx: number, dy: number): Contour[] {
  return cs.map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }));
}

export function scale(cs: Contour[], s: number, origin: Pt = { x: 0, y: 0 }): Contour[] {
  return cs.map((c) => ({
    ...c,
    points: c.points.map((p) => ({ x: origin.x + (p.x - origin.x) * s, y: origin.y + (p.y - origin.y) * s })),
  }));
}

// ── Clipper bridge ─────────────────────────────────────────────────────────

export const toClipper = (cs: Contour[]): IntPoint[][] =>
  cs.map((c) => c.points.map((p) => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) })));

/**
 * Back from Clipper. Orientation decides hole-ness: with all outer contours
 * wound the same way, a reversed winding is a counter. Clipper's `Execute`
 * normalises this, so we key off signed area rather than trusting input flags.
 */
export function fromClipper(paths: IntPoint[][]): Contour[] {
  const raw = paths
    .filter((p) => p.length >= 3)
    .map((p) => p.map((q) => ({ x: q.X / CLIPPER_SCALE, y: q.Y / CLIPPER_SCALE })));
  if (raw.length === 0) return [];
  return raw.map((pts) => ({ points: pts, hole: area(pts) < 0 }));
}

/** Ray/segment helpers for the stroke metric. */
export interface Seg { a: Pt; b: Pt }

export function segments(cs: Contour[]): Seg[] {
  const out: Seg[] = [];
  for (const c of cs) {
    const n = c.points.length;
    for (let i = 0; i < n; i++) out.push({ a: c.points[i]!, b: c.points[(i + 1) % n]! });
  }
  return out;
}

/** Distance along the ray to the first hit, or Infinity. */
export function raySegmentHit(origin: Pt, dir: Pt, s: Seg, eps = 1e-7): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const denom = dir.x * ey - dir.y * ex;
  if (Math.abs(denom) < eps) return Infinity;
  const dx = s.a.x - origin.x;
  const dy = s.a.y - origin.y;
  const t = (dx * ey - dy * ex) / denom;          // along ray
  const u = (dx * dir.y - dy * dir.x) / denom;    // along segment
  if (t <= eps || u < -eps || u > 1 + eps) return Infinity;
  return t;
}

export function pointInContours(pt: Pt, cs: Contour[]): boolean {
  let inside = false;
  for (const c of cs) {
    const n = c.points.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = c.points[i]!;
      const pj = c.points[j]!;
      const crosses = (pi.y > pt.y) !== (pj.y > pt.y);
      if (crosses && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
    }
  }
  return inside;
}
