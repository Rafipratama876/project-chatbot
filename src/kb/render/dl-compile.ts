/**
 * Compiles a finished `DLSpec` into the `SignSpec` shape the shared three.js
 * renderer (`scene.ts`, `materials.ts`, `RenderService`) already knows how to
 * draw. This is the ONLY place a DL job becomes a `SignSpec`: no DL rule ever
 * runs against one, and the CL rule engine (`runEngine`, `ALL_RULES`) is
 * never invoked here.
 *
 * `construction: 'DL-C-01'` is deliberately NOT a member of `taxonomy.ts`'s
 * `Construction` union — `test/coverage.spec.ts` pins that union at exactly
 * the 7 constructions KB v2.2 transcribes, on purpose, and growing it for a
 * render-only token would be exactly the kind of coupling between the two
 * pipelines the isolation is meant to prevent. So it is carried as a plain
 * string, cast at the two points shared code requires the `Construction`
 * type — the shared code paths that matter for this element
 * (`scene.ts`'s new `isDimensionalLetter` branch, and `verifyContract`'s
 * generic checks) only ever compare it with `===`, never index a lookup
 * table by it (confirmed: `CONSTRUCTION_FACTS` is read only by CL's own
 * `specBlock.ts`/`proofSheet.ts`/`gate2-composition.ts`, none of which DL
 * calls), so an unmapped value is safe at runtime.
 *
 * `type: 'CL-T-04'` (Non-Lit) is reused as-is, unlike `construction` — it IS
 * a real, existing `SignType` (no new value, no coverage-test risk), and its
 * facts (`translucentFace: false`, `rearIlluminated: false`) are exactly
 * right for a dimensional letter: `TYPES[spec.type]` is read unconditionally
 * by `scene.ts`/`lighting.ts`/`contract.ts`'s `verifyContract`, so it has to
 * resolve to something, and this is genuinely the correct something rather
 * than a placeholder.
 *
 * `buildRenderContract` from `./contract.js` is deliberately NOT used —
 * its `truthFor` switch has no `DL-C-01` case and would fall through to the
 * "applied vinyl" branch (flat, no shadow, no depth), which is wrong for a
 * dimensional letter. `buildDLRenderContract` below is DL's own, much
 * smaller version of the same idea.
 */
import type { SignSpec, SignElement, WolfStudioForm } from '../domain/spec.js';
import type { Construction } from '../domain/taxonomy.js';
import type { FaceMaterial } from '../domain/materials.js';
import type { RenderContract, SurfaceTruth, ElementTruth } from './contract.js';
import type { DLSpec, DLElement } from '../domain/dl-spec.js';
import { dlDepthOf, dlColourOf } from '../domain/dl-spec.js';
import type { DLMaterialFamily } from '../domain/dl-taxonomy.js';

/** See the module comment: intentionally not in `taxonomy.ts`'s `Construction` union. */
const DL_RENDER_CONSTRUCTION = 'DL-C-01' as unknown as Construction;

const NONE: SurfaceTruth = {
  faceEmissive: false, faceOpaque: true, returnsEmissive: false,
  backgroundEmissive: false, castsShadow: true,
};

function truthForDL(el: DLElement): { day: SurfaceTruth; night: SurfaceTruth; source: string } {
  if (!el.lit) {
    return {
      day: { ...NONE }, night: { ...NONE },
      source: 'Dimensional, dark day and night, casts a shadow, no glow of any kind (PDF scope: cast metal, flat cut, injection molded, formed plastic, foam and HDU are never illuminated).',
    };
  }
  // The one illuminable branch — flat-cut acrylic/PVC (PDF "Gemini flat cut
  // acrylic / lit acrylic"), same day/night truth as a CL-C-01 front-lit letter.
  return {
    day: { ...NONE, faceOpaque: false },
    night: { ...NONE, faceOpaque: false, faceEmissive: true },
    source: 'Flat-cut acrylic/PVC, front-lit: face glows at night, dark and solid by day.',
  };
}

export function buildDLRenderContract(spec: DLSpec): RenderContract {
  return {
    views: spec.views,
    elements: spec.elements.map((el): ElementTruth => {
      const { day, night, source } = truthForDL(el);
      return {
        elementId: el.id,
        construction: DL_RENDER_CONSTRUCTION,
        day,
        night,
        standoffGap: el.standoff,
        returnDepth: dlDepthOf(el),
        source,
      };
    }),
    global: {
      withinMeasuredArea: true,
      clearsObstructions: true,
      depthConsistentInPerspective: true,
      coplanarFaces: true,
      mountingStructureSurfaceColoured: true,
      standoffDrawnForRearLit: true,
      bottomMountedSitsOnRail: false,
      proportionsPreserved: true,
      readsAsOneObject: true,
      noFabricationHardware: true,
    },
  };
}

/** Purely an internal render-material hint — never shown on the DL proof. */
function faceMaterialToken(family: DLMaterialFamily): FaceMaterial {
  switch (family) {
    case 'cast-metal':
    case 'flat-cut-metal':
      return 'aluminium';
    case 'flat-cut-acrylic':
      return 'acrylic';
    default:
      return 'polycarbonate';
  }
}

export function compileDLSpecToSignSpec(spec: DLSpec): SignSpec {
  const contract = buildDLRenderContract(spec);

  const elements: SignElement[] = spec.elements.map((el): SignElement => {
    const colour = dlColourOf(el);
    return {
      id: el.id,
      role: 'CL-E-01',
      content: el.content,
      itemIds: el.itemIds,
      construction: DL_RENDER_CONSTRUCTION,
      bbox: el.bbox,
      baselineY: el.baselineY,
      capHeight: el.capHeight,
      narrowestStroke: 0,
      contours: el.contours,
      returnDepth: dlDepthOf(el),
      // Dimensional letters are one uniform material front-to-back, unlike a
      // channel letter's separate face/return colours — same value both sides
      // so the extrusion in scene.ts reads as one solid piece.
      returnColour: colour,
      face: { material: faceMaterialToken(spec.materialFamily), colour, renderColour: colour },
      trimCap: { kind: 'none' },
      back: 'none',
      lit: el.lit,
      ledColour: el.ledColour,
      standoff: el.standoff,
      suggestions: el.suggestions,
    };
  });

  // A minimal, valid WolfStudioForm — never read by DL's own output layer,
  // only present because SignSpec.form is required by the shared type.
  const form: WolfStudioForm = {
    businessName: spec.businessName,
    channelLetterType: 'Non-Lit',
    installationMethod: 'Flush Mounted',
  };

  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    form,
    type: 'CL-T-04', // Non-Lit — reused as a render token; see module comment.
    subtypes: [],
    mount: 'CL-MT-01', // internal render token only — never shown; DL's real mount is on DLSpec.mount
    artwork: spec.artwork,
    elements,
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
