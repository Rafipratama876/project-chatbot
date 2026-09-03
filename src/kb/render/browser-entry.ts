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
import { buildSignScene, isHaloGround, type SceneMode } from './scene.js';
import { makeCamera, panelsFor, type PanelRequest, type ViewName } from './views.js';
import {
  calibrate, fitArtwork, anchorPx, artworkExtent, solveHomography, applyHomography,
} from '../geometry/calibration.js';
import { recoverCamera, type RecoveredCamera } from '../geometry/cameraFromPlane.js';
import { panelGround, groundNote } from './panelPlan.js';
import { buildEnvironment } from './environment.js';
import {
  contactOcclusion, lightSpill, integrate, applySpill, measureIlluminant, temper,
  vignette, blur, luma,
} from './integrate.js';

export interface RenderedPanel {
  label: string;
  view: 'day' | 'night';
  camera: string;
  dataUrl: string;
  /** Set when the panel could not use the photograph, saying why. */
  note?: string | null;
  /**
   * The same panel as two pictures instead of one: the customer's photograph
   * framed exactly as this panel frames it, and the sign alone on transparency
   * in its place on that frame. Only for a panel that sits on a photograph,
   * and only when asked for — see `RenderOptions.layers`.
   */
  layers?: { background: string; sign: string } | null;
  /** What a generative pass may touch in this panel. See `render/protect.ts`. */
  protection?: {
    /** The whole frame is the customer's site, so none of it is decoration. */
    onPhotograph: boolean;
    /**
     * Greyscale PNG of everything the renderer drew — the sign AND the
     * mounting surface, both of which are specified. Null when not needed.
     */
    coverageUrl: string | null;
    /**
     * Greyscale PNG of CL-P-01 alone — the copy/logo face, per its own colour
     * breaks. Tighter than `coverageUrl`: a model may repaint the returns,
     * trim cap, backer and mounting surface for material and light, as long
     * as it leaves this silhouette's pixels alone. Null on a photograph panel
     * and wherever the render did not compute it.
     */
    logoCoverageUrl: string | null;
  };
}
export interface RenderOptions {
  width?: number;
  height?: number;
  /**
   * Also return each photograph panel as a background and a sign layer.
   *
   * For the layered night pass: only the background goes to a generative
   * model, and the sign is composited back over it here. Off by default —
   * it costs a second read of every composite panel.
   */
  layers?: boolean;
}

declare global {
  interface Window {
    __renderSign?: (spec: SignSpec, opts?: RenderOptions) => Promise<RenderedPanel[]>;
    __renderSignLayer?: (
      spec: SignSpec,
      opts: { width: number; height: number; view: 'day' | 'night' },
    ) => Promise<string>;
    __renderLayers?: (
      spec: SignSpec,
      opts: {
        width: number; height: number; view: 'day' | 'night'; camera?: ViewName;
        /** Light measured off the finished ground, so the sign agrees with it. */
        illuminant?: { r: number; g: number; b: number };
        /** Skip the ground pass — used for the relit second sign render. */
        signOnly?: boolean;
      },
    ) => Promise<{ sign: string; background: string }>;
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
  // The halo is clipped to the panel it lands on — see `HaloClip` in scene.ts.
  // Without this the planes are carried on the materials and ignored, and the
  // glow paints past the edge of the pan onto nothing.
  renderer.localClippingEnabled = true;
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

  // Half the measured cast, not all of it. The estimate is the photograph's
  // light AND its subject matter — a brick facade reads warm because it is
  // brick — so taking the whole of it would dip the sign in the wall's own
  // colour. On a real site photograph this works out to a couple of percent.
  const illuminant = photo ? temper(measureIlluminant(...photoPixels(photo)), 0.5).gain : undefined;

  // Built once and shared by both views: prefiltering is the expensive part,
  // and it does not depend on the spec.
  const environment = buildEnvironment(renderer);
  const sign = buildSignScene(spec, mode, illuminant, environment);
  const panels: RenderedPanel[] = [];

  for (const p of panelsFor(sign.contract.views) as PanelRequest[]) {
    sign.setView(p.view);
    // Was 1.35 at night. That, combined with the old wide/strong halo, pushed
    // most of a night studio panel toward flat white — a lit ROOM, not a dark
    // storefront with one lit sign in it. Neutral exposure at both views
    // now; the letters' own emissive material and the (now much tighter)
    // halo are what carry the night look, not a blanket exposure lift.
    renderer.toneMappingExposure = 1.0;

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

    // A halo is light on a wall, and light has no edge. Drawn as stacked
    // offset polygons it reads as concentric contour bands however fine the
    // arcs are, which is the one thing that kept a night render looking
    // computed. So it is rendered on its own, blurred into a gradient with no
    // geometry left in it, and the shells themselves are then kept OUT of the
    // frame — otherwise their edges show through underneath their own wash.
    const glow = p.view === 'night' && !composite
      ? blurredHalo(renderer, sign.scene, camera, width, height)
      : null;

    // Where the sign itself covers the frame, so the wash lands on the wall
    // and not across the letter faces standing in front of it.
    const covered = glow
      ? signCoverage(renderer, sign.scene, camera, width, height)
      : null;

    // The tighter mask: just the copy/logo face, per CL-P-01. Captured before
    // the real frame is drawn — it renders the scene itself, onto the same
    // canvas, so it has to happen and be read before the pixels that matter
    // are painted over it.
    //
    // Halo protection was tried both ways and neither is free of a real
    // failure, observed on live output, not assumed:
    //
    //   Protected — the halo shells fill solid, not just a thin rim, so
    //   locking them locks a large solid block the size of the halo's whole
    //   reach. Its own colour there is dim (very low night ambient by
    //   design), so the locked block reads as a dark plaque behind the
    //   letters — structurally, not as a rendering fluke, and no amount of
    //   retuning the halo's own reach or threshold changed that shape, only
    //   its size.
    //
    //   Unprotected — the best material realism this pipeline has produced
    //   (real brick, real brushed metal, real screws) came from exactly this
    //   setting, at the cost that the model occasionally ghosts a faint,
    //   duplicated echo of a letter into the glow next to the real one.
    //
    // On the client's explicit choice between the two, unprotected: the
    // plaque read as obviously wrong every time, where the ghost is
    // intermittent and a regenerate clears it.
    const logoCoverageUrl = !composite && p.view === 'night'
      ? logoCoverage(renderer, sign.scene, camera, width, height, false)
      : null;

    setHaloVisible(sign.scene, glow === null);
    renderer.render(sign.scene, camera);
    setHaloVisible(sign.scene, true);

    const dataUrl = composite && photo
      ? compositeOnPhoto(canvas, photo, spec, p.view, sprite?.inchesAcross ?? null, crop)
      // Strictly neutral (R=G=B), not the near-black navy this used to be.
      // HSL saturation is a ratio to lightness, so a hue that is invisible
      // in a near-black fill (#0a0d12 carries a measured 29% "blue" at that
      // darkness) stops being invisible the moment something brightens that
      // pixel — and `preserveChroma` locks every editable pixel's hue to
      // whatever the base had there, on purpose, so a `logoOnly` pass
      // brightening this fill turns an imperceptible tint into a saturated
      // colour. Observed on real output: a solid blue disc where a model had
      // brightened a corner of exactly this fill. A true grey has no hue to
      // amplify.
      : flattenOnto(canvas, p.view === 'night' ? '#0b0b0b' : '#bcc7d1', p.view, glow, covered);

    panels.push({
      label: p.label,
      view: p.view,
      camera: p.camera,
      note: groundNote(ground.reason),
      dataUrl,
      // Only for a panel that is on the photograph: a studio panel's ground is
      // a rendered wall, which `__renderLayers` already hands back separately.
      layers: opts.layers && composite && photo
        ? photoLayers(canvas, photo, spec, sprite?.inchesAcross ?? null, crop)
        : null,
      // Where the sign actually landed in the finished panel, and whether the
      // panel is the customer's photograph. Both are known here and nowhere
      // else: the alpha is the renderer's own output, and reconstructing it
      // downstream would mean guessing at the sign's silhouette from the
      // finished picture. Anything that later decides what a model may touch
      // has to be told, not left to infer.
      protection: composite && photo
        ? { onPhotograph: true, coverageUrl: null, logoCoverageUrl: null }
        : { onPhotograph: false, coverageUrl: alphaOf(canvas), logoCoverageUrl },
    });
  }

  sign.dispose();
  environment.dispose();
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
 * Seats the sign in the photograph.
 *
 * Deterministic arithmetic on pixels the renderer already produced — the same
 * spec and photograph give the same bytes every time. It adds what a real sign
 * does to its surroundings and never repaints the sign itself, so the face,
 * the returns and the trim keep the colours the spec block states.
 */
function integrateOnto(
  ctx: CanvasRenderingContext2D,
  out: HTMLCanvasElement,
  signLayer: CanvasRenderingContext2D,
  view: 'day' | 'night',
  spec: SignSpec,
  pixelsPerInch: number,
): string {
  const w = out.width;
  const h = out.height;
  const photo = ctx.getImageData(0, 0, w, h);
  const sign = signLayer.getImageData(0, 0, w, h);

  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = sign.data[i * 4 + 3]!;

  // The occlusion reaches about as far as the sign stands off the wall: that
  // is the geometry of a flat object shading a flat surface behind it. Driving
  // it from the real standoff means a 1" spacer and an 8" raceway do not
  // darken the wall identically — the depth is one of the things the picture
  // is meant to show.
  //
  // The 0.35 converts a standoff into a blur radius. Three box passes spread
  // roughly three times their radius, so passing the standoff directly reached
  // 11" on a 5" gap — measurably too far, and it read as a drawn outline
  // rather than as shading.
  const standoff = Math.max(...spec.elements.map((e) => e.returnDepth ?? 5), 1);
  const radius = Math.max(2, Math.min(48, standoff * pixelsPerInch * 0.35));

  // Weaker at night: the sky the sign is blocking is barely lit, so there is
  // much less ambient for it to occlude.
  const occlusion = contactOcclusion(alpha, w, h, radius, view === 'night' ? 0.28 : 0.45);
  const spill = view === 'night'
    ? lightSpill(sign.data, w, h, {
        tight: Math.max(3, radius * 0.5),
        wide: Math.max(12, radius * 3),
        strength: 0.55,
      })
    : undefined;

  // The spill is held back over the sign for the same reason as everywhere
  // else: glow piled onto the face washes out the colour the spec block states.
  const seated = integrate(photo.data, sign.data, w, h, { occlusion });
  const merged = spill ? applySpill(seated, w, h, spill, alpha) : seated;
  // Written back through the existing ImageData rather than constructing a new
  // one: the lib.dom typings for the ImageData constructor disagree across
  // TypeScript versions about the exact array flavour, and this needs neither.
  photo.data.set(merged);
  ctx.putImageData(photo, 0, 0);
  return out.toDataURL('image/png');
}

/**
 * The photograph, framed exactly as a panel frames it, and the sign alone in
 * its place on that frame.
 *
 * The two halves `compositeOnPhoto` normally adds together, handed back
 * separately: for the layered pass only the background goes to a model, and
 * the sign is composited back over what comes back. The photograph is NOT
 * darkened for night here — the model is asked for the night version of this
 * wall, and handing it one already dimmed by a flat black wash would have it
 * work from a picture nobody took.
 */
function photoLayers(
  signCanvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  spec: SignSpec,
  inchesAcross: number | null,
  crop: { x: number; y: number; w: number; h: number } | null,
): { background: string; sign: string } {
  const p = spec.placement!;
  const size = crop
    ? (() => {
        const target = Math.min(1400, p.imageWidth);
        return { w: target, h: Math.round((crop.h / crop.w) * target) };
      })()
    : { w: p.imageWidth, h: p.imageHeight };

  const bg = document.createElement('canvas');
  bg.width = size.w;
  bg.height = size.h;
  const bc = bg.getContext('2d')!;
  bc.imageSmoothingQuality = 'high';
  if (crop) {
    bc.drawImage(photo, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h);
  } else {
    bc.drawImage(photo, 0, 0, size.w, size.h);
  }

  const layer = document.createElement('canvas');
  layer.width = size.w;
  layer.height = size.h;
  const lc = layer.getContext('2d')!;
  lc.imageSmoothingQuality = 'high';

  if (inchesAcross === null) {
    // Camera-matched: the render is already in the photograph's frame.
    lc.drawImage(signCanvas, 0, 0, size.w, size.h);
  } else {
    // Straight-on render placed as a sprite at the size the calibration says
    // it occupies — the same arithmetic `compositeOnPhoto` uses.
    const cal = calibrate(
      { a: p.reference.a, b: p.reference.b, inches: p.reference.inches, label: p.reference.label },
      p.imageWidth, p.imageHeight,
    );
    const placement = { calibration: cal, rect: p.rect };
    const fit = fitArtwork(artworkExtent(spec.elements), placement);
    const ppi = cal.pixelsPerInch;
    const spriteW = inchesAcross * ppi;
    const spriteH = spriteW * (signCanvas.height / signCanvas.width);
    const anchor = anchorPx(fit, placement);
    const cx = anchor.x + (fit.width * ppi) / 2;
    const cy = anchor.y - (fit.height * ppi) / 2;
    lc.drawImage(signCanvas, cx - spriteW / 2, cy - spriteH / 2, spriteW, spriteH);
  }

  return { background: bg.toDataURL('image/png'), sign: layer.toDataURL('image/png') };
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
    // The sign is already in the photograph's own frame. Scale it to the
    // output, then integrate rather than paste: the wall darkens where the
    // standoff blocks the sky, and at night the sign throws light onto it.
    const layer = document.createElement('canvas');
    layer.width = out.width;
    layer.height = out.height;
    const lc = layer.getContext('2d')!;
    lc.imageSmoothingQuality = 'high';
    lc.drawImage(signCanvas, 0, 0, out.width, out.height);

    // Pixels per inch in the OUTPUT, which a detail crop rescales.
    const ppi = (out.width / p.imageWidth)
      * (p.rect.w / Math.max(spec.overall.w, 1e-6));
    return integrateOnto(ctx, out, lc, view, spec, ppi);
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
/**
 * The halo on its own, blurred into a wash.
 *
 * Renders the scene twice more: once with only the halo visible, to get the
 * light by itself, and that is all this needs — the blur turns a hard-edged
 * stack of offset polygons into the smooth falloff a wall actually shows. The
 * shells stay in the scene because they carry the perspective; what changes is
 * that their edges never reach the picture.
 */
/**
 * Alpha of the sign alone — no wall behind it, no halo around it.
 *
 * The wash has to go on the wall and stop at the letters. In a studio panel
 * the wall and the letters arrive in the same opaque render, so the only way
 * to tell them apart afterwards is to render the letters once by themselves.
 */
function signCoverage(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): Uint8Array {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    // The backer counts as ground here, not as sign. It is the surface the
    // halo lands on — a rear-illuminated element standing on a pan throws its
    // light onto that pan, and the letters block it. Counting the pan as
    // covered suppressed the wash exactly where it belongs and left it only on
    // the wall outside, so the glow appeared to come from behind the panel
    // rather than from behind the copy.
    if (isHaloGround(mesh.name)) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  });

  const previous = scene.background;
  scene.background = null;
  renderer.render(scene, camera);

  const lift = document.createElement('canvas');
  lift.width = width;
  lift.height = height;
  const ctx = lift.getContext('2d')!;
  ctx.drawImage(renderer.domElement, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);

  scene.background = previous;
  for (const o of hidden) o.visible = true;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3]!;
  return alpha;
}

/**
 * Alpha of CL-P-01 and the halo shells — the copy/logo face plus the light
 * it casts, and nothing else the renderer drew.
 *
 * The face alone was the first version of this: only the mark's own outline
 * and colour breaks need protecting, so the returns, trim cap, backer and
 * mounting surface were left open for a model to relight. In practice the
 * halo had to join it. It is exactly the region a model asked to add
 * "realistic ambient light" reaches for first, and what came back there was
 * not better light — it was a thin invented line traced along the glow's own
 * edge, achromatic enough to survive the colour lock and structured enough to
 * read as a mistake rather than texture. The halo is already a real light
 * source, computed and blurred deterministically (see `blurredHalo`); handing
 * it to a model a second time bought a defect, not an improvement, so it is
 * protected alongside the face and the model's realism budget is spent on the
 * surfaces around it instead — which is most of the panel.
 */
function logoCoverage(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  includeHalo: boolean,
): string {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const keep = /^CL-P-01 face/.test(mesh.name) || (includeHalo && /halo/i.test(mesh.name));
    if (!keep) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  });

  const previous = scene.background;
  scene.background = null;
  renderer.render(scene, camera);
  const url = alphaOf(renderer.domElement as HTMLCanvasElement);

  scene.background = previous;
  for (const o of hidden) o.visible = true;
  return url;
}

/** Shows or hides every halo shell, so its wash can replace its geometry. */
function setHaloVisible(scene: THREE.Scene, visible: boolean): void {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && /halo/i.test(mesh.name)) mesh.visible = visible;
  });
}

function blurredHalo(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): { r: Float32Array; g: Float32Array; b: Float32Array } | null {
  const hidden: THREE.Object3D[] = [];
  let found = false;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (/halo/i.test(mesh.name)) { found = true; return; }
    if (mesh.visible) { mesh.visible = false; hidden.push(mesh); }
  });
  if (!found) {
    for (const o of hidden) o.visible = true;
    return null;
  }

  const previous = scene.background;
  scene.background = null;
  renderer.render(scene, camera);

  const lift = document.createElement('canvas');
  lift.width = width;
  lift.height = height;
  const ctx = lift.getContext('2d')!;
  ctx.drawImage(renderer.domElement, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);

  scene.background = previous;
  for (const o of hidden) o.visible = true;

  // Cut hard, twice now. First pass (10.5%/1.6 → 6%/1.0) was still measured
  // against a live render and still read as a lit backer, not a lit sign —
  // the wash reached almost to the plaque's own edge. A real halo is a
  // narrow bright rim hugging the letters that is mostly gone within a
  // letter-height or so; it does not fill a plaque the size of the sign.
  // Weaker and shorter again, because it is no longer the whole halo: at night
  // the sign now carries a real lamp in its own standoff gap, which lights the
  // surface behind the copy and is blocked by the copy itself. This wash is
  // only the bloom on top of that — a camera artefact, not the light.
  return lightSpill(pixels.data, width, height, {
    threshold: 10,
    tight: Math.max(3, Math.round(width * 0.004)),
    wide: Math.max(10, Math.round(width * 0.016)),
    strength: 0.40,
  });
}

function flattenOnto(
  canvas: HTMLCanvasElement,
  background: string,
  view?: 'day' | 'night',
  glow?: { r: Float32Array; g: Float32Array; b: Float32Array } | null,
  /** Alpha of the sign, so the wash stops where the letters begin. */
  covered?: Uint8Array | null,
): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);

  // The wash goes on the wall BEFORE the sign, because that is where it is:
  // light thrown backwards onto the surface, with the letters standing in
  // front of it. Added afterwards it would wash across the faces instead.
  ctx.drawImage(canvas, 0, 0);

  // The wash goes on the wall and stops at the letters: it is light thrown
  // backwards onto the surface, with the sign standing in front of it. Laid
  // over the top instead, it would wash across the faces and take their
  // colour with it.
  if (glow) {
    const w = out.width;
    const h = out.height;
    const frame = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const open = covered ? 1 - covered[i]! / 255 : 1;
      if (open <= 0) continue;
      frame.data[o] = Math.min(255, frame.data[o]! + glow.r[i]! * 255 * open);
      frame.data[o + 1] = Math.min(255, frame.data[o + 1]! + glow.g[i]! * 255 * open);
      frame.data[o + 2] = Math.min(255, frame.data[o + 2]! + glow.b[i]! * 255 * open);
    }
    ctx.putImageData(frame, 0, 0);
  }

  // A flat fill immediately around the sign, independent of the halo's own
  // brightness curve — deterministic, not a generative model's opinion about
  // what belongs there.
  //
  // The halo above lights the wall wherever a lit shell happens to land, and
  // that turned out not to include the ground right next to the letters:
  // measured on real output, the band between the letterform and the halo's
  // own bright rim stayed close to black regardless of how the halo's own
  // reach or threshold were tuned. A generative pass given that panel as its
  // reference kept the same dark band even when told not to, because it is
  // photographing what is actually there. This is the fix that is not a
  // suggestion to a model: a small, unconditional lift within a couple of
  // letter-heights of the sign, so the base panel itself no longer has a
  // dark gap for anything downstream to preserve.
  if (glow && covered && view === 'night') {
    const w = out.width;
    const h = out.height;
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = covered[i]! / 255;
    const reach = Math.max(24, Math.round(w * 0.05));
    const softened = blur(alpha, w, h, reach, 2);

    const frame = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const open = 1 - covered[i]! / 255;
      if (open <= 0) continue;
      const lift = softened[i]! * 46 * open;
      frame.data[o] = Math.min(255, frame.data[o]! + lift);
      frame.data[o + 1] = Math.min(255, frame.data[o + 1]! + lift);
      frame.data[o + 2] = Math.min(255, frame.data[o + 2]! + lift);
    }
    ctx.putImageData(frame, 0, 0);
  }

  // Lens falloff last, over everything — it belongs to the camera, not to any
  // surface in the scene. Studio panels only; a composite already carries the
  // customer's own camera's falloff.
  if (view === 'night') {
    const frame = ctx.getImageData(0, 0, out.width, out.height);
    // Deeper and closer-in than the day default: a night frame with nothing
    // but the sign emitting light should go dark fast away from it, the way
    // a real photograph exposed for a lit sign crushes its surroundings
    // rather than showing an evenly lit room.
    frame.data.set(vignette(frame.data, out.width, out.height, 0.55, 0.3));
    ctx.putImageData(frame, 0, 0);
  }

  // Bloom, at night only.
  //
  // On a studio panel the mounting surface is part of the same render, so the
  // sign's own layer cannot be separated out and spilled onto it the way a
  // composite can. Bloom over the finished frame is the equivalent, and it is
  // what makes an emissive face read as EMITTING rather than as being merely a
  // bright colour — three.js emissive materials do not light anything around
  // them, so without this a lit sign at night is a flat bright shape.
  if (view === 'night') {
    const w = out.width;
    const h = out.height;
    const frame = ctx.getImageData(0, 0, w, h);
    // Restrained on purpose. At threshold 110 / strength 0.5 this was adding a
    // blurred copy of the halo on top of the halo, and the sum saturated a band
    // 40 px wide — measured. That plateau was the "hard edge" of the glow: not
    // the edge of any shell, but the contour where bloom + halo crossed 255.
    // A halo on a wall IS the light; a second glow over it is invention.
    const glow = lightSpill(frame.data, w, h, {
      threshold: 170,
      tight: Math.max(2, Math.round(w * 0.003)),
      wide: Math.max(6, Math.round(w * 0.012)),
      strength: 0.12,
    });
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      // Held back where the frame is already bright, so bloom lifts the dark
      // wall rather than piling onto something that is at 255 already.
      const peak = Math.max(frame.data[o]!, frame.data[o + 1]!, frame.data[o + 2]!);
      const hold = 1 - Math.min(1, peak / 255) ** 2;
      frame.data[o] = Math.min(255, frame.data[o]! + glow.r[i]! * 255 * hold);
      frame.data[o + 1] = Math.min(255, frame.data[o + 1]! + glow.g[i]! * 255 * hold);
      frame.data[o + 2] = Math.min(255, frame.data[o + 2]! + glow.b[i]! * 255 * hold);
    }
    ctx.putImageData(frame, 0, 0);
  }

  // A photograph, not a screenshot. Deterministic and applied last, over the
  // whole finished frame uniformly — the same reason `vignette` runs here and
  // not per-material: it is what a camera and its white balance do, not a
  // property of any one surface, so it is not something the mask needs to
  // carve around. Most LEDs sold and shot as "white" read warm on camera, and
  // a real exposure for a lit sign at night pulls its shadows down further
  // than a renderer's flat black does — a small S-curve buys both without
  // touching anything's hue identity, because it is applied identically to
  // every pixel, logo included, and the logo's own base value already has it
  // baked in before the protection mask is ever built.
  if (view === 'night') {
    const frame = ctx.getImageData(0, 0, out.width, out.height);
    nightGrade(frame.data);
    ctx.putImageData(frame, 0, 0);
  }

  return out.toDataURL('image/png');
}

/** Warm white balance plus a gentle S-curve — a camera's look, not a light's. */
function nightGrade(data: Uint8ClampedArray): void {
  const warm: [number, number, number] = [1.05, 1.0, 0.92];
  const contrast = 1.1;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]! * warm[c]!;
      data[i + c] = Math.max(0, Math.min(255, (v - 128) * contrast + 128));
    }
  }
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

/**
 * Everything the renderer drew, as a greyscale PNG of the render target's
 * alpha.
 *
 * Taken before anything is composited under it, so it is the renderer's own
 * coverage rather than a threshold of the finished picture — a threshold would
 * swallow the halo and clip the antialiased edge, exactly the pixels a
 * protection margin exists to keep.
 *
 * Note what this includes on a studio panel: the CL-P-31 mounting surface
 * fills most of the frame, and its colour is a spec-block line. It is not
 * backdrop, and it is protected for the same reason the sign is.
 */
function alphaOf(canvas: HTMLCanvasElement): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;

  // A WebGL canvas has no getImageData, so it is drawn into a 2D canvas first.
  // `preserveDrawingBuffer` on the renderer is what keeps it readable here.
  const lift = document.createElement('canvas');
  lift.width = canvas.width;
  lift.height = canvas.height;
  lift.getContext('2d')!.drawImage(canvas, 0, 0);
  const pixels = lift.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);

  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    const a = pixels.data[i * 4 + 3]!;
    image.data[i * 4] = a;
    image.data[i * 4 + 1] = a;
    image.data[i * 4 + 2] = a;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return out.toDataURL('image/png');
}

/** The photograph's pixels, for measuring the light it was taken under. */
function photoPixels(
  photo: HTMLImageElement,
): [Uint8ClampedArray, number, number] {
  // Sampled small: a grey-world average does not get better with resolution,
  // and decoding a 12 MP facade at full size to average it would cost more
  // than the render.
  const w = Math.max(1, Math.min(256, photo.naturalWidth));
  const h = Math.max(1, Math.round((photo.naturalHeight / photo.naturalWidth) * w));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(photo, 0, 0, w, h);
  return [ctx.getImageData(0, 0, w, h).data, w, h];
}

/**
 * The sign alone, on transparency, for a concept scene.
 *
 * Rendered in composite mode so there is no wall behind it: the setting for a
 * concept scene is generated, and a studio wall would be visible through the
 * gaps in the letterforms. What comes back is the deterministic sign exactly
 * as the engine specified it — the thing that must survive being placed over
 * whatever a model draws.
 *
 * A front elevation, deliberately. A three-quarter is the more flattering
 * picture, but it would have to be composited onto a wall at the same angle,
 * and nothing tells a text-to-image model what that angle is. Head-on, the
 * sign sits flat on whatever surface comes back and the geometry agrees.
 */
async function renderSignLayer(
  spec: SignSpec,
  opts: { width: number; height: number; view: 'day' | 'night' },
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, preserveDrawingBuffer: true, alpha: true,
  });
  renderer.setSize(opts.width, opts.height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The halo is clipped to the panel it lands on — see `HaloClip` in scene.ts.
  // Without this the planes are carried on the materials and ignored, and the
  // glow paints past the edge of the pan onto nothing.
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const sign = buildSignScene(spec, 'composite', undefined, buildEnvironment(renderer));
  sign.setView(opts.view);
  sign.setSurface('composite');

  const framed = makeCamera(sign, 'front-elevation', opts.width, opts.height);
  renderer.render(sign.scene, framed.camera);

  const out = document.createElement('canvas');
  out.width = opts.width;
  out.height = opts.height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);

  sign.dispose();
  renderer.dispose();
  return out.toDataURL('image/png');
}

if (typeof window !== 'undefined') window.__renderSignLayer = renderSignLayer;

/**
 * The sign and the ground it stands on, as two separate pictures.
 *
 * For the layered night panel: the setting goes to a model for realism and the
 * SIGN never does, so nothing a model draws can end up being the sign. The two
 * come off the same scene through the same camera, which is what lets them be
 * added back together without anything being lined up by hand.
 *
 * The background carries the wall and nothing else — no letters, no backer, no
 * halo. A model asked to make a wall look real will happily leave a sign it can
 * see in the frame alone; asked to make a wall WITH a sign on it look real, it
 * redraws the sign. Removing it is cheaper than asking.
 */
async function renderLayers(
  spec: SignSpec,
  opts: {
    width: number; height: number; view: 'day' | 'night'; camera?: ViewName;
    illuminant?: { r: number; g: number; b: number };
    signOnly?: boolean;
  },
): Promise<{ sign: string; background: string }> {
  const { width, height, view } = opts;
  const camera = opts.camera ?? 'detail-perspective';

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
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const grab = (): string => {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d')!.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
  };

  // The sign alone, on transparency. Composite mode so the studio wall is a
  // shadow catcher and does not show through the counters of the letterforms.
  const signScene = buildSignScene(spec, 'composite', opts.illuminant, buildEnvironment(renderer));
  signScene.setView(view);
  signScene.setSurface('composite');
  const cam = makeCamera(signScene, camera, width, height).camera;

  // No halo geometry in this path.
  //
  // The shells are twenty-eight stacked offset outlines, and summed they fill
  // SOLID out to the halo's whole reach — so drawn into the frame they are not
  // a glow at all, they are a white plaque the shape of the copy sitting behind
  // it. Blurring them does not rescue that: the source is solid, so the blur
  // keeps a solid core and only softens its rim.
  //
  // The light here is a real one instead. `applyEnvironment` puts a lamp in the
  // standoff gap of a rear-illuminated sign; the copy blocks it, and what lands
  // on the surface behind is a physical falloff rather than a drawing of one.
  setHaloVisible(signScene.scene, false);
  renderer.render(signScene.scene, cam);
  setHaloVisible(signScene.scene, true);
  const sign = grab();
  signScene.dispose();

  if (opts.signOnly) {
    renderer.dispose();
    return { sign, background: '' };
  }

  // The same scene, same camera, with everything but the mounting surface
  // hidden — so the wall is lit and framed exactly as it is under the sign.
  const groundScene = buildSignScene(spec, 'studio', undefined, buildEnvironment(renderer));
  groundScene.setView(view);
  groundScene.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !/mounting surface/i.test(o.name)) mesh.visible = false;
  });
  renderer.render(groundScene.scene, cam);
  const background = grab();
  groundScene.dispose();

  renderer.dispose();
  return { sign, background };
}

if (typeof window !== 'undefined') window.__renderLayers = renderLayers;
