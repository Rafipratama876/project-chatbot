import type { DLRule } from '../dl-rule.js';
import { DL_GATE2_RULES } from './dl-gate2-composition.js';
import { DL_GATE3_RULES } from './dl-gate3-defaults.js';
import { DL_GATE4_RULES } from './dl-gate4-validation.js';
import { DL_GATE5_RULES } from './dl-gate5-render.js';

export const DL_ALL_RULES: DLRule[] = [
  ...DL_GATE2_RULES,
  ...DL_GATE3_RULES,
  ...DL_GATE4_RULES,
  ...DL_GATE5_RULES,
];

export const DL_RULE_IDS: string[] = DL_ALL_RULES.map((r) => r.id);
