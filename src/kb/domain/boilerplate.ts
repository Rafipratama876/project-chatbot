/** The KB revision this build implements. Stamped on every persisted proof. */
export const KB_VERSION = 'v2.2 (compiled 29 Aug 2026)';

/**
 * KB §6.9 standing notes and §9.4 item 5 disclaimer.
 * "Printed on every proof, never evaluated." So they are strings, not rules.
 */

export const STANDING_NOTES: string[] = [
  '1/4" drain holes at the low point of each letter and box',
  'UL 48 listed components; UL label on the raceway or enclosure housing the power supply',
  'Dedicated 120V sign circuit, 20A minimum',
  'Externally operable, lockable disconnect within sight of the sign',
  'LED power supplies sized with a 25% safety margin',
  'All exterior fasteners and mounting hardware corrosion-resistant',
];

export const DISCLAIMER = [
  'Pre-sales concept only. Colours are indicative and not a colour match.',
  'Dimensions are approximate and subject to site survey.',
  'Not for production, permit or engineering use.',
  'Final specifications require review by a Sign Pack designer and the selected fabricator.',
  'Permit allowances, landlord criteria and structural requirements have not been verified.',
].join(' ');

/** KB Layer 0 — hard stop. Asserted by the output contract. */
export const SCOPE_HARD_STOP =
  'Pre-sales concepts only. Never present output as production-ready, permit-ready or engineered.';

/** KB Layer 0 — out of scope, hand off. Checked in Gate 1. */
export const HANDOFF_RULES: Array<{ situation: string; owner: string }> = [
  { situation: 'Flat cut letters as the whole sign (no channel letters present)', owner: 'Dimensional Letters agent' },
  { situation: 'Cast metal, formed/injection-moulded plastic letters', owner: 'Dimensional Letters agent' },
  { situation: 'A full enclosed cabinet as the whole sign', owner: 'Sign Cabinet agent' },
  { situation: 'Letters on a monument', owner: 'Monument agent owns structure; CL agent owns letters' },
  { situation: 'Letters on a pylon', owner: 'Pylon agent owns structure; CL agent owns letters' },
  { situation: 'Vinyl-only wall lettering', owner: 'Wall Graphics agent' },
  { situation: 'Anything needing a stamped engineered drawing', owner: 'Human — escalate' },
];
