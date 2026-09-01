/**
 * Cameras. §9.2 requires that "return depth reads consistently in perspective
 * at the specified value", so the perspective view is a real camera on the same
 * geometry rather than a second interpretation of it.
 */
import * as THREE from 'three';
import type { SignScene } from './scene.js';

export type ViewName = 'front-elevation' | 'perspective' | 'detail-perspective';

export interface CameraSetup { camera: THREE.Camera; width: number; height: number }

export function makeCamera(sign: SignScene, view: ViewName, width = 1600, height = 1000): CameraSetup {
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  sign.bounds.getSize(size);
  sign.bounds.getCenter(centre);
  const span = Math.max(size.x, size.y, 1);

  if (view === 'front-elevation') {
    // Orthographic: a straight-on elevation must not foreshorten the copy,
    // because the proof carries dimensions off it.
    const aspect = width / height;
    const halfW = (span * 0.62) * Math.max(aspect / (size.x / size.y || aspect), 1);
    const halfH = halfW / aspect;
    // A tight near plane over a long range wastes depth precision on empty
    // space in front of the sign, which is where the striping comes from.
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, span * 2, span * 6);
    cam.position.set(centre.x, centre.y, centre.z + span * 4);
    cam.lookAt(centre);
    return { camera: cam, width, height };
  }

  // A 3/4 view is where a channel letter proof earns its keep: it is the only
  // panel that shows the return depth, the trim cap edge and the standoff gap
  // at once. §9.2 asks for return depth that "reads consistently in perspective
  // at the specified value", and a shallow angle does not read at all — at 20°
  // a 5″ return and a 3″ return look the same.
  const detail = view === 'detail-perspective';
  const cam = new THREE.PerspectiveCamera(detail ? 34 : 42, width / height, span * 0.18, span * 8);

  // Far enough back that the halo has room in frame. Cropped to the letters,
  // a halo render shows glowing edges and no glow.
  const dist = detail ? span * 1.45 : span * 2.1;
  // ~33° off axis. Enough that a 5″ return and a 3″ return look different,
  // shallow enough that the letters do not hide the halo on their far side —
  // at 41° the glow only showed on the near edge.
  const azim = detail ? -0.58 : -0.38;
  const elev = detail ? 0.26 : 0.10;     // above the sign, looking slightly down

  cam.position.set(
    centre.x + Math.sin(azim) * dist,
    centre.y + Math.sin(elev) * dist,
    centre.z + Math.cos(azim) * dist * Math.cos(elev),
  );

  // Aiming a little into the near end frames the depth rather than the width.
  cam.lookAt(detail
    ? new THREE.Vector3(centre.x - size.x * 0.10, centre.y, centre.z)
    : centre);
  return { camera: cam, width, height };
}

/** §9.1 × the panel set a proof carries. */
export interface PanelRequest { view: 'day' | 'night'; camera: ViewName; label: string }

export function panelsFor(views: Array<'day' | 'night'>): PanelRequest[] {
  const out: PanelRequest[] = [];
  for (const v of views) {
    out.push({ view: v, camera: 'front-elevation', label: `${v} · front elevation` });
    out.push({ view: v, camera: 'perspective', label: `${v} · perspective` });
    // Every view gets a 3/4: for the night panel it is the one that shows the
    // halo, the standoff and the return depth together, and for the day panel
    // it is what a customer standing on the footpath would see.
    out.push({ view: v, camera: 'detail-perspective', label: `${v} · construction detail` });
  }
  return out;
}
