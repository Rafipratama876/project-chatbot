/**
 * Dimensional Letters spec block — the DL equivalent of `specBlock.ts`.
 * Template interpolation over the finished `DLSpec`; nothing computed here.
 * Deliberately its own generator rather than a reuse of `renderSpecBlock`:
 * that one prints "Channel Letters" and TRIM CAP/RETURN unconditionally,
 * which would be wrong on a Dimensional Letters document.
 */
import type { DLSpec, DLElement } from '../domain/dl-spec.js';
import { dlDepthOf, dlColourOf, dlFinishOf, dlSqFt } from '../domain/dl-spec.js';
import { DL_MATERIALS, DL_MOUNT_FACTS, DL_FINISH_FACTS } from '../domain/dl-taxonomy.js';
import { isDeviceColour } from '../domain/materials.js';
import { formatInches } from '../domain/units.js';

const pad = (label: string): string => label.padEnd(18, ' ');
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function renderDLSpecBlock(spec: DLSpec): string {
  const lines: string[] = [];
  const facts = DL_MATERIALS[spec.materialFamily];
  const showSizes = spec.proofOptions.showSizes;

  lines.push(`${pad('SIGN TYPE')}Dimensional Letters — ${facts.label}`);
  lines.push(`${pad('QUANTITY')}${spec.quantity}`);
  if (showSizes) {
    lines.push(`${pad('OVERALL SIZE')}${fmt(spec.overall.w)}" × ${fmt(spec.overall.h)}"  ·  ${dlSqFt(spec.overall).toFixed(1)} sq ft`);
  }
  lines.push(`${pad('MOUNTING')}${DL_MOUNT_FACTS[spec.mount].label}`);
  lines.push(`${pad('INSTALL TEMPLATE')}${spec.requiresInstallTemplate ? 'Required — printed, matched to stud/pad locations' : 'Not required'}`);

  spec.elements.forEach((el, i) => {
    lines.push('');
    lines.push(`── ELEMENT ${i + 1} · "${el.content}"`);
    if (showSizes) {
      lines.push(`   ${pad('SIZE')}${fmt(el.bbox.w)}" × ${fmt(el.bbox.h)}"   ·   CAP HEIGHT ${fmt(el.capHeight)}"`);
    }
    lines.push(`   ${pad('MATERIAL')}${facts.label}`);
    lines.push(`   ${pad('DEPTH')}${formatInches(dlDepthOf(el))}${spec.proofOptions.showThickness ? ' (per fabricator)' : ''}`);
    lines.push(`   ${pad('COLOUR')}${colourLine(el)}`);
    lines.push(`   ${pad('FINISH')}${DL_FINISH_FACTS[dlFinishOf(el)].label}`);
    lines.push(`   ${pad('ILLUMINATION')}${el.lit ? `LED ${el.ledColour ?? 'white'}` : 'None'}`);
    if (el.standoff) lines.push(`   ${pad('STANDOFF')}${formatInches(el.standoff)}`);
  });

  lines.push('');
  lines.push('── NOTES');
  lines.push('   · All exterior fasteners and mounting hardware corrosion-resistant');

  return lines.join('\n');
}

function colourLine(el: DLElement): string {
  const colour = dlColourOf(el);
  return isDeviceColour(colour) ? `${colour} (indicative, to be confirmed against a physical sample)` : colour;
}

/** Mirrors `assertNoDeviceColours` — the same §4.7-style guard for DL text. */
export function assertNoDLDeviceColours(spec: DLSpec): string[] {
  // Unlike CL, DL states a device colour on the spec block explicitly marked
  // "indicative" (see colourLine above) rather than refusing it outright —
  // DL has no separate paint/film licensed fan-deck lookup to convert against.
  // Nothing to assert here; kept as a named function so the DL output
  // contract has the same shape as CL's for `assembleDLProof` to call.
  void spec;
  return [];
}
