/**
 * KB §9.3 — required spec block, one per element. Template interpolation over
 * the finished spec; no generation involved.
 *
 * §4.7 is enforced here as well as in CL-R-38/39: CMYK, RGB and HEX never
 * appear in this block. If a device value survives to this point it is a bug in
 * Gate 4, and `assertNoDeviceColours` says so rather than printing it.
 */
import type { SignSpec, SignElement } from '../domain/spec.js';
import { sqFt, isBoxConstruction, depthOf, returnColourOf, faceColourOf, faceMaterialOf } from '../domain/spec.js';
import { TYPES, MOUNTS, ROLES, CONSTRUCTION_FACTS, COPY_TREATMENT_FACTS } from '../domain/taxonomy.js';
import { isDeviceColour, FACE } from '../domain/materials.js';
import { STANDING_NOTES } from '../domain/boilerplate.js';
import { formatInches } from '../domain/units.js';

const pad = (label: string): string => label.padEnd(18, ' ');

export function renderSpecBlock(spec: SignSpec): string {
  const lines: string[] = [];
  const showSizes = spec.proofOptions.showSizes;

  lines.push(`${pad('SIGN TYPE')}Channel Letters — ${spec.elements.length} element${spec.elements.length === 1 ? '' : 's'}`);
  lines.push(`${pad('QUANTITY')}${spec.quantity}`);
  if (showSizes) {
    lines.push(`${pad('OVERALL SIZE')}${fmt(spec.overall.w)}" × ${fmt(spec.overall.h)}"  ·  ${sqFt(spec.overall).toFixed(1)} sq ft`);
  }
  lines.push(`${pad('MOUNTING')}${MOUNTS[spec.mount].label} (${spec.mount})`);

  if (spec.raceway) {
    const label = spec.raceway.kind === 'wireway' ? 'WIREWAY' : spec.raceway.kind === 'bottom-rail' ? 'BOTTOM RAIL' : 'RACEWAY';
    lines.push(`${pad(label)}${fmt(spec.raceway.h)}" H × ${fmt(spec.raceway.d)}" D, colour: ${spec.raceway.colour}${spec.raceway.count > 1 ? ` (${spec.raceway.count} required)` : ''}`);
  }

  lines.push(`${pad('BACKER')}${spec.backer.present
    ? `${spec.backer.shape}, ${spec.backer.material.toUpperCase()}, ${fmt(spec.backer.w)}" × ${fmt(spec.backer.h)}"${spec.backer.depth ? ` × ${fmt(spec.backer.depth)}" D` : ''}, colour: ${spec.backer.colour}`
    : 'None'}`);

  if (spec.control) lines.push(`${pad('CONTROL')}${spec.control}`);

  spec.elements.forEach((el, i) => {
    lines.push('');
    lines.push(`── ELEMENT ${i + 1} · ${ROLES[el.role].label} · "${el.content}"`);
    lines.push(`   ${pad('CONSTRUCTION')}${el.construction} — ${CONSTRUCTION_FACTS[el.construction].label}`);
    if (showSizes) {
      const w = el.box?.w ?? el.bbox.w;
      const h = el.box?.h ?? el.bbox.h;
      lines.push(`   ${pad('SIZE')}${fmt(w)}" × ${fmt(h)}"   ·   CAP HEIGHT ${fmt(el.capHeight)}"`);
    }
    if (el.construction !== 'CL-C-06') {
      lines.push(`   ${pad('RETURN DEPTH')}${fmt(el.box?.depth ?? depthOf(el))}"`);
    }
    lines.push(`   ${pad('FACE')}${faceLine(el, spec)}`);
    if (el.construction !== 'CL-C-06' && !isFlat(el)) {
      lines.push(`   ${pad('RETURN')}aluminium, ${returnColourOf(el)}`);
    }
    lines.push(`   ${pad('TRIM CAP')}${trimLine(el)}`);
    lines.push(`   ${pad('ILLUMINATION')}${el.lit ? `LED ${el.ledColour ?? 'white'}` : 'none'}`);
    if (isBoxConstruction(el.construction) && el.copyTreatment) {
      lines.push(`   ${pad('COPY TREATMENT')}${el.copyTreatment} — ${COPY_TREATMENT_FACTS[el.copyTreatment].label}`);
    }
    if (el.standoff) lines.push(`   ${pad('STANDOFF')}${formatInches(el.standoff)}`);
  });

  lines.push('');
  lines.push('── NOTES');
  for (const n of STANDING_NOTES) lines.push(`   · ${n}`);

  return lines.join('\n');
}

const isFlat = (el: SignElement): boolean => el.construction === 'CL-C-04' || el.construction === 'CL-C-05';

function faceLine(el: SignElement, spec: SignSpec): string {
  const mat = FACE[faceMaterialOf(el)]?.label ?? faceMaterialOf(el);
  const parts = [spec.proofOptions.showThickness ? `${mat} (thickness per fabricator)` : mat, faceColourOf(el)];
  if (el.face.colourIndicative) parts.push('indicative, to be confirmed against a physical sample');
  if (el.face.vinylApplication) parts.push('artwork applied as face vinyl');
  return parts.join(', ');
}

function trimLine(el: SignElement): string {
  const tc = el.trimCap;
  if (tc.kind === 'none') return 'n/a';
  if (tc.kind === 'retainer') return 'extruded aluminium retainer';
  if (tc.brand === 'Paintable') return `Jewelite Paintable, painted to ${tc.paintedTo}`;
  if (tc.brand === 'GemTrim') return `${formatInches(tc.width ?? 1)} GemTrim ${tc.code ?? ''} ${tc.colour ?? ''}`.trim();
  if (tc.brand === 'Jewelite') return `${formatInches(tc.width ?? 1)} Jewelite ${tc.colour ?? ''}`.trim();
  return `${formatInches(tc.width ?? 1)} trim cap, ${tc.colour ?? 'Black'}`;
}

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** §4.7 guard. Returns the offending field paths; empty means the block is clean. */
export function assertNoDeviceColours(spec: SignSpec): string[] {
  const bad: string[] = [];
  spec.elements.forEach((el, i) => {
    if (el.face.colour && isDeviceColour(el.face.colour)) bad.push(`elements[${i}].face.colour`);
    if (el.returnColour && isDeviceColour(el.returnColour)) bad.push(`elements[${i}].returnColour`);
    if (el.trimCap.colour && isDeviceColour(el.trimCap.colour)) bad.push(`elements[${i}].trimCap.colour`);
  });
  if (isDeviceColour(spec.backer.colour)) bad.push('backer.colour');
  if (spec.raceway && isDeviceColour(spec.raceway.colour)) bad.push('raceway.colour');
  return bad;
}
