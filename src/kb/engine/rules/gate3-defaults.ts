/**
 * KB §8.1 — Defaults. "Apply to every empty field, and log that you did."
 *
 * The log is not optional: §9.4 item 4 requires every defaulted field to be
 * disclosed. Each default therefore writes a DefaultTrace as well as mutating
 * the spec, and it writes at Authority.HOUSE (§8.2 level 4) or AGENT (level 5),
 * so a customer-claimed field is never overwritten.
 *
 * Defaults a Gate-4 rule owns outright (CL-D-01 → CL-R-19, CL-D-15 → CL-R-36,
 * CL-D-10/11 → CL-R-28, CL-D-07 → CL-R-09/10) are seeded here and re-asserted
 * there; the precedence resolver makes the double-write a no-op rather than a
 * conflict.
 */
import type { Rule, RuleContext } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import type { SignElement } from '../../domain/spec.js';
import { isBoxConstruction } from '../../domain/spec.js';
import { TYPES } from '../../domain/taxonomy.js';
import {
  DEFAULT_RETURN_COLOUR, TRIM_CAP_DEFAULT_COLOUR, TRIM_CAP_DEFAULT_WIDTH,
  RACEWAY_STANDARD, WIREWAY_STANDARD, DEFAULT_LED, DEFAULT_PAINT_SYSTEM,
  DEFAULT_FILM_SYSTEM, TRIM_CAP_PROJECTION,
} from '../../domain/materials.js';
import { getPath } from '../path.js';
import { formatInches } from '../../domain/units.js';

const asInches = (v: unknown): string => formatInches(Number(v));

interface DefaultDef {
  id: string;
  label: string;
  /** How the value reads on a proof. Defaults to JSON, which is rarely right. */
  display?(value: unknown): string;
  scope: 'sign' | 'element';
  authority?: Authority;
  /** Path relative to the spec (sign) or to the element. */
  path: string;
  value(ctx: RuleContext, el?: SignElement): unknown;
  applies?(ctx: RuleContext, el?: SignElement): boolean;
  thresholdKeys?: string[];
}

const litElement = (el: SignElement) => el.lit;

export const DEFAULTS: DefaultDef[] = [
  { id: 'CL-D-01', display: asInches, label: 'Return depth', scope: 'element', path: 'returnDepth',
    value: (ctx) => TYPES[ctx.spec.type].standardDepth,
    applies: (_c, el) => el?.returnDepth === undefined || el.returnDepth === null },

  { id: 'CL-D-02', label: 'Return colour', scope: 'element', path: 'returnColour',
    value: () => DEFAULT_RETURN_COLOUR },

  { id: 'CL-D-03', label: 'Trim cap colour', scope: 'element', path: 'trimCap.colour',
    value: () => TRIM_CAP_DEFAULT_COLOUR,
    applies: (_c, el) => el?.trimCap.kind === 'trim-cap' },

  { id: 'CL-D-04', display: asInches, label: 'Trim cap width', scope: 'element', path: 'trimCap.width',
    value: () => TRIM_CAP_DEFAULT_WIDTH,
    applies: (_c, el) => el?.trimCap.kind === 'trim-cap' },

  { id: 'CL-D-05', label: 'Face colour', scope: 'element', path: 'face.colour',
    value: () => 'per logo' },

  { id: 'CL-D-06', label: 'Face colour treatment', scope: 'element', path: 'face.vinylApplication',
    display: (v) => (v ? 'vinyl application' : 'per logo, no vinyl application'),
    value: () => false },

  { id: 'CL-D-07', label: 'Face material', scope: 'element', path: 'face.material',
    value: () => 'acrylic' },

  { id: 'CL-D-08', label: 'Back material', scope: 'element', path: 'back',
    value: (ctx) => TYPES[ctx.spec.type].back,
    applies: (_c, el) => el?.construction === 'CL-C-01' },

  { id: 'CL-D-09', label: 'Backer', scope: 'sign', path: 'backer.present', value: () => false },

  { id: 'CL-D-10', label: 'Backer colour', scope: 'sign', path: 'backer.colour',
    value: (ctx) => ctx.spec.mountingSurface.colour === 'unspecified'
      ? 'match mounting surface' : ctx.spec.mountingSurface.colour },

  { id: 'CL-D-11', label: 'Raceway / wireway / rail colour', scope: 'sign', path: 'raceway.colour',
    value: (ctx) => ctx.spec.mountingSurface.colour === 'unspecified'
      ? 'match mounting surface' : ctx.spec.mountingSurface.colour,
    applies: (ctx) => !!ctx.spec.raceway },

  { id: 'CL-D-12', label: 'Raceway size', scope: 'sign', path: 'raceway',
    display: (v) => `${formatInches((v as { h: number }).h)} H × ${formatInches((v as { d: number }).d)} D`,
    value: (ctx) => ({ kind: 'raceway' as const, ...RACEWAY_STANDARD, colour: 'match mounting surface', count: 1 }),
    applies: (ctx) => ctx.spec.mount === 'CL-MT-03' && !ctx.spec.raceway },

  { id: 'CL-D-13', label: 'Wireway size', scope: 'sign', path: 'raceway',
    display: (v) => `${formatInches((v as { h: number }).h)} H × ${formatInches((v as { d: number }).d)} D`,
    value: () => ({ kind: 'wireway' as const, ...WIREWAY_STANDARD, colour: 'match mounting surface', count: 1 }),
    applies: (ctx) => ctx.spec.mount === 'CL-MT-04' && !ctx.spec.raceway },

  { id: 'CL-D-14', display: asInches, label: 'Trim cap projection / face recess', scope: 'element', path: 'trimCap.projection',
    value: () => TRIM_CAP_PROJECTION,
    applies: (_c, el) => el?.trimCap.kind === 'trim-cap' },

  { id: 'CL-D-15', label: 'LED', scope: 'element', path: 'ledColour',
    value: () => DEFAULT_LED, applies: (_c, el) => !!el && litElement(el) },

  // CL-D-16 / CL-D-17 are thresholds, not spec fields — see thresholds.ts.

  { id: 'CL-D-18', display: asInches, label: 'Standoff gap', scope: 'element', path: 'standoff',
    value: (ctx) => ctx.thresholds.get('standoff.min'),
    thresholdKeys: ['standoff.min', 'standoff.max'],
    applies: (ctx, el) => TYPES[ctx.spec.type].rearIlluminated
      && (el?.construction === 'CL-C-01' || el?.construction === 'CL-C-03') },

  { id: 'CL-D-19', label: 'Paint system', scope: 'sign', path: 'paintSystem', value: () => DEFAULT_PAINT_SYSTEM },
  { id: 'CL-D-20', label: 'Translucent film', scope: 'sign', path: 'filmSystem', value: () => DEFAULT_FILM_SYSTEM },
  { id: 'CL-D-21', label: 'Show sizes on proof', scope: 'sign', path: 'proofOptions.showSizes', value: () => true },
  { id: 'CL-D-22', label: 'Materials thickness on proof', scope: 'sign', path: 'proofOptions.showThickness', value: () => false },
  { id: 'CL-D-23', label: 'Quantity', scope: 'sign', path: 'quantity', value: () => 1 },

  { id: 'CL-D-24', label: 'External illumination for CL-T-04', scope: 'sign', path: 'externalIllumination',
    value: () => false, applies: (ctx) => ctx.spec.type === 'CL-T-04' },

  // CL-D-25 / CL-D-26 / CL-D-27 are enacted by the §3.5 tree in Gate 2
  // (CL-R-51/52 construction, CL-R-51 copy treatment, CL-R-56 depth). Recorded
  // here so §9.4 can still report them as defaults rather than as silent
  // behaviour of the tree.
  { id: 'CL-D-28', label: 'Box shape', scope: 'element', path: 'box.shape',
    value: () => 'capsule', applies: (_c, el) => !!el && isBoxConstruction(el.construction) },

  { id: 'CL-D-29', label: 'Box face colour', scope: 'element', path: 'box.faceColour',
    value: (ctx) => ctx.spec.elements.find((e) => e.role === 'CL-E-01')?.face.colour ?? 'per logo',
    applies: (_c, el) => !!el && isBoxConstruction(el.construction) },
];

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

export const APPLY_DEFAULTS: Rule = {
  id: 'CL-D',
  gate: GATES.DEFAULTS,
  tier: 'SPEC',
  severity: 'NOTE',
  kbRef: '§8.1',
  title: 'Apply §8.1 defaults to every empty field',
  run(ctx) {
    for (const d of DEFAULTS) {
      if (d.scope === 'sign') {
        if (d.applies && !d.applies(ctx)) continue;
        applyOne(ctx, d, d.path, undefined);
      } else {
        for (const el of ctx.spec.elements) {
          if (d.applies && !d.applies(ctx, el)) continue;
          applyOne(ctx, d, `${ctx.pathOf(el)}.${d.path}`, el);
        }
      }
    }
  },
};

function applyOne(ctx: RuleContext, d: DefaultDef, path: string, el?: SignElement): void {
  const current = getPath(ctx.spec, path);
  if (!isEmpty(current)) return;

  const value = d.value(ctx, el);
  const shown = d.display ? d.display(value) : format(value);
  const ok = ctx.set(path, value, {
    ruleId: d.id,
    kbRef: '§8.1',
    message: `${d.label} defaulted to ${shown}.`,
    authority: d.authority ?? Authority.HOUSE,
    elementId: el?.id,
    thresholdKeys: d.thresholdKeys,
    severity: 'NOTE',
  });

  if (ok) {
    ctx.trace.pushDefault({ defaultId: d.id, path, value, label: d.label, elementId: el?.id, display: shown });
  }
}

const format = (v: unknown): string =>
  typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
