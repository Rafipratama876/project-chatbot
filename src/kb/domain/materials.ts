/**
 * KB Layer 4 — materials & finishes, by part. All tables, no judgment.
 * §4.3 catalogues are `[EXT]` (vendor-verified) — CL-R-40/41 read them.
 */
import type { Inches } from './units.js';

// ── §4.1 Face ──────────────────────────────────────────────────────────────

export const FACE_MATERIALS = [
  'acrylic', 'impact-modified-acrylic', 'polycarbonate', 'aluminium',
  'stainless', 'corten', 'brass', 'copper', 'day-night-acrylic',
] as const;
export type FaceMaterial = (typeof FACE_MATERIALS)[number];

export interface FaceMaterialFacts {
  label: string;
  thicknesses: Inches[];
  /** [w, h] in inches; empty when sold by the linear foot. */
  stockSizes: Array<[number, number]>;
  /** Widest roll, inches — polycarbonate only (CL-R-14). */
  maxRollWidth?: number;
  when: string;
}

export const FACE: Record<FaceMaterial, FaceMaterialFacts> = {
  acrylic: { label: 'Acrylic', thicknesses: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1], stockSizes: [[48, 96], [48, 120], [60, 120]], when: 'Default lit face. Breaks and cracks easily.' },
  'impact-modified-acrylic': { label: 'Impact-modified acrylic', thicknesses: [1 / 8, 1 / 4], stockSizes: [[51, 100], [51, 125], [75, 100], [75, 125]], when: 'Over 5′×10′, or letters over 48″H. Best with a lot of white space.' },
  polycarbonate: { label: 'Polycarbonate (Lexan)', thicknesses: [3 / 16], stockSizes: [], maxRollWidth: 104, when: 'Oversized faces; less breakable; yellows in sunlight. Best fully printed.' },
  aluminium: { label: 'Aluminium', thicknesses: [0.04, 0.063, 0.08, 0.125], stockSizes: [[48, 120], [60, 120], [48, 144], [72, 144]], when: 'Opaque faces, welded to returns on halo types.' },
  stainless: { label: 'Stainless', thicknesses: [], stockSizes: [], when: 'Premium fabricated metal face. Flag cost.' },
  corten: { label: 'Corten', thicknesses: [], stockSizes: [], when: 'Premium fabricated metal face. Flag cost.' },
  brass: { label: 'Brass', thicknesses: [], stockSizes: [], when: 'Premium fabricated metal face. Flag cost.' },
  copper: { label: 'Copper', thicknesses: [], stockSizes: [], when: 'Premium fabricated metal face. Flag cost.' },
  'day-night-acrylic': { label: 'Day/Night acrylic (Acrylite)', thicknesses: [0.177, 0.118], stockSizes: [[49, 97]], when: 'Black by day, white illuminated by night. On request.' },
};

/** CL-R-10 threshold: any face dimension over 5′ × 10′. */
export const MAX_STANDARD_FACE: [Inches, Inches] = [60, 120];
/** CL-R-09 threshold. */
export const MAX_STANDARD_ACRYLIC_LETTER_HEIGHT: Inches = 48;
/** CL-R-17 threshold. */
export const MAX_FORMED_FACE: [Inches, Inches] = [96, 168];
/** CL-R-15 threshold. */
export const MAX_INHOUSE_PRINT_WIDTH: Inches = 52;
/** CL-R-18 threshold. */
export const OVERSIZE_SHIPPING_MIN_DIM: Inches = 168;

// ── §4.2 Return ────────────────────────────────────────────────────────────

/** Stocked coil depths. Anything else is welded (CL-PM-02). */
export const STOCKED_COIL_DEPTHS: Inches[] = [3, 5];
export const DEFAULT_RETURN_COLOUR = 'Black';

// ── §4.3 Trim cap ──────────────────────────────────────────────────────────

export const TRIM_CAP_WIDTHS: Inches[] = [3 / 4, 1, 2];
export const TRIM_CAP_DEFAULT_WIDTH: Inches = 1;
/** §4.3: projection above face and face recess. NOT added to quoted depth. */
export const TRIM_CAP_PROJECTION: Inches = 1 / 8;
export const TRIM_CAP_FACE_RECESS: Inches = 1 / 8;
export const TRIM_CAP_DEFAULT_COLOUR = 'Black';

export interface GemTrimColour { name: string; code: string; widths: Inches[] }

/** §4.3 GemTrim Flex — 31 standard colours `[EXT]`. */
export const GEMTRIM: GemTrimColour[] = [
  { name: 'White', code: '5687', widths: [0.75, 1, 2] },
  { name: 'Pearl Grey', code: '4272', widths: [0.75, 1] },
  { name: 'Ivory', code: '2718', widths: [0.75, 1] },
  { name: 'Yellow', code: '2000', widths: [0.75, 1] },
  { name: 'Mustard', code: '7548', widths: [1] },
  { name: 'Dove Grey', code: '4310', widths: [0.75, 1] },
  { name: 'Black', code: '2025', widths: [0.75, 1, 2] },
  { name: 'Midnight Blue', code: '2767', widths: [0.75, 1] },
  { name: 'Dark Blue', code: '2050', widths: [0.75, 1, 2] },
  { name: 'Intense Blue', code: '2945', widths: [0.75, 1, 2] },
  { name: 'Purple', code: '2287', widths: [0.75, 1] },
  { name: 'Teal', code: '3210', widths: [0.75, 1] },
  { name: 'Spring Green', code: '3555', widths: [0.75, 1] },
  { name: 'Holiday Green', code: '1225', widths: [1] },
  { name: 'Irish Green', code: '2426', widths: [1] },
  { name: 'Lt. Green', code: '2108', widths: [0.75, 1, 2] },
  { name: 'Hunter Green', code: '2162', widths: [0.75, 1] },
  { name: 'Orange', code: '2119', widths: [0.75, 1] },
  { name: 'Mango', code: '2540', widths: [0.75, 1] },
  { name: 'Red', code: '2793', widths: [0.75, 1, 2] },
  { name: 'Maroon', code: '2240', widths: [0.75, 1] },
  { name: 'Burgundy', code: '4840', widths: [0.75, 1] },
  { name: 'Brown', code: '2418', widths: [0.75, 1] },
  { name: 'Bronze', code: '0313', widths: [0.75, 1, 2] },
  { name: 'Med. Bronze', code: '3120', widths: [0.75, 1, 2] },
  { name: 'Dur. Bronze', code: '3130', widths: [0.75, 1] },
  { name: 'Metallic Silver', code: '8886', widths: [0.75, 1, 2] },
  { name: 'Brushed Silver', code: '8884', widths: [0.75, 1] },
  { name: 'Polished Silver', code: '8885', widths: [0.75, 1] },
  { name: 'Brushed Gold', code: '2764', widths: [0.75, 1] },
  { name: 'Polished Gold', code: '2766', widths: [0.75, 1, 2] },
];

/** §4.3 Jewelite by Vidon — 20 standard colours `[EXT]`, all in 3/4″, 1″, 2″. */
export const JEWELITE: string[] = [
  'Brushed Gold', 'Burgundy', 'Green', 'Ivory', 'Paintable', 'True Red',
  'Hunter Green', 'White', 'Brushed Chrome', 'Orange', 'Teal',
  'Metallic Silver', 'Bronze', 'Yellow', 'Intense Blue', 'Bronze 313',
  'Brown', 'Holiday Green', 'Blue', 'Black',
];

export const JEWELITE_PAINTABLE = 'Jewelite Paintable';

export interface TrimCapMatch {
  brand: 'GemTrim' | 'Jewelite' | 'Paintable';
  colour: string;
  code?: string;
  /** Widths the colour is actually offered in. */
  widths: Inches[];
}

/** CL-R-40 / CL-R-41 read this. Exact, case-insensitive name match only. */
export function findTrimCap(colour: string): TrimCapMatch | null {
  const norm = colour.trim().toLowerCase();
  const gem = GEMTRIM.find((c) => c.name.toLowerCase() === norm);
  if (gem) return { brand: 'GemTrim', colour: gem.name, code: gem.code, widths: gem.widths };
  const jew = JEWELITE.find((c) => c.toLowerCase() === norm);
  if (jew) return { brand: 'Jewelite', colour: jew, widths: [0.75, 1, 2] };
  return null;
}

// ── §4.5 Backer panel ──────────────────────────────────────────────────────

export const BACKER_MATERIALS = ['acm', 'acrylic', 'pvc', 'aluminium'] as const;
export type BackerMaterial = (typeof BACKER_MATERIALS)[number];

export const BACKER_SHAPES = [
  'straight-flat', 'straight-aluminium-pan', 'contour-flat', 'cloud-flat',
  'letter-cloud', 'letter-bubble', 'contour-pan', 'custom',
] as const;
export type BackerShape = (typeof BACKER_SHAPES)[number];

/** CL-R-23: minimum backer depth when it houses power supplies. */
export const BACKER_MIN_DEPTH_WITH_SUPPLIES: Inches = 4;
export const BACKER_DEFAULT_ACRYLIC_THICKNESS: Inches = 1 / 4;

// ── §4.6 Raceway / wireway ─────────────────────────────────────────────────

export const RACEWAY_STANDARD = { h: 4.75, d: 5 };
export const RACEWAY_ALTERNATIVES = [{ h: 4.5, d: 4.5 }, { h: 6, d: 6.5 }, { h: 8, d: 5 }];
export const WIREWAY_STANDARD = { h: 12, d: 2 };
export const WIREWAY_ALTERNATIVES = [{ h: 3, d: 1.5 }, { h: 4, d: 1 }];
/** CL-R-27: a letter or logo taller than this needs a second/larger raceway. */
export const RACEWAY_MAX_LETTER_HEIGHT: Inches = 36;

// ── §4.7 Colour systems ────────────────────────────────────────────────────

export const PAINT_SYSTEMS = ['PMS', 'Sherwin-Williams', 'Matthews Paint'] as const;
export type PaintSystem = (typeof PAINT_SYSTEMS)[number];

export const FILM_SYSTEMS = [
  '3M Scotchcal 3630', '3M Envision 3730', 'Orafol Oracal 8500', 'Avery Dennison 4500',
] as const;
export type FilmSystem = (typeof FILM_SYSTEMS)[number];

export const DEFAULT_PAINT_SYSTEM: PaintSystem = 'PMS';
export const DEFAULT_FILM_SYSTEM: FilmSystem = '3M Scotchcal 3630';

/** CL-R-38 / CL-R-39 trigger on these notations. */
export const DEVICE_COLOUR_RE = /^(#[0-9a-f]{3,8}|rgba?\s*\(|cmyk\s*\(|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})/i;
export const isDeviceColour = (v: string): boolean => DEVICE_COLOUR_RE.test(v.trim());

/**
 * §4.7: CMYK/RGB/HEX may drive the on-screen render but never the spec block.
 *
 * The conversion itself is a lookup against a measured fan-deck, which this
 * package does not ship — PMS, Sherwin-Williams, Matthews and the four film
 * lines are licensed colour data. So it is a port. The default implementation
 * names the system and marks the value indicative WITHOUT inventing a colour
 * number, which is the honest output when no fan deck is loaded: a made-up
 * "PMS 186 C" on a proof is worse than no number, because a fabricator would
 * order against it.
 *
 * ⚠ Wire a real converter before this goes in front of customers.
 */
export interface ColourConversion {
  system: PaintSystem | FilmSystem;
  /** The catalogue name, when a fan deck is loaded. */
  name: string | null;
  /** Always true — §4.7 requires the spec block to say so. */
  indicative: true;
  sourceValue: string;
}

export type ColourConverter = (device: string, system: PaintSystem | FilmSystem) => ColourConversion;

export const placeholderConverter: ColourConverter = (device, system) => ({
  system, name: null, indicative: true, sourceValue: device,
});

/** How a conversion reads in the spec block. Never contains the device value. */
export function formatConversion(c: ColourConversion): string {
  return c.name
    ? `${c.system} ${c.name} (indicative, to be confirmed against a physical sample)`
    : `${c.system}, nearest match to the supplied colour (indicative, to be confirmed against a physical sample)`;
}

// ── §4.8 Illumination ──────────────────────────────────────────────────────

export const KELVIN_RANGE: [number, number] = [1800, 6500];
export const DEFAULT_LED = 'White, bright white';
export const LED_COLOURS = ['white', 'warm-white', 'bright-white', 'cool-white', 'red', 'blue', 'green', 'orange', 'yellow', 'rgb', 'rgbw'] as const;
export type LedColour = (typeof LED_COLOURS)[number];
/** §4.8: even illumination is comfortable at 4″+ for a front-lit face. */
export const COMFORTABLE_FRONTLIT_DEPTH: Inches = 4;
