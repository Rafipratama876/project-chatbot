/**
 * KB §6.6 — Colour. Gate 4. CL-R-38 … CL-R-42.
 *
 * §4.7: CMYK, RGB and HEX may drive the on-screen render, but they never appear
 * in the spec block. So the device value stays on the element for the renderer
 * and a converted, explicitly indicative name is written alongside it.
 *
 * CL-R-38 and CL-R-39 write at Authority.CUSTOMER rather than HOUSE. They are
 * not overriding the customer's choice — the colour is unchanged; only the
 * notation is. Writing at HOUSE would let §8.2 refuse the conversion on exactly
 * the fields that need it, since a hex value is always customer-supplied, and a
 * raw hex would then reach the spec block.
 */
import type { Rule } from '../rule.js';
import { GATES } from '../gates.js';
import { Authority } from '../precedence.js';
import {
  isDeviceColour, findTrimCap, DEFAULT_PAINT_SYSTEM, DEFAULT_FILM_SYSTEM,
  JEWELITE_PAINTABLE, GEMTRIM, TRIM_CAP_DEFAULT_WIDTH,
  placeholderConverter, formatConversion,
} from '../../domain/materials.js';
import { TYPES } from '../../domain/taxonomy.js';
import { returnColourOf, faceColourOf } from '../../domain/spec.js';
import { formatInches } from '../../domain/units.js';

/** The converter port, defaulting to the honest no-fan-deck implementation. */
const convert = (ctx: { services: { colourConverter?: typeof placeholderConverter } }) =>
  ctx.services.colourConverter ?? placeholderConverter;

/** CL-R-38 — paint colour given as a device value. */
export const CL_R_38: Rule = {
  id: 'CL-R-38', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.6', title: 'Paint colour converted to an accepted system',
  run(ctx) {
    const system = ctx.spec.paintSystem ?? DEFAULT_PAINT_SYSTEM;
    for (const el of ctx.spec.elements) {
      if (!el.returnColour || !isDeviceColour(el.returnColour)) continue;
      const device = el.returnColour;
      // The device value goes in the TRACE (so the disclosure can quote it) but
      // never into the field the spec block prints.
      ctx.set(ctx.pathOf(el, 'returnColour'), formatConversion(convert(ctx)(device, system)), {
        message: `"${el.content}" return colour was given as ${device}; converted to the nearest ${system} colour and marked indicative.`,
        elementId: el.id,
        authority: Authority.CUSTOMER,
      });
    }
    if (isDeviceColour(ctx.spec.backer.colour)) {
      const backerDevice = ctx.spec.backer.colour;
      ctx.set('backer.colour', formatConversion(convert(ctx)(backerDevice, system)), {
        message: `Backer colour converted from ${backerDevice} to the nearest ${system} colour.`,
        authority: Authority.CUSTOMER,
      });
    }
  },
};

/** CL-R-39 — translucent face or box copy colour given as a device value. */
export const CL_R_39: Rule = {
  id: 'CL-R-39', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.6', title: 'Translucent colour converted to an accepted film',
  run(ctx) {
    const film = ctx.spec.filmSystem ?? DEFAULT_FILM_SYSTEM;
    for (const el of ctx.spec.elements) {
      if (!el.lit || !el.face.colour || !isDeviceColour(el.face.colour)) continue;
      const device = el.face.colour;
      // Keep the device value for the renderer (§4.7) …
      ctx.set(ctx.pathOf(el, 'face.renderColour'), device, {
        message: `"${el.content}" render colour retained as ${device}.`, severity: 'NOTE', elementId: el.id,
      });
      // … and write the spec-block value separately.
      ctx.set(ctx.pathOf(el, 'face.colour'), formatConversion(convert(ctx)(device, film)), {
        message: `"${el.content}" face colour was given as ${device}; converted to the nearest ${film} colour and marked indicative.`,
        elementId: el.id,
        authority: Authority.CUSTOMER,
      });
      ctx.set(ctx.pathOf(el, 'face.colourSystem'), film, { message: 'Film system recorded.', severity: 'NOTE', elementId: el.id });
      ctx.set(ctx.pathOf(el, 'face.colourIndicative'), true, { message: 'Colour marked indicative.', severity: 'NOTE', elementId: el.id });
    }
  },
};

/** CL-R-40 — trim cap colour not in either catalogue → Jewelite Paintable. */
export const CL_R_40: Rule = {
  id: 'CL-R-40', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.6', title: 'Off-catalogue trim cap colour',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (el.trimCap.kind !== 'trim-cap' || !el.trimCap.colour) continue;
      if (findTrimCap(el.trimCap.colour)) continue;
      const wanted = el.trimCap.colour;
      ctx.set(ctx.pathOf(el, 'trimCap'), {
        ...el.trimCap, brand: 'Paintable' as const, colour: JEWELITE_PAINTABLE, paintedTo: wanted,
      }, {
        message: `"${wanted}" is not in the GemTrim or Jewelite catalogue — specified as ${JEWELITE_PAINTABLE}, painted to ${wanted}. This costs more and takes longer.`,
        elementId: el.id,
      });
    }
  },
};

/** CL-R-41 — catalogue colour not offered in the specified width. */
export const CL_R_41: Rule = {
  id: 'CL-R-41', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'AUTOFIX',
  kbRef: '§6.6', title: 'Trim cap colour not offered in that width',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      const tc = el.trimCap;
      if (tc.kind !== 'trim-cap' || !tc.colour || tc.width === undefined) continue;
      const match = findTrimCap(tc.colour);
      if (!match || match.widths.includes(tc.width)) continue;

      if (match.widths.includes(TRIM_CAP_DEFAULT_WIDTH)) {
        ctx.set(ctx.pathOf(el, 'trimCap.width'), TRIM_CAP_DEFAULT_WIDTH, {
          message: `${match.colour} is not offered in ${formatInches(tc.width)} trim cap — switched to ${formatInches(TRIM_CAP_DEFAULT_WIDTH)}, which carries all 31 GemTrim colours.`,
          elementId: el.id,
        });
      } else {
        const alt = GEMTRIM.find((c) => c.widths.includes(tc.width!));
        ctx.set(ctx.pathOf(el, 'trimCap.colour'), alt?.name ?? match.colour, {
          message: `${match.colour} is not offered in ${formatInches(tc.width)} trim cap; nearest colour available in that width is ${alt?.name ?? match.colour}.`,
          elementId: el.id,
        });
      }
    }
  },
};

/** CL-R-42 — halo type with different face and return colours. NOTE. */
export const CL_R_42: Rule = {
  id: 'CL-R-42', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: '§6.6', title: 'Halo face and return colour differ',
  applies: (ctx) => TYPES[ctx.spec.type].rearIlluminated,
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (el.construction !== 'CL-C-01') continue;
      if (faceColourOf(el).toLowerCase() === returnColourOf(el).toLowerCase()) continue;
      ctx.note(
        `"${el.content}" has a ${faceColourOf(el)} face and ${returnColourOf(el)} returns. The house standard for halo types is the same colour on both.`,
        { elementId: el.id, path: ctx.pathOf(el, 'face.colour') },
      );
    }
  },
};

export const GATE4_COLOUR_RULES: Rule[] = [CL_R_38, CL_R_39, CL_R_40, CL_R_41, CL_R_42];
