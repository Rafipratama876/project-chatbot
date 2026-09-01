/**
 * Recover a camera from a rectangle on the wall.
 *
 * Compositing a flat elevation onto a photograph works while the wall faces the
 * camera. The moment it does not — and most storefront photographs are taken
 * from the footpath, at an angle — a straight-on render pasted onto an angled
 * wall reads as a sticker: the returns run parallel while the wall converges,
 * and §9.2's "return depth reads consistently in perspective at the specified
 * value" is exactly what fails.
 *
 * A homography can warp the sprite to sit on the wall, but it cannot invent the
 * depth: warping a flat image of a 5″ can gives a flat image of a 5″ can. What
 * is needed is to put the three.js camera where the photographer stood, and
 * render the sign from there.
 *
 * That is recoverable from one plane. Given four image points that are the
 * corners of a rectangle of known real size, the homography between them fixes
 * the wall's orientation and distance up to the focal length, and the focal
 * length follows from the rotation being a rotation.
 *
 * Assumes square pixels and the principal point at the image centre. Both hold
 * for an ordinary photograph and neither is worth asking a sign salesperson
 * about.
 */
import type { Pt } from '../domain/spec.js';
import { solveHomography, CalibrationError } from './calibration.js';

export interface PlaneRectangle {
  /** Image points, clockwise from the top-left of the real rectangle. */
  corners: [Pt, Pt, Pt, Pt];
  /** Its real size, in inches. */
  widthInches: number;
  heightInches: number;
}

export interface RecoveredCamera {
  /** Vertical field of view, degrees — for THREE.PerspectiveCamera. */
  fovDeg: number;
  /** Camera position in wall coordinates: x right, y up, z out of the wall. */
  position: [number, number, number];
  /**
   * The camera's own axes, expressed in wall coordinates — what a renderer
   * needs to orient a camera.
   *
   * Not the columns of the world→camera rotation, which is what the recovery
   * produces: those are the WALL's axes seen from the camera. Handing the
   * columns to a renderer transposes the rotation, and the camera ends up
   * pointing somewhere the sign is not.
   */
  basis: { right: [number, number, number]; up: [number, number, number]; forward: [number, number, number] };
  /** How far off the wall normal the camera sits, degrees. 0 is head-on. */
  obliquityDeg: number;
  /**
   * False when the view is too close to head-on for the focal length to be
   * recoverable. The pose is still usable; the fov is a stated assumption.
   */
  focalRecovered: boolean;
}

/** Below this the wall is effectively fronto-parallel and f is ill-conditioned. */
const MIN_VANISHING_TERM = 1e-7;
/** What a phone camera roughly is, for the fronto-parallel fallback. */
const DEFAULT_FOV_DEG = 42;

export function recoverCamera(
  rect: PlaneRectangle,
  imageWidth: number,
  imageHeight: number,
): RecoveredCamera {
  if (rect.widthInches <= 0 || rect.heightInches <= 0) {
    throw new CalibrationError('the reference rectangle needs a real width and height');
  }

  // Wall coordinates: origin at the rectangle's top-left, x right, y DOWN — the
  // same handedness as the image, so the homography is a plain plane-to-plane
  // map. Flipped to y-up at the end, where the scene lives.
  const world: Pt[] = [
    { x: 0, y: 0 },
    { x: rect.widthInches, y: 0 },
    { x: rect.widthInches, y: rect.heightInches },
    { x: 0, y: rect.heightInches },
  ];
  const h = solveHomography(world, [...rect.corners]);

  // Columns of H.
  const h1: V3 = [h[0]!, h[3]!, h[6]!];
  const h2: V3 = [h[1]!, h[4]!, h[7]!];
  const h3: V3 = [h[2]!, h[5]!, 1];

  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  const f = focalFrom(h1, h2, cx, cy);
  const focalRecovered = f !== null;
  const focal = f ?? focalFromFov(DEFAULT_FOV_DEG, imageHeight);

  // K⁻¹ applied to each column gives the rotation columns, up to scale.
  const invK = (v: V3): V3 => [(v[0] - cx * v[2]) / focal, (v[1] - cy * v[2]) / focal, v[2]];

  let r1 = invK(h1);
  let r2 = invK(h2);
  let t = invK(h3);

  // Both rotation columns must be unit length; the homography carries an
  // arbitrary scale, and averaging the two is more stable than trusting either.
  const lambda = (norm(r1) + norm(r2)) / 2;
  if (lambda < 1e-12) throw new CalibrationError('the reference rectangle is degenerate');

  r1 = scale(r1, 1 / lambda);
  r2 = scale(r2, 1 / lambda);
  t = scale(t, 1 / lambda);

  // A homography fixes the pose only up to sign, and which sign is right is
  // not decidable from `t` alone: the wall's z axis points out of the wall
  // toward the viewer while a pinhole camera's z points into the scene, so the
  // frame is left-handed and the usual "is t in front" test picks the wrong
  // branch. The condition that actually matters is stated directly instead —
  // the photographer stood in front of the wall, not inside the building.
  const pose = (sign: 1 | -1) => {
    const [a, b] = orthonormalise(scale(r1, sign), scale(r2, sign));
    const c = cross(a, b);
    const tt = scale(t, sign);
    return { a, b, c, position: scale([dot(a, tt), dot(b, tt), dot(c, tt)], -1) };
  };

  const forwardPose = pose(1);
  const chosen = forwardPose.position[2] > 0 ? forwardPose : pose(-1);
  const [o1, o2, o3] = [chosen.a, chosen.b, chosen.c];
  const camPos = chosen.position;

  const fovDeg = focalRecovered ? fovFromFocal(focal, imageHeight) : DEFAULT_FOV_DEG;
  const obliquity = Math.acos(Math.min(1, Math.abs(o3[2]))) * (180 / Math.PI);

  // R maps world → camera with o1, o2, o3 as its COLUMNS, so the camera's own
  // axes in world coordinates are its ROWS.
  const rows: [V3, V3, V3] = [
    [o1[0], o2[0], o3[0]],
    [o1[1], o2[1], o3[1]],
    [o1[2], o2[2], o3[2]],
  ];

  // Flip y: the wall rectangle was measured y-down, the scene is y-up. A row
  // gains a sign on its y COMPONENT; the "up" axis additionally reverses,
  // because up in a y-down frame is down in a y-up one.
  const flipY = (v: V3): [number, number, number] => [v[0], -v[1], v[2]];
  const negate = (v: [number, number, number]): [number, number, number] => [-v[0], -v[1], -v[2]];

  const position = flipY(camPos);
  let up = negate(flipY(rows[1]));
  let forward = flipY(rows[2]);

  // Two axes, each pinned to a fact about the scene rather than to which
  // negations survive the frame changes. The wall frame is y-down, the scene is
  // y-up, and a pinhole camera's z points into the scene while the wall's
  // points out of it; reasoning about the resulting signs went wrong three
  // times, each time invisibly — every axis individually correct, the frame as
  // a whole mirrored.
  //
  // 1. The wall is in front of the camera.
  const toWall: V3 = [
    rect.widthInches / 2 - position[0],
    -rect.heightInches / 2 - position[1],
    -position[2],
  ];
  if (dot(forward as V3, toWall) < 0) forward = negate(forward);

  // 2. The photographer was not upside down. A genuinely inverted photograph is
  //    not something a storefront proof needs to support.
  if (up[1] < 0) up = negate(up);

  // The third axis is then derived, not carried through the flips: image-right
  // is fixed once the view direction and the vertical are. Tracking it
  // separately is what produced a basis whose axes were each right and whose
  // handedness was not.
  const right = normalise(cross(forward as V3, up as V3));

  return {
    fovDeg,
    position,
    basis: { right: [right[0], right[1], right[2]], up, forward },
    obliquityDeg: obliquity,
    focalRecovered,
  };
}

/**
 * Focal length from the two rotation columns.
 *
 * r1 and r2 are perpendicular unit vectors, so K⁻ᵀK⁻¹ applied across h1 and h2
 * must vanish. With the principal point fixed, that leaves one equation in f².
 * It degenerates as the wall approaches fronto-parallel — the term that carries
 * the information is the one that goes to zero — so this returns null there
 * rather than a huge or imaginary number.
 */
function focalFrom(h1: V3, h2: V3, cx: number, cy: number): number | null {
  const denom = h1[2] * h2[2];
  if (Math.abs(denom) < MIN_VANISHING_TERM) return null;

  const numerator =
    h1[0] * h2[0] + h1[1] * h2[1]
    - cx * (h1[0] * h2[2] + h1[2] * h2[0])
    - cy * (h1[1] * h2[2] + h1[2] * h2[1])
    + (cx * cx + cy * cy) * denom;

  const fSquared = -numerator / denom;
  if (!Number.isFinite(fSquared) || fSquared <= 0) return null;
  return Math.sqrt(fSquared);
}

const focalFromFov = (fovDeg: number, imageHeight: number): number =>
  imageHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));

const fovFromFocal = (focal: number, imageHeight: number): number =>
  (2 * Math.atan(imageHeight / (2 * focal)) * 180) / Math.PI;

// ── Small vector helpers ───────────────────────────────────────────────────

type V3 = [number, number, number];

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): number => Math.sqrt(dot(a, a));
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Two unit vectors that are exactly perpendicular, as close as possible to the
 * pair given.
 *
 * The symmetric step splits the error between them rather than holding one
 * fixed and correcting the other — from four hand-placed clicks neither is more
 * trustworthy. It is first-order, though, and on a 5 px jitter it leaves about
 * 1e-4 of skew; a basis that is not quite a rotation shears the whole render,
 * so a strict pass follows to take the residual to machine precision.
 */
function orthonormalise(a: V3, b: V3): [V3, V3] {
  const skew = dot(a, b) / 2;
  const aRaw = sub(a, scale(b, skew));
  const bRaw = sub(b, scale(a, skew));
  const a2 = normalise(aRaw);

  const b2 = normalise(sub(bRaw, scale(a2, dot(a2, bRaw))));
  return [a2, b2];
}

const normalise = (v: V3): V3 => scale(v, 1 / Math.max(norm(v), 1e-12));
