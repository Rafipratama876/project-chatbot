/**
 * KB §6.4 — Mounting. Gate 4. CL-R-24 … CL-R-32.
 * CL-R-24, -25, -26 are the ⚠ critical substitutions; each gets its own callout.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import { TYPES, MOUNTS } from '../../domain/taxonomy.js';
import { RACEWAY_STANDARD, WIREWAY_STANDARD } from '../../domain/materials.js';
import { formatInches } from '../../domain/units.js';
import { sqFt, depthOf } from '../../domain/spec.js';

const rearLit = (ctx: { spec: { type: keyof typeof TYPES } }): boolean =>
  TYPES[ctx.spec.type].rearIlluminated;

/** ⚠ CL-R-24 — rear-illuminated type mounted flush. Substitute spacers. */
export const CL_R_24: Rule = {
  id: 'CL-R-24', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX', critical: true,
  kbRef: '§6.4', title: 'Rear-illuminated type mounted flush',
  applies: (ctx) => rearLit(ctx) && ctx.spec.mount === 'CL-MT-01',
  run(ctx) {
    ctx.set('mount', 'CL-MT-02', {
      // §8.2 level 1: a flush-mounted halo letter does not light. Buildability
      // beats the customer's mount choice, and the callout says why.
      authority: Authority.BUILDABILITY,
      message: `${TYPES[ctx.spec.type].name} letters were specified flush mounted, where the light cannot escape. Substituted ${MOUNTS['CL-MT-02'].label}.`,
    });
    const gap = ctx.thresholds.get('standoff.min');
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      ctx.set(ctx.pathOf(el, 'standoff'), gap, {
        message: `"${el.content}" spaced ${formatInches(gap)} off the surface.`,
        severity: 'NOTE', elementId: el.id, authority: Authority.BUILDABILITY,
        thresholdKeys: ['standoff.min'],
      });
    }
  },
};

/** ⚠ CL-R-25 — rear-illuminated type on a raceway with no backer. */
export const CL_R_25: Rule = {
  id: 'CL-R-25', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX', critical: true,
  kbRef: '§6.4', title: 'Rear-illuminated type on a raceway with no backer',
  applies: (ctx) => rearLit(ctx) && ctx.spec.mount === 'CL-MT-03' && !ctx.spec.backer.present,
  run(ctx) {
    ctx.set('backer.present', true, {
      authority: Authority.BUILDABILITY,
      message: `${TYPES[ctx.spec.type].name} letters on a raceway have no surface for the halo to wash across. Added a backer panel behind the set.`,
    });
    ctx.set('backer.w', ctx.spec.overall.w + 4, { message: 'Backer sized to the letter set plus margin.', severity: 'NOTE', authority: Authority.BUILDABILITY });
    ctx.set('backer.h', ctx.spec.overall.h + 4, { message: 'Backer sized to the letter set plus margin.', severity: 'NOTE', authority: Authority.BUILDABILITY });
  },
};

/** ⚠ CL-R-26 — rear-illuminated, bottom mounted, nothing behind. `[DER]` */
export const CL_R_26: Rule = {
  id: 'CL-R-26', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX', critical: true,
  kbRef: '§6.4', title: 'Rear-illuminated type bottom mounted with no surface behind',
  applies: (ctx) => rearLit(ctx) && ctx.spec.mount === 'CL-MT-05' && !ctx.spec.backer.present,
  run(ctx) {
    // The KB offers both; the default is the backer, and the alternative is
    // recorded as an offer rather than applied.
    ctx.set('backer.present', true, {
      authority: Authority.BUILDABILITY,
      message: `${TYPES[ctx.spec.type].name} letters bottom mounted on a rail have nothing behind them for the halo. Added a backer panel (default).`,
    });
    ctx.set('backer.w', ctx.spec.overall.w + 4, { message: 'Backer sized to the set.', severity: 'NOTE', authority: Authority.BUILDABILITY });
    ctx.set('backer.h', ctx.spec.overall.h + 4, { message: 'Backer sized to the set.', severity: 'NOTE', authority: Authority.BUILDABILITY });
    ctx.note('Alternative offered: switch the sign to front lit and keep the bottom-mounted rail with no backer.', {
      severity: 'NOTE', path: 'type',
    });
  },
};

/** CL-R-27 — letter or logo over 36″H on a raceway. */
export const CL_R_27: Rule = {
  id: 'CL-R-27', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.4', title: 'Oversized element on a raceway',
  applies: (ctx) => ctx.spec.mount === 'CL-MT-03',
  run(ctx) {
    const max = ctx.thresholds.get('mount.raceway_max_letter_height');
    const tall = ctx.spec.elements.filter((e) => e.bbox.h > max);
    if (tall.length === 0) return;
    const current = ctx.spec.raceway ?? { kind: 'raceway' as const, ...RACEWAY_STANDARD, colour: 'match mounting surface', count: 1 };
    ctx.set('raceway', { ...current, count: 2 }, {
      message: `${tall.map((e) => `"${e.content}"`).join(', ')} exceeds ${formatInches(max)} on a raceway — a second raceway (or one larger fabricated raceway) is required.`,
      thresholdKeys: ['mount.raceway_max_letter_height'],
      authority: Authority.BUILDABILITY,
    });
  },
};

/** CL-R-28 — raceway, wireway or rail colour must match the mounting surface. */
export const CL_R_28: Rule = {
  id: 'CL-R-28', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.4', title: 'Mounting structure colour matches the building',
  applies: (ctx) => !!ctx.spec.raceway,
  run(ctx) {
    const surface = ctx.spec.mountingSurface.colour;
    const target = surface === 'unspecified' ? 'match building colour' : surface;
    if (ctx.spec.raceway!.colour === target) return;
    ctx.set('raceway.colour', target, {
      message: `${ctx.spec.raceway!.kind} colour called out as "${target}".`,
    });
  },
};

/** CL-R-29 — detached element with fewer than 2 attachment points. */
export const CL_R_29: Rule = {
  id: 'CL-R-29', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.4', title: 'Detached element needs two attachment points',
  run(ctx) {
    const min = ctx.thresholds.get('mount.min_attachment_points');
    for (const el of ctx.spec.elements) {
      if (!el.detached) continue;
      if ((el.attachmentPoints ?? 0) >= min) continue;
      ctx.set(ctx.pathOf(el, 'supportRods'), true, {
        message: `"${el.content}" is a detached element with fewer than ${min} attachment points — carried on a 2″×2″ frame with a square or circular base, or on support rods above the letter line.`,
        elementId: el.id, thresholdKeys: ['mount.min_attachment_points'],
        authority: Authority.BUILDABILITY,
      });
      ctx.set(ctx.pathOf(el, 'attachmentPoints'), min, {
        message: `"${el.content}" attachment points set to ${min}.`,
        severity: 'NOTE', elementId: el.id, authority: Authority.BUILDABILITY,
      });
    }
  },
};

/** CL-R-30 — bottom mounted, oversized: engineering review. Never assert it holds. */
export const CL_R_30: Rule = {
  id: 'CL-R-30', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.4', title: 'Bottom-mounted rail sizing needs engineering review',
  applies: (ctx) => ctx.spec.mount === 'CL-MT-05',
  run(ctx) {
    const maxH = ctx.thresholds.get('mount.bottom_rail_review_height');
    const maxL = ctx.thresholds.get('mount.bottom_rail_review_length');
    const tall = ctx.spec.elements.filter((e) => e.bbox.h > maxH);
    const long = ctx.spec.overall.w > maxL;
    if (tall.length === 0 && !long) return;
    ctx.note(
      `Bottom-mounted set ${long ? `spans ${formatInches(ctx.spec.overall.w)}` : ''}${long && tall.length ? ' and ' : ''}${tall.length ? `includes elements over ${formatInches(maxH)}` : ''} — rail sizing and anchorage need engineering review. This concept does not assert that it will hold.`,
      { path: 'mount', thresholdKeys: ['mount.bottom_rail_review_height', 'mount.bottom_rail_review_length'] },
    );
  },
};

/** CL-R-31 — protrusion-limited façade with a raceway. Propose a wireway. */
export const CL_R_31: Rule = {
  id: 'CL-R-31', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.4', title: 'Protrusion limit with a raceway specified',
  applies: (ctx) => ctx.spec.mount === 'CL-MT-03' && ctx.spec.site?.protrusionLimit !== undefined,
  run(ctx) {
    const limit = ctx.spec.site!.protrusionLimit!;
    const deepest = Math.max(...ctx.spec.elements.map(depthOf), 0);
    const total = (ctx.spec.raceway?.d ?? RACEWAY_STANDARD.d) + deepest;
    if (total <= limit) return;
    ctx.note(
      `A raceway plus ${formatInches(deepest)} returns projects ${formatInches(total)}, over the ${formatInches(limit)} protrusion limit. A wireway (${formatInches(WIREWAY_STANDARD.d)} deep) is thinner and is proposed instead.`,
      { path: 'mount' },
    );
  },
};

/** CL-R-32 — sign area may exceed the permitted area. Never assert compliance. */
export const CL_R_32: Rule = {
  id: 'CL-R-32', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.4', title: 'Permitted signage area',
  applies: (ctx) => ctx.spec.site?.permittedAreaSqFt !== undefined,
  run(ctx) {
    const permitted = ctx.spec.site!.permittedAreaSqFt!;
    const area = sqFt(ctx.spec.overall);
    if (area <= permitted) return;
    ctx.note(
      `Sign area is approximately ${area.toFixed(1)} sq ft against a stated allowance of ${permitted} sq ft — flag for permit review. This concept makes no claim of compliance.`,
      { path: 'overall' },
    );
  },
};

export const GATE4_MOUNTING_RULES: Rule[] = [
  CL_R_24, CL_R_25, CL_R_26, CL_R_27, CL_R_28, CL_R_29, CL_R_30, CL_R_31, CL_R_32,
];
