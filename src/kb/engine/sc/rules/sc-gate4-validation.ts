/**
 * SC GATE 4 — validation. Runs to a fixpoint like CL's/DL's Gate 4, bounded
 * by `SC_MAX_VALIDATION_PASSES`.
 */
import type { SCRule } from '../sc-rule.js';
import { SC_GATES } from '../sc-gates.js';
import { SC_FACE_MATERIAL_FACTS } from '../../../domain/sc-taxonomy.js';
import { isDeviceColour } from '../../../domain/materials.js';
import { formatInches } from '../../../domain/units.js';

/** SC-R-01 · illumination only ever on an illuminable face material (PDF §5: panel + vinyl is "usually without illumination"). */
export const SC_R_01: SCRule = {
  id: 'SC-R-01', gate: SC_GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: 'PDF §5 (cabinet faces — illumination)', title: 'Illumination only on an illuminable face material',
  applies: (ctx) => !!ctx.spec.form.illuminated,
  run(ctx) {
    const facts = SC_FACE_MATERIAL_FACTS[ctx.spec.faceMaterial];
    if (!facts.illuminable) {
      ctx.escalate(
        `Illumination was requested but ${facts.label} is "usually without illumination" per the PDF.`,
        `Is this actually meant to be lit — should the face material change to one that is, or should this ship non-illuminated as ${facts.label}?`,
        'SC-R-01',
      );
      return;
    }
    ctx.spec.cabinet.lit = true;
    ctx.spec.cabinet.ledColour = ctx.spec.form.ledColour ?? 'White';
  },
};

/** SC-R-02 · uneven/textured mounting surface → suggest mounting pads/extra hold, same reasoning as DL-R-03. */
export const SC_R_02: SCRule = {
  id: 'SC-R-02', gate: SC_GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'PDF §9 (mounting)', title: 'Suggest extra hold on an uneven mounting surface',
  applies: (ctx) => ctx.spec.mountingSurface.texture === 'uneven',
  run(ctx) {
    ctx.spec.cabinet.suggestions = [
      ...(ctx.spec.cabinet.suggestions ?? []),
      'Mounting surface is uneven/textured — confirm the mount can carry the cabinet cleanly at this wall (stiff-arm/angle-iron or a match plate rather than direct stud mounting).',
    ];
    ctx.note('Mounting surface flagged uneven/textured.', { path: 'mount' });
  },
};

/** SC-R-03 · device colours (hex/RGB/CMYK) are indicative only. Mirrors CL-R-38/39, DL-R-04. */
export const SC_R_03: SCRule = {
  id: 'SC-R-03', gate: SC_GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'v1, mirrors CL-R-38/39', title: 'Flag device colours as indicative',
  run(ctx) {
    const colour = ctx.spec.cabinet.faceColour;
    if (colour && isDeviceColour(colour)) {
      ctx.note(
        `Colour "${colour}" is a device value (hex/RGB/CMYK), not a catalogue name — it drives the render only. `
        + 'The proof states it as indicative, to be confirmed against a physical sample.',
        { path: 'cabinet.faceColour' },
      );
    }
  },
};

/** SC-R-04 · recommend a pan face over 36" — the PDF's own rigidity threshold. */
export const SC_R_04: SCRule = {
  id: 'SC-R-04', gate: SC_GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'PDF §5 (pan face — "recommended for signs beyond 36\\" on width or height")',
  title: 'Suggest a pan face over the PDF\'s 36" rigidity threshold',
  applies: (ctx) => ctx.spec.faceMaterial === 'acrylic-polycarbonate'
    && (ctx.spec.overall.w > 36 || ctx.spec.overall.h > 36),
  run(ctx) {
    ctx.spec.cabinet.suggestions = [
      ...(ctx.spec.cabinet.suggestions ?? []),
      'Over 36" on width or height — the PDF recommends a pan face (molded, reinforced) over a flat acrylic/polycarbonate face at this size to prevent warping from wind and temperature.',
    ];
    ctx.note(`Cabinet is ${formatInches(Math.max(ctx.spec.overall.w, ctx.spec.overall.h))} on its longest side — flat face rigidity flagged.`, { path: 'faceMaterial' });
  },
};

export const SC_GATE4_RULES: SCRule[] = [SC_R_01, SC_R_02, SC_R_03, SC_R_04];
