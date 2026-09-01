/**
 * The side / section detail on the proof sheet.
 *
 * Drawn from the spec, not picked from a library of stock drawings. The return
 * depth, the standoff gap and the backer are the numbers §6.3, §6.5 and §6.4
 * settled, so a section that shows something else is a section of a different
 * sign. Deterministic SVG — no model, no raster.
 *
 * §9.2 forbids fabrication hardware in a *customer-facing render*. This is a
 * section detail, not a render: the whole point is to show how the letter meets
 * the wall, so the spacer is labelled. Rivets, drivers and conduit stay out.
 */
import type { SignSpec, SignElement } from '../domain/spec.js';
import { depthOf, isBoxConstruction } from '../domain/spec.js';
import { TYPES, MOUNTS } from '../domain/taxonomy.js';
import { formatInches } from '../domain/units.js';

export interface SectionOptions {
  width?: number;
  height?: number;
  /** Drawing scale: pixels per inch of real depth. */
  pxPerInch?: number;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Which element the section represents. §9.3 prints one spec block per element,
 * but a section shows the *typical* letter — the primary channel-letter
 * element, since that is the construction the rest is matched to.
 */
export function sectionSubject(spec: SignSpec): SignElement | undefined {
  return spec.elements.find((e) => e.construction === 'CL-C-01')
    ?? spec.elements.find((e) => isBoxConstruction(e.construction))
    ?? spec.elements[0];
}

export function renderSectionDetail(spec: SignSpec, opts: SectionOptions = {}): string {
  const el = sectionSubject(spec);
  if (!el) return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

  const W = opts.width ?? 620;
  const H = opts.height ?? 380;
  const type = TYPES[spec.type];

  const depth = depthOf(el);
  const standoff = el.standoff ?? 0;
  const backer = spec.backer.present ? Math.max(spec.backer.depth, 0.25) : 0;

  // The wall is drawn at a fixed width; everything in front of it is to scale
  // against the return depth, so a 3″ can and a 5″ can look different.
  const totalDepth = backer + standoff + depth;
  const pxPerInch = opts.pxPerInch ?? Math.min(26, (W * 0.42) / Math.max(totalDepth, 1));

  const wallX = W * 0.30;
  const wallW = 34;
  const midY = H / 2;
  const letterH = H * 0.46;

  const backerX = wallX + wallW;
  const backerW = backer * pxPerInch;
  const canX = backerX + backerW + standoff * pxPerInch;
  const canW = depth * pxPerInch;
  const faceW = 7;

  const parts: string[] = [];
  const leaders: Array<{ x: number; y: number; label: string }> = [];

  // ── Building wall, broken at both ends (it continues past the detail) ────
  parts.push(`
    <rect x="${wallX}" y="24" width="${wallW}" height="${H - 48}" fill="#e8e8e8" stroke="#111" stroke-width="1.5"/>
    ${breakLine(wallX, wallW, 44)}
    ${breakLine(wallX, wallW, H - 44)}`);
  leaders.push({ x: wallX + wallW / 2, y: 74, label: 'BUILDING WALL' });

  // ── CL-P-20 backer ──────────────────────────────────────────────────────
  if (backer > 0) {
    parts.push(`<rect x="${backerX}" y="${midY - letterH * 0.78}" width="${backerW}" height="${letterH * 1.56}"
      fill="#c9c9c9" stroke="#111" stroke-width="1.5"/>`);
    leaders.push({ x: backerX + backerW / 2, y: midY + letterH * 0.68, label: 'BACKER' });
  }

  // ── CL-P-15 spacer, and the gap that makes a halo possible ──────────────
  if (standoff > 0) {
    const sx = backerX + backerW;
    const sw = standoff * pxPerInch;
    for (const y of [midY - letterH * 0.28, midY + letterH * 0.28]) {
      parts.push(`<rect x="${sx}" y="${y - 3}" width="${sw}" height="6" fill="#7a7a7a" stroke="#111" stroke-width="1"/>`);
    }
    leaders.push({ x: sx + sw / 2, y: midY + letterH * 0.28, label: 'SPACER' });
    parts.push(dimension(sx, sx + sw, midY - letterH * 0.62, formatInches(standoff), 'up'));
  }

  // ── CL-P-02 return + CL-P-01 face ───────────────────────────────────────
  const canY = midY - letterH / 2;
  parts.push(`
    <rect x="${canX}" y="${canY}" width="${canW}" height="${letterH}"
      fill="#2b2b2b" stroke="#111" stroke-width="1.5"/>
    <rect x="${canX + canW}" y="${canY - 2}" width="${faceW}" height="${letterH + 4}"
      fill="${type.translucentFace ? '#ffd24d' : '#3d3d3d'}" stroke="#111" stroke-width="1.5"/>`);

  // Trim cap laps the face edge and stands 1/8″ proud (§4.3).
  if (el.trimCap.kind === 'trim-cap' || el.trimCap.kind === 'retainer') {
    const tx = canX + canW;
    for (const y of [canY - 2, canY + letterH - 6]) {
      parts.push(`<rect x="${tx - 1}" y="${y}" width="${faceW + 5}" height="8" fill="#111"/>`);
    }
  }

  const label = [
    TYPES[spec.type].name.toUpperCase(),
    'CHANNEL LETTER',
  ].join('\n');
  leaders.push({ x: canX + canW / 2, y: canY + letterH * 0.34, label });

  // ── Return depth, the number the whole section exists to communicate ────
  parts.push(dimension(canX, canX + canW, canY + letterH + 34, formatInches(depth), 'down'));

  // ── Leader lines out to the right ───────────────────────────────────────
  const leaderX = W - 172;
  leaders.forEach((l, i) => {
    const ty = 70 + i * 52;
    parts.push(`
      <path d="M${l.x},${l.y} L${leaderX - 14},${ty}" stroke="#111" stroke-width="1" fill="none"/>
      <circle cx="${l.x}" cy="${l.y}" r="2.5" fill="#111"/>
      ${l.label.split('\n').map((line, k) =>
        `<text x="${leaderX}" y="${ty + 4 + k * 13}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#111">${esc(line)}</text>`,
      ).join('')}`);
  });

  const caption = `${MOUNTS[spec.mount].label} · ${formatInches(depth)} return`
    + (standoff ? ` · ${formatInches(standoff)} standoff` : '')
    + (backer ? ' · on backer' : '');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${parts.join('\n')}
  <text x="16" y="${H - 14}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#555">${esc(caption)}</text>
</svg>`;
}

/** The conventional break symbol for an element that continues past the view. */
function breakLine(x: number, w: number, y: number): string {
  return `<path d="M${x - 6},${y + 7} L${x + w + 6},${y - 7}" stroke="#111" stroke-width="1.5" fill="none"/>`;
}

/** A dimension line with arrowheads and a centred label. */
function dimension(x1: number, x2: number, y: number, label: string, tick: 'up' | 'down'): string {
  const dir = tick === 'up' ? -1 : 1;
  return `
    <g stroke="#111" stroke-width="1" fill="none">
      <path d="M${x1},${y} L${x2},${y}"/>
      <path d="M${x1},${y - 5} L${x1},${y + 5}"/>
      <path d="M${x2},${y - 5} L${x2},${y + 5}"/>
      <path d="M${x1},${y} l6,-3 v6 z" fill="#111"/>
      <path d="M${x2},${y} l-6,-3 v6 z" fill="#111"/>
    </g>
    <text x="${(x1 + x2) / 2}" y="${y + dir * 9}" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#111">${esc(label)}</text>`;
}

/**
 * The logo elevation on the sheet: the mark's silhouette with overall width and
 * height called out, matching §9.3's OVERALL SIZE.
 */
export function renderElevation(spec: SignSpec, opts: { width?: number; height?: number } = {}): string {
  const W = opts.width ?? 460;
  const H = opts.height ?? 260;
  const { w, h } = spec.overall;
  if (w <= 0 || h <= 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

  const pad = 58;
  const scale = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
  const dw = w * scale;
  const dh = h * scale;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2 - 6;

  // The silhouette is the actual contours, so the elevation is the same
  // geometry the renderer extrudes rather than a stand-in rectangle.
  const paths = spec.elements.flatMap((el) =>
    el.contours.map((c) => {
      const d = c.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(ox + (p.x - spec.overall.w * 0 - minX(spec)) * scale).toFixed(2)},${(oy + dh - (p.y - minY(spec)) * scale).toFixed(2)}`)
        .join(' ');
      return `<path d="${d} Z" fill="${c.hole ? '#fff' : '#9a9a9a'}"/>`;
    }),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <g fill-rule="evenodd">${paths.join('')}</g>
  ${dimension(ox, ox + dw, oy + dh + 30, `${w.toFixed(2)}"`, 'down')}
  <g transform="translate(${ox + dw + 34},${oy + dh / 2}) rotate(-90)">
    ${dimension(-dh / 2, dh / 2, 0, `${h.toFixed(1)}"`, 'up')}
  </g>
</svg>`;
}

const minX = (spec: SignSpec): number =>
  Math.min(...spec.elements.flatMap((e) => e.contours.flatMap((c) => c.points.map((p) => p.x))), 0);
const minY = (spec: SignSpec): number =>
  Math.min(...spec.elements.flatMap((e) => e.contours.flatMap((c) => c.points.map((p) => p.y))), 0);
