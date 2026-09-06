/**
 * Compiles a finished `SCSpec` into the `SignSpec` shape the shared three.js
 * renderer (`scene.ts`, `materials.ts`, `RenderService`) already knows how to
 * draw. This is the ONLY place a Sign Cabinet job becomes a `SignSpec`: no SC
 * rule ever runs against one, and the CL rule engine (`runEngine`,
 * `ALL_RULES`) and the DL engine (`runDLEngine`) are never invoked here.
 *
 * Unlike `dl-compile.ts`, this does NOT need a private, cast construction
 * token: `construction: 'CL-C-02'` (Pill box) is a real, existing member of
 * `taxonomy.ts`'s `Construction` union, and `isBoxConstruction`'s facts —
 * a rectangular illuminated box, dark by day, glowing by night — are exactly
 * right for a sign cabinet. `copyTreatment: 'CL-CT-03'` ("Translucent vinyl
 * copy on a white face": `fieldGlows: true, copyGlows: true`) is the day/night
 * truth the PDF's own day/night mockups show — the whole face, background and
 * graphic together, dark by day and glowing by night. Reusing these two
 * existing taxonomy values as render tokens is the same trick `dl-compile.ts`
 * documents for `type: 'CL-T-04'`: they are read only for their render facts,
 * by `contract.ts`'s generic `truthFor`/`isBoxConstruction` switch and by
 * `scene.ts` — never by a `CL-R-*` rule, and never by Channel Letters' own
 * output layer (`specBlock.ts`/`proofSheet.ts`), which SC never calls.
 *
 * `type: 'CL-T-04'` (Non-Lit) is reused as-is, unlike the construction — it IS
 * a real, existing `SignType`, and `rearIlluminated: false` is exactly right:
 * a cabinet's face glows, but there is no separate halo behind it.
 */
import type { SignSpec, SignElement, WolfStudioForm } from '../domain/spec.js';
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

  // A pill box (CL-C-02) is drawn from `el.box` — a generated rectangle in
  // local coordinates — not from `contours` (`buildBox` in scene.ts only
  // reads contours for CL-C-03's logo-silhouette cut). `contours` below is
  // still populated with a plain rectangle: harmless, and keeps the field a
  // real outline rather than an empty placeholder for anything downstream
  // that measures it (bbox-derived fields already carry the real geometry).
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
    construction: 'CL-C-02', // Pill box — real taxonomy value, reused for its render facts only.
    copyTreatment: 'CL-CT-03', // Whole face + graphic glow together at night, dark by day.
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
  // truth is entirely carried by the reused `CL-C-02`/`CL-CT-03` tokens, so
  // the shared `buildRenderContract(spec)` (called by `RenderService` when
  // `spec.renderContract` is absent) produces the right contract on its own,
  // through the same `isBoxConstruction` branch a Channel Letters pill-box
  // job already exercises. Nothing SC-specific needs to run before render.
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
