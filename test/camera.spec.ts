/**
 * Camera recovery is tested by round trip: take a camera whose pose we chose,
 * project a rectangle through it, hand only the four image points back, and
 * check what comes out is the camera we started with.
 *
 * Anything less is testing that the code runs.
 */
import { describe, it, expect } from 'vitest';
import { recoverCamera, type PlaneRectangle } from '#/kb/geometry/cameraFromPlane.js';
import { CalibrationError } from '#/kb/geometry/calibration.js';
import type { Pt } from '#/kb/domain/spec.js';

const W = 1600;
const H = 1000;

/**
 * Project the corners of a wall rectangle through a camera at `yawDeg` off the
 * wall normal, `distance` inches away, with the given vertical field of view.
 * Wall coordinates are y-down, matching how `recoverCamera` reads them.
 */
function project(
  rect: { w: number; h: number },
  yawDeg: number,
  pitchDeg: number,
  distance: number,
  fovDeg: number,
): [Pt, Pt, Pt, Pt] {
  const focal = H / (2 * Math.tan((fovDeg * Math.PI) / 360));
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;

  // Camera sits off the wall normal, aimed at the rectangle's centre.
  const centre = [rect.w / 2, rect.h / 2, 0];
  // Pitch positive means the camera is ABOVE the wall's centre; the world is
  // y-down, so above is a smaller y.
  const eye = [
    centre[0]! + Math.sin(yaw) * Math.cos(pitch) * distance,
    centre[1]! - Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance,
  ];

  // Camera basis. The world is y-DOWN and so is the image, so the second axis
  // is "down", not "up" — building it from an up vector mirrors the projection
  // vertically, and a helper that models the projection wrongly will happily
  // certify code that is wrong the same way.
  const forward = normalise([centre[0]! - eye[0]!, centre[1]! - eye[1]!, centre[2]! - eye[2]!]);
  const worldDown: V = [0, 1, 0];
  // Derived from the square-on case, where the answer is not open to
  // interpretation: camera at (0,0,d), forward (0,0,-1), world y-down. Image
  // right must be world +x and image down must be world +y.
  //   cross(forward, worldDown) = (1,0,0)  ✓ right
  //   cross(camRight, forward)  = (0,1,0)  ✓ down
  const camRight = normalise(cross(forward, worldDown));
  const camDown = cross(camRight, forward);

  const corners: Array<[number, number, number]> = [
    [0, 0, 0], [rect.w, 0, 0], [rect.w, rect.h, 0], [0, rect.h, 0],
  ];

  return corners.map(([x, y, z]) => {
    const d: V = [x - eye[0]!, y - eye[1]!, z - eye[2]!];
    return {
      x: W / 2 + (focal * dot(d, camRight)) / dot(d, forward),
      y: H / 2 + (focal * dot(d, camDown)) / dot(d, forward),
    };
  }) as [Pt, Pt, Pt, Pt];
}

type V = [number, number, number];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: V): V => {
  const n = Math.sqrt(dot(a, a)) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

const rect = (corners: [Pt, Pt, Pt, Pt]): PlaneRectangle => ({
  corners, widthInches: 52, heightInches: 96,
});

/**
 * The helper checks itself before anything uses it.
 *
 * Twice now a sign error in this projection has gone unnoticed, because the
 * recovery mirrors the same axis back and every assertion downstream passes in
 * the mirrored frame. A helper that models the projection wrongly certifies
 * code that is wrong the same way, so the orientation is pinned here against
 * cases whose answer is not open to interpretation.
 */
describe('the test projection itself', () => {
  it('puts a point to the right of centre on the right of the image', () => {
    // Camera square to the wall: a point at larger wall x must land at larger
    // image x. If this mirrors, everything built on it mirrors with it.
    const [topLeft, topRight] = project({ w: 52, h: 96 }, 0, 0, 400, 42);
    expect(topRight!.x).toBeGreaterThan(topLeft!.x);
  });

  it('puts the top of the wall above its bottom', () => {
    const [topLeft, , , bottomLeft] = project({ w: 52, h: 96 }, 0, 0, 400, 42);
    expect(topLeft!.y).toBeLessThan(bottomLeft!.y);
  });

  it('narrows the wall when the camera moves off axis', () => {
    // The helper aims at the rectangle's centre, so the wall stays centred
    // whatever the yaw — what changes is how much of the image it spans.
    const square = project({ w: 52, h: 96 }, 0, 0, 400, 42);
    const oblique = project({ w: 52, h: 96 }, 35, 0, 400, 42);
    const span = (pts: Pt[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(span(oblique)).toBeLessThan(span(square));
  });

  it('the near edge is larger than the far edge', () => {
    // Seen from the right, the wall's right-hand edge is nearer and so taller.
    const [tl, tr, br, bl] = project({ w: 52, h: 96 }, 32, 0, 380, 42);
    const leftHeight = bl!.y - tl!.y;
    const rightHeight = br!.y - tr!.y;
    expect(rightHeight).toBeGreaterThan(leftHeight);
  });
});

describe('camera recovery from a wall rectangle', () => {
  it('recovers the field of view of an angled view', () => {
    const corners = project({ w: 52, h: 96 }, 32, 6, 340, 42);
    const cam = recoverCamera(rect(corners), W, H);

    expect(cam.focalRecovered).toBe(true);
    expect(cam.fovDeg).toBeGreaterThan(38);
    expect(cam.fovDeg).toBeLessThan(46);
  });

  it('recovers how far off the wall normal the camera was', () => {
    for (const yaw of [15, 25, 40]) {
      const cam = recoverCamera(rect(project({ w: 52, h: 96 }, yaw, 4, 320, 42)), W, H);
      // Obliquity combines yaw and pitch, so it should sit just above the yaw.
      expect(cam.obliquityDeg).toBeGreaterThan(yaw - 6);
      expect(cam.obliquityDeg).toBeLessThan(yaw + 8);
    }
  });

  it('recovers the distance to the wall', () => {
    const cam = recoverCamera(rect(project({ w: 52, h: 96 }, 30, 5, 400, 42)), W, H);
    const distance = Math.hypot(...cam.position);
    expect(distance).toBeGreaterThan(340);
    expect(distance).toBeLessThan(460);
  });

  it('recovers which side the camera stood on', () => {
    // Mirroring the sign of the yaw must mirror the recovered position, or the
    // sign is composited onto the wrong side of the building.
    const left = recoverCamera(rect(project({ w: 52, h: 96 }, -30, 4, 340, 42)), W, H);
    const right = recoverCamera(rect(project({ w: 52, h: 96 }, 30, 4, 340, 42)), W, H);
    expect(Math.sign(left.position[0])).not.toBe(Math.sign(right.position[0]));
  });

  it('recovers whether the camera was above or below', () => {
    const above = recoverCamera(rect(project({ w: 52, h: 96 }, 25, 12, 340, 42)), W, H);
    const below = recoverCamera(rect(project({ w: 52, h: 96 }, 25, -12, 340, 42)), W, H);
    // The wall rectangle is measured y-down from its top-left and the recovered
    // position is y-up, so a camera above the centre sits at a larger y.
    expect(above.position[1]).toBeGreaterThan(below.position[1]);
  });

  it('puts the camera in front of the wall, never behind it', () => {
    for (const yaw of [-35, -10, 10, 35]) {
      const cam = recoverCamera(rect(project({ w: 52, h: 96 }, yaw, 3, 300, 42)), W, H);
      expect(cam.position[2]).toBeGreaterThan(0);
    }
  });

  it('says so when the wall is head-on, instead of inventing a focal length', () => {
    // Fronto-parallel: the term the focal length is recovered from vanishes.
    // Most storefront photos taken square to the building land here, and a
    // huge or imaginary f would swing the whole composite.
    const cam = recoverCamera(rect(project({ w: 52, h: 96 }, 0, 0, 320, 42)), W, H);
    expect(cam.focalRecovered).toBe(false);
    expect(cam.obliquityDeg).toBeLessThan(3);
    // The pose is still usable; the fov is a stated assumption.
    expect(cam.position[2]).toBeGreaterThan(0);
  });

  it('returns an orthonormal basis even from imperfect corners', () => {
    // Four clicks are never exactly a projected rectangle.
    const clean = project({ w: 52, h: 96 }, 28, 6, 330, 42);
    const jittered = clean.map((p, i) => ({
      x: p.x + (i % 2 ? 2.5 : -2.5),
      y: p.y + (i < 2 ? 2 : -2),
    })) as [Pt, Pt, Pt, Pt];

    const { basis } = recoverCamera(rect(jittered), W, H);
    const len = (v: number[]) => Math.hypot(...v);
    expect(len(basis.right)).toBeCloseTo(1, 6);
    expect(len(basis.up)).toBeCloseTo(1, 6);
    expect(len(basis.forward)).toBeCloseTo(1, 6);

    const perp = basis.right[0] * basis.up[0] + basis.right[1] * basis.up[1] + basis.right[2] * basis.up[2];
    expect(Math.abs(perp)).toBeLessThan(1e-6);
  });

  it('the recovered camera reprojects the rectangle back where it came from', () => {
    // The decisive test, and the one the others were standing in for: build a
    // camera from what came back, project the wall rectangle through it, and
    // check the corners land on the image points we started with.
    //
    // Every earlier assertion here — fov, distance, obliquity, orthonormality —
    // passed while `basis` returned the ROWS of the rotation transposed, which
    // pointed the camera away from the sign entirely.
    const rectSize = { w: 52, h: 96 };
    const corners = project(rectSize, 31, 7, 380, 40);
    const cam = recoverCamera(rect(corners), W, H);

    // Camera axes in wall coordinates, y-up.
    const { right, up, forward } = cam.basis;
    const eye = cam.position;
    const focal = H / (2 * Math.tan((cam.fovDeg * Math.PI) / 360));

    const world: Array<[number, number]> = [
      [0, 0], [rectSize.w, 0], [rectSize.w, rectSize.h], [0, rectSize.h],
    ];

    world.forEach(([wx, wy], i) => {
      // Wall points are y-down; the camera frame is y-up.
      const d: V = [wx - eye[0], -wy - eye[1], 0 - eye[2]];
      const z = dot(d, forward as V);
      expect(z, 'the rectangle must be in front of the camera').toBeGreaterThan(0);

      const px = W / 2 + (focal * dot(d, right as V)) / z;
      // Image y grows downward, the camera's up axis grows upward.
      const py = H / 2 - (focal * dot(d, up as V)) / z;

      expect(px).toBeCloseTo(corners[i]!.x, 0);
      expect(py).toBeCloseTo(corners[i]!.y, 0);
    });
  });

  it('rejects a rectangle with no size rather than dividing by zero', () => {
    const corners = project({ w: 52, h: 96 }, 20, 0, 300, 42);
    expect(() => recoverCamera({ corners, widthInches: 0, heightInches: 96 }, W, H))
      .toThrow(CalibrationError);
  });

  it('rejects four collinear clicks', () => {
    const line: [Pt, Pt, Pt, Pt] = [
      { x: 100, y: 500 }, { x: 300, y: 500 }, { x: 500, y: 500 }, { x: 700, y: 500 },
    ];
    expect(() => recoverCamera(rect(line), W, H)).toThrow(CalibrationError);
  });
});
