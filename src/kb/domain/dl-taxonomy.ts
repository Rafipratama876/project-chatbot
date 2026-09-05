/**
 * Dimensional Letters — material, finish and mount vocabulary.
 *
 * Transcribed from `Dimensional-Letter-Training_v2.pdf` (SignPack University,
 * "Dimensional Letters: From Beginner to Expert Learning"). This file is the
 * DL equivalent of `taxonomy.ts` — a lookup table, not a rule. It shares no
 * types or values with `taxonomy.ts` / `materials.ts` (the Channel Letters
 * KB v2.2 tables): Dimensional Letters is out of that KB's own scope (see
 * `HANDOFF_RULES` in `boilerplate.ts`), so this is a second, independent
 * vocabulary rather than an extension of the first.
 *
 * Numbers carry the same provenance discipline the CL tables use:
 * `source: 'EXT'` is read directly off a PDF page (vendor-published);
 * `source: 'DER'` is a reasonable shop range the PDF did not give a number
 * for, and must be confirmed before it drives a hard validation failure.
 */
import type { Inches } from './units.js';

// ── Material families (PDF §3, §4, §6, §7, §9, §10) ────────────────────────

export const DL_MATERIAL_FAMILIES = [
  'cast-metal',
  'flat-cut-metal',
  'flat-cut-acrylic',
  'flat-cut-pvc',
  'injection-molded',
  'formed-plastic',
  'foam',
  'hdu',
] as const;
export type DLMaterialFamily = (typeof DL_MATERIAL_FAMILIES)[number];

export interface DLMetalAlloy {
  id: 'aluminum' | 'stainless-steel' | 'brass' | 'copper';
  label: string;
  maxHeight: Inches;
  maxDepth: Inches;
}

/** PDF "10. SPECIALTY SIGNS - STEEL ART" — solid-cut size ranges by alloy. */
export const DL_METAL_ALLOYS: DLMetalAlloy[] = [
  { id: 'aluminum', label: 'Aluminum', maxHeight: 60, maxDepth: 2 },
  { id: 'stainless-steel', label: 'Stainless Steel', maxHeight: 48, maxDepth: 2 },
  { id: 'brass', label: 'Brass', maxHeight: 36, maxDepth: 1 },
  { id: 'copper', label: 'Copper', maxHeight: 36, maxDepth: 1 },
];

export interface DLInjectionMoldedStyle {
  id: 'architectural-prismatic' | 'helvetica-flat' | 'times-bold-flat';
  label: string;
  depths: Inches[];
  /** Standard heights the style is stocked in, inches (PDF gives them in feet). */
  heights: Inches[];
}

/** PDF "9. SPECIALTY SIGNS - GEMINI" injection molded — styles/sizes/materials. */
export const DL_INJECTION_MOLDED_STYLES: DLInjectionMoldedStyle[] = [
  { id: 'architectural-prismatic', label: 'Architectural-Prismatic', depths: [0.5, 0.625, 0.75], heights: [24, 36, 48, 72, 96, 120, 144] },
  { id: 'helvetica-flat', label: 'Helvetica-Flat', depths: [0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5], heights: [24, 36, 48, 60, 72, 96, 108, 120, 144, 180, 216] },
  { id: 'times-bold-flat', label: 'Times Bold-Flat', depths: [0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5], heights: [24, 36, 48, 72, 96, 120, 144, 180, 216] },
];

export interface DLMaterialFacts {
  id: DLMaterialFamily;
  label: string;
  aliases: string[];
  /** Only flat-cut acrylic and flat-cut PVC are shown lit in the PDF (Gemini page). */
  illuminable: boolean;
  minHeight: Inches;
  maxHeight: Inches;
  minDepth: Inches;
  maxDepth: Inches;
  source: 'EXT' | 'DER';
  when: string;
}

export const DL_MATERIALS: Record<DLMaterialFamily, DLMaterialFacts> = {
  'cast-metal': {
    id: 'cast-metal', label: 'Cast Metal', aliases: ['cast aluminum', 'cast bronze', 'cast metal letters'],
    illuminable: false, minHeight: 2, maxHeight: 36, minDepth: 0.25, maxDepth: 2, source: 'DER',
    when: 'Built to last: weather- and time-resistant, near-zero maintenance, premium look. Cast from a mold, so identical repeats are cheap once the mold exists.',
  },
  'flat-cut-metal': {
    id: 'flat-cut-metal', label: 'Flat Cut Metal', aliases: ['aluminum letters', 'stainless letters', 'brass letters', 'copper letters', 'steel art'],
    illuminable: false, minHeight: 0.75, maxHeight: 60, minDepth: 0.063, maxDepth: 2, source: 'EXT',
    when: 'Cut from flat sheet on a CNC router. Range varies by alloy — aluminum/stainless up to 60″H × 2″D, brass/copper up to 36″H × 1″D (see DL_METAL_ALLOYS).',
  },
  'flat-cut-acrylic': {
    id: 'flat-cut-acrylic', label: 'Flat Cut Acrylic', aliases: ['acrylic letters', 'lit acrylic'],
    illuminable: true, minHeight: 1, maxHeight: 48, minDepth: 0.25, maxDepth: 1, source: 'DER',
    when: 'Cut from flat acrylic sheet. Can be face- or edge-lit (Gemini "flat cut acrylic / lit acrylic" line) — the only DL family this engine treats as illuminable.',
  },
  'flat-cut-pvc': {
    id: 'flat-cut-pvc', label: 'Flat Cut PVC', aliases: ['pvc letters'],
    illuminable: false, minHeight: 1, maxHeight: 48, minDepth: 0.5, maxDepth: 1.5, source: 'DER',
    when: 'Cut from flat PVC sheet, painted. Light and inexpensive; studs or double-sided tape both standard mounts (PDF "9. FLAT CUT PVC").',
  },
  'injection-molded': {
    id: 'injection-molded', label: 'Injection Molded', aliases: ['injection moulded', 'molded plastic letters'],
    illuminable: false, minHeight: 24, maxHeight: 216, minDepth: 0.375, maxDepth: 1.5, source: 'EXT',
    when: 'Molten plastic injected into a pre-built mold — the look and feel of cast metal in a lighter, cheaper plastic. Sold in one of three catalogue styles (see DL_INJECTION_MOLDED_STYLES); custom sizes need a new mold and are a cost/lead-time flag.',
  },
  'formed-plastic': {
    id: 'formed-plastic', label: 'Formed Plastic', aliases: ['vacuum formed', 'thermoformed'],
    illuminable: false, minHeight: 2, maxHeight: 60, minDepth: 0.5, maxDepth: 3, source: 'DER',
    when: 'Vacuum-formed over a routed mold, then trimmed and mounted. Durable, all-weather, custom-painted, any custom shape.',
  },
  foam: {
    id: 'foam', label: 'Foam', aliases: ['eps', 'urethane foam letters'],
    illuminable: false, minHeight: 2, maxHeight: 96, minDepth: 1, maxDepth: 4, source: 'DER',
    when: 'Lightweight, routed from sign foam, usually coated/painted for durability. Good for large lobby or interior letters where weight matters.',
  },
  hdu: {
    id: 'hdu', label: 'HDU (High Density Urethane)', aliases: ['high density urethane', 'sandblasted hdu'],
    illuminable: false, minHeight: 2, maxHeight: 96, minDepth: 1, maxDepth: 3, source: 'DER',
    when: 'Dense sign-grade foam board, typically hand- or CNC-carved and painted. Common for sandblasted plaques and dimensional letters that need crisp detail without metal weight.',
  },
};

/** §1.2-style Custom resolver input — form value → family, or null for free text. */
export const DL_FORM_MATERIAL_MAP: Record<string, DLMaterialFamily | null> = {
  'Cast Metal': 'cast-metal',
  'Flat Cut Metal': 'flat-cut-metal',
  'Flat Cut Acrylic': 'flat-cut-acrylic',
  'Flat Cut PVC': 'flat-cut-pvc',
  'Injection Molded': 'injection-molded',
  'Formed Plastic': 'formed-plastic',
  Foam: 'foam',
  HDU: 'hdu',
  Custom: null,
};

export function materialFromAlias(raw: string): DLMaterialFamily | null {
  const norm = raw.trim().toLowerCase();
  for (const m of Object.values(DL_MATERIALS)) {
    if (m.label.toLowerCase() === norm || m.aliases.includes(norm)) return m.id;
  }
  return null;
}

// ── Finishes (PDF §9 Gemini, §10 Steel Art) ─────────────────────────────────

export const DL_FINISHES = [
  'satin-brushed', 'mirror-polish', 'edgeblend', 'satinbrite',
  'satinbrite-face-polished-sides', 'satinbrite-face-painted-sides',
  'non-directional', 'random-orbital', 'glass-bead',
  'verde-green-patina', 'medium-oxidized-satin-brushed',
  'painted', 'powder-coat',
] as const;
export type DLFinish = (typeof DL_FINISHES)[number];

export interface DLFinishFacts { id: DLFinish; label: string; appliesTo: DLMaterialFamily[] }

export const DL_FINISH_FACTS: Record<DLFinish, DLFinishFacts> = {
  'satin-brushed': { id: 'satin-brushed', label: 'Satin Brushed', appliesTo: ['cast-metal', 'flat-cut-metal'] },
  'mirror-polish': { id: 'mirror-polish', label: 'Mirror Polish (up to 24″)', appliesTo: ['flat-cut-metal'] },
  edgeblend: { id: 'edgeblend', label: 'Edgeblend™ (up to 24″)', appliesTo: ['flat-cut-metal'] },
  satinbrite: { id: 'satinbrite', label: 'Satinbrite™', appliesTo: ['flat-cut-metal'] },
  'satinbrite-face-polished-sides': { id: 'satinbrite-face-polished-sides', label: 'Satinbrite™ Face & Polished Sides', appliesTo: ['flat-cut-metal'] },
  'satinbrite-face-painted-sides': { id: 'satinbrite-face-painted-sides', label: 'Satinbrite™ Face & Painted Sides', appliesTo: ['flat-cut-metal'] },
  'non-directional': { id: 'non-directional', label: 'Non-Directional', appliesTo: ['flat-cut-metal'] },
  'random-orbital': { id: 'random-orbital', label: 'Random Orbital', appliesTo: ['flat-cut-metal'] },
  'glass-bead': { id: 'glass-bead', label: 'Glass Bead', appliesTo: ['flat-cut-metal'] },
  'verde-green-patina': { id: 'verde-green-patina', label: 'Verde Green Patina', appliesTo: ['flat-cut-metal'] },
  'medium-oxidized-satin-brushed': { id: 'medium-oxidized-satin-brushed', label: 'Medium Oxidized Satin Brushed', appliesTo: ['flat-cut-metal'] },
  painted: { id: 'painted', label: 'Painted', appliesTo: ['cast-metal', 'flat-cut-metal', 'flat-cut-pvc', 'injection-molded', 'formed-plastic', 'foam', 'hdu'] },
  'powder-coat': { id: 'powder-coat', label: 'Powder Coat', appliesTo: ['cast-metal', 'flat-cut-metal'] },
};

export const DL_DEFAULT_FINISH: Record<DLMaterialFamily, DLFinish> = {
  'cast-metal': 'satin-brushed',
  'flat-cut-metal': 'satin-brushed',
  'flat-cut-acrylic': 'painted',
  'flat-cut-pvc': 'painted',
  'injection-molded': 'painted',
  'formed-plastic': 'painted',
  foam: 'painted',
  hdu: 'painted',
};

// ── Mounting methods (PDF §8 install methods, §9 Gemini mounting options) ──

export const DL_MOUNTS = [
  'double-sided-tape', 'stud-mounted', 'flush-stud', 'jam-nut-mount',
  'spacer-mount', 'corrugated-mount', 'flat-metal-wall-mount',
  'stud-with-mounting-pads',
] as const;
export type DLMount = (typeof DL_MOUNTS)[number];

export interface DLMountFacts { id: DLMount; label: string; description: string; standoff: boolean }

export const DL_MOUNT_FACTS: Record<DLMount, DLMountFacts> = {
  'double-sided-tape': { id: 'double-sided-tape', label: 'Double-Sided Tape', description: 'Clean surface, tape pattern to wall, press letters to set, remove masking. No drilling.', standoff: false },
  'stud-mounted': { id: 'stud-mounted', label: 'Stud Mounted', description: 'Studs into drilled holes with adhesive, letters flush or lightly spaced off the wall.', standoff: false },
  'flush-stud': { id: 'flush-stud', label: 'Flush Stud', description: 'Studs through the back into the surface, letter tight against the wall.', standoff: false },
  'jam-nut-mount': { id: 'jam-nut-mount', label: 'Jam Nut Mount', description: 'Threaded stud secured with a jam nut behind the letter, adjustable standoff.', standoff: true },
  'spacer-mount': { id: 'spacer-mount', label: 'Spacer Mount', description: 'Letter stands off the wall on a spacer for a shadow gap.', standoff: true },
  'corrugated-mount': { id: 'corrugated-mount', label: 'Corrugated Mount', description: 'For corrugated/ribbed metal wall panels, standoff rides the panel profile.', standoff: true },
  'flat-metal-wall-mount': { id: 'flat-metal-wall-mount', label: 'Flat Metal Wall Mount', description: 'Threaded stud direct into a flat metal wall.', standoff: false },
  'stud-with-mounting-pads': { id: 'stud-with-mounting-pads', label: 'Stud Mounted with Mounting Pads', description: 'Adds a mounting pad behind each stud for extra surface contact on uneven, textured or stone/ACM walls.', standoff: false },
};

export const DL_FORM_MOUNT_MAP: Record<string, DLMount | null> = {
  'Double-Sided Tape': 'double-sided-tape',
  'Stud Mounted': 'stud-mounted',
  'Flush Stud': 'flush-stud',
  'Jam Nut Mount': 'jam-nut-mount',
  'Spacer Mount': 'spacer-mount',
  'Corrugated Mount': 'corrugated-mount',
  'Flat Metal Wall Mount': 'flat-metal-wall-mount',
  'Stud Mounted with Mounting Pads': 'stud-with-mounting-pads',
  Other: null,
};

/** PDF page 6: "Every dimensional sign/letter installation needs a printed template." */
export const DL_INSTALL_TEMPLATE_REQUIRED = true;

/** PDF page 8: mounting pads recommended on uneven/textured/stone/metal walls. */
export const DL_MOUNTING_SURFACE_TEXTURES = ['smooth', 'uneven', 'unspecified'] as const;
export type DLMountingSurfaceTexture = (typeof DL_MOUNTING_SURFACE_TEXTURES)[number];
