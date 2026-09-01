/**
 * KB §6.3 — Depth. Gate 4. CL-R-19 … CL-R-23.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import { TYPES } from '../../domain/taxonomy.js';
import { depthOf } from '../../domain/spec.js';
import { STOCKED_COIL_DEPTHS } from '../../domain/materials.js';
import { formatInches } from '../../domain/units.js';

/** CL-R-19 — return depth unspecified → type default. */
export const CL_R_19: Rule = {
  id: 'CL-R-19', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.3', title: 'Return depth defaults by type',
  run(ctx) {
    const std = TYPES[ctx.spec.type].standardDepth;
    for (const el of ctx.spec.elements) {
      if (el.returnDepth != null && depthOf(el) > 0) continue;
      ctx.set(ctx.pathOf(el, 'returnDepth'), std, {
        message: `"${el.content}" return depth defaulted to ${formatInches(std)} — the standard for ${TYPES[ctx.spec.type].name}.`,
        elementId: el.id,
      });
    }
  },
};

/** CL-R-20 — on-request depth: buildable, not stocked. */
export const CL_R_20: Rule = {
  id: 'CL-R-20', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.3', title: 'On-request return depth',
  run(ctx) {
    const t = TYPES[ctx.spec.type];
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      if (!t.onRequestDepths.includes(depthOf(el))) continue;
      ctx.note(
        `"${el.content}" at ${formatInches(depthOf(el))} deep is an on-request depth for ${t.name} — buildable and available, but not stocked. Price and lead time differ from the ${formatInches(t.standardDepth)} standard.`,
        { elementId: el.id, path: ctx.pathOf(el, 'returnDepth') },
      );
    }
  },
};

/** CL-R-21 — depth outside the standard and on-request set → welded. */
export const CL_R_21: Rule = {
  id: 'CL-R-21', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.3', title: 'Non-standard return depth needs welded construction',
  run(ctx) {
    const t = TYPES[ctx.spec.type];
    const allowed = [t.standardDepth, ...t.onRequestDepths];
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      if (allowed.includes(depthOf(el))) continue;
      const nearest = STOCKED_COIL_DEPTHS
        .reduce((a, b) => (Math.abs(b - depthOf(el)) < Math.abs(a - depthOf(el)) ? b : a));
      ctx.note(
        `"${el.content}" at ${formatInches(depthOf(el))} deep is outside the standard (${formatInches(t.standardDepth)}) and on-request (${t.onRequestDepths.map(formatInches).join(', ')}) set — welded construction (CL-PM-02). Nearest stocked coil depth is ${formatInches(nearest)}.`,
        { elementId: el.id, path: ctx.pathOf(el, 'returnDepth') },
      );
      ctx.set(ctx.pathOf(el, 'suggestions'), [
        ...(el.suggestions ?? []),
        `Nearest stocked depth: ${formatInches(nearest)}`,
      ], { message: 'Stocked-depth alternative proposed.', severity: 'NOTE', elementId: el.id });
    }
  },
};

/** CL-R-22 — front lit at 3″ or less hot-spots. */
export const CL_R_22: Rule = {
  id: 'CL-R-22', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'WARN',
  kbRef: '§6.3', title: 'Shallow front-lit cans hot-spot',
  applies: (ctx) => TYPES[ctx.spec.type].illumination === 'front' || TYPES[ctx.spec.type].illumination === 'front+halo',
  run(ctx) {
    const limit = ctx.thresholds.get('depth.frontlit_hotspot_threshold');
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01' || !el.lit) continue;
      if (depthOf(el) > limit) continue;
      ctx.note(
        `"${el.content}" is front lit at ${formatInches(depthOf(el))} deep — shallow front-lit cans hot-spot. ${formatInches(TYPES[ctx.spec.type].standardDepth)} is recommended.`,
        { elementId: el.id, path: ctx.pathOf(el, 'returnDepth'), thresholdKeys: ['depth.frontlit_hotspot_threshold'] },
      );
    }
  },
};

/** CL-R-23 — backer housing power supplies must be at least 4″ deep. */
export const CL_R_23: Rule = {
  id: 'CL-R-23', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.3', title: 'Backer depth when it houses power supplies',
  applies: (ctx) => ctx.spec.backer.present && ctx.spec.backer.housesSupplies,
  run(ctx) {
    const min = ctx.thresholds.get('depth.backer_min_with_supplies');
    if (ctx.spec.backer.depth >= min) return;
    ctx.set('backer.depth', min, {
      message: `Backer houses the power supplies, so its depth is set to ${formatInches(min)}.`,
      authority: Authority.BUILDABILITY,
      thresholdKeys: ['depth.backer_min_with_supplies'],
    });
  },
};

export const GATE4_DEPTH_RULES: Rule[] = [CL_R_19, CL_R_20, CL_R_21, CL_R_22, CL_R_23];
