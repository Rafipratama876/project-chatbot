/**
 * The Dimensional Letters data model — the DL equivalent of `spec.ts`.
 *
 * Deliberately its own object, not a variant of `SignSpec`: a DL job has no
 * trim cap, no raceway, no backer, no return colour distinct from the face,
 * and (almost always) no illumination, so forcing it through `SignSpec`
 * would mean every DL proof carrying a pile of channel-letters fields that
 * are meaningless for it. The two boundary types that genuinely are generic —
 * artwork geometry and photo placement — are reused directly from `spec.ts`
 * rather than redeclared.
 */
import { z } from 'zod';
import type { Inches } from './units.js';
import {
  ArtworkItemSchema, PlacementSchema, ArtworkProvenanceSchema,
  type ArtworkItem, type PlacementInput, type ArtworkProvenance,
  type Contour, type Rect, type Escalation,
} from './spec.js';
import type { DLMaterialFamily, DLFinish, DLMount, DLMountingSurfaceTexture } from './dl-taxonomy.js';

// ── Intake: the DL wizard form ─────────────────────────────────────────────

export const DLJobFormSchema = z.object({
  businessName: z.string().min(1),
  /** A DL_FORM_MATERIAL_MAP key, or free text resolved via Additional Information. */
  materialFamily: z.string(),
  finish: z.string().optional(),
  colour: z.string().optional(),
  /** A DL_FORM_MOUNT_MAP key, or free text ('Other'). */
  mountingMethod: z.string(),
  mountingSurfaceColour: z.string().optional(),
  mountingSurfaceTexture: z.enum(['smooth', 'uneven', 'unspecified']).optional(),
  depth: z.number().positive().optional(),
  quantity: z.number().int().positive().optional(),
  illuminated: z.boolean().optional(),
  ledColour: z.string().optional(),
  showSizesOnProof: z.boolean().optional(),
  showMaterialThickness: z.boolean().optional(),
  /** The only field an LLM parses — mirrors CL's §1.2/§7.1 free-text ports. */
  additionalInformation: z.string().optional(),
  site: z.object({
    area: z.object({ w: z.number(), h: z.number() }).optional(),
    protrusionLimit: z.number().positive().optional(),
    permittedAreaSqFt: z.number().positive().optional(),
  }).optional(),
});
export type DLJobForm = z.infer<typeof DLJobFormSchema>;

export const DLJobInputSchema = z.object({
  jobId: z.string(),
  form: DLJobFormSchema,
  artwork: z.array(ArtworkItemSchema).min(1),
  placement: PlacementSchema.optional(),
  artworkProvenance: ArtworkProvenanceSchema.optional(),
});
export type DLJobInput = z.infer<typeof DLJobInputSchema>;

// ── The spec the DL engine builds ──────────────────────────────────────────

export interface DLElement {
  id: string;
  content: string;
  itemIds: string[];

  bbox: Rect;
  baselineY: Inches;
  capHeight: Inches;
  contours: Contour[];

  /** Unset until Gate 3 (defaults). Non-null for every stage after. */
  depth?: Inches;
  colour?: string;
  finish?: DLFinish;

  /** True only for flat-cut-acrylic / flat-cut-pvc, and only if requested. */
  lit: boolean;
  ledColour?: string;
  standoff?: Inches;

  suggestions?: string[];
}

export interface DLSpec {
  jobId: string;
  businessName: string;
  form: DLJobForm;

  materialFamily: DLMaterialFamily;
  /** Set when CL-style free-text resolution filled in the family/mount. */
  resolvedFrom?: { field: string; text: string; confidence: number };

  artwork: ArtworkItem[];
  elements: DLElement[];

  mount: DLMount;
  mountingSurface: { colour: string; texture: DLMountingSurfaceTexture };
  requiresInstallTemplate: boolean;

  overall: { w: Inches; h: Inches };
  quantity: number;

  proofOptions: { showSizes: boolean; showThickness: boolean };
  views: Array<'day' | 'night'>;
  /** Built in DL Gate 5. The renderer consumes exactly this object. */
  renderContract?: import('../render/contract.js').RenderContract;

  site: NonNullable<DLJobForm['site']>;
  placement?: PlacementInput;
  artworkProvenance?: ArtworkProvenance;
  escalations: Escalation[];
  /** True once a hard-stop rule fired; the pipeline stops rendering. */
  blocked: boolean;
}

// ── Derived helpers ─────────────────────────────────────────────────────────

export function dlBboxOf(items: Array<{ bbox: Rect }>): Rect {
  const xs = items.map((i) => i.bbox.x);
  const ys = items.map((i) => i.bbox.y);
  const x2 = items.map((i) => i.bbox.x + i.bbox.w);
  const y2 = items.map((i) => i.bbox.y + i.bbox.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y };
}

export const dlSqFt = (r: { w: Inches; h: Inches }): number => (r.w * r.h) / 144;

function resolved<T>(value: T | undefined, el: DLElement, field: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `${field} is unresolved on element ${el.id} ("${el.content}"). `
      + 'It is set by DL Gate 3 (defaults) — this code ran before that gate.',
    );
  }
  return value;
}

export const dlDepthOf = (el: DLElement): Inches => resolved(el.depth, el, 'depth');
export const dlColourOf = (el: DLElement): string => resolved(el.colour, el, 'colour');
export const dlFinishOf = (el: DLElement): DLFinish => resolved(el.finish, el, 'finish');
export const anyDLLit = (spec: DLSpec): boolean => spec.elements.some((e) => e.lit);
