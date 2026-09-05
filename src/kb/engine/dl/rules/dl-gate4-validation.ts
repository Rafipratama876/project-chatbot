/**
 * DL GATE 4 — validation. Runs to a fixpoint like CL's Gate 4, bounded by
 * `DL_MAX_VALIDATION_PASSES` — a rule set that never settles is a bug in the
 * rule set, not something to loop on silently.
 */
import type { DLRule } from '../dl-rule.js';
import { DL_GATES } from '../dl-gates.js';
import { DL_MATERIALS, DL_MOUNT_FACTS } from '../../../domain/dl-taxonomy.js';
import { isDeviceColour } from '../../../domain/materials.js';
import { formatInches } from '../../../domain/units.js';

/** DL-R-01 · size/depth against the material family's vendor/derived range. */
export const DL_R_01: DLRule = {
  id: 'DL-R-01', gate: DL_GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: 'PDF p.4/5/9/10 (size ranges)', title: 'Height and depth within the material family range',
  run(ctx) {
    const facts = DL_MATERIALS[ctx.spec.materialFamily];
    for (const el of ctx.spec.elements) {
      if (el.capHeight > facts.maxHeight) {
        ctx.note(
          `"${el.content}" is ${formatInches(el.capHeight)} tall — above ${facts.label}'s typical ${formatInches(facts.maxHeight)} max. `
          + 'Confirm the fabricator can build this size before it goes out as a proof.',
          { elementId: el.id, path: 'capHeight' },
        );
      }
      if (el.depth !== undefined && el.depth > facts.maxDepth) {
        ctx.note(
          `Depth ${formatInches(el.depth)} exceeds ${facts.label}'s typical ${formatInches(facts.maxDepth)} max depth.`,
          { elementId: el.id, path: 'depth' },
        );
      }
      // A job asking for more than 3x the material's max height is not a
      // "confirm with the shop" situation — it is very likely the wrong
      // material family entirely, so this is a hard stop rather than a WARN.
      if (el.capHeight > facts.maxHeight * 3) {
        ctx.note(
          `"${el.content}" at ${formatInches(el.capHeight)} is far outside anything ${facts.label} is fabricated at `
          + `(typical max ${formatInches(facts.maxHeight)}). This cannot ship as a ${facts.label} proof.`,
          { severity: 'BLOCK', elementId: el.id, path: 'capHeight' },
        );
      }
    }
  },
};

/** DL-R-02 · only flat-cut acrylic / PVC are ever drawn illuminated. */
export const DL_R_02: DLRule = {
  id: 'DL-R-02', gate: DL_GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: 'PDF p.9 (Gemini flat cut acrylic / lit acrylic)', title: 'Illumination only on an illuminable family',
  applies: (ctx) => !!ctx.spec.form.illuminated,
  run(ctx) {
    const facts = DL_MATERIALS[ctx.spec.materialFamily];
    if (!facts.illuminable) {
      ctx.escalate(
        `Illumination was requested but ${facts.label} is never shown lit in the PDF — only flat-cut acrylic and flat-cut PVC are.`,
        `Is this actually flat-cut acrylic, or should this ship non-illuminated as ${facts.label}?`,
        'DL-R-02',
      );
      return;
    }
    for (const el of ctx.spec.elements) {
      el.lit = true;
      el.ledColour = ctx.spec.form.ledColour ?? 'White';
    }
  },
};

/** DL-R-03 · uneven/textured surface + a mount with no extra hold → suggest pads. */
export const DL_R_03: DLRule = {
  id: 'DL-R-03', gate: DL_GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'PDF p.8 (mounting pads: stone, ACM, metal, textured walls)', title: 'Suggest mounting pads on an uneven surface',
  applies: (ctx) => ctx.spec.mountingSurface.texture === 'uneven' && ctx.spec.mount !== 'stud-with-mounting-pads',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      el.suggestions = [
        ...(el.suggestions ?? []),
        'Mounting surface is uneven/textured — mounting pads behind each stud increase surface contact and hold. Consider "Stud Mounted with Mounting Pads".',
      ];
    }
    ctx.note(
      'Mounting surface flagged uneven/textured — suggested mounting pads rather than switching the mount automatically.',
      { path: 'mount' },
    );
  },
};

/** DL-R-04 · device colours (hex/RGB/CMYK) on a painted finish are indicative only. */
export const DL_R_04: DLRule = {
  id: 'DL-R-04', gate: DL_GATES.VALIDATION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'v1, mirrors CL-R-38/39', title: 'Flag device colours as indicative',
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (el.colour && isDeviceColour(el.colour)) {
        ctx.note(
          `Colour "${el.colour}" is a device value (hex/RGB/CMYK), not a catalogue name — it drives the render only. `
          + 'The proof states it as indicative, to be confirmed against a physical sample.',
          { elementId: el.id, path: 'colour' },
        );
      }
    }
  },
};

/** DL-R-05 · a mount whose PDF description implies a standoff needs one recorded. */
export const DL_R_05: DLRule = {
  id: 'DL-R-05', gate: DL_GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
  kbRef: 'PDF p.9 (mounting options)', title: 'Standoff-capable mount has a standoff recorded',
  applies: (ctx) => DL_MOUNT_FACTS[ctx.spec.mount].standoff,
  run(ctx) {
    for (const el of ctx.spec.elements) {
      if (!el.standoff) {
        ctx.note(`${DL_MOUNT_FACTS[ctx.spec.mount].label} implies a standoff gap, but none is set on "${el.content}".`, { elementId: el.id, path: 'standoff' });
      }
    }
  },
};

export const DL_GATE4_RULES: DLRule[] = [DL_R_01, DL_R_02, DL_R_03, DL_R_04, DL_R_05];
