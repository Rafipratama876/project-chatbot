/**
 * SC GATE 3 — defaults. "Apply to every empty field, and log that you did"
 * (same discipline as CL §8.1 / DL Gate 3): every default here writes at
 * `Authority.HOUSE` so an explicit customer value already claimed in Gate 1
 * is never overwritten, and every write is traced so SC's disclosure
 * generator can report it as "defaulted, not chosen" — never silently.
 */
import type { SCRule } from '../sc-rule.js';
import { SC_GATES } from '../sc-gates.js';
import { Authority } from '../../precedence.js';
import {
  SC_DEFAULT_EXTRUSION_DEPTH, SC_DEFAULT_RETAINER, SC_DEFAULT_CORNER_STYLE,
} from '../../../domain/sc-taxonomy.js';
import { formatInches } from '../../../domain/units.js';

const DEFAULT_FACE_COLOUR = 'White';

export const SC_DEF_01: SCRule = {
  id: 'SC-DEF-01', gate: SC_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'PDF §4 (extrusion 7/9/12")', title: 'Default cabinet depth to the standard 7" extrusion',
  run(ctx) {
    if (ctx.spec.cabinet.depth !== undefined) return;
    const value = SC_DEFAULT_EXTRUSION_DEPTH;
    if (ctx.set('cabinet.depth', value, {
      authority: Authority.HOUSE,
      message: `No extrusion depth specified — defaulted to ${formatInches(value)}, the standard stock extrusion.`,
    })) {
      ctx.trace.pushDefault({ defaultId: 'SC-DEF-01', path: 'cabinet.depth', value, label: 'Extrusion depth', display: formatInches(value) });
    }
  },
};

export const SC_DEF_02: SCRule = {
  id: 'SC-DEF-02', gate: SC_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'v1 default', title: 'Default face colour',
  run(ctx) {
    if (ctx.spec.cabinet.faceColour !== undefined) return;
    const value = ctx.spec.form.faceColour ?? DEFAULT_FACE_COLOUR;
    if (ctx.set('cabinet.faceColour', value, {
      authority: Authority.HOUSE,
      message: `No face colour specified — defaulted to "${value}".`,
    })) {
      ctx.trace.pushDefault({ defaultId: 'SC-DEF-02', path: 'cabinet.faceColour', value, label: 'Face colour', display: String(value) });
    }
  },
};

export const SC_DEF_03: SCRule = {
  id: 'SC-DEF-03', gate: SC_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'PDF §9 (retainer types)', title: 'Default retainer type',
  run(ctx) {
    if (ctx.spec.cabinet.retainerType !== undefined) return;
    const value = SC_DEFAULT_RETAINER;
    if (ctx.set('cabinet.retainerType', value, {
      authority: Authority.HOUSE,
      message: `No retainer type specified — defaulted to "Normal Retainer".`,
    })) {
      ctx.trace.pushDefault({ defaultId: 'SC-DEF-03', path: 'cabinet.retainerType', value, label: 'Retainer type', display: 'Normal Retainer' });
    }
  },
};

export const SC_DEF_04: SCRule = {
  id: 'SC-DEF-04', gate: SC_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'PDF §4 (corner options)', title: 'Default corner style to square',
  run(ctx) {
    if (ctx.spec.cabinet.cornerStyle !== undefined) return;
    const value = SC_DEFAULT_CORNER_STYLE;
    if (ctx.set('cabinet.cornerStyle', value, {
      authority: Authority.HOUSE,
      message: 'No corner style specified — defaulted to square (standard).',
    })) {
      ctx.trace.pushDefault({ defaultId: 'SC-DEF-04', path: 'cabinet.cornerStyle', value, label: 'Corner style', display: 'Square' });
    }
  },
};

export const SC_GATE3_RULES: SCRule[] = [SC_DEF_01, SC_DEF_02, SC_DEF_03, SC_DEF_04];
