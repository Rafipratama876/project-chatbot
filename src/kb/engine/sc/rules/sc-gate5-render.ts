/**
 * SC GATE 5 — render contract inputs.
 *
 * The actual `RenderContract`/`SignSpec` (the shared three.js renderer's own
 * types) is built once the spec is finished, by `compileSCSpecToSignSpec` in
 * `src/kb/render/sc-compile.ts`. This gate only resolves the one thing that
 * decides the shape of that contract while the spec is still `SCSpec`: which
 * views are required.
 */
import type { SCRule } from '../sc-rule.js';
import { SC_GATES } from '../sc-gates.js';
import { SC_MOUNT_FACTS } from '../../../domain/sc-taxonomy.js';

export const SC_RC_01: SCRule = {
  id: 'SC-RC-01', gate: SC_GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'NOTE',
  kbRef: 'v1, mirrors CL-RC-01 / DL-RC-01', title: 'Select the required views',
  run(ctx) {
    const views: Array<'day' | 'night'> = ctx.spec.cabinet.lit ? ['day', 'night'] : ['day'];
    if (ctx.spec.views.join() !== views.join()) {
      ctx.set('views', views, {
        message: views.includes('night')
          ? 'Day and night views are required — the cabinet is illuminated.'
          : 'Day view only — this cabinet is not illuminated.',
      });
    }
  },
};

export const SC_RC_02: SCRule = {
  id: 'SC-RC-02', gate: SC_GATES.RENDER_CONTRACT, tier: 'VISUAL', severity: 'WARN',
  kbRef: 'v1, mirrors CL-RC-03 / DL-RC-02', title: 'Sign fits the measured area',
  applies: (ctx) => !!ctx.spec.site?.area,
  run(ctx) {
    const area = ctx.spec.site.area!;
    const { w, h } = ctx.spec.overall;
    if (w > area.w || h > area.h) {
      ctx.note(
        `Cabinet is ${w.toFixed(1)}″ × ${h.toFixed(1)}″ against a measured area of ${area.w}″ × ${area.h}″ — it does not fit.`,
        { path: 'overall' },
      );
    }
  },
};

export const SC_RC_03: SCRule = {
  id: 'SC-RC-03', gate: SC_GATES.RENDER_CONTRACT, tier: 'STANDING', severity: 'NOTE',
  kbRef: 'PDF §9/§10 (mounting)', title: 'Record the mounting method on the trace',
  run(ctx) {
    ctx.note(`${SC_MOUNT_FACTS[ctx.spec.mount].label}: ${SC_MOUNT_FACTS[ctx.spec.mount].description}`, { path: 'mount' });
  },
};

export const SC_GATE5_RULES: SCRule[] = [SC_RC_01, SC_RC_02, SC_RC_03];
