/**
 * One scene graph. Two lighting environments.
 *
 * §9.1 requires a day view and a night view for every illuminated sign. Built
 * as two independent samples, they disagree: letterforms drift, framing shifts,
 * raceway height changes, and a proof whose two halves do not match will not be
 * believed. Built as one scene with two lighting rigs, the geometry is the same
 * object in both — consistency is a property of the data structure rather than
 * something to hope for.
 */
import * as THREE from 'three';
import type { SignSpec, SignElement, Contour } from '../domain/spec.js';
import { isBoxConstruction, returnColourOf, faceColourOf, faceRenderColour, depthOf } from '../domain/spec.js';
import { TYPES, isContourBacker } from '../domain/taxonomy.js';
import { buildRenderContract, type RenderContract, type ElementTruth } from './contract.js';
import { extrude, flat, boxShape, contoursToShapes } from './shapes.js';
import {
  faceMaterial, returnMaterial, trimCapMaterial, haloMaterial, surfaceMaterial, backerMaterial, copyMaterial,
  applyReflections,
  resolveColour, setFaceLit, type View,
} from './materials.js';
import { offsetContours, ringAround } from '../geometry/offset.js';
import { pointInContours, absArea } from '../geometry/poly.js';
import { TRIM_CAP_PROJECTION, RACEWAY_STANDARD, WIREWAY_STANDARD } from '../domain/materials.js';
import { applyEnvironment } from './lighting.js';
import { ENVIRONMENT_INTENSITY } from './environment.js';

export type SceneMode =
  /** Neutral wall built from the spec — the default pre-sales output. */
  | 'studio'
  /**
   * Transparent background with a shadow-catching plane, for compositing onto
   * the customer's photo. The synthetic wall is omitted rather than hidden: a
   * wall drawn behind a halo letter would light up, and the halo would then be
   * washing across a surface that is not the one in the photograph.
   */
  | 'composite';

export interface SignScene {
  scene: THREE.Scene;
  mode: SceneMode;
  contract: RenderContract;
  /** Bounding box of the sign in world units (inches). */
  bounds: THREE.Box3;
  /** Swap the lighting environment. Geometry is never rebuilt. */
  setView(view: View): void;
  /**
   * Swap the mounting surface between a drawn wall and a shadow catcher.
   *
   * Per panel, not per scene: the front elevation is composited onto the
   * customer's photograph and needs the wall invisible, while a 3/4 view is a
   * studio shot of the sign and needs a real surface — a halo has to wash
   * across something, and washing across a shadow catcher lights nothing at
   * all.
   */
  setSurface(mode: SceneMode): void;
  currentView(): View;
  dispose(): void;
}

const WALL_Z = 0;

/**
 * Surface separation, inches. A face, its trim cap and the can's front cap all
 * sit at the same plane on a real letter; in a depth buffer that is z-fighting,
 * and it shows up as stripes across the face. 1/50″ is under the tolerance any
 * of this is drawn to and is invisible in perspective, but it is unambiguous to
 * the depth test. Materials also use polygonOffset so the ordering holds at
 * grazing angles.
 */
const SURFACE_EPS = 0.02;

/**
 * How far a contour backer stands proud of the copy.
 *
 * Wide enough to read as a panel rather than as a thick outline, and on a halo
 * sign it is also the surface the light lands on — too tight and the glow has
 * nowhere to fall.
 */
/**
 * Whether a mesh is ground for the halo rather than sign.
 *
 * The wash lands on whatever is behind the copy — the wall, or the backer when
 * there is one — and is blocked by the copy standing in front of it. Anything
 * this returns true for is left out of the coverage mask the compositor uses,
 * so the glow is allowed to fall there.
 */
export const isHaloGround = (name: string): boolean =>
  /halo/i.test(name) || /mounting surface/i.test(name) || /backer panel/i.test(name);

/** The rectangle the halo is allowed to paint on, in world inches. */
export interface HaloClip { x0: number; x1: number; y0: number; y1: number }

const backerReveal = (spec: SignSpec): number =>
  Math.max(2, Math.max(...spec.elements.map((e) => e.capHeight), 0) * 0.16);

export function buildSignScene(
  spec: SignSpec,
  mode: SceneMode = 'studio',
  /** The photograph's own light, so a composite agrees with it. */
  illuminant?: { r: number; g: number; b: number },
  /**
   * Prefiltered environment for the PBR materials to reflect. Optional: the
   * scene is correct without it, just flatter — nothing about the sign changes,
   * only what its metal has to catch.
   */
  environment?: THREE.Texture,
): SignScene {
  const contract = spec.renderContract ?? buildRenderContract(spec);
  const scene = new THREE.Scene();
  const type = TYPES[spec.type];
  const composite = mode === 'composite';

  const viewDependent: Array<(view: View) => void> = [];
  const disposables: Array<{ dispose(): void }> = [];

  // ── CL-P-31 mounting surface ────────────────────────────────────────────
  const area = spec.site?.area ?? { w: spec.overall.w * 2.2, h: spec.overall.h * 3.2 };
  const wallW = Math.max(area.w, spec.overall.w * 1.4);
  const wallH = Math.max(area.h, spec.overall.h * 2.4);
  const wallGeo = new THREE.PlaneGeometry(wallW, wallH);
  // In composite mode the real wall is in the photograph. A ShadowMaterial
  // receives the cast shadow and nothing else, so the sign lands on the
  // customer's own facade instead of on a painted stand-in of it.
  const studioWallMat = surfaceMaterial(spec.mountingSurface.colour, { w: wallW, h: wallH });
  const catcherMat = new THREE.ShadowMaterial({ opacity: 0.34 });
  const wall = new THREE.Mesh(wallGeo, composite ? catcherMat : studioWallMat);
  wall.position.set(spec.overall.w / 2, spec.overall.h / 2, WALL_Z - 0.01);
  wall.receiveShadow = true;
  wall.name = 'CL-P-31 mounting surface';
  scene.add(wall);
  disposables.push(wallGeo, studioWallMat, catcherMat);

  // ── CL-P-20 backer panel ────────────────────────────────────────────────
  let mountPlaneZ = WALL_Z;
  /** Where the surface the halo lands on ends. Null = it runs to the wall. */
  let haloClip: HaloClip | null = null;
  if (spec.backer.present) {
    const thickness = Math.max(spec.backer.depth, 0.25);
    const contour = isContourBacker(spec.backer.shape);

    // §4.5 lists Contour Flat, Cloud Flat, Letter Cloud and Letter Bubble as
    // distinct shapes, and they are all the same idea: the panel is cut around
    // the copy rather than boxed behind it. Drawing them as a rectangle is
    // drawing a different product — and on a halo sign it is the difference
    // between a glowing cloud and a glowing billboard.
    const geo = contour
      ? extrude(
          offsetContours(spec.elements.flatMap((e) => e.contours), backerReveal(spec)),
          { depth: thickness, curveSegments: 20 },
        )
      : new THREE.BoxGeometry(spec.backer.w, spec.backer.h, thickness);

    // Backer is a fabricated aluminium pan, not a rendered wall — see
    // `backerMaterial()`. "match mounting surface" is a wall-relative default
    // from CL-D-10 with nothing to say about metal, so it falls through to
    // the material's own mill-aluminium default instead of tinting the panel
    // wall-grey.
    const backerColour = /match (mounting surface|building colour)/i.test(spec.backer.colour)
      ? 'aluminum'
      : spec.backer.colour;
    const mat = backerMaterial(backerColour);
    const backer = new THREE.Mesh(geo, mat);
    backer.position.set(
      contour ? 0 : spec.overall.w / 2,
      contour ? 0 : spec.overall.h / 2,
      contour ? WALL_Z : WALL_Z + thickness / 2,
    );
    backer.castShadow = true;
    backer.receiveShadow = true;
    backer.name = 'CL-P-20 backer panel';
    scene.add(backer);
    disposables.push(geo, mat);
    mountPlaneZ = WALL_Z + thickness;

    // A rectangular pan is a real edge, and light stops at it. The halo is
    // drawn on the plane of the pan's face, so without this the shells that
    // reach past the pan keep painting in mid-air over the wall — which is
    // what put a bright ring around the panel and left the copy sitting on an
    // unlit black field. A contour backer is already cut to the copy, so its
    // own offset does this job and it is left alone.
    if (!contour) {
      haloClip = {
        x0: spec.overall.w / 2 - spec.backer.w / 2,
        x1: spec.overall.w / 2 + spec.backer.w / 2,
        y0: spec.overall.h / 2 - spec.backer.h / 2,
        y1: spec.overall.h / 2 + spec.backer.h / 2,
      };
    }
  }

  // ── CL-P-18 raceway / CL-P-19 wireway / CL-P-27 bottom rail ─────────────
  if (spec.raceway) {
    const r = spec.raceway;
    const size = r.kind === 'wireway' ? WIREWAY_STANDARD : RACEWAY_STANDARD;
    const h = r.h || size.h;
    const d = r.d || size.d;
    const geo = new THREE.BoxGeometry(spec.overall.w + 4, h, d);
    const mat = surfaceMaterial(r.colour);
    const box = new THREE.Mesh(geo, mat);
    // §9.2: bottom-mounted sets sit ON the rail, rail visible beneath the baseline.
    const y = r.kind === 'bottom-rail' ? -h / 2 : h / 2 - 1;
    box.position.set(spec.overall.w / 2, y, mountPlaneZ + d / 2);
    box.castShadow = true;
    box.name = `${r.kind === 'wireway' ? 'CL-P-19 wireway' : r.kind === 'bottom-rail' ? 'CL-P-27 bottom rail' : 'CL-P-18 raceway'}`;
    scene.add(box);
    disposables.push(geo, mat);
    if (r.kind !== 'bottom-rail') mountPlaneZ += d;
  }

  // ── Elements ────────────────────────────────────────────────────────────
  const signGroup = new THREE.Group();
  signGroup.name = 'sign';
  scene.add(signGroup);

  for (const el of spec.elements) {
    const truth = contract.elements.find((e) => e.elementId === el.id);
    if (!truth) continue;
    // What the halo washes across: the backer when there is one, otherwise the
    // building itself.
    const haloSurface = spec.backer.present ? spec.backer.colour : spec.mountingSurface.colour;

    const group = isBoxConstruction(el.construction)
      ? buildBox(el, truth, spec, mountPlaneZ, haloSurface, haloClip, viewDependent, disposables)
      : buildLetters(el, truth, spec, mountPlaneZ, haloSurface, haloClip, viewDependent, disposables);
    group.name = `${el.id} · ${el.role} · ${el.construction}`;
    signGroup.add(group);
  }

  const bounds = new THREE.Box3().setFromObject(signGroup);
  let view: View = 'day';
  let surface: SceneMode = mode;

  const setView = (v: View) => {
    view = v;
    applyEnvironment(scene, v, spec, surface === 'composite', illuminant);
    // Named parts only, never the whole scene. Reflections also drop away at
    // night: returns keeping a daylight sheen in an unlit frame is its own
    // kind of wrong.
    applyReflections(scene, environment, ENVIRONMENT_INTENSITY[v]);
    for (const fn of viewDependent) fn(v);
  };

  const setSurface = (next: SceneMode) => {
    surface = next;
    wall.material = next === 'composite' ? catcherMat : studioWallMat;
    applyEnvironment(scene, view, spec, next === 'composite', illuminant);
  };

  setView('day');

  return {
    scene,
    mode,
    setSurface,
    contract,
    bounds,
    setView,
    currentView: () => view,
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}

/** CL-C-01 — individual channel letters. Face + return + trim cap (+ halo). */
function buildLetters(
  el: SignElement,
  truth: ElementTruth,
  spec: SignSpec,
  mountPlaneZ: number,
  haloSurface: string,
  haloClip: HaloClip | null,
  viewDependent: Array<(view: View) => void>,
  disposables: Array<{ dispose(): void }>,
): THREE.Group {
  const g = new THREE.Group();
  const type = TYPES[spec.type];
  const standoff = truth.standoffGap ?? 0;
  const depth = truth.returnDepth;
  const baseZ = mountPlaneZ + standoff;

  // Flat cut letters and vinyl have no return.
  const isFlatCut = el.construction === 'CL-C-04' || el.construction === 'CL-C-05';
  const isVinyl = el.construction === 'CL-C-06';
  // Dimensional Letters (compiled by src/kb/render/dl-compile.ts): unlike
  // flat-cut channel-letter parts, a DL element's true depth is the point of
  // the proof (cast metal, HDU, etc. run up to 2″+), so it is drawn at its
  // real `returnDepth` rather than the flat-cut placeholder below. 'DL-C-01'
  // is deliberately not a member of the `Construction` union — see the
  // comment in dl-compile.ts — so this reads the raw string.
  const isDimensionalLetter = (el.construction as string) === 'DL-C-01';

  if (isVinyl) {
    const geo = flat(el.contours);
    const mat = copyMaterial(el.face.renderColour ?? faceColourOf(el), 0.8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = mountPlaneZ + SURFACE_EPS;
    mesh.name = 'CL-P-24 vinyl application';
    g.add(mesh);
    disposables.push(geo, mat);
    return g;
  }

  const canDepth = isFlatCut ? 0.5 : isDimensionalLetter ? depthOf(el) : depth;

  // The can: one extrusion, exactly as it is fabricated.
  const canGeo = extrude(el.contours, { depth: canDepth });
  const canMat = returnMaterial(returnColourOf(el), truth.day, 'day');
  const can = new THREE.Mesh(canGeo, canMat);
  can.position.z = baseZ;
  can.castShadow = true;
  can.receiveShadow = true;
  can.name = 'CL-P-02 return';
  g.add(can);
  disposables.push(canGeo, canMat);

  // The face, as a separate surface so it can emit while the return does not.
  const faceGeo = flat(el.contours);
  const faceMat = faceMaterial({
    // A day/night face is dark by day and its stated colour once lit, so the
    // colour is asked for per view rather than fixed at build time.
    colour: faceRenderColour(el, 'day'),
    truth: truth.day,
    view: 'day',
    translucent: type.translucentFace && !isFlatCut && !isDimensionalLetter,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = baseZ + canDepth + SURFACE_EPS;
  face.name = 'CL-P-01 face';
  g.add(face);
  disposables.push(faceGeo, faceMat);

  viewDependent.push((view) => {
    const t = view === 'day' ? truth.day : truth.night;
    setFaceLit(faceMat, faceRenderColour(el, view), t.faceEmissive && view === 'night');
    canMat.emissiveIntensity = t.returnsEmissive && view === 'night' ? 1.4 : 0;
    canMat.needsUpdate = true;
  });

  // CL-P-03 trim cap — a thin outline, 1/8″ proud of the face. Not added to
  // the quoted depth (§4.3), so it does not move the face plane.
  if (el.trimCap.kind === 'trim-cap' && el.trimCap.width) {
    const ring = ringAround(el.contours, el.trimCap.width);
    const geo = extrude(ring, { depth: TRIM_CAP_PROJECTION });
    const mat = trimCapMaterial(el.trimCap.colour ?? 'Black');
    const trim = new THREE.Mesh(geo, mat);
    trim.position.z = baseZ + canDepth + SURFACE_EPS;
    trim.name = 'CL-P-03 trim cap';
    g.add(trim);
    disposables.push(geo, mat);
  } else if (el.trimCap.kind === 'retainer') {
    const ring = ringAround(el.contours, 0.5);
    const geo = extrude(ring, { depth: 0.25 });
    const mat = trimCapMaterial(returnColourOf(el));
    const retainer = new THREE.Mesh(geo, mat);
    retainer.position.z = baseZ + canDepth + SURFACE_EPS;
    retainer.name = 'CL-P-04 retainer';
    g.add(retainer);
    disposables.push(geo, mat);
  }

  // The halo. §9.2: the surface BEHIND glows; the letter stays dark and solid.
  // So the emitter is a plane on the mounting surface, slightly larger than the
  // letter, and the letter itself never emits.
  if (truth.night.backgroundEmissive) {
    // CL-P-15 spacer — Layer 2 lists it as "Visible — shadow gap", so the gap
    // is drawn and the hardware is not. A photograph of a real installation
    // shows the standoff posts; a pre-sales render that drew them would be
    // showing fabrication hardware §9.2 keeps off a customer-facing view.
    g.add(buildHalo(el.contours, standoff, el.ledColour, haloSurface, mountPlaneZ, haloClip, viewDependent, disposables));
  }

  return g;
}

/**
 * The halo.
 *
 * §9.2: "Surface behind glows in a halo; face stays dark and solid." Light from
 * the LEDs spreads as it travels the standoff gap, so the glow is brightest
 * tight against the letterform and fades outward. A single emissive plane cut
 * to the outline has none of that — it renders as a hard white shape offset
 * behind the sign, which reads as a second sign rather than as light.
 *
 * So it is built as concentric shells, each offset further out and dimmer. The
 * falloff follows the letterform, because that is the shape the light is
 * actually coming from.
 */
function buildHalo(
  contours: Contour[],
  standoff: number,
  ledColour: string | undefined,
  /** What the light lands on — the backer if there is one, otherwise the wall. */
  surfaceColour: string,
  wallZ: number,
  /** The edge of that surface, when it has one. */
  clip: HaloClip | null,
  viewDependent: Array<(view: View) => void>,
  disposables: Array<{ dispose(): void }>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'halo (CL-P-09 LED module, glow only)';

  // Spread scales with the gap: a 1.5″ standoff throws a tighter halo than a
  // 2″ one, which is the difference §6.5 CL-R-37 is drawing.
  // Light leaves the back of the can and spreads as it crosses the gap. Was
  // 3.2× the gap — measured against real output that left a visibly dark,
  // unlit band immediately around the letters before the bright ring began,
  // reading as a dark plaque sitting behind the sign rather than as the
  // sign's own glow. 1.8× kept the same falloff shape but started it closer
  // in, so the light reached the letters' own edge instead of leaving a gap.
  //
  // 1.1× now. A halo LED sits an inch and a half off the surface and throws a
  // tight, bright collar around the letterform, not a wide lantern glow — the
  // wide version read as fog and swallowed the edge of the copy, which is the
  // one thing the halo is there to draw.
  const reach = Math.max(standoff, 1.5) * 1.1;

  // Enough shells that the steps fall below what the eye separates. Six read
  // as concentric rings — a halo drawn as contour lines, not as light. More
  // than that also softens the polygonal facets an offset leaves behind.
  const shells = 28;
  // Four planes, each keeping what is on the inside of one pan edge. Cheaper
  // and exact where clipping the shell outlines geometrically would mean a
  // boolean per shell, twenty-eight times per element.
  const clipPlanes = clip ? [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -clip.x0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), clip.x1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -clip.y0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), clip.y1),
  ] : [];
  // The halo is the LED reflected off the surface behind, not the LED itself.
  const colour = resolveColour(ledColour ?? 'bright white', '#fbfbf7')
    .multiply(resolveColour(surfaceColour, '#ffffff'));

  for (let i = 0; i < shells; i++) {
    const t = i / (shells - 1);
    // Spacing widens outward, so the bright core gets the resolution and the
    // faint tail does not cost eighteen more polygons than it needs.
    // A gentler curve than the 2.1 this used to be. That exponent piled most
    // of the shells within an inch of the letterform, so their sum stayed
    // above 1 across a wide band and everything in it clipped to flat white —
    // the "hard edge" of the halo was the CLIPPING CONTOUR, not the edge of any
    // shell. Measured, the plateau ran about an inch before falling off a cliff.
    const distance = 0.1 + reach * t ** 1.7;
    // A twentieth of the fabrication tolerance. This is drawn as light, and a
    // quarter-inch chord on a five-inch arc reads as a facet.
    const geo = flat(offsetContours(contours, distance, true, 0.012));
    const mat = haloMaterial(ledColour, 'day', surfaceColour);
    if (clip) mat.clippingPlanes = clipPlanes;

    const mesh = new THREE.Mesh(geo, mat);
    // Named individually, not just on the group: the §9.2 checks walk meshes,
    // and an unnamed mesh is invisible to them whatever its parent is called.
    mesh.name = `halo shell ${i + 1} (CL-P-09 LED module, glow only)`;
    mesh.position.z = wallZ + SURFACE_EPS * (1 + i * 0.02);
    // Positive, so the shells draw AFTER the opaque mounting surface. They
    // write no depth — that is what lets them accumulate — so a negative
    // render order put them on the canvas first and the wall painted straight
    // over them. The halo was in the scene and emitting the whole time; it was
    // simply being covered up.
    mesh.renderOrder = 1 + i;
    group.add(mesh);
    disposables.push(geo, mat);

    viewDependent.push((view) => {
      const night = view === 'night';
      mat.emissive = night ? colour : new THREE.Color(0x000000);
      // Each shell contributes a thin slice; additively they sum to a smooth
      // gradient that is brightest against the letterform.
      // Shell i covers everything inside its own offset, so a point just
      // outside the letterform receives the sum of every shell. Eighteen shells
      // at 1.15 sum to about 8, which tone-maps to flat white and throws the
      // gradient away — the halo then reads as a paper cut-out. About 2 at the
      // core keeps it bright while leaving the falloff visible.
      // Peak matters more than any single shell here. A point beside the
      // letterform sits inside EVERY shell, so it receives the whole sum: at
      // 0.30 across 18 shells that came to about 2.3, and anything over 1 is
      // white however much over it is. Tuned so the blown-out core is a
      // fraction of an inch and the gradient beyond it is visible, which is
      // what a halo on a wall actually looks like.
      mat.emissiveIntensity = night ? 0.12 * (1 - t) ** 1.4 : 0;
      mat.opacity = night ? 1 : 0;

      // Hidden outright by day, not merely dimmed. Additive blending adds the
      // fragment colour whatever the alpha, so `opacity = 0` does not hide an
      // additive material — the shells kept contributing their lit base colour
      // and a halo-lit sign carried a white outline in broad daylight, which
      // §9.2 says is precisely what it must not have.
      mesh.visible = night;
      mat.needsUpdate = true;
    });
  }

  return group;
}

/**
 * Splits a mark's contours by fill, keeping each hole with the outer it belongs
 * to. A counter has no colour of its own — it is an absence in whichever fill
 * surrounds it — so it is matched to its container by containment.
 */
function groupByColour(contours: Contour[]): Array<{ colour?: string; contours: Contour[] }> {
  const outers = contours.filter((c) => !c.hole);
  const holes = contours.filter((c) => c.hole);
  const keys = [...new Set(outers.map((c) => c.colour ?? ''))];

  return keys.map((key) => {
    const mine = outers.filter((c) => (c.colour ?? '') === key);
    const myHoles = holes.filter((h) => {
      const probe = h.points[0]!;
      return mine.some((o) => pointInContours(probe, [o]));
    });
    return { colour: key || undefined, contours: [...mine, ...myHoles] };
  });
}

/** CL-C-02 pill box / CL-C-03 logo box / CL-C-07 push-through. */
function buildBox(
  el: SignElement,
  truth: ElementTruth,
  spec: SignSpec,
  mountPlaneZ: number,
  haloSurface: string,
  haloClip: HaloClip | null,
  viewDependent: Array<(view: View) => void>,
  disposables: Array<{ dispose(): void }>,
): THREE.Group {
  const g = new THREE.Group();
  const box = el.box!;
  const depth = truth.returnDepth;

  // A logo box is cut to the mark's silhouette (§9.2: "reads as the logo
  // silhouette, not a rectangle"), so its shape IS the artwork and already
  // carries absolute coordinates. A pill box is a generated rectangle in local
  // coordinates and has to be placed. Translating both is what put the logo box
  // an inch off its own artwork.
  const isContourCut = el.construction === 'CL-C-03';
  // Every shape in the mark, not the first one. §9.2: a logo box "reads as the
  // logo silhouette" — a silhouette drawn from one path of a five-path mark is
  // a different sign.
  const contourShapes = isContourCut ? contoursToShapes(el.contours) : [];
  const shape: THREE.Shape | THREE.Shape[] = isContourCut && contourShapes.length > 0
    ? contourShapes
    : boxShape(box.w, box.h, box.cornerRadius);

  // Centre the generated box on the copy it carries.
  const origin = isContourCut
    ? { x: 0, y: 0 }
    : {
        x: el.bbox.x + el.bbox.w / 2 - box.w / 2,
        y: el.bbox.y + el.capHeight / 2 - box.h / 2,
      };

  const canGeo = new THREE.ExtrudeGeometry(
    Array.isArray(shape) ? shape : [shape],
    { depth, bevelEnabled: false, curveSegments: 24 },
  );
  const canMat = returnMaterial(box.returnColour, truth.day, 'day');
  const standoff = truth.standoffGap ?? 0;
  const boxZ = mountPlaneZ + standoff;

  const can = new THREE.Mesh(canGeo, canMat);
  can.position.set(origin.x, origin.y, boxZ);
  can.castShadow = true;
  can.name = el.construction === 'CL-C-03' ? 'CL-P-32 logo box' : 'CL-P-21 pill box';
  g.add(can);
  disposables.push(canGeo, canMat);

  // §3.4 decides which surface carries which colour, and getting it backwards
  // inverts the whole day read. CL-CT-02 reversed-out is an opaque dark FIELD
  // with the copy knocked out to show the face colour — not a coloured field
  // with dark copy.
  // A logo box has no copy treatment — §9.2 says it "reads as the logo
  // silhouette" and its face "glows in the logo colours". Applying the
  // reversed-out default to it would paint the mark in the return colour.
  const ct = el.copyTreatment ?? 'CL-CT-02';
  const reversedOut = !isContourCut
    && (ct === 'CL-CT-02' || ct === 'CL-CT-04' || ct === 'CL-CT-05');
  const fieldColour = reversedOut ? returnColourOf(el) : box.faceColour;
  const copyColour = reversedOut ? box.faceColour : (el.face.renderColour ?? faceColourOf(el));

  const faceGeo = new THREE.ShapeGeometry(Array.isArray(shape) ? shape : [shape]);
  const faceMat = faceMaterial({ colour: fieldColour, truth: truth.day, view: 'day', translucent: !reversedOut });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(origin.x, origin.y, boxZ + depth + SURFACE_EPS);
  face.name = 'CL-P-01 face';
  g.add(face);
  disposables.push(faceGeo, faceMat);

  // CL-P-34 copy vinyl. §3.4 decides whether the copy or the field glows, and
  // the two are separate meshes so the night view can differ from the day view
  // without touching the geometry. A logo box has no separate copy — the face
  // already is the mark.
  // §9.2: the surface BEHIND a rear-illuminated element glows. On a logo box
  // that surface is the wall, exactly as it is for a letter.
  if (truth.night.backgroundEmissive) {
    g.add(buildHalo(el.contours, standoff, el.ledColour, haloSurface, mountPlaneZ, haloClip, viewDependent, disposables));
  }

  if (isContourCut) {
    // "FACE COLOR: Per Logo" — the face carries the mark's own colours, so it
    // is drawn as one mesh per fill rather than one slab in an average colour.
    const byColour = groupByColour(el.contours);
    if (byColour.length > 1 || byColour[0]?.colour) {
      face.visible = false;

      // Ordered by total area, largest first — a big background fill (a
      // sticker mark's own cream border, say) and a small foreground detail
      // (one letter's ink) share the artwork's own coordinates, and every
      // colour drawn at the identical face depth z-fights: which one wins is
      // decided by GPU floating-point noise per pixel, not by rendering
      // meaning, and the loser flickers through as a wrong-coloured scatter
      // wherever the background shape happens to cross a letter's own
      // stroke — measured on real output, exactly at one letter whose ink
      // the background sheet passed behind. Smaller shapes nudged forward is
      // the same fix the halo shells use for the identical problem, just
      // never applied here (see `i * 0.02` below `buildHalo`).
      const ordered = byColour
        .map((group) => ({
          group,
          area: group.contours.reduce((sum, c) => sum + absArea(c.points), 0),
        }))
        .sort((a, b) => b.area - a.area);

      ordered.forEach(({ group }, i) => {
        const geo = flat(group.contours);
        const mat = faceMaterial({
          colour: group.colour ?? box.faceColour,
          truth: truth.day, view: 'day', translucent: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(origin.x, origin.y, boxZ + depth + SURFACE_EPS * (1 + i * 0.02));
        mesh.renderOrder = 1 + i;
        mesh.name = `CL-P-01 face (${group.colour ?? 'per logo'})`;
        g.add(mesh);
        disposables.push(geo, mat);

        viewDependent.push((view) => {
          const t = view === 'day' ? truth.day : truth.night;
          setFaceLit(mat, group.colour ?? box.faceColour, !!t.faceEmissive && view === 'night');
        });
      });
      return g;
    }

    viewDependent.push((view) => {
      const t = view === 'day' ? truth.day : truth.night;
      setFaceLit(faceMat, box.faceColour, !!t.faceEmissive && view === 'night');
    });
    return g;
  }

  const copyGeo = flat(el.contours);
  const copyMat = copyMaterial(copyColour);
  const copy = new THREE.Mesh(copyGeo, copyMat);
  copy.position.z = boxZ + depth + SURFACE_EPS * 2;
  copy.name = 'CL-P-34 copy vinyl';
  g.add(copy);
  disposables.push(copyGeo, copyMat);

  viewDependent.push((view) => {
    const t = view === 'day' ? truth.day : truth.night;
    const fieldGlow = !!t.fieldEmissive && view === 'night';
    const copyGlow = !!t.copyEmissive && view === 'night';

    setFaceLit(faceMat, fieldColour, fieldGlow);
    copyMat.emissive = copyGlow ? resolveColour(copyColour) : new THREE.Color(0x000000);
    copyMat.emissiveIntensity = copyGlow ? 1 : 0;
    copyMat.toneMapped = !copyGlow;
    copyMat.needsUpdate = true;
  });

  return g;
}
