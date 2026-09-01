/**
 * A marked wall face must not contradict its own pixels.
 *
 * The bug: a wall marked as the whole of an 848 x 522 photograph was declared
 * 240" x 120". For a rectangle in the image with square pixels that is
 * impossible — 240" across those pixels is 147.8" tall. Nothing failed. The
 * placement homography used one wall and the renderer's recovered camera used
 * another, and the sign rendered 53 px right, 29 px up and 12% too large, with
 * no error and nothing on the proof to say so.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isRectangularInImage, impliedHeightInches, imageToWall, applyHomography,
} from '#/kb/geometry/homography.js';
import { recoverCamera } from '#/kb/geometry/cameraFromPlane.js';
import { resolveFacade, signSize, type DesignLike } from '#/modules/designs/job-from-design.js';

/** The user's actual job. */
const PHOTO = { w: 848, h: 522 };
const SQUARE_ON = [
  { x: 0, y: 0 }, { x: 847.7, y: 0 }, { x: 847.7, y: 522 }, { x: 0, y: 522 },
];
const OBLIQUE = [
  { x: 200, y: 180 }, { x: 1350, y: 320 }, { x: 1350, y: 760 }, { x: 200, y: 900 },
];

describe('is the marked quad a rectangle in the photograph', () => {
  it('recognises a square-on wall', () => {
    expect(isRectangularInImage(SQUARE_ON)).toBe(true);
  });

  it('recognises a wall shot at an angle', () => {
    expect(isRectangularInImage(OBLIQUE)).toBe(false);
  });

  it('a parallelogram is not a rectangle — its aspect is not recoverable either', () => {
    // Opposite edges parallel but the corners are not square. The pixels do
    // not determine the real aspect here any more than for a perspective view.
    const sheared = [
      { x: 100, y: 100 }, { x: 900, y: 100 }, { x: 1000, y: 600 }, { x: 200, y: 600 },
    ];
    expect(isRectangularInImage(sheared)).toBe(false);
  });
});

describe('the implied height', () => {
  it('is the one the pixels already fix, for a square-on wall', () => {
    expect(impliedHeightInches(SQUARE_ON, 240)).toBeCloseTo(147.79, 1);
  });

  it('scales with the stated width', () => {
    expect(impliedHeightInches(SQUARE_ON, 480)).toBeCloseTo(295.58, 1);
  });

  it('is null when the wall has perspective — there the pixels say nothing', () => {
    // Deriving one anyway measurably made placement WORSE on this quad, which
    // is why this returns null instead of guessing.
    expect(impliedHeightInches(OBLIQUE, 480)).toBeNull();
  });
});

describe('resolveFacade', () => {
  it('overrules a height the pixels contradict', () => {
    const fixed = resolveFacade({ corners: SQUARE_ON, widthInches: 240, heightInches: 120 });
    expect(fixed.heightInches).toBeCloseTo(147.79, 1);
  });

  it('leaves a consistent height alone', () => {
    const fixed = resolveFacade({ corners: SQUARE_ON, widthInches: 240, heightInches: 147.79 });
    expect(fixed.heightInches).toBe(147.79);
  });

  it('never touches an angled wall — the typed height is the only source there', () => {
    const fixed = resolveFacade({ corners: OBLIQUE, widthInches: 480, heightInches: 200 });
    expect(fixed.heightInches).toBe(200);
  });
});

/**
 * The check that actually matters: does the sign land where it was dragged?
 *
 * This reproduces the renderer's own camera placement and projects the sign's
 * centre back into the photograph. Testing `resolveFacade` alone would not
 * catch a regression in the camera maths that puts the sign elsewhere.
 */
function placementErrorPx(
  facade: { corners: Array<{ x: number; y: number }>; widthInches: number; heightInches: number },
  rect: { x: number; y: number; w: number; h: number },
  sign: { w: number; h: number },
  image: { w: number; h: number },
): { dx: number; dy: number } {
  const recovered = recoverCamera(facade as never, image.w, image.h);
  const centrePx = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const onWall = applyHomography(imageToWall(facade), centrePx);

  const camera = new THREE.PerspectiveCamera(recovered.fovDeg, image.w / image.h, 1, 20000);
  const signCentre = { x: sign.w / 2, y: sign.h / 2 };
  camera.position.set(
    recovered.position[0] - (onWall.x - signCentre.x),
    recovered.position[1] - (-onWall.y - signCentre.y),
    recovered.position[2],
  );
  const { up, forward } = recovered.basis;
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(
    camera.position.x + forward[0],
    camera.position.y + forward[1],
    camera.position.z + forward[2],
  );
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const projected = new THREE.Vector3(signCentre.x, signCentre.y, 0).project(camera);
  return {
    dx: (projected.x * 0.5 + 0.5) * image.w - centrePx.x,
    dy: (-projected.y * 0.5 + 0.5) * image.h - centrePx.y,
  };
}

describe('the sign lands where it was dragged', () => {
  const rect = { x: 397.8, y: 281.9, w: 125.0, h: 49.3 };
  const sign = { w: 35.42, h: 11.34 };

  it('the reported job: 53 px right and 29 px up, before the fix', () => {
    // Pinned so the regression is recognisable if it ever returns.
    const broken = { corners: SQUARE_ON, widthInches: 240, heightInches: 120 };
    const error = placementErrorPx(broken, rect, sign, PHOTO);
    expect(error.dx).toBeGreaterThan(40);
    expect(error.dy).toBeLessThan(-20);
  });

  it('the same job, once the face is reconciled: exact', () => {
    const fixed = resolveFacade({ corners: SQUARE_ON, widthInches: 240, heightInches: 120 });
    const error = placementErrorPx(fixed, rect, sign, PHOTO);
    expect(Math.abs(error.dx)).toBeLessThan(0.5);
    expect(Math.abs(error.dy)).toBeLessThan(0.5);
  });

  it('an angled wall places within a few pixels', () => {
    const facade = { corners: OBLIQUE, widthInches: 480, heightInches: 200 };
    const error = placementErrorPx(
      resolveFacade(facade),
      { x: 600, y: 420, w: 300, h: 90 },
      { w: 100, h: 30 },
      { w: 1600, h: 1000 },
    );
    // Not exact: the recovered focal length is a fit, not a measurement. A few
    // pixels on a 1600 px photograph is below what anyone can see; tens are not.
    expect(Math.hypot(error.dx, error.dy)).toBeLessThan(8);
  });
});

describe('the measured sign size uses the reconciled face', () => {
  const base: DesignLike = {
    id: 'd', name: 'n', logoText: 'N',
    positionX: 0.543, positionY: 0.5871, scale: 0.1475, scaleY: 0.0945,
    widthInches: 35.42, heightInches: 11.34,
    maxSignAreaAllowed: null,
    wallImageWidth: 848, wallImageHeight: 522,
    facadeRect: { corners: SQUARE_ON, widthInches: 240, heightInches: 120 },
    spec: { channelLetterType: 'Front Lit', installationMethod: 'Flush Mounted' },
  };

  it('reports the height against the corrected wall, not the impossible one', () => {
    // 0.0945 x 522 px = 49.3 px, over a wall that is really 147.79" tall.
    const size = signSize(base);
    expect(size.heightInches).toBeCloseTo(49.33 / (522 / 147.79), 1);
  });

  it('the width is unaffected — only the height was contradictory', () => {
    expect(signSize(base).widthInches).toBeCloseTo(35.4, 1);
  });
});
