/**
 * KB §6.1 — Stroke and height. Gate 4, CL-C-01 elements only.
 * CL-R-01 … CL-R-08.
 *
 * §3.5 is explicit: "Do not thicken a tagline. The Offset Path autofixes in
 * §6.1 apply to CL-E-01 and CL-E-02 only." An element that failed the minimums
 * has already been re-assigned a construction in Gate 2, so by the time these
 * run, anything still on CL-C-01 is a letter set that is meant to be one.
 */
import type { Rule, RuleContext } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import type { SignElement } from '../../domain/spec.js';
import { OFFSET_ELIGIBLE_ROLES, TYPES } from '../../domain/taxonomy.js';
import { offsetToStroke, STROKE_TOLERANCE } from '../../geometry/offset.js';
import { inspectCounters, hasCounterLetter } from '../../geometry/counters.js';
import { measureStroke } from '../../geometry/metrics.js';
import { minStrokeFor, minHeightFor } from '../../geometry/decisionTree.js';
import { bounds } from '../../geometry/poly.js';
import { formatInches } from '../../domain/units.js';

const channelLetterElements = (ctx: RuleContext): SignElement[] =>
  ctx.spec.elements.filter((e) => e.construction === 'CL-C-01');

const offsetEligible = (el: SignElement): boolean =>
  el.construction === 'CL-C-01' && OFFSET_ELIGIBLE_ROLES.includes(el.role);

/**
 * CL-R-01 / CL-R-02 / CL-R-03 — Offset Path to the governing minimum.
 * One rule object: the three differ only in which threshold they read, and the
 * minimum is already selected by type in `minStrokeFor`. The trace is attributed
 * to whichever of the three actually governs.
 */
export const CL_R_01_03: Rule = {
  id: 'CL-R-01',
  gate: GATES.VALIDATION,
  tier: 'VISUAL',
  severity: 'AUTOFIX',
  kbRef: '§6.1',
  title: 'Offset Path to the minimum stroke',
  run(ctx) {
    const t = TYPES[ctx.spec.type];
    const min = minStrokeFor(ctx.spec.type, ctx.thresholds);
    const ruleId = t.illumination === 'none' ? 'CL-R-03'
      : t.illumination === 'front+halo' ? 'CL-R-02'
      : 'CL-R-01';

    for (const el of channelLetterElements(ctx)) {
      if (el.narrowestStroke >= min.value - STROKE_TOLERANCE) continue;

      if (!offsetEligible(el)) {
        // §3.5: never thicken a tagline. Gate 2 should already have moved it;
        // if it is still here the construction assignment is inconsistent.
        ctx.note(
          `"${el.content}" is below the ${formatInches(min.value)} minimum stroke but its role (${el.role}) is not offset-eligible — §3.5 forbids thickening it.`,
          { ruleId, severity: 'WARN', elementId: el.id, path: ctx.pathOf(el, 'narrowestStroke') },
        );
        continue;
      }

      const result = offsetToStroke(el.contours, min.value);
      const path = ctx.pathOf(el);

      if (!el.originalContours) {
        ctx.set(`${path}.originalContours`, el.contours, {
          ruleId, message: `Original outline of "${el.content}" retained.`,
          severity: 'NOTE', elementId: el.id,
        });
      }

      ctx.set(`${path}.contours`, result.contours, {
        ruleId,
        // Buildability: a stem thinner than the minimum cannot be fabricated.
        authority: Authority.BUILDABILITY,
        message: `"${el.content}" Offset Path applied: narrowest stroke ${formatInches(result.strokeBefore)} → ${formatInches(result.strokeAfter)} (target ${formatInches(min.value)}, ${formatInches(result.delta)} per side).`,
        elementId: el.id,
        thresholdKeys: [min.key],
      });

      ctx.set(`${path}.narrowestStroke`, result.strokeAfter, {
        ruleId, message: `"${el.content}" narrowest stroke now ${formatInches(result.strokeAfter)}.`,
        severity: 'NOTE', elementId: el.id, authority: Authority.BUILDABILITY,
      });

      const b = bounds(result.contours);
      ctx.set(`${path}.bbox`, b, {
        ruleId, message: `"${el.content}" bounding box follows the offset outline.`,
        severity: 'NOTE', elementId: el.id, authority: Authority.BUILDABILITY,
      });

      if (!result.converged) {
        ctx.note(
          `"${el.content}" could not reach the ${formatInches(min.value)} minimum by offsetting — the letterform closes on itself first.`,
          { ruleId, severity: 'WARN', elementId: el.id, path: `${path}.contours` },
        );
      }

      // CL-R-05, evaluated from the measured result rather than asserted.
      if (hasCounterLetter(el.content)) {
        const insp = inspectCounters(el.content, result);
        ctx.note(insp.summary, {
          ruleId: 'CL-R-05',
          kbRef: '§6.1',
          severity: insp.closed ? 'WARN' : 'NOTE',
          elementId: el.id,
          path: `${path}.contours`,
          value: { holesBefore: result.holesBefore, holesAfter: result.holesAfter, areaRetained: insp.areaRetained },
        });
      }
    }
  },
};

/**
 * CL-R-04 — small elements below the governing minimum: tittles, commas,
 * apostrophes, periods, serifs, thin terminals, thin crossbars.
 * "Most common failure in the source material."
 */
export const CL_R_04: Rule = {
  id: 'CL-R-04',
  gate: GATES.VALIDATION,
  tier: 'VISUAL',
  severity: 'AUTOFIX',
  kbRef: '§6.1',
  title: 'Thicken small details to the minimum',
  run(ctx) {
    const min = minStrokeFor(ctx.spec.type, ctx.thresholds);

    for (const el of channelLetterElements(ctx)) {
      if (!offsetEligible(el)) continue;
      const m = measureStroke(el.contours, min.value);
      if (m.thinPoints.length === 0) continue;

      // The offset in CL-R-01..03 already thickened the whole outline; anything
      // still thin is a detail that did not respond to it.
      const worst = m.thinPoints[0]!;
      if (worst.width >= min.value - STROKE_TOLERANCE) continue;

      const retry = offsetToStroke(el.contours, min.value, { maxIterations: 8 });
      const path = ctx.pathOf(el);

      if (retry.converged) {
        ctx.set(`${path}.contours`, retry.contours, {
          message: `"${el.content}" small details (${m.thinPoints.length} point(s) under ${formatInches(min.value)}, thinnest ${formatInches(worst.width)}) thickened to the minimum.`,
          elementId: el.id, thresholdKeys: [min.key], authority: Authority.BUILDABILITY,
        });
        ctx.set(`${path}.narrowestStroke`, retry.strokeAfter, {
          message: `"${el.content}" narrowest stroke now ${formatInches(retry.strokeAfter)}.`,
          severity: 'NOTE', elementId: el.id, authority: Authority.BUILDABILITY,
        });
      } else {
        ctx.escalate(
          `"${el.content}" has ${m.thinPoints.length} detail(s) below the ${formatInches(min.value)} minimum (thinnest ${formatInches(worst.width)}) that distort when thickened.`,
          'Simplify the mark, drop the detail, or accept a specialty fabrication quote?',
        );
      }
    }
  },
};

/** CL-R-06 — script or cursive letterform. WARN. */
export const CL_R_06: Rule = {
  id: 'CL-R-06',
  gate: GATES.VALIDATION,
  tier: 'VISUAL',
  severity: 'WARN',
  kbRef: '§6.1',
  title: 'Offset Path on script renders it illegible',
  run(ctx) {
    for (const el of channelLetterElements(ctx)) {
      if (el.fontStyle !== 'script') continue;
      if (!el.originalContours) continue; // no offset was applied
      ctx.note(
        `"${el.content}" is a script letterform and has been offset — script often loses legibility this way. A simplified alternative should be proposed.`,
        { elementId: el.id, path: ctx.pathOf(el, 'contours') },
      );
      ctx.set(ctx.pathOf(el, 'suggestions'), [
        ...(el.suggestions ?? []),
        'Simplified non-script alternative for the primary copy',
      ], { message: 'Simplified alternative proposed.', severity: 'NOTE', elementId: el.id });
    }
  },
};

/** CL-R-07 — illuminated, cap height below the minimum. WARN. */
export const CL_R_07: Rule = {
  id: 'CL-R-07',
  gate: GATES.VALIDATION,
  tier: 'SPEC',
  severity: 'WARN',
  kbRef: '§6.1',
  title: 'Illuminated cap height below the minimum',
  applies: (ctx) => TYPES[ctx.spec.type].illumination !== 'none',
  run(ctx) {
    for (const el of channelLetterElements(ctx)) {
      const min = minHeightFor(ctx.spec.type, el.fontStyle, ctx.thresholds);
      if (el.capHeight >= min.value) continue;
      ctx.note(
        `"${el.content}" is ${formatInches(el.capHeight)} tall against a ${formatInches(min.value)} minimum for illuminated${el.fontStyle === 'serif' || el.fontStyle === 'script' ? ' serif/script' : ''} channel letters — specialty fabrication is needed.`,
        { elementId: el.id, path: ctx.pathOf(el, 'capHeight'), thresholdKeys: [min.key] },
      );
    }
  },
};

/** CL-R-08 — non-illuminated, cap height under 3″. WARN. */
export const CL_R_08: Rule = {
  id: 'CL-R-08',
  gate: GATES.VALIDATION,
  tier: 'SPEC',
  severity: 'WARN',
  kbRef: '§6.1',
  title: 'Non-illuminated cap height below the minimum',
  applies: (ctx) => TYPES[ctx.spec.type].illumination === 'none',
  run(ctx) {
    const min = ctx.thresholds.get('height.min.non_illuminated');
    for (const el of channelLetterElements(ctx)) {
      if (el.capHeight >= min) continue;
      ctx.note(
        `"${el.content}" is ${formatInches(el.capHeight)} tall against a ${formatInches(min)} minimum for non-illuminated channel letters.`,
        { elementId: el.id, path: ctx.pathOf(el, 'capHeight'), thresholdKeys: ['height.min.non_illuminated'] },
      );
    }
  },
};

export const GATE4_STROKE_RULES: Rule[] = [CL_R_01_03, CL_R_04, CL_R_06, CL_R_07, CL_R_08];
