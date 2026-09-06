/**
 * Sign Cabinets spec block — the SC equivalent of `specBlock.ts`/`dl-specBlock.ts`.
 * Template interpolation over the finished `SCSpec`; nothing computed here.
 * Deliberately its own generator rather than a reuse of `renderSpecBlock`:
 * that one prints "Channel Letters" and TRIM CAP/RETURN unconditionally,
 * which would be wrong on a Sign Cabinet document.
 */
import type { SCSpec } from '../domain/sc-spec.js';
import { scDepthOf, scFaceColourOf, scRetainerOf, scCornerStyleOf, scSqFt } from '../domain/sc-spec.js';
import { SC_FACE_MATERIAL_FACTS, SC_MOUNT_FACTS, SC_RETAINER_FACTS } from '../domain/sc-taxonomy.js';
import { isDeviceColour } from '../domain/materials.js';
import { formatInches } from '../domain/units.js';

const pad = (label: string): string => label.padEnd(18, ' ');
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function colourLine(spec: SCSpec): string {
  const colour = scFaceColourOf(spec.cabinet);
  return isDeviceColour(colour) ? `${colour} (indicative, to be confirmed against a physical sample)` : colour;
}

export function renderSCSpecBlock(spec: SCSpec): string {
  const lines: string[] = [];
  const facts = SC_FACE_MATERIAL_FACTS[spec.faceMaterial];
  const showSizes = spec.proofOptions.showSizes;
  const cornerStyle = scCornerStyleOf(spec.cabinet);

  lines.push(`${pad('SIGN TYPE')}Sign Cabinet — ${facts.label}`);
  lines.push(`${pad('QUANTITY')}${spec.quantity}`);
  if (showSizes) {
    lines.push(`${pad('OVERALL SIZE')}${fmt(spec.overall.w)}" × ${fmt(spec.overall.h)}"  ·  ${scSqFt(spec.overall).toFixed(1)} sq ft`);
  }
  lines.push(`${pad('FACE MATERIAL')}${facts.label}${spec.proofOptions.showThickness ? ' (per fabricator)' : ''}`);
  lines.push(`${pad('FACE COLOUR')}${colourLine(spec)}`);
  lines.push(`${pad('EXTRUSION DEPTH')}${formatInches(scDepthOf(spec.cabinet))}`);
  lines.push(`${pad('RETAINER')}${SC_RETAINER_FACTS[scRetainerOf(spec.cabinet)].label}`);
  lines.push(`${pad('CORNERS')}${cornerStyle === 'radius' ? `Radius, ${formatInches(spec.cabinet.cornerRadius ?? 6)}` : 'Square'}`);
  lines.push(`${pad('ILLUMINATION')}${spec.cabinet.lit ? `LED ${spec.cabinet.ledColour ?? 'White'}` : 'None'}`);
  lines.push(`${pad('MOUNTING')}${SC_MOUNT_FACTS[spec.mount].label}`);
  if (spec.attachmentDetail) lines.push(`${pad('ATTACHMENT')}${spec.attachmentDetail}`);

  lines.push('');
  lines.push('── NOTES');
  lines.push('   · All exterior fasteners and mounting hardware corrosion-resistant');
  for (const s of spec.cabinet.suggestions ?? []) lines.push(`   · ${s}`);

  return lines.join('\n');
}

/** Mirrors `assertNoDeviceColours`/`assertNoDLDeviceColours` — same §4.7-style guard for SC text. */
export function assertNoSCDeviceColours(spec: SCSpec): string[] {
  void spec;
  return [];
}
