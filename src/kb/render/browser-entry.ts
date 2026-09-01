/**
 * Browser half of the renderer. Bundled at runtime and injected into a headless
 * page — WebGL needs a real GL context, and a browser is the least surprising
 * way to get one on any machine.
 *
 * It receives the finished SignSpec and makes no decisions: geometry, depths,
 * colours, the view list and the placement all arrive resolved by the rule
 * engine.
 */
import * as THREE from 'three';
import type { SignSpec } from '../domain/spec.js';
import { buildSignScene, type SceneMode } from './scene.js';
import { makeCamera, panelsFor, type PanelRequest } from './views.js';
import {
  calibrate, fitArtwork, anchorPx, artworkExtent, solveHomography, applyHomography,
} from '../geometry/calibration.js';
import { recoverCamera, type RecoveredCamera } from '../geometry/cameraFromPlane.js';
import { panelGround, groundNote } from './panelPlan.js';

export interface RenderedPanel {
  label: string;
  view: 'day' | 'night';
  camera: string;
  dataUrl: string;
  /** Set when the panel could not use the photograph, saying why. */
  note?: string | null;
}
export interface RenderOptions { width?: number; height?: number }

declare global {
  interface Window {
    __renderSign?: (spec: SignSpec, opts?: RenderOptions) => Promise<RenderedPanel[]>;
  }
}

async function render(spec: SignSpec, opts: RenderOptions = {}): Promise<RenderedPanel[]> {
  const width = opts.width ?? 1600;
  const height = opts.height ?? 1000;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, preserveDrawingBuffer: true, alpha: true,
  });
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const photo = spec.placement ? await loadImage(spec.placement.backgroundImage) : null;
  const mode: SceneMode = photo ? 'composite' : 'studio';

  // When the customer marked a rectangle on the wall, the camera can be put
  // where the photographer stood and the sign rendered from there — so the
  // returns converge with the building instead of running parallel across it.
  const matched = photo && spec.placement?.facadeRect
    ? recoverCamera(
        {
          corners: spec.placement.facadeRect.corners as never,
          widthInches: spec.placement.facadeRect.widthInches,
          heightInches: spec.placement.facadeRect.heightInches,
        },
        spec.placement.imageWidth,
        spec.placement.imageHeight,
      )
    : null;

  const sign = buildSignScene(spec, mode);
  const panels: RenderedPanel[] = [];

  for (const p of panelsFor(sign.contract.views) as PanelRequest[]) {
    sign.setView(p.view);
    renderer.toneMappingExposure = p.view === 'night' ? 1.35 : 1.0;

    // Both views go on the customer's building where the photograph supports
    // it. A night panel rendered in a studio answers a different question from
    // the day panel beside it, and a proof whose two halves are of different
    // places is harder to read than one whose halves match.
    const ground = panelGround({
      camera: p.camera,
      hasPhoto: photo !== null,
      obliquityDeg: matched?.obliquityDeg ?? null,
    });
    const composite = ground.composite;

    // The surface follows the panel, not the job. Left as a shadow catcher for
    // a studio panel, a halo would wash across nothing and a rear-illuminated
    // sign would render as a dark shape at night.
    sign.setSurface(composite ? 'composite' : 'studio');

    let camera: THREE.Camera;
    let sprite: { inchesAcross: number } | null = null;
    let crop: { x: number; y: number; w: number; h: number } | null = null;

    if (composite && matched && spec.placement) {
      // Rendered straight into the photograph's own frame: no sprite, no
      // scaling, no paste. The sign lands where the geometry says it lands.
      crop = p.camera === 'detail-perspective' ? detailCrop(spec) : null;
      camera = matchedCamera(
        matched, spec, spec.placement.imageWidth / spec.placement.imageHeight, crop ?? undefined,
      );
    } else if (composite) {
      // No wall rectangle, so assume the wall faces the camera and place a
      // flat sprite at the calibrated size.
      const framed = placementCamera(sign, width, height);
      camera = framed.camera;
      sprite = framed;
    } else {
      camera = makeCamera(sign, p.camera, width, height).camera;
    }

    renderer.render(sign.scene, camera);

    panels.push({
      label: p.label,
      view: p.view,
      camera: p.camera,
      note: groundNote(ground.reason),
      dataUrl: composite && photo
        ? compositeOnPhoto(canvas, photo, spec, p.view, sprite?.inchesAcross ?? null, crop)
        : flattenOnto(canvas, p.view === 'night' ? '#0a0d12' : '#bcc7d1'),
    });
  }

  sign.dispose();
  renderer.dispose();
  return panels;
}

/**
 * An orthographic camera framing exactly the sign's own extent, so one world
 * inch maps to a known number of canvas pixels and the composite can place the
 * result at the calibrated scale without guessing.
 */
function placementCamera(
  sign: ReturnType<typeof buildSignScene>,
  width: number,
  height: number,
): { camera: THREE.OrthographicCamera; inchesAcross: number } {
  const box = sign.bounds;
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);

  // Margin for the halo and the cast shadow, which extend past the letters.
  const margin = Math.max(size.x, size.y) * 0.35 + 6;
  const inchesAcross = size.x + margin * 2;
  const inchesDown = inchesAcross * (height / width);

  const cam = new THREE.OrthographicCamera(
    -inchesAcross / 2, inchesAcross / 2,
    inchesDown / 2, -inchesDown / 2,
    0.1, Math.max(size.z, 1) * 40 + 200,
  );
  cam.position.set(centre.x, centre.y, centre.z + Math.max(size.z, 1) * 20 + 100);
  cam.lookAt(centre.x, centre.y, centre.z);
  return { camera: cam, inchesAcross };
}

/**
 * A camera standing where the photographer stood.
 *
 * The recovered pose is in wall coordinates whose origin is the marked
 * rectangle's top-left corner. The scene is built around the artwork's own
 * origin, so the camera is shifted by the difference rather than the scene
 * being moved — translating the scene would move the wall plane and the shadow
 * catcher with it.
 *
 * Where the sign sits on the wall comes from mapping the placement box back
 * through the homography. Converting pixels to inches with the flat scale would
 * be wrong here: on an angled wall a pixel near the far end is worth more
 * inches than one near the camera, which is the whole reason this path exists.
 */
function matchedCamera(
  recovered: RecoveredCamera,
  spec: SignSpec,
  aspect: number,
  /** Sub-rectangle of the photo to render, for a zoomed detail panel. */
  crop?: { x: number; y: number; w: number; h: number },
): THREE.PerspectiveCamera {
  const placement = spec.placement!;
  const facade = placement.facadeRect!;

  const world = [
    { x: 0, y: 0 },
    { x: facade.widthInches, y: 0 },
    { x: facade.widthInches, y: facade.heightInches },
    { x: 0, y: facade.heightInches },
  ];
  // Swapping the arguments gives the inverse map, image → wall.
  const toWall = solveHomography(facade.corners as never, world);
  const centrePx = {
    x: placement.rect.x + placement.rect.w / 2,
    y: placement.rect.y + placement.rect.h / 2,
  };
  const onWall = applyHomography(toWall, centrePx);

  const camera = new THREE.PerspectiveCamera(recovered.fovDeg, aspect, 1, 20000);

  // Wall coordinates are y-down from the rectangle's top-left; the scene is
  // y-up from the sign's own origin.
  const signCentre = { x: spec.overall.w / 2, y: spec.overall.h / 2 };
  const offsetX = onWall.x - signCentre.x;
  const offsetY = -onWall.y - signCentre.y;

  camera.position.set(
    recovered.position[0] - offsetX,
    recovered.position[1] - offsetY,
    recovered.position[2],
  );

  // Oriented with lookAt rather than by assembling the basis into a matrix.
  // The recovered axes are correct as IMAGE axes — x right, y up, z toward the
  // wall — and that set is left-handed with respect to a three.js camera, whose
  // z points out of the screen. Feeding it to makeBasis produced a rotation
  // that pointed the camera away from the sign while every axis was
  // individually right. lookAt derives the handedness itself.
  const { up, forward } = recovered.basis;
  camera.up.set(up[0], up[1], up[2]);
  camera.lookAt(
    camera.position.x + forward[0],
    camera.position.y + forward[1],
    camera.position.z + forward[2],
  );

  // Matching the photograph fixes the camera: there is exactly one viewpoint
  // that reproduces it, so a "closer 3/4" cannot be a different angle — it has
  // to be the same view, cropped. `setViewOffset` renders a sub-rectangle of
  // the same frustum, so cropping the photograph to the same rectangle keeps
  // the two in register down to the pixel.
  if (crop) {
    camera.setViewOffset(
      placement.imageWidth, placement.imageHeight,
      crop.x, crop.y, crop.w, crop.h,
    );
  }

  camera.updateProjectionMatrix();
  return camera;
}

/**
 * A crop around the sign, for the detail panel.
 *
 * Wide enough that the halo and the surrounding wall stay in frame — a detail
 * cropped to the letters shows glowing edges and no glow.
 */
function detailCrop(
  spec: SignSpec,
): { x: number; y: number; w: number; h: number } {
  const p = spec.placement!;
  const aspect = p.imageWidth / p.imageHeight;

  const margin = Math.max(p.rect.w, p.rect.h) * 0.85;
  let w = p.rect.w + margin * 2;
  let h = w / aspect;
  if (h < p.rect.h + margin * 2) {
    h = p.rect.h + margin * 2;
    w = h * aspect;
  }

  // Kept inside the photograph: a crop running off the edge would render wall
  // the photograph does not have.
  w = Math.min(w, p.imageWidth);
  h = Math.min(h, p.imageHeight);
  const cx = p.rect.x + p.rect.w / 2;
  const cy = p.rect.y + p.rect.h / 2;

  return {
    x: Math.max(0, Math.min(p.imageWidth - w, cx - w / 2)),
    y: Math.max(0, Math.min(p.imageHeight - h, cy - h / 2)),
    w, h,
  };
}

/**
 * Draws the photograph, then the sign over it.
 *
 * With a matched camera the render is already in the photograph's own frame, so
 * this is a straight overlay. Without one, the sign was drawn straight-on and
 * is placed as a sprite at the size the calibration says it occupies.
 */
function compositeOnPhoto(
  signCanvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  spec: SignSpec,
  view: 'day' | 'night',
  /** World inches the sprite spans, or null when the camera was matched. */
  inchesAcross: number | null,
  /** Sub-rectangle of the photo the camera rendered, for a detail panel. */
  crop: { x: number; y: number; w: number; h: number } | null = null,
): string {
  const p = spec.placement!;
  const out = document.createElement('canvas');

  if (crop) {
    // Output at a usable size rather than at the crop's own pixel count: a
    // detail cut from a 1600 px photograph is only ~300 px across, and the
    // sign — which is rendered, not photographed — can be drawn at any
    // resolution. The photograph upscales and looks soft, which is what a crop
    // of a photograph honestly is.
    const target = Math.min(1400, p.imageWidth);
    out.width = target;
    out.height = Math.round((crop.h / crop.w) * target);
  } else {
    out.width = p.imageWidth;
    out.height = p.imageHeight;
  }
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';

  if (crop) {
    ctx.drawImage(photo, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  } else {
    ctx.drawImage(photo, 0, 0, out.width, out.height);
  }

  // At night the building is not lit by the sun any more. Darkening the
  // photograph is the difference between "an illuminated sign" and "a bright
  // rectangle stuck on a daylight photo".
  if (view === 'night') {
    ctx.fillStyle = 'rgba(6,9,14,0.78)';
    ctx.fillRect(0, 0, out.width, out.height);
  }

  if (inchesAcross === null) {
    ctx.drawImage(signCanvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  const cal = calibrate(
    { a: p.reference.a, b: p.reference.b, inches: p.reference.inches, label: p.reference.label },
    p.imageWidth, p.imageHeight,
  );
  const placement = { calibration: cal, rect: p.rect };

  // The artwork reaching the renderer has already been scaled to the fitted
  // size by intake, so the sign's own extent IS the fitted extent. Re-fitting
  // here only recovers where the box centres it.
  const fit = fitArtwork(artworkExtent(spec.elements), placement);
  const ppi = cal.pixelsPerInch;

  const spriteW = inchesAcross * ppi;
  const spriteH = spriteW * (signCanvas.height / signCanvas.width);

  const anchor = anchorPx(fit, placement);
  const cx = anchor.x + (fit.width * ppi) / 2;
  const cy = anchor.y - (fit.height * ppi) / 2;

  ctx.drawImage(signCanvas, cx - spriteW / 2, cy - spriteH / 2, spriteW, spriteH);
  return out.toDataURL('image/png');
}

/** Studio panels still need an opaque background under the alpha buffer. */
function flattenOnto(canvas: HTMLCanvasElement, background: string): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('background image failed to load'));
    img.src = src;
  });
}

window.__renderSign = render;
export { render };
