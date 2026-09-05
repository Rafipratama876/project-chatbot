/**
 * DL GATE 3 — defaults. "Apply to every empty field, and log that you did"
 * (same discipline as CL §8.1): every default here writes at
 * `Authority.HOUSE` so an explicit customer value already claimed in Gate 1
 * is never overwritten, and every write is traced so DL's disclosure
 * generator can report it as "defaulted, not chosen" — never silently.
 */
import type { DLRule } from '../dl-rule.js';
import { DL_GATES } from '../dl-gates.js';
import { Authority } from '../../precedence.js';
import { DL_MATERIALS, DL_DEFAULT_FINISH, DL_MOUNT_FACTS, finishFromLabel } from '../../../domain/dl-taxonomy.js';
import { formatInches } from '../../../domain/units.js';

const DEFAULT_METAL_COLOUR = 'Natural / mill finish';
const DEFAULT_PLASTIC_COLOUR = 'White';
/** `[DER]` house minimum — not a vendor figure. Same honesty as CL's standoff.min. */
const DEFAULT_STANDOFF: number = 1.5;

export const DL_DEF_01: DLRule = {
  id: 'DL-DEF-01', gate: DL_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'PDF p.4/5/9/10 (depth ranges)', title: 'Default element depth from the material family range',
  run(ctx) {
    const facts = DL_MATERIALS[ctx.spec.materialFamily];
    ctx.spec.elements.forEach((el, i) => {
      if (el.depth !== undefined) return;
      const mid = (facts.minDepth + facts.maxDepth) / 2;
      const value = Math.round(mid * 16) / 16;
      const path = `elements[${i}].depth`;
      if (ctx.set(path, value, {
        authority: Authority.HOUSE,
        message: `No depth specified — defaulted to ${formatInches(value)}, the midpoint of ${facts.label}'s typical ${formatInches(facts.minDepth)}–${formatInches(facts.maxDepth)} range.`,
      })) {
        ctx.trace.pushDefault({
          defaultId: 'DL-DEF-01', path, value, elementId: el.id,
          label: 'Depth', display: formatInches(value),
        });
      }
    });
  },
};

export const DL_DEF_02: DLRule = {
  id: 'DL-DEF-02', gate: DL_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'v1 default', title: 'Default element colour',
  run(ctx) {
    const metal = ctx.spec.materialFamily === 'cast-metal' || ctx.spec.materialFamily === 'flat-cut-metal';
    const value = ctx.spec.form.colour ?? (metal ? DEFAULT_METAL_COLOUR : DEFAULT_PLASTIC_COLOUR);
    ctx.spec.elements.forEach((el, i) => {
      if (el.colour !== undefined) return;
      const path = `elements[${i}].colour`;
      if (ctx.set(path, value, {
        authority: Authority.HOUSE,
        message: `No colour specified — defaulted to "${value}".`,
      })) {
        ctx.trace.pushDefault({ defaultId: 'DL-DEF-02', path, value, elementId: el.id, label: 'Colour', display: String(value) });
      }
    });
  },
};

export const DL_DEF_03: DLRule = {
  id: 'DL-DEF-03', gate: DL_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'PDF p.9/10 (finish options)', title: 'Default finish for the material family',
  run(ctx) {
    // The form carries the finish SELECT's label ("Mirror Polish (up to
    // 24″)"), same as materialFamily/mountingMethod — resolve it to a DLFinish
    // id rather than storing the label as if it were one; DL_FINISH_FACTS is
    // keyed by id, and an unresolved label there is a crash, not a typo.
    const requested = ctx.spec.form.finish ? finishFromLabel(ctx.spec.form.finish) : null;
    if (ctx.spec.form.finish && !requested) {
      ctx.note(`Finish "${ctx.spec.form.finish}" is not one of the known finishes — ignored.`, { severity: 'WARN' });
    }
    const value = requested ?? DL_DEFAULT_FINISH[ctx.spec.materialFamily];
    ctx.spec.elements.forEach((el, i) => {
      if (el.finish !== undefined) return;
      const path = `elements[${i}].finish`;
      if (ctx.set(path, value, {
        authority: Authority.HOUSE,
        message: `No finish specified — defaulted to "${value}".`,
      })) {
        ctx.trace.pushDefault({ defaultId: 'DL-DEF-03', path, value, elementId: el.id, label: 'Finish', display: String(value) });
      }
    });
  },
};

export const DL_DEF_04: DLRule = {
  id: 'DL-DEF-04', gate: DL_GATES.DEFAULTS, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: 'v1 house minimum', title: 'Default standoff for standoff-capable mounts',
  applies: (ctx) => DL_MOUNT_FACTS[ctx.spec.mount].standoff,
  run(ctx) {
    ctx.spec.elements.forEach((el, i) => {
      if (el.standoff !== undefined) return;
      const path = `elements[${i}].standoff`;
      if (ctx.set(path, DEFAULT_STANDOFF, {
        authority: Authority.HOUSE,
        message: `${DL_MOUNT_FACTS[ctx.spec.mount].label} stands the letter off the wall — defaulted the gap to ${formatInches(DEFAULT_STANDOFF)}.`,
      })) {
        ctx.trace.pushDefault({
          defaultId: 'DL-DEF-04', path, value: DEFAULT_STANDOFF, elementId: el.id,
          label: 'Standoff', display: formatInches(DEFAULT_STANDOFF),
        });
      }
    });
  },
};

export const DL_GATE3_RULES: DLRule[] = [DL_DEF_01, DL_DEF_02, DL_DEF_03, DL_DEF_04];
