/**
 * DL GATE 2 — composition.
 *
 * The PDF's Dimensional Letters scope is, overwhelmingly, one name or mark
 * fabricated as one set of letters (a business name, a house number, a
 * logotype) rather than the multi-role hierarchy (primary/secondary/tagline/
 * logo/legal) Channel Letters' §3.1 defines for a full storefront sign. So
 * DL-COMP-01 merges every measured artwork item into a single element —
 * deliberately simpler than CL-R-48/§3.2, and documented as a v1 scope limit
 * rather than silently approximated.
 */
import type { DLElement } from '../../../domain/dl-spec.js';
import { dlBboxOf } from '../../../domain/dl-spec.js';
import type { DLRule } from '../dl-rule.js';
import { DL_GATES } from '../dl-gates.js';

export const DL_COMP_01: DLRule = {
  id: 'DL-COMP-01', gate: DL_GATES.COMPOSITION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'v1 scope: one element per job', title: 'Group measured artwork into one dimensional-letters element',
  applies: (ctx) => ctx.spec.elements.length === 0 && ctx.spec.artwork.length > 0,
  run(ctx) {
    const items = ctx.spec.artwork;
    const bbox = dlBboxOf(items);
    const content = items.map((i) => i.text ?? i.char ?? '').join('').trim() || ctx.spec.businessName;

    const element: DLElement = {
      id: 'dl-el-1',
      content,
      itemIds: items.map((i) => i.id),
      bbox,
      baselineY: Math.min(...items.map((i) => i.baselineY)),
      capHeight: Math.max(...items.map((i) => i.capHeight)),
      contours: items.flatMap((i) => i.contours),
      lit: false,
    };

    ctx.set('elements', [element], {
      message: `Grouped ${items.length} artwork item(s) into one dimensional-letters element ("${content}").`,
    });
    ctx.set('overall', { w: bbox.w, h: bbox.h }, {
      message: `Overall size ${bbox.w.toFixed(1)}″ × ${bbox.h.toFixed(1)}″.`,
    });
  },
};

export const DL_GATE2_RULES: DLRule[] = [DL_COMP_01];
