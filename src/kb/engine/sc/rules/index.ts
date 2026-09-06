import { SC_GATE3_RULES } from './sc-gate3-defaults.js';
import { SC_GATE4_RULES } from './sc-gate4-validation.js';
import { SC_GATE5_RULES } from './sc-gate5-render.js';
import type { SCRule } from '../sc-rule.js';

export const SC_ALL_RULES: SCRule[] = [...SC_GATE3_RULES, ...SC_GATE4_RULES, ...SC_GATE5_RULES];

export * from './sc-gate3-defaults.js';
export * from './sc-gate4-validation.js';
export * from './sc-gate5-render.js';
