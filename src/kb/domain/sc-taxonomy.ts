/**
 * Sign Cabinets — face material, extrusion, retainer, corner and mounting
 * vocabulary.
 *
 * Transcribed from `Sign-Cabinets-Training.pdf` (SignPack University,
 * "Sign Cabinets: From Beginner to Expert Learning"). This file is the Sign
 * Cabinets equivalent of `taxonomy.ts` / `dl-taxonomy.ts` — a lookup table,
 * not a rule. It shares no types or values with `taxonomy.ts` / `materials.ts`
 * (the Channel Letters KB v2.2 tables) or `dl-taxonomy.ts`: Sign Cabinets is
 * its own scope (see `HANDOFF_RULES` in `boilerplate.ts` — "A full enclosed
 * cabinet as the whole sign" already names "Sign Cabinet agent" as the
 * owner), so this is a third, independent vocabulary.
 *
 * `source: 'EXT'` is read directly off a PDF page; `source: 'DER'` is a
 * reasonable shop range the PDF did not give an exact number for.
 */
import type { Inches } from './units.js';

// ── Face materials (PDF §5) ─────────────────────────────────────────────────

export const SC_FACE_MATERIALS = [
  'acrylic-polycarbonate', 'pan-face', 'embossed-pan-face', 'panel-with-vinyl',
  'cut-through-face', 'push-through-acrylic', 'flex-face',
] as const;
export type SCFaceMaterial = (typeof SC_FACE_MATERIALS)[number];

export interface SCFaceMaterialFacts {
  id: SCFaceMaterial;
  label: string;
  aliases: string[];
  /** PDF §5: "Cabinets can be either illuminated or non-illuminated" — but
   * panel + vinyl is "usually without illumination", the one family this
   * engine treats as never lit. */
  illuminable: boolean;
  source: 'EXT' | 'DER';
  when: string;
}

export const SC_FACE_MATERIAL_FACTS: Record<SCFaceMaterial, SCFaceMaterialFacts> = {
  'acrylic-polycarbonate': {
    id: 'acrylic-polycarbonate', label: 'Acrylic / Polycarbonate', aliases: ['acrylic', 'polycarbonate', 'polycarb', 'lexan'],
    illuminable: true, source: 'EXT',
    when: 'Translucent flat face. Acrylic: crystal clear, better weather/abrasion resistance, more affordable. Polycarbonate: 10-20x more impact resistant, better for vandal-prone or high-impact areas.',
  },
  'pan-face': {
    id: 'pan-face', label: 'Pan Face', aliases: ['molded face', 'formed face'],
    illuminable: true, source: 'EXT',
    when: 'Molded acrylic or polycarbonate face with raised/3D elements. Reinforces rigidity against warping from wind and temperature. Recommended beyond 36" on width or height.',
  },
  'embossed-pan-face': {
    id: 'embossed-pan-face', label: 'Embossed Pan Face', aliases: ['embossed'],
    illuminable: true, source: 'EXT',
    when: 'Pan face with raised (embossed) graphics or letters — a 3D effect for extra visibility, a more refined plaque look.',
  },
  'panel-with-vinyl': {
    id: 'panel-with-vinyl', label: 'Panel with Vinyl', aliases: ['flat panel', 'vinyl panel', 'metal panel'],
    illuminable: false, source: 'EXT',
    when: 'Cost-effective flat metal panel with cut or printed vinyl graphics. Usually without illumination. Fast production.',
  },
  'cut-through-face': {
    id: 'cut-through-face', label: 'Cut-Through Face', aliases: ['cut through', 'routed face'],
    illuminable: true, source: 'EXT',
    when: 'Cut/routed metal face with internal acrylic application and illumination — adds depth and premium visual appeal. Ideal for logos/text that need to stand out at night.',
  },
  'push-through-acrylic': {
    id: 'push-through-acrylic', label: 'Push-Through Acrylic', aliases: ['push thru', 'push-thru'],
    illuminable: true, source: 'EXT',
    when: 'Cut/routed metal face with 3D acrylic elements extending through it — bright, crisp illumination around and through the letters. High-end branding, nighttime visibility.',
  },
  'flex-face': {
    id: 'flex-face', label: 'Flex Face', aliases: ['flex', 'vinyl flex face', 'flexible face'],
    illuminable: true, source: 'DER',
    when: 'Seamless, lightweight vinyl tensioned over an aluminium frame. Popular for large-format signs and pylon cabinets. Excellent light diffusion.',
  },
};

export const SC_FORM_FACE_MATERIAL_MAP: Record<string, SCFaceMaterial | null> = {
  'Acrylic / Polycarbonate': 'acrylic-polycarbonate',
  'Pan Face': 'pan-face',
  'Embossed Pan Face': 'embossed-pan-face',
  'Panel with Vinyl': 'panel-with-vinyl',
  'Cut-Through Face': 'cut-through-face',
  'Push-Through Acrylic': 'push-through-acrylic',
  'Flex Face': 'flex-face',
  Custom: null,
};

export function faceMaterialFromAlias(raw: string): SCFaceMaterial | null {
  const norm = raw.trim().toLowerCase();
  for (const m of Object.values(SC_FACE_MATERIAL_FACTS)) {
    if (m.label.toLowerCase() === norm || m.aliases.includes(norm)) return m.id;
  }
  return null;
}

// ── Extrusion depth (PDF §4) ────────────────────────────────────────────────

/** Standard stock sizes; a custom numeric depth is also accepted on the form. */
export const SC_EXTRUSION_DEPTHS: Inches[] = [7, 9, 12];
export const SC_DEFAULT_EXTRUSION_DEPTH: Inches = 7;

// ── Retainer type (PDF §9 diagram) ──────────────────────────────────────────

export const SC_RETAINER_TYPES = ['normal', 'insert', 'zf-style', 'hanger-bar'] as const;
export type SCRetainerType = (typeof SC_RETAINER_TYPES)[number];

export interface SCRetainerFacts { id: SCRetainerType; label: string; description: string }

export const SC_RETAINER_FACTS: Record<SCRetainerType, SCRetainerFacts> = {
  normal: { id: 'normal', label: 'Normal Retainer', description: 'Standard framing member around the face perimeter, 1.5" typical.' },
  insert: { id: 'insert', label: 'Insert Retainer', description: 'Sits inset from the cabinet edge rather than capping it flush.' },
  'zf-style': { id: 'zf-style', label: 'ZF Style Retainer', description: 'A stepped Z/F profile, used with certain hanger-bar configurations.' },
  'hanger-bar': { id: 'hanger-bar', label: 'Hanger Bar', description: 'Carries the face on a bar rather than a perimeter retainer.' },
};

export const SC_DEFAULT_RETAINER: SCRetainerType = 'normal';

// ── Corners (PDF §4) ─────────────────────────────────────────────────────────

export const SC_CORNER_STYLES = ['square', 'radius'] as const;
export type SCCornerStyle = (typeof SC_CORNER_STYLES)[number];

export const SC_CORNER_RADII: Inches[] = [2, 4, 6, 8, 10, 12, 14, 16];
export const SC_DEFAULT_CORNER_STYLE: SCCornerStyle = 'square';

// ── Mounting / installation (PDF §10) ───────────────────────────────────────

export const SC_MOUNTS = ['wall', 'blade', 'ceiling', 'pole', 'base'] as const;
export type SCMount = (typeof SC_MOUNTS)[number];

export interface SCMountFacts { id: SCMount; label: string; description: string }

export const SC_MOUNT_FACTS: Record<SCMount, SCMountFacts> = {
  wall: { id: 'wall', label: 'Wall Mounted', description: 'Direct to the building face — the most common cabinet installation.' },
  blade: { id: 'blade', label: 'Blade Mounted', description: 'Perpendicular to the wall on a bracket, double-faced, read approaching from either direction.' },
  ceiling: { id: 'ceiling', label: 'Ceiling Mounted', description: 'Hung from an overhead structure — canopies, arcades, interior corridors.' },
  pole: { id: 'pole', label: 'Pole Mounted', description: 'Elevated on one or more poles — pylons and freestanding roadside cabinets.' },
  base: { id: 'base', label: 'Base Mounted', description: 'Ground-level on a monument base.' },
};

export const SC_FORM_MOUNT_MAP: Record<string, SCMount | null> = {
  'Wall Mounted': 'wall',
  'Blade Mounted': 'blade',
  'Ceiling Mounted': 'ceiling',
  'Pole Mounted': 'pole',
  'Base Mounted': 'base',
  Other: null,
};

/** §9 mounting-attachment vocabulary (wall/between-pole/saddle/thru-pole/…) —
 * finer than the §10 categories above, and not distinct enough render- or
 * validation-wise to earn its own field in v1. Kept as a free-text note on
 * the spec block rather than a second select. */
export const SC_ATTACHMENT_NOTE_FIELD = 'attachmentDetail';

/** PDF §9: mounting pads recommended on uneven/textured/stone/metal walls
 * (same shape as `DL_MOUNTING_SURFACE_TEXTURES`). */
export const SC_MOUNTING_SURFACE_TEXTURES = ['smooth', 'uneven', 'unspecified'] as const;
export type SCMountingSurfaceTexture = (typeof SC_MOUNTING_SURFACE_TEXTURES)[number];
