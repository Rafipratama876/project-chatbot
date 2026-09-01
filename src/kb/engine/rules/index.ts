/**
 * The rule registry. All 56 KB rules plus the engine-internal gate rules.
 *
 * Ordering inside a gate is registration order; ordering across gates is
 * `GATE_ORDER`. §6 says rule numbers reflect when a rule was added and the gate
 * decides when it runs, so nothing here sorts by ID.
 */
import type { Rule } from '../rule.js';
import { GATE2_RULES } from './gate2-composition.js';
import { APPLY_DEFAULTS } from './gate3-defaults.js';
import { GATE4_STROKE_RULES } from './gate4-stroke.js';
import { GATE4_FACE_RULES } from './gate4-face.js';
import { GATE4_DEPTH_RULES } from './gate4-depth.js';
import { GATE4_MOUNTING_RULES } from './gate4-mounting.js';
import { GATE4_ILLUMINATION_RULES } from './gate4-illumination.js';
import { GATE4_COLOUR_RULES } from './gate4-colour.js';
import { GATE4_ARTWORK_RULES } from './gate4-artwork.js';
import { GATE5_RULES } from './gate5-render.js';

export const ALL_RULES: Rule[] = [
  ...GATE2_RULES,
  APPLY_DEFAULTS,
  // Gate 4 runs in KB section order: depth and colour feed the geometry rules'
  // thresholds, and §6.4 mounting substitutions can add a backer that §6.5
  // control selection depends on.
  ...GATE4_DEPTH_RULES,
  ...GATE4_STROKE_RULES,
  ...GATE4_FACE_RULES,
  ...GATE4_MOUNTING_RULES,
  ...GATE4_ILLUMINATION_RULES,
  ...GATE4_COLOUR_RULES,
  ...GATE4_ARTWORK_RULES,
  ...GATE5_RULES,
];

/**
 * The 56 KB rule IDs. `CL-R-02`, `-03`, `-05`, and `-50`…`-54` are implemented
 * inside composite rules (see gate2-composition.ts and gate4-stroke.ts) and are
 * attributed by `ruleId` override at trace time, so they are listed here but do
 * not appear as separate Rule objects.
 */
export const KB_RULE_IDS: string[] = Array.from({ length: 56 }, (_, i) =>
  `CL-R-${String(i + 1).padStart(2, '0')}`);

export const COMPOSITE_RULE_IDS: Record<string, string[]> = {
  'CL-R-01': ['CL-R-01', 'CL-R-02', 'CL-R-03', 'CL-R-05'],
  'CL-R-50': ['CL-R-50', 'CL-R-51', 'CL-R-52', 'CL-R-53', 'CL-R-54'],
};

/** Every KB rule ID this build can emit. Asserted in the tests. */
export function implementedRuleIds(): Set<string> {
  const ids = new Set<string>();
  for (const r of ALL_RULES) {
    ids.add(r.id);
    for (const alias of COMPOSITE_RULE_IDS[r.id] ?? []) ids.add(alias);
  }
  return ids;
}

export * from './gate2-composition.js';
export * from './gate3-defaults.js';
export * from './gate4-stroke.js';
export * from './gate4-face.js';
export * from './gate4-depth.js';
export * from './gate4-mounting.js';
export * from './gate4-illumination.js';
export * from './gate4-colour.js';
export * from './gate4-artwork.js';
export * from './gate5-render.js';
