/**
 * KB §9.2 — "What must be visually true", per construction.
 *
 * Read the KB table as a list of requirements rather than a description and
 * every row is a statement about geometry or lighting: which surfaces emit,
 * which stay opaque, whether a gap exists and how big. None of it is taste.
 * That is exactly the category a scene graph gets right by construction and a
 * sampled image gets right by luck, so it is expressed here as assertions the
 * renderer is checked against — not as adjectives in a prompt.
 */
import type { SignSpec, SignElement } from '../domain/spec.js';
import type { Construction, CopyTreatment } from '../domain/taxonomy.js';
import { TYPES, COPY_TREATMENT_FACTS } from '../domain/taxonomy.js';
import { isBoxConstruction, depthOf } from '../domain/spec.js';

export type View = 'day' | 'night';

/** What each surface does in a given view. The renderer maps these to materials. */
export interface SurfaceTruth {
  faceEmissive: boolean;
  faceOpaque: boolean;
  returnsEmissive: boolean;
  /** Halo: the surface BEHIND the element glows, the element does not. */
  backgroundEmissive: boolean;
  copyEmissive?: boolean;
  fieldEmissive?: boolean;
  castsShadow: boolean;
}

export interface ElementTruth {
  elementId: string;
  construction: Construction;
  copyTreatment?: CopyTreatment;
  day: SurfaceTruth;
  night: SurfaceTruth;
  /** §9.2: drawn for every rear-illuminated element. */
  standoffGap?: number;
  /** §9.2: return depth reads consistently in perspective at this value. */
  returnDepth: number;
  /** The KB sentence this row came from, for the audit log. */
  source: string;
}

export interface RenderContract {
  views: View[];
  elements: ElementTruth[];
  /** §9.2 "True of every render". */
  global: {
    withinMeasuredArea: boolean;
    clearsObstructions: boolean;
    depthConsistentInPerspective: boolean;
    /** Box faces sit in the same plane as the letter faces. */
    coplanarFaces: boolean;
    mountingStructureSurfaceColoured: boolean;
    standoffDrawnForRearLit: boolean;
    bottomMountedSitsOnRail: boolean;
    proportionsPreserved: boolean;
    readsAsOneObject: boolean;
    /** No rivets, studs, drivers, conduit in a customer-facing render. */
    noFabricationHardware: boolean;
  };
}

const NONE: SurfaceTruth = {
  faceEmissive: false, faceOpaque: true, returnsEmissive: false,
  backgroundEmissive: false, castsShadow: true,
};

function truthFor(spec: SignSpec, el: SignElement): { day: SurfaceTruth; night: SurfaceTruth; source: string } {
  const t = TYPES[spec.type];

  if (el.construction === 'CL-C-01') {
    switch (t.illumination) {
      case 'front':
        return {
          day: { ...NONE, faceOpaque: false },
          night: { ...NONE, faceOpaque: false, faceEmissive: true },
          source: 'Face glows. Returns and trim dark. Nothing behind glows.',
        };
      case 'halo':
        return {
          day: { ...NONE },
          night: { ...NONE, backgroundEmissive: true },
          source: 'Surface behind glows in a halo; face stays dark and solid.',
        };
      case 'front+halo':
        return {
          day: { ...NONE, faceOpaque: false },
          night: { ...NONE, faceOpaque: false, faceEmissive: true, backgroundEmissive: true },
          source: 'Face glows and halo present, balanced.',
        };
      case 'side':
        return {
          day: { ...NONE },
          night: { ...NONE, returnsEmissive: true },
          source: 'LEDs light the return/edge only.',
        };
      default:
        return { day: { ...NONE }, night: { ...NONE }, source: 'Never self-illuminated.' };
    }
  }

  // §9.2 gives the logo box its own row: "Reads as the logo silhouette, not a
  // rectangle. Face glows in the logo colours." It has no copy treatment —
  // there is no copy, the face IS the mark — so routing it through the §3.4
  // table applies the reversed-out default and leaves the sign dark at night.
  if (el.construction === 'CL-C-03') {
    // §9.2's logo-box row describes the FACE. Whether anything glows behind it
    // is a property of the sign type, exactly as it is for channel letters — a
    // logo box on a CL-T-03 sign is front and back lit, and rendering it with
    // a lit face and no halo shows a different construction from the one the
    // spec block sells.
    return {
      day: { ...NONE, faceOpaque: true },
      night: {
        ...NONE,
        faceOpaque: false,
        faceEmissive: true,
        fieldEmissive: true,
        backgroundEmissive: t.rearIlluminated,
      },
      source: t.rearIlluminated
        ? 'Reads as the logo silhouette, not a rectangle. Face glows in the logo colours, with a halo behind.'
        : 'Reads as the logo silhouette, not a rectangle. Face glows in the logo colours.',
    };
  }

  if (isBoxConstruction(el.construction)) {
    const ct = el.copyTreatment ?? 'CL-CT-02';
    const facts = COPY_TREATMENT_FACTS[ct];
    return {
      day: { ...NONE, faceOpaque: true },
      night: {
        ...NONE,
        faceOpaque: !facts.fieldGlows,
        fieldEmissive: facts.fieldGlows,
        copyEmissive: facts.copyGlows,
        faceEmissive: facts.fieldGlows,
      },
      source: `${facts.label}: ${facts.night}`,
    };
  }

  if (el.construction === 'CL-C-04' || el.construction === 'CL-C-05') {
    return {
      day: { ...NONE },
      night: { ...NONE, castsShadow: true },
      source: 'Flat, dimensional, cast shadow, no visible return depth. Dark at night, no glow of any kind.',
    };
  }

  // CL-C-06 applied vinyl
  return {
    day: { ...NONE, castsShadow: false },
    night: { ...NONE, castsShadow: false },
    source: 'Flat graphics, no dimension, no shadow. Dark.',
  };
}

export function buildRenderContract(spec: SignSpec): RenderContract {
  const t = TYPES[spec.type];
  return {
    // §9.1: any element illuminated → day + night. Nothing illuminated → day,
    // and night only if external illumination was specified.
    views: spec.elements.some((e) => e.lit) || spec.externalIllumination
      ? ['day', 'night']
      : ['day'],
    elements: spec.elements.map((el) => {
      const { day, night, source } = truthFor(spec, el);
      return {
        elementId: el.id,
        construction: el.construction,
        copyTreatment: el.copyTreatment,
        day,
        night,
        // A logo box on a rear-illuminated sign stands off the wall for the
        // same reason a letter does: light cannot escape a flush-mounted one.
        standoffGap: t.rearIlluminated && (el.construction === 'CL-C-01' || el.construction === 'CL-C-03')
          ? el.standoff
          : undefined,
        returnDepth: el.construction === 'CL-C-06' ? 0 : (el.box?.depth ?? depthOf(el)),
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
      bottomMountedSitsOnRail: spec.mount === 'CL-MT-05',
      proportionsPreserved: true,
      readsAsOneObject: true,
      noFabricationHardware: true,
    },
  };
}

export interface ContractViolation { elementId?: string; requirement: string; detail: string }

/**
 * Checked against the built scene, not against a picture. If this returns
 * anything, the render does not match the spec block and must not ship.
 */
export function verifyContract(spec: SignSpec, contract: RenderContract): ContractViolation[] {
  const v: ContractViolation[] = [];
  const t = TYPES[spec.type];

  const letterDepth = spec.elements.find((e) => e.construction === 'CL-C-01')?.returnDepth;
  for (const el of spec.elements) {
    if (el.box && letterDepth !== undefined && Math.abs(el.box.depth - letterDepth) > 1e-6) {
      v.push({
        elementId: el.id,
        requirement: 'Box faces sit in the same plane as the letter faces',
        detail: `box depth ${el.box.depth}″ vs letter return depth ${letterDepth}″`,
      });
    }
    if (t.rearIlluminated && el.construction === 'CL-C-01' && !el.standoff) {
      v.push({
        elementId: el.id,
        requirement: 'Standoff gap drawn for every rear-illuminated element',
        detail: 'no standoff set',
      });
    }
  }

  if (contract.views.includes('night') && !spec.elements.some((e) => e.lit) && !spec.externalIllumination) {
    v.push({ requirement: '§9.1 required views', detail: 'night view requested for a sign with nothing illuminated' });
  }
  if (!contract.views.includes('night') && spec.elements.some((e) => e.lit)) {
    v.push({ requirement: '§9.1 required views', detail: 'illuminated sign without a night view' });
  }

  if (spec.raceway && spec.mountingSurface.colour !== 'unspecified'
    && spec.raceway.colour !== spec.mountingSurface.colour
    && spec.raceway.colour !== 'match building colour'
    && spec.raceway.colour !== 'match mounting surface') {
    v.push({
      requirement: 'Raceway, wireway or bottom rail drawn surface-coloured',
      detail: `${spec.raceway.kind} colour "${spec.raceway.colour}" vs surface "${spec.mountingSurface.colour}"`,
    });
  }

  return v;
}
