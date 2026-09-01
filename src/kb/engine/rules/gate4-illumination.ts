/**
 * KB §6.5 — Illumination and control. Gate 4. CL-R-33 … CL-R-37.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import { TYPES } from '../../domain/taxonomy.js';
import { DEFAULT_LED } from '../../domain/materials.js';
import { formatInches, formatRange } from '../../domain/units.js';
import { anyLit, depthOf } from '../../domain/spec.js';

/** CL-R-33 — flush, spacer or bottom mounted + illuminated → timer. */
export const CL_R_33: Rule = {
  id: 'CL-R-33', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.5', title: 'Control defaults to a timer',
  applies: (ctx) =>
    anyLit(ctx.spec) && ctx.spec.control === undefined &&
    ['CL-MT-01', 'CL-MT-02', 'CL-MT-05'].includes(ctx.spec.mount),
  run(ctx) {
    ctx.set('control', 'timer', {
      message: 'Illuminated and mounted without an enclosure to carry a sensor — a timer is specified.',
    });
  },
};

/** CL-R-34 — backer or raceway mounted + illuminated → photocell. */
export const CL_R_34: Rule = {
  id: 'CL-R-34', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.5', title: 'Control defaults to a photocell',
  applies: (ctx) =>
    anyLit(ctx.spec) && ctx.spec.control === undefined &&
    (ctx.spec.backer.present || ['CL-MT-03', 'CL-MT-04'].includes(ctx.spec.mount)),
  run(ctx) {
    ctx.set('control', 'photocell', {
      message: 'Illuminated on a backer or raceway — a photocell is specified.',
    });
  },
};

/** CL-R-35 — red translucent face gets red LEDs, not white. */
export const CL_R_35: Rule = {
  id: 'CL-R-35', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.5', title: 'Red face needs red LEDs',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.lit) continue;
      const face = `${el.face.colour ?? ''} ${el.box?.faceColour ?? ''}`.toLowerCase();
      if (!/\bred\b|\bcrimson\b|\bscarlet\b/.test(face)) continue;
      if (/red/i.test(el.ledColour ?? '')) continue;
      ctx.set(ctx.pathOf(el, 'ledColour'), 'Red', {
        message: `"${el.content}" has a red translucent face — red acrylic with red LEDs. White LEDs behind red acrylic read dull and pink.`,
        elementId: el.id,
        authority: Authority.BUILDABILITY,
      });
    }
  },
};

/** CL-R-36 — LED colour unspecified → white, bright white. */
export const CL_R_36: Rule = {
  id: 'CL-R-36', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.5', title: 'LED colour defaults to bright white',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.lit || el.ledColour) continue;
      ctx.set(ctx.pathOf(el, 'ledColour'), DEFAULT_LED, {
        message: `"${el.content}" LED colour defaulted to ${DEFAULT_LED}.`,
        elementId: el.id,
      });
    }
  },
};

/** CL-R-37 — rear-illuminated type rendered without a standoff gap. */
export const CL_R_37: Rule = {
  id: 'CL-R-37', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.5', title: 'Standoff gap on every rear-illuminated element',
  applies: (ctx) => TYPES[ctx.spec.type].rearIlluminated,
  run(ctx) {
    const min = ctx.thresholds.get('standoff.min');
    const max = ctx.thresholds.get('standoff.max');
    for (const el of ctx.spec.elements) {
      // A logo box on a halo sign needs the same gap: CL-R-24's reasoning —
      // light cannot escape a flush-mounted rear-illuminated element — does not
      // care whether the element is a letter or a cabinet cut to a silhouette.
      if ((el.construction !== 'CL-C-01' && el.construction !== 'CL-C-03') || !el.lit) continue;
      const gap = el.standoff ?? 0;
      if (gap >= min && gap <= max) continue;
      const value = gap === 0 ? min : Math.min(Math.max(gap, min), max);
      ctx.set(ctx.pathOf(el, 'standoff'), value, {
        message: `"${el.content}" is rear-illuminated — a ${formatRange(min, max)} standoff gap is drawn (${formatInches(value)}).`,
        elementId: el.id,
        thresholdKeys: ['standoff.min', 'standoff.max'],
        authority: Authority.BUILDABILITY,
      });
    }
  },
};

export const GATE4_ILLUMINATION_RULES: Rule[] = [CL_R_33, CL_R_34, CL_R_35, CL_R_36, CL_R_37];
