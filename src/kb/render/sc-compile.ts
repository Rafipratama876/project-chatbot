/**
 * Compiles a finished `SCSpec` into the `SignSpec` shape the shared three.js
 * renderer (`scene.ts`, `materials.ts`, `RenderService`) already knows how to
 * draw. This is the ONLY place a Sign Cabinet job becomes a `SignSpec`: no SC
 * rule ever runs against one, and the CL rule engine (`runEngine`,
 * `ALL_RULES`) and the DL engine (`runDLEngine`) are never invoked here.
 *
 * `construction: SC_CABINET_CONSTRUCTION` ('SC-C-01') is Sign Cabinets' own
 * token — cast rather than added to `taxonomy.ts`'s pinned 7-member
 * `Construction` union, the same device `dl-compile.ts` uses for `DL-C-01`.
 * Unlike DL's token, this one is NOT recognised by `isBoxConstruction`
 * (domain/spec.ts): `scene.ts` dispatches `=== SC_CABINET_CONSTRUCTION` to
 * its own `buildSCCabinet` and `contract.ts`'s `truthFor` returns its own
 * hardcoded day/night truth, both ahead of (never inside) the shared
 * Channel Letters box-construction branches. The visual result is the box
 * the PDF's day/night mockups show — whole face and graphic dark and solid
 * by day, glowing together at night — but the code path, the mesh name
 * ('SC-P-21 cabinet box', not Channel Letters' 'CL-P-21 pill box') and the
 * `ENV_REFLECTANCE` entry in `materials.ts` are entirely SC's own: a future
 * change to Channel Letters' pill/logo/push-through box rendering, or to its
 * `CL-CT-03` copy-treatment table, cannot move a cabinet, and vice versa.
 * Neither token is ever read by a `CL-R-*` rule, and neither reaches Channel
 * Letters' own output layer (`specBlock.ts`/`proofSheet.ts`), which SC never
 * calls.
 *
 * `type: 'CL-T-04'` (Non-Lit) is reused as-is, unlike the construction — it IS
 * a real, existing `SignType`, and `rearIlluminated: false` is exactly right:
 * a cabinet's face glows, but there is no separate halo behind it.
 */
import type { SignSpec, SignElement, WolfStudioForm } from '../domain/spec.js';
import { SC_CABINET_CONSTRUCTION } from '../domain/spec.js';
import type { RenderContract } from './contract.js';
import type { SCSpec } from '../domain/sc-spec.js';
import { scDepthOf, scFaceColourOf } from '../domain/sc-spec.js';
import type { FaceMaterial } from '../domain/materials.js';
import type { Pt } from '../domain/spec.js';
import { SC_FACE_MATERIAL_FACTS } from '../domain/sc-taxonomy.js';

/** Purely an internal render-material hint — never shown on the SC proof. */
function faceMaterialToken(family: SCSpec['faceMaterial']): FaceMaterial {
  switch (family) {
    case 'panel-with-vinyl':
    case 'cut-through-face':
    case 'push-through-acrylic':
      return 'aluminium';
    case 'flex-face':
      return 'polycarbonate';
    default:
      return 'acrylic';
  }
}

export function compileSCSpecToSignSpec(spec: SCSpec): SignSpec {
  const facts = SC_FACE_MATERIAL_FACTS[spec.faceMaterial];
  const depth = scDepthOf(spec.cabinet);
  const faceColour = scFaceColourOf(spec.cabinet);
  const { w, h } = spec.cabinet.bbox;
  const cornerRadius = spec.cabinet.cornerStyle === 'radius'
    ? Math.min(spec.cabinet.cornerRadius ?? 6, Math.min(w, h) / 2)
    : 0;

  // `buildSCCabinet` draws the box from `el.box` — a generated rectangle in
  // local coordinates — not from `contours`. `contours` below is still
  // populated with a plain rectangle: harmless, and keeps the field a real
  // outline rather than an empty placeholder for anything downstream that
  // measures it (bbox-derived fields already carry the real geometry).
  const rectPoints: Pt[] = [
    { x: spec.cabinet.bbox.x, y: spec.cabinet.bbox.y },
    { x: spec.cabinet.bbox.x + w, y: spec.cabinet.bbox.y },
    { x: spec.cabinet.bbox.x + w, y: spec.cabinet.bbox.y + h },
    { x: spec.cabinet.bbox.x, y: spec.cabinet.bbox.y + h },
  ];

  const element: SignElement = {
    id: 'cabinet',
    role: 'CL-E-01',
    content: spec.businessName,
    itemIds: spec.artwork.map((a) => a.id),
    construction: SC_CABINET_CONSTRUCTION, // SC's own box token — see module comment.
    // No `copyTreatment` — SC's day/night truth is hardcoded in `contract.ts`'s
    // own `SC_CABINET_CONSTRUCTION` branch, never looked up from a copy-treatment
    // table, so there is nothing for this field to select.
    bbox: spec.cabinet.bbox,
    baselineY: spec.cabinet.bbox.y + spec.cabinet.bbox.h,
    capHeight: spec.cabinet.bbox.h,
    narrowestStroke: 0,
    contours: [{ points: rectPoints, hole: false }],
    returnDepth: depth,
    returnColour: faceColour,
    face: { material: faceMaterialToken(spec.faceMaterial), colour: faceColour, renderColour: faceColour },
    trimCap: { kind: 'none' },
    back: 'aluminium',
    lit: spec.cabinet.lit && facts.illuminable,
    ledColour: spec.cabinet.ledColour,
    standoff: undefined,
    suggestions: spec.cabinet.suggestions,
    box: {
      shape: cornerRadius > 0 ? 'rounded-rectangle' : 'rectangle',
      w, h, depth, cornerRadius,
      faceColour, returnColour: faceColour,
    },
  };

  // A minimal, valid WolfStudioForm — never read by SC's own output layer,
  // only present because SignSpec.form is required by the shared type.
  const form: WolfStudioForm = {
    businessName: spec.businessName,
    channelLetterType: 'Non-Lit',
    installationMethod: 'Flush Mounted',
  };

  // `renderContract` is left unset deliberately — unlike DL, SC's day/night
  // truth is entirely carried by `SC_CABINET_CONSTRUCTION`'s own branch in
  // `contract.ts`'s `truthFor`, so the shared `buildRenderContract(spec)`
  // (called by `RenderService` when `spec.renderContract` is absent)
  // produces the right contract on its own. Nothing SC-specific needs to run
  // before render.
  const contract: RenderContract | undefined = undefined;

  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    form,
    type: 'CL-T-04', // Non-Lit — reused as a render token; see module comment.
    subtypes: [],
    mount: 'CL-MT-01', // internal render token only — never shown; SC's real mount is on SCSpec.mount
    artwork: spec.artwork,
    elements: [element],
    backer: { present: false, shape: 'straight-flat', material: 'acm', w: 0, h: 0, depth: 0, colour: 'n/a', housesSupplies: false },
    mountingSurface: { colour: spec.mountingSurface.colour, kind: 'wall' },
    overall: spec.overall,
    quantity: spec.quantity,
    proofOptions: spec.proofOptions,
    views: spec.views,
    renderContract: contract,
    externalIllumination: false,
    site: spec.site,
    placement: spec.placement,
    artworkProvenance: spec.artworkProvenance,
    escalations: [],
    blocked: spec.blocked,
  };
}
