/**
 * KB §6.7 — Artwork. Gate 4. CL-R-43 … CL-R-47.
 * CL-R-46 is the only blocking rule in the entire KB.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import { bubbleSilhouette, dropTinyHoles, offsetToStroke, STROKE_TOLERANCE } from '../../geometry/offset.js';
import { minStrokeFor, minHeightFor } from '../../geometry/decisionTree.js';
import { bounds } from '../../geometry/poly.js';
import { formatInches } from '../../domain/units.js';

/** CL-R-43 — distressed, organic, hand-drawn or heavily textured letterform. */
export const CL_R_43: Rule = {
  id: 'CL-R-43', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.7', title: 'Distressed or hand-drawn letterform',
  run(ctx) {
    const min = minStrokeFor(ctx.spec.type, ctx.thresholds);
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      if (el.fontStyle !== 'distressed') continue;

      const bubble = bubbleSilhouette(el.contours, min.value * 0.75);
      if (!el.originalContours) {
        ctx.set(ctx.pathOf(el, 'originalContours'), el.contours, {
          message: `Original artwork of "${el.content}" retained for face vinyl.`, severity: 'NOTE', elementId: el.id,
        });
      }
      ctx.set(ctx.pathOf(el, 'contours'), bubble, {
        message: `"${el.content}" is a distressed letterform. A simplified "bubble" can is built per letter and the original artwork is specified as face vinyl.`,
        elementId: el.id, authority: Authority.BUILDABILITY, thresholdKeys: [min.key],
      });
      ctx.set(ctx.pathOf(el, 'face.vinylApplication'), true, {
        message: `"${el.content}" original artwork applied as face vinyl.`, severity: 'NOTE', elementId: el.id,
      });
      ctx.set(ctx.pathOf(el, 'bbox'), bounds(bubble), {
        message: `"${el.content}" bounding box follows the simplified can.`, severity: 'NOTE', elementId: el.id,
        authority: Authority.BUILDABILITY,
      });
    }
  },
};

/** CL-R-44 — face texture or photographic effect → vinyl, keep the can simple. */
export const CL_R_44: Rule = {
  id: 'CL-R-44', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.7', title: 'Face texture becomes a vinyl application',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.face.printed && !/texture|photo|gradient|image/i.test(el.face.colour ?? '')) continue;
      if (el.face.vinylApplication) continue;
      ctx.set(ctx.pathOf(el, 'face.vinylApplication'), true, {
        message: `"${el.content}" carries a face texture or photographic effect — converted to a vinyl application; the can shape stays simple.`,
        elementId: el.id,
      });
    }
  },
};

/** CL-R-45 — remove unnecessary tiny counters or holes at extreme sizes. */
export const CL_R_45: Rule = {
  id: 'CL-R-45', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.7', title: 'Remove unnecessary tiny counters',
  run(ctx) {
    const min = minStrokeFor(ctx.spec.type, ctx.thresholds);
    // A counter smaller than the minimum stroke squared cannot be fabricated
    // as an opening — it is a hole the router cannot leave standing.
    const minHoleArea = min.value * min.value;
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      const { contours, dropped } = dropTinyHoles(el.contours, minHoleArea);
      if (dropped === 0) continue;
      ctx.set(ctx.pathOf(el, 'contours'), contours, {
        message: `"${el.content}": ${dropped} counter(s) smaller than ${minHoleArea.toFixed(2)} sq in removed — too small to leave open at this size.`,
        elementId: el.id, thresholdKeys: [min.key], authority: Authority.BUILDABILITY,
      });
    }
  },
};

/**
 * CL-R-46 — BLOCK. Letterform still unbuildable after every autofix and every
 * construction alternative. The only blocking rule in the KB.
 */
export const CL_R_46: Rule = {
  id: 'CL-R-46', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'BLOCK',
  kbRef: '§6.7', title: 'Unbuildable after every autofix',
  run(ctx) {
    const minS = minStrokeFor(ctx.spec.type, ctx.thresholds);

    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;

      const minH = minHeightFor(ctx.spec.type, el.fontStyle, ctx.thresholds);
      const strokeFails = el.narrowestStroke < minS.value - STROKE_TOLERANCE;
      if (!strokeFails) continue;

      // Last check: can any further offset reach the minimum at all?
      const attempt = offsetToStroke(el.contours, minS.value, { maxIterations: 10 });
      if (attempt.converged) continue;

      // Would a construction alternative have taken it? If cap height clears
      // the dimensional minimum, Gate 2 would already have moved it to a box or
      // flat cut, so reaching here means every alternative was exhausted.
      ctx.note(
        `"${el.content}" cannot be built: narrowest stroke ${formatInches(el.narrowestStroke)} against a ${formatInches(minS.value)} minimum, and the outline closes on itself before it reaches that. Cap height ${formatInches(el.capHeight)} (minimum ${formatInches(minH.value)}).`,
        { elementId: el.id, path: ctx.pathOf(el, 'contours'), severity: 'BLOCK', thresholdKeys: [minS.key, minH.key] },
      );
      ctx.escalate(
        `"${el.content}" is unbuildable after every autofix and every construction alternative (CL-R-46).`,
        'Simplify the artwork, raise the copy height, or route this to a human for a specialty fabrication quote.',
      );
      ctx.set('blocked', true, {
        message: 'Job blocked by CL-R-46.', severity: 'BLOCK', authority: Authority.BUILDABILITY,
      });
    }
  },
};

/**
 * CL-R-47 — every autofix that changed the customer's artwork or configuration
 * must appear on the proof in plain language.
 *
 * This rule does not change the spec. It asserts a property of the output, so
 * it records what §9.4 must cover and the output layer fails if it does not.
 */
export const CL_R_47: Rule = {
  id: 'CL-R-47', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.7', title: 'Every autofix must be disclosed',
  run(ctx) {
    const autofixes = ctx.trace.bySeverity('AUTOFIX');
    const criticals = ctx.trace.criticals();
    if (autofixes.length === 0 && criticals.length === 0) return;
    ctx.note(
      `${autofixes.length} autofix(es) and ${criticals.length} critical substitution(s) must appear on the proof in plain language.`,
      {
        path: '',
        value: {
          autofixRules: [...new Set(autofixes.map((a) => a.ruleId))],
          criticalRules: [...new Set(criticals.map((a) => a.ruleId))],
        },
      },
    );
  },
};

export const GATE4_ARTWORK_RULES: Rule[] = [CL_R_43, CL_R_44, CL_R_45, CL_R_46, CL_R_47];
