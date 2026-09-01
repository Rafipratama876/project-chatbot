/**
 * KB Layer 1 (taxonomy), Layer 3.1/3.3/3.4 (roles, constructions, copy
 * treatments), Layer 5 (production methods), Layer 7.1 (mount methods).
 *
 * Every ID in this file is transcribed from CHANNEL LETTERS KB v2.2.
 * This is a lookup table, not a prompt. The only value that reaches an LLM is
 * the `Custom` / `Other` branch of §1.2 and §7.1 (src/llm/parseAdditionalInfo).
 */

// ── §1.1 Types ─────────────────────────────────────────────────────────────

export const SIGN_TYPES = [
  'CL-T-01', 'CL-T-02', 'CL-T-03', 'CL-T-04', 'CL-T-05', 'CL-T-06', 'CL-T-07',
  'CL-T-08', 'CL-T-09', 'CL-T-10', 'CL-T-11', 'CL-T-12', 'CL-T-13',
] as const;
export type SignType = (typeof SIGN_TYPES)[number];

/** How §9.2 collapses a type for render purposes. */
export type IlluminationMode = 'front' | 'halo' | 'front+halo' | 'side' | 'none';

export interface TypeFacts {
  id: SignType;
  name: string;
  aliases: string[];
  status: 'Standard' | 'Specialty' | 'Rare';
  illumination: IlluminationMode;
  /** True for CL-T-02/03/06 — drives R-24/25/26/37 and the standoff gap. */
  rearIlluminated: boolean;
  translucentFace: boolean;
  /** §4.2 standard return depth, inches. */
  standardDepth: number;
  /** §4.2 on-request depths, inches. */
  onRequestDepths: number[];
  /** §4.4 rear closure material. */
  back: 'aluminium' | 'clear-polycarbonate' | 'none';
  trimCap: boolean;
}

export const TYPES: Record<SignType, TypeFacts> = {
  'CL-T-01': { id: 'CL-T-01', name: 'Front Lit', aliases: ['face lit', 'front-lit', 'standard channel letter'], status: 'Standard', illumination: 'front', rearIlluminated: false, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: true },
  'CL-T-02': { id: 'CL-T-02', name: 'Back / Halo Lit', aliases: ['halo lit', 'reverse lit', 'back-lit'], status: 'Standard', illumination: 'halo', rearIlluminated: true, translucentFace: false, standardDepth: 3, onRequestDepths: [4, 6], back: 'clear-polycarbonate', trimCap: false },
  'CL-T-03': { id: 'CL-T-03', name: 'Front and Back / Halo Lit', aliases: ['combination lit', 'dual lit'], status: 'Standard', illumination: 'front+halo', rearIlluminated: true, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'clear-polycarbonate', trimCap: true },
  'CL-T-04': { id: 'CL-T-04', name: 'Non-Lit', aliases: ['unlit', 'non-illuminated', 'hollow letter'], status: 'Standard', illumination: 'none', rearIlluminated: false, translucentFace: false, standardDepth: 3, onRequestDepths: [4, 5], back: 'aluminium', trimCap: false },
  'CL-T-05': { id: 'CL-T-05', name: 'Trimless Front Lit', aliases: ['no-trim face lit', 'frameless'], status: 'Specialty', illumination: 'front', rearIlluminated: false, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: false },
  'CL-T-06': { id: 'CL-T-06', name: 'Trimless Back / Halo Lit', aliases: ['no-trim halo'], status: 'Specialty', illumination: 'halo', rearIlluminated: true, translucentFace: false, standardDepth: 3, onRequestDepths: [4, 6], back: 'clear-polycarbonate', trimCap: false },
  'CL-T-07': { id: 'CL-T-07', name: 'Side Lit', aliases: ['edge lit', 'sidelit'], status: 'Specialty', illumination: 'side', rearIlluminated: false, translucentFace: false, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: false },
  'CL-T-08': { id: 'CL-T-08', name: 'Front and Side Lit', aliases: ['face & edge lit'], status: 'Specialty', illumination: 'front', rearIlluminated: false, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: true },
  'CL-T-09': { id: 'CL-T-09', name: 'Bevelled Edge', aliases: ['bevel edge', 'fab bevel'], status: 'Specialty', illumination: 'front', rearIlluminated: false, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: true },
  'CL-T-10': { id: 'CL-T-10', name: 'Marquée', aliases: ['marquee', 'bulb letter'], status: 'Specialty', illumination: 'front', rearIlluminated: false, translucentFace: false, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: false },
  'CL-T-11': { id: 'CL-T-11', name: 'Faux Neon', aliases: ['led neon', 'neon flex'], status: 'Specialty', illumination: 'front', rearIlluminated: false, translucentFace: false, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: false },
  'CL-T-12': { id: 'CL-T-12', name: 'Open Face', aliases: ['open pan', 'exposed neon'], status: 'Rare', illumination: 'front', rearIlluminated: false, translucentFace: false, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: false },
  'CL-T-13': { id: 'CL-T-13', name: 'Custom / Specialty', aliases: [], status: 'Rare', illumination: 'front', rearIlluminated: false, translucentFace: true, standardDepth: 5, onRequestDepths: [4, 6], back: 'aluminium', trimCap: true },
};

/** §1.1 note: ~90% of jobs are these three. Bias defaults toward them. */
export const COMMON_TYPES: SignType[] = ['CL-T-01', 'CL-T-02', 'CL-T-03'];

// ── §1.2 Wolf Studio form → taxonomy ───────────────────────────────────────
// `null` = free text; resolve from Additional Information, else escalate.

export const FORM_TYPE_MAP: Record<string, SignType | null> = {
  'Front Lit': 'CL-T-01',
  'Back Lit': 'CL-T-02',
  'Front and Back Lit': 'CL-T-03',
  'Non-Lit': 'CL-T-04',
  'Faux Neon': 'CL-T-11',
  Custom: null,
};

/** Types the Custom resolver is allowed to return (§1.2). */
export const CUSTOM_RESOLVABLE: SignType[] = [
  'CL-T-05', 'CL-T-06', 'CL-T-07', 'CL-T-08',
  'CL-T-09', 'CL-T-10', 'CL-T-11', 'CL-T-12', 'CL-T-13',
];

// ── §1.3 Sub-type modifiers ────────────────────────────────────────────────

export const SUBTYPES = {
  'CL-S-01': { label: 'Standard trim cap', appliesTo: ['CL-T-01', 'CL-T-03'] },
  'CL-S-02': { label: 'Retainer (extruded)', appliesTo: ['CL-T-01', 'CL-T-03'] },
  'CL-S-03': { label: 'Trimless', appliesTo: ['CL-T-05', 'CL-T-06'] },
  'CL-S-04': { label: 'Perforated return', appliesTo: [] },
  'CL-S-05': { label: 'Push-through acrylic face', appliesTo: ['CL-T-10', 'CL-T-12'] },
  'CL-S-06': { label: 'Day/Night face', appliesTo: ['CL-T-01', 'CL-T-03'] },
  'CL-S-07': { label: 'RGB / colour-changing', appliesTo: 'any-illuminated' },
} as const;
export type SubType = keyof typeof SUBTYPES;

// ── §3.1 Element roles ─────────────────────────────────────────────────────

export const ELEMENT_ROLES = ['CL-E-01', 'CL-E-02', 'CL-E-03', 'CL-E-04', 'CL-E-05', 'CL-E-06'] as const;
export type ElementRole = (typeof ELEMENT_ROLES)[number];

export const ROLES: Record<ElementRole, { label: string; hint: string }> = {
  'CL-E-01': { label: 'Primary copy', hint: 'The brand name. The tallest typographic element.' },
  'CL-E-02': { label: 'Secondary copy', hint: '70–100% of primary height, own baseline.' },
  'CL-E-03': { label: 'Tagline / descriptor', hint: 'Typically 25–40% of primary height.' },
  'CL-E-04': { label: 'Logo mark / icon', hint: 'Non-typographic shape.' },
  'CL-E-05': { label: 'Article / connector', hint: 'THE, &, AT, OF, A — short word at a different scale.' },
  'CL-E-06': { label: 'Legal / contact line', hint: 'Smallest copy on the sign.' },
};

/** §6.1 runs on CL-C-01 elements only; §3.5 offsets apply to these roles only. */
export const OFFSET_ELIGIBLE_ROLES: ElementRole[] = ['CL-E-01', 'CL-E-02'];

// ── §3.3 Constructions ─────────────────────────────────────────────────────

export const CONSTRUCTIONS = ['CL-C-01', 'CL-C-02', 'CL-C-03', 'CL-C-04', 'CL-C-05', 'CL-C-06', 'CL-C-07'] as const;
export type Construction = (typeof CONSTRUCTIONS)[number];

export const CONSTRUCTION_FACTS: Record<Construction, {
  label: string; lights: boolean | 'per-type'; dimensional: boolean; isBox: boolean;
}> = {
  'CL-C-01': { label: 'Individual channel letters', lights: 'per-type', dimensional: true, isBox: false },
  'CL-C-02': { label: 'Pill box', lights: true, dimensional: true, isBox: true },
  'CL-C-03': { label: 'Logo box', lights: true, dimensional: true, isBox: true },
  'CL-C-04': { label: 'Flat cut acrylic letters', lights: false, dimensional: true, isBox: false },
  'CL-C-05': { label: 'Flat cut metal letters', lights: false, dimensional: true, isBox: false },
  'CL-C-06': { label: 'Applied vinyl', lights: false, dimensional: false, isBox: false },
  'CL-C-07': { label: 'Push-through acrylic', lights: true, dimensional: true, isBox: true },
};

// ── §3.4 Copy treatment inside a box ───────────────────────────────────────

export const COPY_TREATMENTS = ['CL-CT-01', 'CL-CT-02', 'CL-CT-03', 'CL-CT-04', 'CL-CT-05'] as const;
export type CopyTreatment = (typeof COPY_TREATMENTS)[number];

export const COPY_TREATMENT_FACTS: Record<CopyTreatment, {
  label: string; day: string; night: string; fieldGlows: boolean; copyGlows: boolean;
}> = {
  'CL-CT-01': { label: 'Opaque vinyl copy on a white face', day: 'Coloured copy on white', night: 'Field glows white, copy stays dark', fieldGlows: true, copyGlows: false },
  'CL-CT-02': { label: 'Reversed out', day: 'Dark field, copy in the face colour', night: 'Field stays dark, copy glows', fieldGlows: false, copyGlows: true },
  'CL-CT-03': { label: 'Translucent vinyl copy on a white face', day: 'Coloured copy on white', night: 'Field glows white, copy glows in colour', fieldGlows: true, copyGlows: true },
  'CL-CT-04': { label: 'Push-through acrylic', day: 'Dimensional copy proud of the face', night: 'Field dark, copy glows and reads dimensional', fieldGlows: false, copyGlows: true },
  'CL-CT-05': { label: 'Routed and backed', day: 'Flush copy, crisp edge', night: 'Field dark, copy glows flush', fieldGlows: false, copyGlows: true },
};

// ── §7.1 Mount methods ─────────────────────────────────────────────────────

export const MOUNT_METHODS = ['CL-MT-01', 'CL-MT-02', 'CL-MT-03', 'CL-MT-04', 'CL-MT-05', 'CL-MT-06'] as const;
export type MountMethod = (typeof MOUNT_METHODS)[number];

export const MOUNTS: Record<MountMethod, { formValue: string; label: string; description: string }> = {
  'CL-MT-01': { formValue: 'Flush Mounted', label: 'Flush mounted', description: 'Studs through the back into the surface, element tight against it.' },
  'CL-MT-02': { formValue: 'Direct Mounted with Spacers', label: 'Direct mounted with spacers', description: 'Same, spaced off the surface. Mandatory for every rear-illuminated type.' },
  'CL-MT-03': { formValue: 'Raceway', label: 'Raceway', description: 'Elements on a raceway carrying wiring and drivers.' },
  'CL-MT-04': { formValue: 'Wireway', label: 'Wireway', description: 'Slimmer chase; also a mounting surface and backing board.' },
  'CL-MT-05': { formValue: 'Bottom Mounted', label: 'Bottom mounted', description: 'Elements stand on a horizontal rail and bolt down into it.' },
  'CL-MT-06': { formValue: 'Other', label: 'Other', description: 'Resolve from Additional Information. Cannot resolve → escalate.' },
};

export const FORM_MOUNT_MAP: Record<string, MountMethod | null> = {
  'Flush Mounted': 'CL-MT-01',
  'Direct Mounted with Spacers': 'CL-MT-02',
  Raceway: 'CL-MT-03',
  Wireway: 'CL-MT-04',
  'Bottom Mounted': 'CL-MT-05',
  Other: null,
};

// ── §4.5 Backer panel — orthogonal to mount method ─────────────────────────
// "Backer is not a mount method — the form asks for it separately. Any method
// can carry one." Open question 2 in §11 notes these values still need
// confirming against the live dropdown; the table below is the §4.5 shape list.

export const FORM_BACKER_MAP: Record<string, string | null> = {
  'No Backer': null,
  'Straight Flat': 'straight-flat',
  'Straight Aluminium Pan': 'straight-aluminium-pan',
  'Straight Aluminum Pan': 'straight-aluminium-pan',
  'Straight Pan': 'straight-aluminium-pan',
  'Contour Flat': 'contour-flat',
  'Cloud Flat': 'cloud-flat',
  'Letter Cloud': 'letter-cloud',
  'Letter Bubble': 'letter-bubble',
  'Contour Pan': 'contour-pan',
  Custom: null,
  Other: null,
};

/** A contour backer is cut to the copy's silhouette, not to a rectangle. */
export const isContourBacker = (shape: string): boolean =>
  shape.startsWith('contour') || shape.startsWith('cloud') || shape.startsWith('letter-');

// ── §5 Production methods ──────────────────────────────────────────────────

export const PRODUCTION_METHODS = {
  'CL-PM-01': { label: 'Preformed', note: 'Standard, lowest cost. Uses stocked 3″ and 5″ coil.' },
  'CL-PM-02': { label: 'Welded / fabricated', note: 'Seamless, any depth, any metal. Required for non-standard depths.' },
  'CL-PM-03': { label: 'Extruded / trimless', note: 'Integral retainer groove. Premium.' },
  'CL-PM-04': { label: 'Cast metal', note: 'Halo lit only, typically 6″–24″ high.' },
  'CL-PM-05': { label: 'Pan formed', note: '4″ minimum stroke — rules most logos out. Rare.' },
  'CL-PM-06': { label: 'Fabricated box', note: 'Pill boxes and logo boxes.' },
} as const;
export type ProductionMethod = keyof typeof PRODUCTION_METHODS;

// ── Resolver used by Gate 1 ────────────────────────────────────────────────

export interface FormResolution<T> {
  /** null when the form value is a documented free-text branch (Custom/Other). */
  value: T | null;
  /** false when the string is not in the mapping table at all. */
  known: boolean;
  /** true when the value is documented but requires free-text resolution. */
  needsResolution: boolean;
}

export function resolveFormValue<T>(
  table: Record<string, T | null>,
  raw: string | null | undefined,
): FormResolution<T> {
  if (raw == null || raw.trim() === '') return { value: null, known: false, needsResolution: false };
  const norm = raw.trim().toLowerCase();
  const key = Object.keys(table).find((k) => k.toLowerCase() === norm);
  if (key === undefined) return { value: null, known: false, needsResolution: false };
  const value = table[key] ?? null;
  return { value, known: true, needsResolution: value === null };
}

/** §1.1 alias parsing — input only, never used for output naming. */
export function typeFromAlias(raw: string): SignType | null {
  const norm = raw.trim().toLowerCase();
  for (const t of Object.values(TYPES)) {
    if (t.name.toLowerCase() === norm || t.aliases.includes(norm)) return t.id;
  }
  return null;
}
