/**
 * KB §6.2 — Face material and size. Gate 4. CL-R-09 … CL-R-18.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import { formatInches } from '../../domain/units.js';
import type { SignElement } from '../../domain/spec.js';
import { faceColourOf } from '../../domain/spec.js';

const dimensional = (el: SignElement): boolean => el.construction !== 'CL-C-06';
const faceW = (el: SignElement): number => el.box?.w ?? el.bbox.w;
const faceH = (el: SignElement): number => el.box?.h ?? el.bbox.h;

/** CL-R-09 — letter height over 48″ with standard acrylic. */
export const CL_R_09: Rule = {
  id: 'CL-R-09', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.2', title: 'Oversized letter on standard acrylic',
  run(ctx) {
    const max = ctx.thresholds.get('face.max_acrylic_letter_height');
    for (const el of ctx.spec.elements) {
      if (!dimensional(el) || el.face.material !== 'acrylic') continue;
      if (faceH(el) <= max) continue;
      ctx.set(ctx.pathOf(el, 'face.material'), 'impact-modified-acrylic', {
        message: `"${el.content}" is ${formatInches(faceH(el))} tall, over the ${formatInches(max)} limit for standard acrylic — face changed to impact-modified acrylic.`,
        elementId: el.id, thresholdKeys: ['face.max_acrylic_letter_height'],
      });
    }
  },
};

/** CL-R-10 — any face dimension over 5′ × 10′. */
export const CL_R_10: Rule = {
  id: 'CL-R-10', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.2', title: 'Face beyond standard sheet size',
  run(ctx) {
    const maxW = ctx.thresholds.get('face.max_standard_w');
    const maxH = ctx.thresholds.get('face.max_standard_h');
    for (const el of ctx.spec.elements) {
      if (!dimensional(el) || el.face.material !== 'acrylic') continue;
      const w = faceW(el);
      const h = faceH(el);
      const over = Math.max(w, h) > maxH || Math.min(w, h) > maxW;
      if (!over) continue;
      ctx.set(ctx.pathOf(el, 'face.material'), 'impact-modified-acrylic', {
        message: `"${el.content}" face is ${formatInches(w)} × ${formatInches(h)}, beyond the ${formatInches(maxW)} × ${formatInches(maxH)} standard sheet — face changed to impact-modified acrylic.`,
        elementId: el.id, thresholdKeys: ['face.max_standard_w', 'face.max_standard_h'],
      });
    }
  },
};

/** CL-R-11 — large open or white areas. NOTE. */
export const CL_R_11: Rule = {
  id: 'CL-R-11', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.2', title: 'Large open or white face areas',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.face.largeOpenAreas) continue;
      ctx.note(`"${el.content}" carries large open or white face areas — impact-modified acrylic is preferred.`, {
        elementId: el.id, path: ctx.pathOf(el, 'face.material'),
      });
    }
  },
};

/** CL-R-12 — fully digitally printed face. NOTE. */
export const CL_R_12: Rule = {
  id: 'CL-R-12', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.2', title: 'Fully printed face',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.face.printed) continue;
      ctx.note(`"${el.content}" face is fully digitally printed — polycarbonate is preferred.`, {
        elementId: el.id, path: ctx.pathOf(el, 'face.material'),
      });
    }
  },
};

/** CL-R-13 — retainer instead of trim cap above the size threshold. */
export const CL_R_13: Rule = {
  id: 'CL-R-13', gate: GATES.VALIDATION, tier: 'VISUAL', severity: 'AUTOFIX',
  kbRef: '§6.2', title: 'Retainer replaces trim cap on large work',
  run(ctx) {
    const hT = ctx.thresholds.get('face.retainer_height_threshold');
    const wT = ctx.thresholds.get('face.retainer_width_threshold');
    for (const el of ctx.spec.elements) {
      if (el.trimCap.kind !== 'trim-cap') continue;
      if (faceH(el) <= hT && faceW(el) <= wT) continue;
      ctx.set(ctx.pathOf(el, 'trimCap'), { kind: 'retainer' as const }, {
        message: `"${el.content}" is ${formatInches(faceW(el))} × ${formatInches(faceH(el))} — over ${formatInches(hT)} high or ${formatInches(wT)} wide, so an extruded retainer replaces the trim cap.`,
        elementId: el.id, thresholdKeys: ['face.retainer_height_threshold', 'face.retainer_width_threshold'],
        authority: Authority.BUILDABILITY,
      });
      if (!ctx.spec.subtypes.includes('CL-S-02')) {
        ctx.set('subtypes', [...ctx.spec.subtypes, 'CL-S-02'], {
          message: 'Sub-type CL-S-02 (extruded retainer) applies.', severity: 'NOTE',
        });
      }
    }
  },
};

/** CL-R-14 — polycarbonate face wider than the widest roll. */
export const CL_R_14: Rule = {
  id: 'CL-R-14', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.2', title: 'Polycarbonate beyond the widest roll',
  run(ctx) {
    const max = ctx.thresholds.get('face.max_polycarbonate_width');
    for (const el of ctx.spec.elements) {
      if (el.face.material !== 'polycarbonate') continue;
      if (faceW(el) <= max) continue;
      ctx.note(`"${el.content}" polycarbonate face is ${formatInches(faceW(el))} wide, beyond the ${formatInches(max)} roll — a seam is required.`, {
        elementId: el.id, path: ctx.pathOf(el, 'face.material'), thresholdKeys: ['face.max_polycarbonate_width'],
      });
    }
  },
};

/** CL-R-15 — printed graphic wider than 52″. */
export const CL_R_15: Rule = {
  id: 'CL-R-15', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.2', title: 'Printed graphic beyond in-house width',
  run(ctx) {
    const max = ctx.thresholds.get('face.max_inhouse_print_width');
    for (const el of ctx.spec.elements) {
      if (!el.face.printed || faceW(el) <= max) continue;
      ctx.note(`"${el.content}" printed graphic is ${formatInches(faceW(el))} wide, over the ${formatInches(max)} in-house limit — outsourced print, note lead time.`, {
        elementId: el.id, path: ctx.pathOf(el, 'face.printed'), thresholdKeys: ['face.max_inhouse_print_width'],
      });
    }
  },
};

/** CL-R-16 — lighted face or gradient needing a print seam. */
export const CL_R_16: Rule = {
  id: 'CL-R-16', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.2', title: 'Lit printed face needing a seam',
  run(ctx) {
    const max = ctx.thresholds.get('face.max_inhouse_print_width');
    for (const el of ctx.spec.elements) {
      if (!el.lit || !el.face.printed || faceW(el) <= max) continue;
      ctx.note(`"${el.content}" is a lit printed face wider than one print run — outsourced print; seam location confirmed at production.`, {
        elementId: el.id, path: ctx.pathOf(el, 'face'),
      });
    }
  },
};

/** CL-R-17 — formed face larger than 8′ × 14′. */
export const CL_R_17: Rule = {
  id: 'CL-R-17', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: '§6.2', title: 'Formed face beyond the sheet limit',
  run(ctx) {
    const maxW = ctx.thresholds.get('face.max_formed_w');
    const maxH = ctx.thresholds.get('face.max_formed_h');
    for (const el of ctx.spec.elements) {
      const w = faceW(el);
      const h = faceH(el);
      if (Math.min(w, h) <= maxW && Math.max(w, h) <= maxH) continue;
      ctx.note(`"${el.content}" formed face is ${formatInches(w)} × ${formatInches(h)}, beyond ${formatInches(maxW)} × ${formatInches(maxH)} — a seam is required.`, {
        elementId: el.id, path: ctx.pathOf(el, 'bbox'),
        thresholdKeys: ['face.max_formed_w', 'face.max_formed_h'],
      });
    }
  },
};

/** CL-R-18 — smallest dimension over 14′: oversized shipping. */
export const CL_R_18: Rule = {
  id: 'CL-R-18', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.2', title: 'Oversized shipping',
  run(ctx) {
    const max = ctx.thresholds.get('face.oversize_shipping_min_dim');
    const { w, h } = ctx.spec.overall;
    if (Math.min(w, h) <= max) return;
    ctx.note(`Smallest overall dimension is ${formatInches(Math.min(w, h))}, over ${formatInches(max)} — oversized shipping; flag cost and lead time.`, {
      path: 'overall', thresholdKeys: ['face.oversize_shipping_min_dim'],
    });
  },
};

export const GATE4_FACE_RULES: Rule[] = [
  CL_R_09, CL_R_10, CL_R_11, CL_R_12, CL_R_13, CL_R_14, CL_R_15, CL_R_16, CL_R_17, CL_R_18,
];
