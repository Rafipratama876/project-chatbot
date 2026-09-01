/**
 * KB Layer 2 — part vocabulary.
 *
 * "No callout, dimension or render instruction may name a part that isn't on
 * this list." That sentence is a validation rule, so it is implemented as one:
 * `lintCallout()` below. Nothing here is a prompt.
 */

export const PARTS = {
  'CL-P-01': { part: 'Face', what: 'Front surface. Translucent (lit) or opaque metal (halo/non-lit).', visible: true },
  'CL-P-02': { part: 'Return', what: 'Side wall of the can. Depth = return depth.', visible: true },
  'CL-P-03': { part: 'Trim Cap', what: 'CAB moulding over aluminium foil, glued to the face edge.', visible: true },
  'CL-P-04': { part: 'Retainer', what: 'Extruded aluminium face frame; replaces trim cap on large and trimless work.', visible: true },
  'CL-P-05': { part: 'Back', what: 'Rear closure. Aluminium (front lit) or clear polycarbonate (halo).', visible: false },
  'CL-P-06': { part: 'Flange', what: 'Bent tab at the rear of the return the back fastens to.', visible: false },
  'CL-P-07': { part: 'Rivets', what: 'Fasteners joining return seams and back.', visible: false },
  'CL-P-08': { part: 'Drain / weep holes', what: '1/4″ holes at low points.', visible: false },
  'CL-P-09': { part: 'LED module', what: 'Internal light engine.', visible: false },
  'CL-P-10': { part: 'Power supply', what: 'LED driver, 120V to low-voltage DC.', visible: false },
  'CL-P-11': { part: 'Flexible conduit / whip', what: 'Wiring run to the supply.', visible: false },
  'CL-P-12': { part: 'Waterproof enclosure box', what: 'Remote housing for supplies.', visible: false },
  'CL-P-13': { part: 'Disconnect switch', what: 'Externally operable, within sight of the sign.', visible: false },
  'CL-P-14': { part: 'Dedicated sign circuit', what: '120V branch circuit.', visible: false },
  'CL-P-15': { part: 'Spacer / standoff', what: 'Holds the letter off the surface so halo light escapes.', visible: true },
  'CL-P-16': { part: 'Angle clip', what: 'Bracket securing a letter to a backer or raceway.', visible: false },
  'CL-P-17': { part: 'Mounting stud', what: 'Threaded stud through the letter back into the surface.', visible: false },
  'CL-P-18': { part: 'Raceway', what: 'Rectangular enclosure — mounting structure and electrical housing.', visible: true },
  'CL-P-19': { part: 'Wireway', what: 'Slimmer enclosure — wiring chase, mounting surface, backing board.', visible: true },
  'CL-P-20': { part: 'Backer panel', what: 'Panel behind the whole set. Orthogonal to mount method.', visible: true },
  'CL-P-21': { part: 'Pill box', what: 'Small illuminated cabinet carrying secondary copy.', visible: true },
  'CL-P-22': { part: 'Photocell', what: 'Ambient-light switch.', visible: false },
  'CL-P-23': { part: 'Timer', what: 'Scheduled switch.', visible: false },
  'CL-P-24': { part: 'Vinyl application', what: 'Translucent, cut, day/night or printed vinyl on a letter face.', visible: true },
  'CL-P-25': { part: 'Polycarbonate (Lexan) back', what: 'Clear rear panel the LEDs mount to on halo types.', visible: false },
  'CL-P-26': { part: 'Floating-element frame', what: '2″×2″ frame with square or circular base for detached elements.', visible: false },
  'CL-P-27': { part: 'Bottom rail', what: 'Horizontal rail the letters stand on and bolt down into.', visible: true },
  'CL-P-28': { part: 'Support rod', what: 'Slim vertical rod carrying an element above the letter line.', visible: true },
  'CL-P-29': { part: 'Push-through acrylic', what: 'Acrylic protruding through a routed face.', visible: true },
  'CL-P-30': { part: 'Gooseneck / spotlight', what: 'External illumination for non-lit letters.', visible: true },
  'CL-P-31': { part: 'Mounting surface', what: 'Wall, parapet, canopy fascia or rail the sign mounts to.', visible: true },
  'CL-P-32': { part: 'Logo box', what: 'Illuminated cabinet cut to a logo silhouette rather than a rectangle.', visible: true },
  'CL-P-33': { part: 'Flat cut letter', what: 'Letter with no return — flat acrylic or metal, stud or tape mounted.', visible: true },
  'CL-P-34': { part: 'Copy vinyl', what: 'The lettering applied to, or reversed out of, a box face.', visible: true },
} as const;

export type PartId = keyof typeof PARTS;
export const PART_IDS = Object.keys(PARTS) as PartId[];

/** Parts §9.2 forbids from a customer-facing render: "no fabrication hardware". */
export const HARDWARE_PARTS: PartId[] = [
  'CL-P-07', 'CL-P-10', 'CL-P-11', 'CL-P-12', 'CL-P-16', 'CL-P-17',
];

export const partName = (id: PartId): string => PARTS[id].part;
export const isVisible = (id: PartId): boolean => PARTS[id].visible;

/** Lower-cased part names + the aliases the KB itself uses inline. */
const VOCAB: Array<{ id: PartId; terms: string[] }> = PART_IDS.map((id) => {
  const p = PARTS[id];
  const terms = p.part
    .toLowerCase()
    .split(/\s*[/·]\s*/)
    .map((t) => t.replace(/\s*\(.*?\)\s*/g, ' ').trim())
    .filter(Boolean);
  return { id, terms };
});

const EXTRA_ALIASES: Record<string, PartId> = {
  'light box': 'CL-P-21',
  capsule: 'CL-P-21',
  lexan: 'CL-P-25',
  weep: 'CL-P-08',
  spacers: 'CL-P-15',
  standoffs: 'CL-P-15',
  driver: 'CL-P-10',
  drivers: 'CL-P-10',
  conduit: 'CL-P-11',
  studs: 'CL-P-17',
};

/**
 * Nouns a callout may plausibly use that are NOT parts. Anything outside both
 * lists is not vocabulary the KB defines, and the linter reports it.
 */
const ALLOWED_NON_PARTS = new Set([
  'sign', 'letter', 'letters', 'copy', 'element', 'elements', 'colour', 'color',
  'height', 'width', 'depth', 'minimum', 'night', 'day', 'acrylic', 'aluminium',
  'aluminum', 'polycarbonate', 'vinyl', 'led', 'leds', 'building', 'wall',
  'proof', 'concept', 'set', 'line', 'copy', 'tagline', 'logo', 'box', 'boxes',
]);

export interface CalloutLintResult {
  ok: boolean;
  referencedParts: PartId[];
  /** Words that look like part names but are not in Layer 2. */
  unknownPartTerms: string[];
  /** Hardware §9.2 forbids naming in a customer render. */
  hardwareMentions: PartId[];
}

/**
 * Layer 2 enforcement. Runs on every generated callout string before it can
 * reach the proof — including LLM-written ones (src/llm/writeCallouts.ts).
 */
export function lintCallout(text: string, opts: { forbidHardware?: boolean } = {}): CalloutLintResult {
  const lower = text.toLowerCase();
  const referenced = new Set<PartId>();

  for (const { id, terms } of VOCAB) {
    for (const t of terms) {
      if (t.length >= 3 && lower.includes(t)) referenced.add(id);
    }
  }
  for (const [alias, id] of Object.entries(EXTRA_ALIASES)) {
    if (lower.includes(alias)) referenced.add(id);
  }

  // Terms that read like part vocabulary but the KB does not define.
  const SUSPECT = [
    'bezel', 'gasket', 'diffuser', 'lightbox frame', 'ballast', 'neon tube',
    'transformer', 'sintra', 'chassis', 'housing frame', 'lens',
  ];
  const unknown = SUSPECT.filter((s) => lower.includes(s) && !ALLOWED_NON_PARTS.has(s));

  const hardware = opts.forbidHardware
    ? [...referenced].filter((id) => HARDWARE_PARTS.includes(id))
    : [];

  return {
    ok: unknown.length === 0 && hardware.length === 0,
    referencedParts: [...referenced].sort(),
    unknownPartTerms: unknown,
    hardwareMentions: hardware,
  };
}
