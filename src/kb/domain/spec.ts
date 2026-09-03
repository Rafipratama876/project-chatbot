/**
 * The data model the whole pipeline mutates. Zod guards the two external
 * boundaries (the Wolf Studio form, and LLM output); everything internal is a
 * plain interface, because the rule engine — not a parser — is what makes the
 * spec valid.
 */
import { z } from 'zod';
import type { Inches } from './units.js';
import type {
  SignType, MountMethod, Construction, CopyTreatment, ElementRole, SubType,
} from './taxonomy.js';
import type { FaceMaterial, BackerMaterial, BackerShape, PaintSystem, FilmSystem } from './materials.js';

// ── Geometry primitives ────────────────────────────────────────────────────

export interface Pt { x: Inches; y: Inches }
/**
 * Closed polygon. `hole: true` marks a counter (the bowl of an O, of an A…).
 *
 * `colour` is the fill the artwork declared. A logo is one element (§3.2), but
 * it is not one colour — "FACE COLOR: Per Logo" means the face carries the
 * mark's own colours, so the contour has to remember which one it was. Merging
 * the paths and keeping only a single element colour is what turns a two-tone
 * logo into a solid slab.
 */
export interface Contour { points: Pt[]; hole: boolean; colour?: string }
export interface Rect { x: Inches; y: Inches; w: Inches; h: Inches }

// ── Intake: the Wolf Studio form ───────────────────────────────────────────

export const WolfStudioFormSchema = z.object({
  businessName: z.string().min(1),
  channelLetterType: z.string(),
  installationMethod: z.string(),
  backerPanelOption: z.string().optional(),
  backerPanelColour: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  returnDepth: z.number().positive().optional(),
  returnColour: z.string().optional(),
  trimCapColour: z.string().optional(),
  trimCapWidth: z.number().positive().optional(),
  faceMaterial: z.string().optional(),
  faceColour: z.string().optional(),
  ledColour: z.string().optional(),
  control: z.enum(['photocell', 'timer']).optional(),
  mountingSurfaceColour: z.string().optional(),
  mountingSurfaceKind: z.enum(['wall', 'parapet', 'canopy-fascia', 'rail']).optional(),
  showSizesOnProof: z.boolean().optional(),
  showMaterialThickness: z.boolean().optional(),
  externalIllumination: z.boolean().optional(),
  /** §1.2 / §7.1 free text. The only field an LLM parses. */
  additionalInformation: z.string().optional(),
  /** Site facts that reach precedence level 2 (landlord / permit). */
  site: z.object({
    area: z.object({ w: z.number(), h: z.number() }).optional(),
    protrusionLimit: z.number().positive().optional(),
    permittedAreaSqFt: z.number().positive().optional(),
    obstructions: z.array(z.object({ label: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).optional(),
  }).optional(),
});
export type WolfStudioForm = z.infer<typeof WolfStudioFormSchema>;

export const ArtworkItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['glyph', 'shape']),
  char: z.string().optional(),
  text: z.string().optional(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  capHeight: z.number().nonnegative(),
  baselineY: z.number(),
  /** The narrowest stroke measured on the outline, inches. §6.1 reads this. */
  narrowestStroke: z.number().nonnegative(),
  colour: z.string().optional(),
  /**
   * §3.2: "a two-colour word stays one element with a colour break noted".
   * An imported logo is one mark drawn as many paths, so the breaks belong to
   * the item rather than being inferred from a split that should not happen.
   */
  colourBreaks: z.array(z.string()).optional(),
  fontStyle: z.enum(['sans', 'serif', 'script', 'display', 'distressed']).optional(),
  contours: z.array(z.object({
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    hole: z.boolean(),
    colour: z.string().optional(),
  })),
});
export type ArtworkItem = z.infer<typeof ArtworkItemSchema>;

/**
 * Where the sign goes on the customer's own photo.
 *
 * Optional: without it the proof is rendered against a neutral studio wall,
 * which is a legitimate pre-sales output. With it, §9.2's "sign sits inside the
 * measured area and clears windows, doors, awnings" becomes checkable against
 * a real facade instead of an assumed one.
 */
export const PlacementSchema = z.object({
  /** Data URL or a path the render worker can read. */
  backgroundImage: z.string(),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  /** The user's real-world measurement, which sets the scale for everything. */
  reference: z.object({
    a: z.object({ x: z.number(), y: z.number() }),
    b: z.object({ x: z.number(), y: z.number() }),
    inches: z.number().positive(),
    label: z.string().optional(),
  }),
  /** Where the logo was dragged, in image pixels. */
  rect: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  /**
   * Four corners of a rectangle ON THE WALL, clockwise from its top-left, with
   * its real size. Optional, and only worth supplying when the photograph was
   * taken at an angle: it lets the renderer put its camera where the
   * photographer stood, so the sign's returns converge with the building's
   * instead of running parallel across it.
   *
   * Without it the composite assumes the wall faces the camera, which is right
   * for a photograph taken square to the building and visibly wrong for one
   * taken from the footpath.
   */
  /**
   * Where the sun is, in the photograph.
   *
   * A composite fails on lighting long before it fails on geometry: a sign
   * whose shadow falls the opposite way from every other shadow in the picture
   * reads as pasted on, however exactly it is placed. Azimuth is degrees
   * clockwise from straight-on to the wall — negative for light from the left.
   *
   * Optional, and deliberately shallow by default: a short, soft shadow asserts
   * little and disagrees with nothing, which is the honest default when nobody
   * has said where the sun was.
   */
  sun: z.object({
    azimuthDeg: z.number().min(-90).max(90),
    elevationDeg: z.number().min(5).max(89),
  }).optional(),

  facadeRect: z.object({
    corners: z.array(z.object({ x: z.number(), y: z.number() })).length(4),
    widthInches: z.number().positive(),
    heightInches: z.number().positive(),
  }).optional(),
});
export type PlacementInput = z.infer<typeof PlacementSchema>;

/**
 * Where the geometry came from.
 *
 * A vector outline IS the artwork. A traced one is a reading of pixels, and
 * every dimension on the proof inherits its error — so §9.4, which exists to
 * report anything the customer would want to know before signing, has to
 * report it. Defaults to vector: a job that does not say is one whose artwork
 * was supplied as geometry.
 */
export const ArtworkProvenanceSchema = z.object({
  source: z.enum(['vector', 'traced']),
  /** 0–1. Below the trace threshold, §6.1's figures are indicative only. */
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});
export type ArtworkProvenance = z.infer<typeof ArtworkProvenanceSchema>;

export const JobInputSchema = z.object({
  jobId: z.string(),
  form: WolfStudioFormSchema,
  artwork: z.array(ArtworkItemSchema).min(1),
  placement: PlacementSchema.optional(),
  artworkProvenance: ArtworkProvenanceSchema.optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

// ── The spec the engine builds ─────────────────────────────────────────────

export interface TrimCapSpec {
  kind: 'trim-cap' | 'retainer' | 'none';
  width?: Inches;
  brand?: 'GemTrim' | 'Jewelite' | 'Paintable';
  colour?: string;
  code?: string;
  /** §4.3 / CL-D-14. Recorded, NOT added to the quoted depth. */
  projection?: Inches;
  /** CL-R-40: paintable route taken, flag cost and lead time. */
  paintedTo?: string;
}

export interface FaceSpec {
  material?: FaceMaterial;
  colour?: string;
  /** Set by CL-R-38/39 when the input was a device colour. */
  colourSystem?: PaintSystem | FilmSystem;
  colourIndicative?: boolean;
  /** §4.7: the device value drives the render only, never the spec block. */
  renderColour?: string;
  printed?: boolean;
  largeOpenAreas?: boolean;
  vinylApplication?: boolean;
  /** §1.3 CL-S-06: dark by day, glows in `colour` at night. */
  dayNight?: boolean;
}

export interface BoxSpec {
  shape: 'rectangle' | 'rounded-rectangle' | 'capsule' | 'contour';
  w: Inches;
  h: Inches;
  depth: Inches;
  cornerRadius: Inches;
  faceColour: string;
  returnColour: string;
}

export interface SignElement {
  id: string;
  role: ElementRole;
  /** The copy, or a description for a logo mark. Used in the spec block. */
  content: string;
  itemIds: string[];

  construction: Construction;
  copyTreatment?: CopyTreatment;

  bbox: Rect;
  baselineY: Inches;
  capHeight: Inches;
  narrowestStroke: Inches;
  contours: Contour[];
  /** Kept so a callout can say what the artwork was before an offset. */
  originalContours?: Contour[];
  fontStyle?: ArtworkItem['fontStyle'];
  colourBreaks?: string[];

  /**
   * Unset until Gate 3. §8.1 says defaults "apply to every empty field, and log
   * that you did" — so Gate 2 must leave a field the customer did not fill
   * genuinely empty, or the default is applied silently and §9.4 cannot report
   * it. These are non-null for every stage after Gate 3.
   */
  returnDepth?: Inches;
  returnColour?: string;
  face: FaceSpec;
  trimCap: TrimCapSpec;
  back?: 'aluminium' | 'clear-polycarbonate' | 'none';

  lit: boolean;
  ledColour?: string;
  /** §6.5 / §8.1 CL-D-18. Set for every rear-illuminated element. */
  standoff?: Inches;
  box?: BoxSpec;

  attachmentPoints?: number;
  detached?: boolean;
  supportRods?: boolean;
  /** §3.7 pattern suggestions attach here; never applied silently. */
  suggestions?: string[];
}

export interface BackerSpec {
  present: boolean;
  shape: BackerShape;
  material: BackerMaterial;
  w: Inches;
  h: Inches;
  depth: Inches;
  colour: string;
  housesSupplies: boolean;
}

export interface RacewaySpec { kind: 'raceway' | 'wireway' | 'bottom-rail'; h: Inches; d: Inches; colour: string; count: number }

export interface Escalation {
  ruleId: string;
  reason: string;
  /** What a human has to decide. */
  question: string;
}

export interface SignSpec {
  jobId: string;
  businessName: string;
  /** The intake form, kept on the spec so rules can read customer intent. */
  form: WolfStudioForm;

  type: SignType;
  subtypes: SubType[];
  mount: MountMethod;
  /** Set when CL-MT-06 / CL-T-13 was resolved from free text. */
  resolvedFrom?: { field: string; text: string; confidence: number };

  /** The measured artwork. CL-R-48 groups it; nothing downstream re-measures. */
  artwork: ArtworkItem[];
  elements: SignElement[];
  backer: BackerSpec;
  raceway?: RacewaySpec;
  control?: 'photocell' | 'timer';
  mountingSurface: { colour: string; kind: 'wall' | 'parapet' | 'canopy-fascia' | 'rail' };

  overall: { w: Inches; h: Inches };
  quantity: number;

  /** §4.7 / CL-D-19, CL-D-20. */
  paintSystem?: PaintSystem;
  filmSystem?: FilmSystem;

  proofOptions: { showSizes: boolean; showThickness: boolean };
  views: Array<'day' | 'night'>;
  /** §9.2, built in Gate 5. The renderer consumes exactly this object. */
  renderContract?: import('../render/contract.js').RenderContract;
  externalIllumination: boolean;

  site: NonNullable<WolfStudioForm['site']>;
  /** Set when the customer supplied a photo; drives the composited day view. */
  placement?: PlacementInput;
  /** Vector or traced. Disclosed on the proof either way. */
  artworkProvenance?: ArtworkProvenance;
  escalations: Escalation[];
  /** True once a BLOCK fired; the pipeline stops rendering. */
  blocked: boolean;
}

// ── Derived helpers, used by rules and by the renderer ─────────────────────

export const isBoxConstruction = (c: Construction): boolean =>
  c === 'CL-C-02' || c === 'CL-C-03' || c === 'CL-C-07';

export const isChannelLetter = (c: Construction): boolean => c === 'CL-C-01';

export const isFlatCut = (c: Construction): boolean => c === 'CL-C-04' || c === 'CL-C-05';

export function bboxOf(items: Array<{ bbox: Rect }>): Rect {
  const xs = items.map((i) => i.bbox.x);
  const ys = items.map((i) => i.bbox.y);
  const x2 = items.map((i) => i.bbox.x + i.bbox.w);
  const y2 = items.map((i) => i.bbox.y + i.bbox.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x2) - x, h: Math.max(...y2) - y };
}

export const sqFt = (r: { w: Inches; h: Inches }): number => (r.w * r.h) / 144;

export const primaryOf = (spec: SignSpec): SignElement | undefined =>
  spec.elements.find((e) => e.role === 'CL-E-01');

export const anyLit = (spec: SignSpec): boolean => spec.elements.some((e) => e.lit);

/**
 * Post-Gate-3 accessors for the fields §8.1 resolves.
 *
 * Every stage from Gate 4 onward runs after the defaults gate, so these values
 * are always present there. Reading one before Gate 3 is a gate-ordering bug,
 * and this says so by name instead of silently yielding `undefined`.
 */
function resolved<T>(value: T | undefined, el: SignElement, field: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `${field} is unresolved on element ${el.id} ("${el.content}"). ` +
      'It is set by Gate 3 (§8.1 defaults) — this code ran before that gate.',
    );
  }
  return value;
}

export const depthOf = (el: SignElement): Inches => resolved(el.returnDepth, el, 'returnDepth');
export const returnColourOf = (el: SignElement): string => resolved(el.returnColour, el, 'returnColour');
export const faceColourOf = (el: SignElement): string => resolved(el.face.colour, el, 'face.colour');
export const faceMaterialOf = (el: SignElement): FaceMaterial => resolved(el.face.material, el, 'face.material');

/**
 * What the face looks like in daylight.
 *
 * A day/night face (§1.3 CL-S-06, Acrylite day/night acrylic and day/night
 * vinyl) is not the colour the spec block states: it reads dark grey by day
 * and glows in its stated colour once the LEDs are on. Rendering the night
 * colour in the day panel is the same class of error as a halo that glows in
 * daylight — it shows the customer a sign that does not exist at noon.
 *
 * The spec block is untouched by this: FACE COLOR still states the colour the
 * fabricator buys. This is the day appearance only.
 */
export const DAY_NIGHT_DAY_APPEARANCE = '#2f3032';

export const isDayNightFace = (el: SignElement): boolean =>
  el.face.material === 'day-night-acrylic' || el.face.dayNight === true;

/** Face colour for a given view, device value included (§4.7 render-only). */
export const faceRenderColour = (el: SignElement, view: 'day' | 'night'): string =>
  view === 'day' && isDayNightFace(el)
    ? DAY_NIGHT_DAY_APPEARANCE
    : (el.face.renderColour ?? faceColourOf(el));
