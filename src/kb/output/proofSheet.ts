/**
 * The proof sheet.
 *
 * §9.3 fixes what a spec block says and §9.4 fixes what must be disclosed; this
 * is the sheet they go on. Pure template over the finished spec and trace — the
 * numbers, the drawings and the callouts are all already decided, so nothing
 * here computes anything about the sign.
 */
import type { SignSpec } from '../domain/spec.js';
import { sqFt, depthOf, returnColourOf, faceColourOf, isBoxConstruction } from '../domain/spec.js';
import { TYPES, MOUNTS, ROLES, CONSTRUCTION_FACTS, COPY_TREATMENT_FACTS } from '../domain/taxonomy.js';
import { STANDING_NOTES } from '../domain/boilerplate.js';
import { formatInches } from '../domain/units.js';
import { renderSectionDetail, renderElevation } from './sectionDetail.js';
import type { DisclosureBundle } from './disclosures.js';

export interface SheetPanel {
  view: 'day' | 'night';
  camera: string;
  dataUrl?: string;
  file?: string;
  /** Set by the renderer when the panel could not use the photograph. */
  note?: string | null;
}

export interface ProofSheetInput {
  spec: SignSpec;
  disclosures: DisclosureBundle;
  panels: SheetPanel[];
  kbVersion: string;
  /** Non-empty means the sheet is watermarked and must not ship. */
  problems?: string[];
}

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const src = (p?: SheetPanel): string => p?.dataUrl ?? (p?.file ? `file://${p.file}` : '');

export function renderProofSheet(input: ProofSheetInput): string {
  const { spec, disclosures, panels, kbVersion } = input;
  // The two panels answer different questions. The day view answers "what will
  // this look like on my building", so it is the elevation, composited onto the
  // customer's photograph. The night view answers "how is it built and how does
  // it light", so it is the 3/4 — the only angle where the return depth, the
  // standoff gap and the halo are visible at the same time. A flat night
  // elevation shows a glowing shape and none of the construction.
  const pick = (view: 'day' | 'night', ...cameras: string[]): SheetPanel | undefined => {
    for (const camera of cameras) {
      const found = panels.find((p) => p.view === view && p.camera === camera);
      if (found) return found;
    }
    return panels.find((p) => p.view === view);
  };

  const day = pick('day', 'front-elevation', 'perspective');
  const night = pick('night', 'detail-perspective', 'perspective', 'front-elevation');

  // A proof rendered against a neutral wall looks like a design decision unless
  // it says otherwise. §9.2 asks the sign to sit inside the measured area and
  // clear the openings, and none of that was checked without a photograph.
  const onBuilding = !!spec.placement;

  // §9.3's per-element block, numbered the way a fabricator reads it.
  const primary = spec.elements.find((e) => e.construction === 'CL-C-01') ?? spec.elements[0];
  const specRows = primary ? [
    ['CHANNEL LETTER TYPE', TYPES[spec.type].name],
    ['FACE COLOR', faceColourOf(primary)],
    ['FACE COLOR TREATMENT', primary.face.vinylApplication ? 'Vinyl application' : 'Per Logo'],
    ['TRIM CAP COLOR', trimLabel(primary.trimCap)],
    ['RETURN COLOR', returnColourOf(primary)],
    ['RETURN DEPTH', formatInches(depthOf(primary))],
  ] : [];

  const footer = [
    ['INSTALLATION METHOD', MOUNTS[spec.mount].label],
    ['BACKER PANEL OPTIONS', spec.backer.present ? spec.backer.shape.replace(/-/g, ' ') : 'No backer'],
    ['BACKER PANEL COLOR', spec.backer.present ? spec.backer.colour : '—'],
    ['SIGN QUANTITY', String(spec.quantity)],
    ['MAX SIGN AREA ALLOWED', spec.site?.permittedAreaSqFt ? `${spec.site.permittedAreaSqFt} sq ft` : 'Not provided'],
  ];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(spec.businessName)} — channel letter proof</title>
<style>${STYLES}</style></head>
<body>
<div class="sheet${input.problems?.length ? ' flagged' : ''}">

  ${input.problems?.length ? `<div class="banner">
    <strong>This proof failed its own output contract and must not ship.</strong>
    <ul>${input.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  </div>` : ''}

  <header class="head">
    <div>
      <h1>${esc(spec.businessName)}</h1>
      <p class="sub">Channel letters — ${spec.elements.length} element${spec.elements.length === 1 ? '' : 's'} · ${esc(kbVersion)}</p>
    </div>
    ${spec.blocked ? '<div class="blocked">BLOCKED · CL-R-46</div>' : ''}
  </header>

  <section class="views">
    ${viewPanel('DAY VIEW', day, onBuilding
      ? day?.note ?? undefined
      : 'Shown on a neutral wall — no site photograph was supplied.')}
    ${viewPanel('NIGHT VIEW', night, onBuilding
      ? night?.note ?? undefined
      : 'Shown on a neutral wall — no site photograph was supplied.')}
  </section>

  <section class="three">
    <div class="card">
      <h2>SIGN SPECIFICATIONS</h2>
      <table class="specs">${specRows.map(([label, value], i) => `
        <tr><td class="n">${i + 1}</td><td><span class="label">${esc(label)}</span><strong>${esc(value)}</strong></td></tr>`).join('')}
      </table>
    </div>

    <div class="card">
      <h2>LOGO ELEVATION / DIMENSIONS</h2>
      <div class="pad">
        <p class="overall">Overall:<br><strong>${sqFt(spec.overall).toFixed(1)} sq ft</strong></p>
        ${renderElevation(spec)}
      </div>
    </div>

    <div class="card">
      <h2>SIDE / SECTION DETAIL (TYPICAL CHANNEL LETTER)</h2>
      <div class="pad">${renderSectionDetail(spec)}</div>
    </div>
  </section>

  <section class="footer-grid">
    ${footer.map(([label, value]) => `
      <div><span class="label">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}
  </section>

  ${spec.elements.length > 1 ? `<section class="card elements">
    <h2>ELEMENTS</h2>
    <table class="elements-table">
      <thead><tr><th>#</th><th>Role</th><th>Content</th><th>Construction</th><th>Size</th><th>Cap</th><th>Depth</th><th>Illumination</th></tr></thead>
      <tbody>${spec.elements.map((el, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(ROLES[el.role].label)}</td>
        <td>${esc(el.content)}</td>
        <td>${esc(el.construction)} — ${esc(CONSTRUCTION_FACTS[el.construction].label)}${
          isBoxConstruction(el.construction) && el.copyTreatment
            ? `<br><span class="muted">${esc(COPY_TREATMENT_FACTS[el.copyTreatment].label)}</span>` : ''}</td>
        <td>${(el.box?.w ?? el.bbox.w).toFixed(1)}" × ${(el.box?.h ?? el.bbox.h).toFixed(1)}"</td>
        <td>${formatInches(el.capHeight)}</td>
        <td>${el.construction === 'CL-C-06' ? '—' : formatInches(el.box?.depth ?? depthOf(el))}</td>
        <td>${el.lit ? esc(el.ledColour ?? 'LED') : 'None'}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>` : ''}

  ${disclosures.criticals.length ? `<section class="critical">
    <h2>⚠ IMPORTANT CHANGES TO WHAT WAS REQUESTED</h2>
    ${disclosures.criticals.map((c) => `<p>${esc(c.customerText ?? c.text)}</p>`).join('')}
  </section>` : ''}

  <section class="disclosures">
    ${block('ADJUSTMENTS MADE', disclosures.autofixes.map((c) => c.customerText ?? c.text))}
    ${block('THINGS TO CONFIRM', disclosures.warnings.map((c) => c.text))}
    ${block('DEFAULTS APPLIED', disclosures.defaults.map((c) => c.text))}
    ${block('NEEDS A HUMAN', disclosures.escalations.map((c) => `[${c.ruleId}] ${c.text}`))}
    ${block('NOTES', STANDING_NOTES)}
    ${disclosures.derivedValues.length ? block(
      'DERIVED VALUES USED (not vendor-confirmed)',
      disclosures.derivedValues.map((t) => `${t.key} = ${t.value}${t.unit === 'in' ? '"' : ''} [${t.source}] ${t.kbRef}`),
    ) : ''}
  </section>

  ${spec.placement ? `<p class="scale-note">Scale taken from a ${formatInches(spec.placement.reference.inches)} reference${
    spec.placement.reference.label ? ` across the ${esc(spec.placement.reference.label)}` : ''}.${
    spec.placement.facadeRect
      ? ' The viewpoint was matched to the photograph, so the sign carries the building\'s own perspective.'
      : ' The wall is assumed square to the camera.'}${
    spec.placement.sun
      ? ''
      : ' Sun position was not given; the shadow is short and soft and does not assert a direction.'}</p>`
    : `<p class="scale-note">No site photograph was supplied, so the sign is shown on a neutral wall and
       nothing has been checked against the real facade — not the fit, not the clearances, not the surrounding colours.</p>`}

  <footer class="disclaimer">${esc(disclosures.disclaimer)}</footer>
</div>
</body></html>`;
}

const viewPanel = (title: string, panel?: SheetPanel, note?: string): string => `
  <figure class="view">
    <figcaption>${title}</figcaption>
    ${panel ? `<img src="${esc(src(panel))}" alt="${title}">` : '<div class="missing">not rendered</div>'}
    ${note ? `<figcaption class="view-note">${esc(note)}</figcaption>` : ''}
  </figure>`;

const block = (title: string, items: string[]): string =>
  items.length === 0 ? '' : `
  <div class="block">
    <h3>${title}</h3>
    <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  </div>`;

function trimLabel(tc: { kind: string; width?: number; brand?: string; colour?: string; code?: string; paintedTo?: string }): string {
  if (tc.kind === 'none') return 'n/a';
  if (tc.kind === 'retainer') return 'Extruded retainer';
  if (tc.brand === 'Paintable') return `Jewelite Paintable → ${tc.paintedTo}`;
  return [tc.width ? formatInches(tc.width) : null, tc.brand, tc.code, tc.colour].filter(Boolean).join(' ');
}

const STYLES = `
:root { --ink:#111; --line:#d8d8d8; --muted:#6b6b6b; --bar:#1a1a1a; }
* { box-sizing: border-box; }
body { margin:0; background:#e9e9e9; font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; color:var(--ink); }
.sheet { max-width:1400px; margin:24px auto; background:#fff; padding:22px; box-shadow:0 1px 4px rgba(0,0,0,.15); }
.sheet.flagged { outline:3px solid #b3261e; }
.banner { background:#fdecea; border-left:4px solid #b3261e; padding:12px 14px; margin-bottom:16px; }
.banner ul { margin:6px 0 0; padding-left:18px; }
.head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:10px; margin-bottom:16px; }
h1 { margin:0; font-size:22px; letter-spacing:-.01em; }
.sub { margin:4px 0 0; color:var(--muted); font-size:12px; }
.blocked { background:#b3261e; color:#fff; padding:6px 12px; font-weight:700; font-size:12px; letter-spacing:.04em; }
.views { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
.view { margin:0; position:relative; border:1px solid var(--line); background:#f4f4f4; }
.view figcaption { position:absolute; top:10px; left:10px; background:var(--bar); color:#fff; padding:5px 12px; font-size:11px; font-weight:700; letter-spacing:.06em; z-index:1; }
.view img { display:block; width:100%; height:auto; }
.missing { padding:60px; text-align:center; color:var(--muted); }
.three { display:grid; grid-template-columns:340px 1fr 1fr; gap:14px; margin-bottom:14px; }
.card { border:1px solid var(--line); background:#fff; }
.card h2 { margin:0; background:var(--bar); color:#fff; font-size:12px; letter-spacing:.05em; padding:9px 12px; text-align:center; }
.pad { padding:12px; text-align:center; }
.pad svg { max-width:100%; height:auto; }
.specs { width:100%; border-collapse:collapse; }
.specs td { border-bottom:1px solid var(--line); padding:9px 10px; vertical-align:middle; }
.specs .n { width:34px; text-align:center; color:#fff; }
.specs .n::before { content:attr(data-n); }
.specs tr td.n { background:transparent; }
.specs tr td.n { color:var(--ink); font-weight:700; }
.label { display:block; font-size:10px; letter-spacing:.05em; color:var(--muted); text-transform:uppercase; }
.overall { margin:0 0 6px; text-align:left; font-size:12px; color:var(--muted); }
.overall strong { font-size:24px; color:var(--ink); }
.footer-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:0; border:1px solid var(--line); margin-bottom:14px; }
.footer-grid > div { padding:11px 13px; border-right:1px solid var(--line); }
.footer-grid > div:last-child { border-right:0; }
.elements { margin-bottom:14px; }
.elements-table { width:100%; border-collapse:collapse; font-size:12px; }
.elements-table th { background:#f2f2f2; text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); font-size:11px; letter-spacing:.03em; }
.elements-table td { padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
.muted { color:var(--muted); font-size:11px; }
.critical { border:2px solid #b3261e; padding:12px 14px; margin-bottom:14px; }
.critical h2 { margin:0 0 8px; font-size:12px; letter-spacing:.05em; color:#b3261e; }
.critical p { margin:0 0 6px; }
.disclosures { display:grid; grid-template-columns:repeat(2,1fr); gap:0 22px; }
.block h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.05em; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; }
.block ul { margin:0; padding-left:18px; }
.block li { margin-bottom:3px; }
.scale-note { margin:14px 0 0; font-size:11px; color:var(--muted); }
.disclaimer { margin-top:14px; padding-top:10px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); }
@media print { body { background:#fff; } .sheet { box-shadow:none; margin:0; max-width:none; } }
`;
