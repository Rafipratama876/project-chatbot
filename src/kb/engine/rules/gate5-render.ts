/**
 * GATE 5 — render contract.
 *
 * ⚠ The KB does not number these; §9.1 and §9.2 are prose. `CL-RC-##` are
 * engine-internal IDs, distinguishable from KB rule IDs on purpose.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { buildRenderContract, verifyContract } from '../../render/contract.js';
import { TYPES } from '../../domain/taxonomy.js';

/** CL-RC-01 · §9.1 required views. */
export const CL_RC_01: Rule = {
  id: 'CL-RC-01', gate: GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'NOTE',
  kbRef: '§9.1', title: 'Select the required views',
  run(ctx) {
    const contract = buildRenderContract(ctx.spec);
    if (ctx.spec.views.join() !== contract.views.join()) {
      ctx.set('views', contract.views, {
        message: contract.views.includes('night')
          ? 'Day and night views are required — at least one element is illuminated.'
          : 'Day view only — nothing on this sign is illuminated.',
      });
    }
  },
};

/**
 * CL-RC-02 · §9.2 visual truth.
 *
 * The contract is attached to the spec so the renderer consumes the same object
 * the engine produced. Day and night are two lighting environments over one
 * scene graph, so the letterforms, framing and raceway height cannot drift
 * between them the way two independent image samples would.
 */
export const CL_RC_02: Rule = {
  id: 'CL-RC-02', gate: GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'NOTE',
  kbRef: '§9.2', title: 'Build and verify the visual-truth contract',
  run(ctx) {
    const contract = buildRenderContract(ctx.spec);
    ctx.set('renderContract', contract, {
      message: `Render contract built for ${contract.elements.length} element(s), views: ${contract.views.join(' + ')}.`,
    });

    for (const violation of verifyContract(ctx.spec, contract)) {
      ctx.note(`§9.2 violation — ${violation.requirement}: ${violation.detail}`, {
        severity: 'WARN', elementId: violation.elementId, path: 'renderContract',
      });
    }
  },
};

/** CL-RC-03 · §9.2 "Sign sits inside the measured area and clears obstructions". */
export const CL_RC_03: Rule = {
  id: 'CL-RC-03', gate: GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'WARN',
  kbRef: '§9.2', title: 'Sign fits the measured area and clears obstructions',
  applies: (ctx) => !!ctx.spec.site?.area,
  run(ctx) {
    const area = ctx.spec.site.area!;
    const { w, h } = ctx.spec.overall;
    if (w > area.w || h > area.h) {
      ctx.note(`Sign is ${w.toFixed(1)}″ × ${h.toFixed(1)}″ against a measured area of ${area.w}″ × ${area.h}″ — it does not fit.`, { path: 'overall' });
    }
    for (const o of ctx.spec.site.obstructions ?? []) {
      const overlaps = !(o.x > w || o.x + o.w < 0 || o.y > h || o.y + o.h < 0);
      if (overlaps) {
        ctx.note(`Sign overlaps ${o.label} at ${o.x}″, ${o.y}″ — §9.2 requires it to clear windows, doors, awnings, mullions, downspouts and expansion joints.`, { path: 'overall' });
      }
    }
  },
};

/** CL-RC-04 · Layer 0 scope check, once constructions are known. */
export const CL_RC_04: Rule = {
  id: 'CL-RC-04', gate: GATES.RENDER_CONTRACT, tier: 'SPEC', severity: 'WARN',
  kbRef: 'Layer 0', title: 'Agent scope',
  run(ctx) {
    const hasChannelLetters = ctx.spec.elements.some((e) => e.construction === 'CL-C-01');
    if (!hasChannelLetters && ctx.spec.elements.length > 0) {
      const allFlat = ctx.spec.elements.every((e) => e.construction === 'CL-C-04' || e.construction === 'CL-C-05');
      if (allFlat) {
        ctx.escalate(
          'No channel letters remain after composition — the whole sign is flat cut letters.',
          'Layer 0: hand this off to the Dimensional Letters agent?',
        );
      }
    }
    if (TYPES[ctx.spec.type].status === 'Rare') {
      ctx.note(`${TYPES[ctx.spec.type].name} is a rare specialty type — confirm the shop will build it before the proof goes out.`, { path: 'type' });
    }
  },
};

export const GATE5_RULES: Rule[] = [CL_RC_01, CL_RC_02, CL_RC_03, CL_RC_04];
