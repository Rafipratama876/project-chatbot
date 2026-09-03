/**
 * KB §6.0 — Composition. Runs in Gate 2, before everything else.
 * CL-R-48 … CL-R-56.
 */
import type { Rule, RuleContext } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import type { SignElement } from '../../domain/spec.js';
import { isBoxConstruction, bboxOf } from '../../domain/spec.js';
import {
  TYPES, CONSTRUCTION_FACTS, OFFSET_ELIGIBLE_ROLES, isContourBacker,
} from '../../domain/taxonomy.js';
import { groupIntoElements, assignRoles } from '../../geometry/grouping.js';
import { measureStroke } from '../../geometry/metrics.js';
import { decideConstruction, minStrokeFor } from '../../geometry/decisionTree.js';
import { offsetToStroke, STROKE_TOLERANCE } from '../../geometry/offset.js';
import { sizeBox, boxUndersized } from '../../geometry/boxSizing.js';
import { isPanBacker, BACKER_PAN_MIN_DEPTH, BACKER_FLAT_THICKNESS } from '../../domain/materials.js';
import { formatInches } from '../../domain/units.js';

/** CL-R-48 — group per-item dimensions into elements (§3.2). */
export const CL_R_48: Rule = {
  id: 'CL-R-48',
  gate: GATES.COMPOSITION,
  tier: 'SPEC',
  severity: 'AUTOFIX',
  kbRef: '§6.0 / §3.2',
  title: 'Group artwork items into elements',
  applies: (ctx) => ctx.spec.artwork.length > 0 && ctx.spec.elements.length === 0,
  run(ctx) {
    const th = ctx.thresholds;
    const typeFacts = TYPES[ctx.spec.type];
    const form = ctx.spec.form;
    const protos = groupIntoElements(ctx.spec.artwork, th);

    const elements: SignElement[] = protos.map((p) => {
      // The narrowest stroke of a merged element is measured on the merged
      // outline, not taken as the min of its items — adjacent glyphs can form
      // a thinner junction than either had alone.
      const merged = p.contours.length ? measureStroke(p.contours).narrowest : p.narrowestStroke;
      const stroke = Math.min(
        merged > 0 ? merged : Number.POSITIVE_INFINITY,
        p.narrowestStroke > 0 ? p.narrowestStroke : Number.POSITIVE_INFINITY,
      );
      return {
        id: p.id,
        role: p.role ?? 'CL-E-01',
        content: p.content,
        itemIds: p.items.map((i) => i.id),
        construction: 'CL-C-01',
        bbox: p.bbox,
        baselineY: p.baselineY,
        capHeight: p.capHeight,
        narrowestStroke: Number.isFinite(stroke) ? stroke : 0,
        contours: p.contours,
        fontStyle: p.fontStyle,
        colourBreaks: p.colourBreaks,
        // Seed ONLY what the customer actually supplied. §8.1 requires every
        // empty field to be defaulted *and logged* in Gate 3; filling them in
        // here would apply the same values silently and §9.4 could not report
        // them as defaults.
        returnDepth: form.returnDepth,
        returnColour: form.returnColour,
        face: { material: form.faceMaterial as never, colour: form.faceColour },
        trimCap: {
          kind: typeFacts.trimCap ? 'trim-cap' : 'none',
          colour: form.trimCapColour,
          width: form.trimCapWidth,
        },
        back: typeFacts.back,
        lit: typeFacts.illumination !== 'none',
      };
    });

    ctx.set('elements', elements, {
      message: `Grouped ${ctx.spec.artwork.length} item(s) into ${elements.length} element(s) per §3.2.`,
      thresholdKeys: ['grouping.cap_height_tolerance'],
    });

    for (const el of elements) {
      if (el.colourBreaks && el.colourBreaks.length > 1) {
        ctx.note(`"${el.content}" keeps one element with a colour break noted: ${el.colourBreaks.join(' / ')}.`, {
          severity: 'NOTE', elementId: el.id, path: `elements[${elements.indexOf(el)}].colourBreaks`,
        });
      }
    }

    const overall = bboxOf(elements);
    ctx.set('overall', { w: overall.w, h: overall.h }, {
      message: `Overall size ${overall.w.toFixed(1)}″ × ${overall.h.toFixed(1)}″.`,
      severity: 'NOTE',
    });
  },
};

/** CL-R-49 — role assignment (§3.1). */
export const CL_R_49: Rule = {
  id: 'CL-R-49',
  gate: GATES.COMPOSITION,
  tier: 'SPEC',
  severity: 'AUTOFIX',
  kbRef: '§6.0 / §3.1',
  title: 'Assign an element role',
  run(ctx) {
    const protos = assignRoles(
      ctx.spec.elements.map((e) => ({
        id: e.id, items: [], content: e.content, bbox: e.bbox, baselineY: e.baselineY,
        capHeight: e.capHeight, narrowestStroke: e.narrowestStroke, contours: e.contours,
        typographic: !!e.itemIds.length && ctx.spec.artwork
          .filter((a) => e.itemIds.includes(a.id))
          .every((a) => a.kind === 'glyph'),
        fontStyle: e.fontStyle, colourBreaks: e.colourBreaks ?? [],
      })),
      ctx.thresholds,
    );

    protos.forEach((p, i) => {
      const el = ctx.spec.elements[i]!;
      if (el.role !== p.role) {
        ctx.set(ctx.pathOf(el, 'role'), p.role, {
          message: `"${el.content}" assigned role ${p.role}.`,
          elementId: el.id,
          thresholdKeys: ['role.tagline.min_ratio', 'role.tagline.max_ratio', 'role.secondary.min_ratio'],
        });
      }
    });
  },
};

/**
 * CL-R-50 … CL-R-54 — the §3.5 decision tree.
 *
 * One pass, five possible attributions. Running these as five independent rule
 * objects would mean five re-derivations of H and S and a silent dependency on
 * their conditions staying mutually exclusive; the tree is a tree, so it runs
 * as one and reports which branch fired.
 */
export const CL_R_50_54: Rule = {
  id: 'CL-R-50',
  gate: GATES.COMPOSITION,
  tier: 'VISUAL',
  severity: 'AUTOFIX',
  kbRef: '§6.0 / §3.5',
  title: 'Assign a construction (decision tree)',
  async run(ctx) {
    const metalReturns = /stainless|brushed|polished|metal|aluminium|aluminum|bronze|gold|silver|chrome/i;
    const primary = ctx.spec.elements.find((e) => e.role === 'CL-E-01');
    const P = primary?.capHeight ?? 0;

    for (const el of [...ctx.spec.elements]) {
      const typographic = ctx.spec.artwork
        .filter((a) => el.itemIds.includes(a.id))
        .every((a) => a.kind === 'glyph') && el.itemIds.length > 0;

      let logoComplex: boolean | undefined;
      if (!typographic) {
        const judged = await ctx.services.logoComplexity?.(el);
        const min = ctx.services.minConfidence ?? 0.75;
        if (judged && judged.confidence >= min) {
          logoComplex = judged.complex;
          ctx.note(
            `Logo mark "${el.content}" assessed as ${judged.complex ? 'too detailed for separate cans' : 'buildable as an individual channel shape'} (confidence ${judged.confidence.toFixed(2)}): ${judged.reason}`,
            { ruleId: 'CL-R-54', severity: 'NOTE', elementId: el.id, path: ctx.pathOf(el, 'construction') },
          );
        } else if (judged) {
          ctx.escalate(
            `Logo-mark assessment for "${el.content}" returned confidence ${judged.confidence.toFixed(2)}, below the ${min} threshold.`,
            'Does the mark have fine detail, enclosed counters or colour breaks that cannot be separate cans?',
            'CL-R-54',
          );
        }
      }

      // §3.5 tests the stroke a primary/secondary letterform can REACH, since
      // §6.1's Offset Path is allowed to change it. Trial-offset here, and let
      // CL-R-01/02/03 in Gate 4 perform the real one. Taglines are never
      // trial-offset: §3.5 forbids thickening them.
      const offsetEligible = typographic && OFFSET_ELIGIBLE_ROLES.includes(el.role);
      let strokeAfterOffset = el.narrowestStroke;
      if (offsetEligible && el.contours.length > 0) {
        const minS = minStrokeFor(ctx.spec.type, ctx.thresholds);
        if (el.narrowestStroke < minS.value - STROKE_TOLERANCE) {
          strokeAfterOffset = offsetToStroke(el.contours, minS.value).strokeAfter;
        }
      }

      const outcome = decideConstruction(
        {
          typographic,
          offsetEligible,
          strokeAfterOffset,
          capHeight: el.capHeight,
          narrowestStroke: el.narrowestStroke,
          primaryCapHeight: P,
          signType: ctx.spec.type,
          metalFinishedReturns: metalReturns.test(el.returnColour ?? ''),
          logoComplex,
        },
        ctx.thresholds,
        el.fontStyle,
      );

      if (outcome.escalate) {
        ctx.escalate(outcome.escalate.reason, outcome.escalate.question, outcome.ruleId);
      }

      if (outcome.construction !== el.construction) {
        ctx.set(ctx.pathOf(el, 'construction'), outcome.construction, {
          ruleId: outcome.ruleId,
          critical: outcome.critical,
          // §8.2 level 1: a letterform below the minimum is not buildable, and
          // buildability outranks a customer instruction to the contrary.
          authority: outcome.critical ? Authority.BUILDABILITY : Authority.HOUSE,
          message: `"${el.content}" → ${outcome.construction} (${CONSTRUCTION_FACTS[outcome.construction].label}): ${outcome.reason}`,
          elementId: el.id,
          thresholdKeys: outcome.thresholdKeys,
        });
      }

      // A logo box carries no copy, so §3.4 does not apply to it.
      if (outcome.copyTreatment && outcome.construction !== 'CL-C-03') {
        ctx.set(ctx.pathOf(el, 'copyTreatment'), outcome.copyTreatment, {
          ruleId: outcome.ruleId,
          message: `"${el.content}" copy treatment → ${outcome.copyTreatment} (reversed out; §3.4 default).`,
          elementId: el.id,
        });
      }

      // Lighting follows construction, not the form value (§1.2 note).
      const lights = CONSTRUCTION_FACTS[outcome.construction].lights;
      const lit = lights === 'per-type' ? TYPES[ctx.spec.type].illumination !== 'none' : lights;
      if (lit !== el.lit) {
        ctx.set(ctx.pathOf(el, 'lit'), lit, {
          ruleId: outcome.ruleId,
          message: `"${el.content}" is ${lit ? 'illuminated' : 'not illuminated'} as a ${CONSTRUCTION_FACTS[outcome.construction].label}.`,
          elementId: el.id,
          severity: 'NOTE',
        });
      }
    }
  },
};

/** CL-R-55 — box sizing (§3.6). `[DER]` */
export const CL_R_55: Rule = {
  id: 'CL-R-55',
  gate: GATES.COMPOSITION,
  tier: 'SPEC',
  severity: 'AUTOFIX',
  kbRef: '§6.0 / §3.6',
  title: 'Size pill and logo boxes',
  run(ctx) {
    const letterDepth = ctx.spec.elements.find((e) => e.construction === 'CL-C-01')?.returnDepth
      ?? TYPES[ctx.spec.type].standardDepth;
    const primaryFace = ctx.spec.elements.find((e) => e.role === 'CL-E-01')?.face.colour ?? 'per logo';
    // Box colours follow the letters (CL-D-29 / §3.6); Gate 3 fills the rest.

    for (const el of ctx.spec.elements) {
      if (!isBoxConstruction(el.construction)) continue;
      if (el.box && !boxUndersized(el.box, el.capHeight, ctx.thresholds)) continue;

      const sized = sizeBox({
        copyCapHeight: el.capHeight,
        copyBBox: el.bbox,
        letterReturnDepth: letterDepth,
        // §8.1 CL-D-28: capsule for a single line of copy.
        shape: el.construction === 'CL-C-03' ? 'contour'
          : el.content.includes('\n') ? 'rounded-rectangle' : 'capsule',
        faceColour: el.face.colour ?? primaryFace,
        returnColour: el.returnColour ?? 'Black',
      }, ctx.thresholds);

      ctx.set(ctx.pathOf(el, 'box'), sized.box, {
        message: `"${el.content}" box sized to ${sized.box.w.toFixed(1)}″ × ${sized.box.h.toFixed(1)}″ — ${sized.minimumGoverned ? 'the 4″ minimum governs' : 'copy cap height + 2″'}.`,
        elementId: el.id,
        thresholdKeys: sized.thresholdKeys,
      });
    }
  },
};

/** CL-R-56 — box depth matches the letter return depth. */
export const CL_R_56: Rule = {
  id: 'CL-R-56',
  gate: GATES.COMPOSITION,
  tier: 'VISUAL',
  severity: 'AUTOFIX',
  kbRef: '§6.0 / §9.2',
  title: 'Box depth matches the letter return depth',
  run(ctx) {
    const letter = ctx.spec.elements.find((e) => e.construction === 'CL-C-01');
    if (!letter) return;

    const letterDepth = letter.returnDepth ?? TYPES[ctx.spec.type].standardDepth;
    for (const el of ctx.spec.elements) {
      if (!el.box || el.box.depth === letterDepth) continue;
      ctx.set(ctx.pathOf(el, 'box.depth'), letterDepth, {
        message: `"${el.content}" box depth set to ${letterDepth}″ so the box faces sit in the same plane as the letter faces.`,
        elementId: el.id,
      });
      ctx.set(ctx.pathOf(el, 'returnDepth'), letterDepth, {
        message: `"${el.content}" return depth follows the box depth.`,
        elementId: el.id,
        severity: 'NOTE',
      });
    }
  },
};

/**
 * Size the backer to the sign it sits behind.
 *
 * ⚠ Engine-internal, not a KB rule ID. §4.5 gives materials, shapes and a
 * minimum depth but no sizing formula, so the margin below is a house choice
 * and should be confirmed.
 */
export const CL_BK_01: Rule = {
  id: 'CL-BK-01',
  gate: GATES.COMPOSITION,
  tier: 'SPEC',
  severity: 'AUTOFIX',
  kbRef: '§4.5',
  title: 'Size the backer panel to the sign',
  applies: (ctx) => ctx.spec.backer.present && ctx.spec.elements.length > 0,
  run(ctx) {
    const { w, h } = ctx.spec.overall;
    // A contour backer is cut to the copy, so it needs only a reveal; a
    // straight one is a rectangle behind everything and reads better with more.
    //
    // Scaled to the copy, and tight. The reveal is read against the letter
    // HEIGHT, not the width: on a wordmark 37″ × 11.5″ a 6″ margin adds a sixth
    // to the width but half again to the height, and the panel stops being a
    // pan behind a sign and becomes a billboard with a sign in the middle of
    // it. The reference photographs of a straight aluminium pan show the copy
    // very nearly filling the panel. Clamped so it never collapses to a rim —
    // a pan still needs an edge to fold and fix through.
    // Two margins, not one. The eye judges a pan by how much air sits above and
    // below the copy, so the vertical reveal is the tighter of the two: equal
    // margins on a wordmark four times wider than it is tall read as a deep
    // band with small letters in it.
    const cap = Math.max(...ctx.spec.elements.map((e) => e.capHeight), 0);
    const contour = isContourBacker(ctx.spec.backer.shape);
    const marginX = contour ? 2 : Math.min(3, Math.max(0.75, cap * 0.08));
    const marginY = contour ? 2 : Math.min(2, Math.max(0.5, cap * 0.05));

    if (ctx.spec.backer.w !== w + marginX * 2) {
      ctx.set('backer.w', w + marginX * 2, {
        message: `Backer sized to ${(w + marginX * 2).toFixed(1)}″ wide — the sign plus a ${marginX.toFixed(1)}″ reveal.`,
      });
    }
    if (ctx.spec.backer.h !== h + marginY * 2) {
      ctx.set('backer.h', h + marginY * 2, {
        message: `Backer sized to ${(h + marginY * 2).toFixed(1)}″ tall — a ${marginY.toFixed(1)}″ reveal above and below the copy.`,
        severity: 'NOTE',
      });
    }

    // §4.5 lists the pans beside the flat panels as separate products, and the
    // returns are the difference. Left at zero the pan renders as a plate: no
    // edge, no shadow under it, nothing the letters stand proud of — the proof
    // then shows a flat backer where a pan was quoted.
    if (ctx.spec.backer.depth <= 0) {
      const isPan = isPanBacker(ctx.spec.backer.shape);
      const depth = isPan ? BACKER_PAN_MIN_DEPTH : BACKER_FLAT_THICKNESS;
      ctx.set('backer.depth', depth, {
        message: isPan
          ? `${ctx.spec.backer.shape.replace(/-/g, ' ')} formed with ${formatInches(depth)} returns.`
          : `Backer panel ${formatInches(depth)} thick.`,
        severity: 'NOTE',
      });
    }
  },
};

export const GATE2_RULES: Rule[] = [CL_R_48, CL_R_49, CL_R_50_54, CL_R_55, CL_R_56, CL_BK_01];
