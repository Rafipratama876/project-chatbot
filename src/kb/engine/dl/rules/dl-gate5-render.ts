/**
 * DL GATE 5 — render contract inputs.
 *
 * The actual `RenderContract` object (the shared TypeScript interface from
 * `src/kb/render/contract.ts`) is built once the spec is finished, by
 * `compileDLSpecToSignSpec` in `src/kb/render/dl-compile.ts` — that is also
 * where a DL element becomes a `SignSpec`/`SignElement` for the shared
 * three.js renderer. This gate only resolves the two things that decide the
 * shape of that contract (required views, and whether the sign fits the
 * measured site) while the spec is still `DLSpec`.
 */
import type { DLRule } from '../dl-rule.js';
import { DL_GATES } from '../dl-gates.js';
import { anyDLLit } from '../../../domain/dl-spec.js';
import { DL_MOUNT_FACTS } from '../../../domain/dl-taxonomy.js';

export const DL_RC_01: DLRule = {
  id: 'DL-RC-01', gate: DL_GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'NOTE',
  kbRef: 'v1, mirrors CL-RC-01', title: 'Select the required views',
  run(ctx) {
    const views: Array<'day' | 'night'> = anyDLLit(ctx.spec) ? ['day', 'night'] : ['day'];
    if (ctx.spec.views.join() !== views.join()) {
      ctx.set('views', views, {
        message: views.includes('night')
          ? 'Day and night views are required — the sign is illuminated.'
          : 'Day view only — nothing on this sign is illuminated.',
      });
    }
  },
};

export const DL_RC_02: DLRule = {
  id: 'DL-RC-02', gate: DL_GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'WARN',
  kbRef: 'v1, mirrors CL-RC-03', title: 'Sign fits the measured area',
  applies: (ctx) => !!ctx.spec.site?.area,
  run(ctx) {
    const area = ctx.spec.site.area!;
    const { w, h } = ctx.spec.overall;
    if (w > area.w || h > area.h) {
      ctx.note(
        `Sign is ${w.toFixed(1)}″ × ${h.toFixed(1)}″ against a measured area of ${area.w}″ × ${area.h}″ — it does not fit.`,
        { path: 'overall' },
      );
    }
  },
};

export const DL_RC_03: DLRule = {
  id: 'DL-RC-03', gate: DL_GATES.RENDER_CONTRACT, tier: 'STANDING', severity: 'NOTE',
  kbRef: 'PDF p.6 (printed installation template)', title: 'Record the mounting-template requirement',
  run(ctx) {
    ctx.note(
      `${DL_MOUNT_FACTS[ctx.spec.mount].label}: a printed installation template is required so stud/pad locations match the pattern exactly.`,
      { path: 'mount' },
    );
  },
};

export const DL_GATE5_RULES: DLRule[] = [DL_RC_01, DL_RC_02, DL_RC_03];
