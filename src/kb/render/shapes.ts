/**
 * Contour[] → THREE.Shape[].
 *
 * A channel letter is literally an extrusion of its 2D outline, so this is not
 * an approximation of the letterform — it is the fabrication step. The same
 * polygon the rule engine measured and offset is the polygon that gets
 * extruded, which is why the render and the spec block cannot disagree.
 */
import * as THREE from 'three';
import type { Contour, Pt } from '../domain/spec.js';
import { pointInContours, absArea } from '../geometry/poly.js';

const toVec2 = (pts: Pt[]): THREE.Vector2[] => pts.map((p) => new THREE.Vector2(p.x, p.y));

export function contoursToShapes(contours: Contour[]): THREE.Shape[] {
  const outers = contours.filter((c) => !c.hole);
  const holes = contours.filter((c) => c.hole);

  // Each hole belongs to the SMALLEST outer that contains it, not the first
  // one found. A trim-cap ring nests three deep — outer band, counter, counter
  // band, counter's counter — and a hole assigned to two outers at once gets
  // triangulated twice, which shows up on the render as a wedge cut across the
  // letter. Area is the nesting order.
  const withArea = outers
    .map((c) => ({ contour: c, area: Math.abs(absArea(c.points)) }))
    .sort((a, b) => a.area - b.area);

  const assigned = new Map<Contour, Contour[]>();
  for (const h of holes) {
    const probe = h.points[0]!;
    const owner = withArea.find(({ contour }) => pointInContours(probe, [contour]));
    if (!owner) continue;
    const list = assigned.get(owner.contour) ?? [];
    list.push(h);
    assigned.set(owner.contour, list);
  }

  return outers.map((outer) => {
    const shape = new THREE.Shape(toVec2(outer.points));
    for (const h of assigned.get(outer) ?? []) {
      shape.holes.push(new THREE.Path(toVec2(h.points)));
    }
    return shape;
  });
}

export interface ExtrudeOptions {
  depth: number;
  /** Bevel is off for channel letters: a return is a flat sheet, not a chamfer. */
  bevel?: boolean;
  curveSegments?: number;
}

export function extrude(contours: Contour[], opts: ExtrudeOptions): THREE.BufferGeometry {
  const shapes = contoursToShapes(contours);
  if (shapes.length === 0) return new THREE.BufferGeometry();
  return new THREE.ExtrudeGeometry(shapes, {
    depth: opts.depth,
    bevelEnabled: opts.bevel ?? false,
    curveSegments: opts.curveSegments ?? 12,
  });
}

/** Flat face plane only — used for the emissive halo source and for vinyl. */
export function flat(contours: Contour[]): THREE.BufferGeometry {
  const shapes = contoursToShapes(contours);
  if (shapes.length === 0) return new THREE.BufferGeometry();
  return new THREE.ShapeGeometry(shapes);
}

/** §3.6 box shapes: rectangle, rounded rectangle, capsule. */
export function boxShape(w: number, h: number, cornerRadius: number): THREE.Shape {
  const r = Math.min(cornerRadius, w / 2, h / 2);
  const s = new THREE.Shape();
  if (r <= 0) {
    s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.closePath();
    return s;
  }
  s.moveTo(r, 0);
  s.lineTo(w - r, 0);
  s.absarc(w - r, r, r, -Math.PI / 2, 0, false);
  s.lineTo(w, h - r);
  s.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(r, h);
  s.absarc(r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(0, r);
  s.absarc(r, r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}
