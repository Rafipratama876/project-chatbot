/**
 * The Sign Cabinets data model — the SC equivalent of `spec.ts`/`dl-spec.ts`.
 *
 * Deliberately its own object, not a variant of `SignSpec` or `DLSpec`: a
 * cabinet is one lit box, not N letters — there is no per-glyph geometry, no
 * stroke width, no baseline. `SCSpec` holds a single `cabinet`, not an
 * `elements[]` array. The two boundary types that genuinely are generic —
 * artwork geometry (the face graphic) and photo placement — are reused
 * directly from `spec.ts` rather than redeclared, same as DL does.
 */
import { z } from 'zod';
import type { Inches } from './units.js';
import {
  ArtworkItemSchema, PlacementSchema, ArtworkProvenanceSchema,
  type ArtworkItem, type PlacementInput, type ArtworkProvenance,
  type Contour, type Rect, type Escalation,
} from './spec.js';
import type {
  SCFaceMaterial, SCMount, SCMountingSurfaceTexture, SCRetainerType, SCCornerStyle,
} from './sc-taxonomy.js';

// ── Intake: the Sign Cabinet wizard form ────────────────────────────────────

export const SCJobFormSchema = z.object({
  businessName: z.string().min(1),
  /** A SC_FORM_FACE_MATERIAL_MAP key, or free text resolved via Additional Information. */
  faceMaterial: z.string(),
  faceColour: z.string().optional(),
  illuminated: z.boolean().optional(),
  ledColour: z.string().optional(),
  extrusionDepth: z.number().positive().optional(),
  cornerStyle: z.enum(['square', 'radius']).optional(),
  cornerRadius: z.number().positive().optional(),
  retainerType: z.string().optional(),
  /** A SC_FORM_MOUNT_MAP key, or free text ('Other'). */
  mountingMethod: z.string(),
  mountingSurfaceColour: z.string().optional(),
  mountingSurfaceTexture: z.enum(['smooth', 'uneven', 'unspecified']).optional(),
  /** §9 attachment detail (saddle, thru-pole, stiff arm, …) — a note, not a rule input. */
  attachmentDetail: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  showSizesOnProof: z.boolean().optional(),
  showMaterialThickness: z.boolean().optional(),
  /** The only field an LLM parses — mirrors CL's §1.2/§7.1 and DL's free-text ports. */
  additionalInformation: z.string().optional(),
  site: z.object({
    area: z.object({ w: z.number(), h: z.number() }).optional(),
    protrusionLimit: z.number().positive().optional(),
    permittedAreaSqFt: z.number().positive().optional(),
  }).optional(),
});
export type SCJobForm = z.infer<typeof SCJobFormSchema>;

export const SCJobInputSchema = z.object({
  jobId: z.string(),
  form: SCJobFormSchema,
  artwork: z.array(ArtworkItemSchema).min(1),
  placement: PlacementSchema.optional(),
  artworkProvenance: ArtworkProvenanceSchema.optional(),
});
export type SCJobInput = z.infer<typeof SCJobInputSchema>;

// ── The spec the SC engine builds ───────────────────────────────────────────

/** One lit box — the whole sign. Unlike CL/DL there is exactly one of these per job. */
export interface SCCabinet {
  bbox: Rect;
  contours: Contour[];

  /** Unset until Gate 3 (defaults). Non-null for every stage after. */
  depth?: Inches;
  faceColour?: string;
  retainerType?: SCRetainerType;
  cornerStyle?: SCCornerStyle;
  cornerRadius?: Inches;

  /** True only when the face material is illuminable, and only if requested. */
  lit: boolean;
  ledColour?: string;

  suggestions?: string[];
}

export interface SCSpec {
  jobId: string;
  businessName: string;
  form: SCJobForm;

  faceMaterial: SCFaceMaterial;
  /** Set when free-text resolution filled in the face material/mount. */
  resolvedFrom?: { field: string; text: string; confidence: number };

  artwork: ArtworkItem[];
  cabinet: SCCabinet;

  mount: SCMount;
  mountingSurface: { colour: string; texture: SCMountingSurfaceTexture };
  attachmentDetail?: string;

  overall: { w: Inches; h: Inches };
  quantity: number;

  proofOptions: { showSizes: boolean; showThickness: boolean };
  views: Array<'day' | 'night'>;
  /** Built in SC Gate 5. The renderer consumes exactly this object. */
  renderContract?: import('../render/contract.js').RenderContract;

  site: NonNullable<SCJobForm['site']>;
  placement?: PlacementInput;
  artworkProvenance?: ArtworkProvenance;
  escalations: Escalation[];
  /** True once a hard-stop rule fired; the pipeline stops rendering. */
  blocked: boolean;
}

// ── Derived helpers ─────────────────────────────────────────────────────────

export const scSqFt = (r: { w: Inches; h: Inches }): number => (r.w * r.h) / 144;

function resolved<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `${field} is unresolved on the cabinet. It is set by SC Gate 3 (defaults) — `
      + 'this code ran before that gate.',
    );
  }
  return value;
}

export const scDepthOf = (c: SCCabinet): Inches => resolved(c.depth, 'depth');
export const scFaceColourOf = (c: SCCabinet): string => resolved(c.faceColour, 'faceColour');
export const scRetainerOf = (c: SCCabinet): SCRetainerType => resolved(c.retainerType, 'retainerType');
export const scCornerStyleOf = (c: SCCabinet): SCCornerStyle => resolved(c.cornerStyle, 'cornerStyle');
