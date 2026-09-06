/**
 * The Dimensional Letters proof sheet — the DL equivalent of `proofSheet.ts`.
 * Pure template over the finished spec, trace-derived disclosures and the
 * rendered panels; nothing here computes anything about the sign.
 *
 * No section/elevation SVG in v1 (`sectionDetail.ts` draws a channel-letter
 * cross-section — trim cap, LED row, raceway — none of which exists on a
 * dimensional letter), so the sheet shows the two rendered views plus the
 * spec table and disclosures rather than a technical drawing.
 */
import type { DLSpec } from '../domain/dl-spec.js';
import { dlSqFt, dlDepthOf, dlColourOf, dlFinishOf } from '../domain/dl-spec.js';
import { DL_MATERIALS, DL_MOUNT_FACTS, DL_FINISH_FACTS } from '../domain/dl-taxonomy.js';
import { formatInches } from '../domain/units.js';
import type { DLDisclosureBundle } from './dl-disclosures.js';
import type { ProofPanel } from './proof.js';

export interface DLProofSheetInput {
  spec: DLSpec;
  disclosures: DLDisclosureBundle;
  panels: ProofPanel[];
  kbVersion: string;
  problems?: string[];
}

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const src = (p?: ProofPanel): string => {
  const chosen = p?.enhanced ?? p;
  return chosen?.dataUrl ?? (chosen?.file ? `file://${chosen.file}` : '');
};

const noteOf = (p: ProofPanel | undefined, fallback?: string): string | undefined => {
  const parts = [p?.note ?? fallback, p?.enhanced?.reason].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' ') : undefined;
};

export function renderDLProofSheet(input: DLProofSheetInput): string {
  const { spec, disclosures, panels, kbVersion } = input;
  const facts = DL_MATERIALS[spec.materialFamily];

  // DL almost never has a night view — 7 of 8 material families are never
  // illuminated (see dl-compile.ts's `truthForDL`), so CL's day-picks-
  // elevation/night-picks-3/4 convention (`preferredPanel` in
  // render/panelPlan.ts) would leave the second panel showing "not
  // rendered" on every ordinary job. Both panels shown here are DAY unless
  // the rare illuminated flat-cut-acrylic/PVC case actually produced a
  // night render, in which case the 3/4 shows that instead — it is the one
  // panel that would show the face glowing.
  const elevation = panels.find((p) => p.view === 'day' && p.camera === 'front-elevation');
  const threeQuarter = panels.find((p) => p.view === 'night' && p.camera === 'detail-perspective')
    ?? panels.find((p) => p.view === 'day' && p.camera === 'detail-perspective');
  const illuminatedAtNight = threeQuarter?.view === 'night';
  const onBuilding = !!spec.placement;

  const specRows: Array<[string, string]> = [
    ['SIGN TYPE', `Dimensional Letters — ${facts.label}`],
    ['MOUNTING', DL_MOUNT_FACTS[spec.mount].label],
    ['INSTALL TEMPLATE', spec.requiresInstallTemplate ? 'Required' : 'Not required'],
    ['SIGN QUANTITY', String(spec.quantity)],
  ];

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(spec.businessName)} — dimensional letters proof</title>
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
      <p class="sub">Dimensional Letters — ${facts.label} · ${spec.elements.length} element${spec.elements.length === 1 ? '' : 's'} · ${esc(kbVersion)}</p>
    </div>
    ${spec.blocked ? '<div class="blocked">BLOCKED</div>' : ''}
  </header>

  <section class="views">
    ${viewPanel('FRONT ELEVATION', elevation, noteOf(elevation, onBuilding ? undefined : 'Shown on a neutral wall — no site photograph was supplied.'))}
    ${viewPanel(illuminatedAtNight ? '3/4 PERSPECTIVE — ILLUMINATED' : '3/4 PERSPECTIVE', threeQuarter, noteOf(threeQuarter, onBuilding ? undefined : 'Shown on a neutral wall — no site photograph was supplied.'))}
  </section>

  <section class="two">
    <div class="card">
      <h2>SIGN SPECIFICATIONS</h2>
      <table class="specs">${specRows.map(([label, value], i) => `
        <tr><td class="n">${i + 1}</td><td><span class="label">${esc(label)}</span><strong>${esc(value)}</strong></td></tr>`).join('')}
      </table>
    </div>
    <div class="card">
      <h2>OVERALL</h2>
      <div class="pad">
        <p class="overall">Overall:<br><strong>${dlSqFt(spec.overall).toFixed(1)} sq ft</strong></p>
        <p class="muted">${spec.overall.w.toFixed(1)}″ × ${spec.overall.h.toFixed(1)}″</p>
      </div>
    </div>
  </section>

  <section class="card elements">
    <h2>ELEMENTS</h2>
    <table class="elements-table">
      <thead><tr><th>#</th><th>Content</th><th>Size</th><th>Cap</th><th>Depth</th><th>Colour</th><th>Finish</th><th>Illumination</th></tr></thead>
      <tbody>${spec.elements.map((el, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(el.content)}</td>
        <td>${el.bbox.w.toFixed(1)}" × ${el.bbox.h.toFixed(1)}"</td>
        <td>${formatInches(el.capHeight)}</td>
        <td>${formatInches(dlDepthOf(el))}</td>
        <td>${esc(dlColourOf(el))}</td>
        <td>${esc(DL_FINISH_FACTS[dlFinishOf(el)].label)}</td>
        <td>${el.lit ? esc(el.ledColour ?? 'LED') : 'None'}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>

  <section class="disclosures">
    ${block('ADJUSTMENTS MADE', disclosures.autofixes.map((c) => c.text))}
    ${block('THINGS TO CONFIRM', disclosures.warnings.map((c) => c.text))}
    ${block('DEFAULTS APPLIED', disclosures.defaults.map((c) => c.text))}
    ${block('NEEDS A HUMAN', disclosures.escalations.map((c) => `[${c.ruleId}] ${c.text}`))}
    ${block('INSTALLATION NOTES', disclosures.standingNotes)}
    ${disclosures.derivedValues.length ? block(
      'DERIVED VALUES USED (not vendor-confirmed)',
      disclosures.derivedValues.map((t) => `${t.key} = ${t.value}${t.unit === 'in' ? '"' : ''} [${t.source}] ${t.kbRef}`),
    ) : ''}
  </section>

  <footer class="disclaimer">${esc(disclosures.disclaimer)}</footer>
</div>
</body></html>`;
}

const viewPanel = (title: string, panel?: ProofPanel, note?: string): string => `
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

const STYLES = `
:root { --ink:#111; --line:#d8d8d8; --muted:#6b6b6b; --bar:#1a1a1a; }
* { box-sizing: border-box; }
body { margin:0; background:#e9e9e9; font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; color:var(--ink); }
.sheet { max-width:1200px; margin:24px auto; background:#fff; padding:22px; box-shadow:0 1px 4px rgba(0,0,0,.15); }
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
.view-note.view-note { position:static; background:#f0f0f0; color:var(--muted); font-weight:400;
  letter-spacing:0; font-size:10.5px; line-height:1.45; padding:7px 10px; border-top:1px solid var(--line); }
.view img { display:block; width:100%; height:auto; }
.missing { padding:60px; text-align:center; color:var(--muted); }
.two { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
.card { border:1px solid var(--line); background:#fff; }
.card h2 { margin:0; background:var(--bar); color:#fff; font-size:12px; letter-spacing:.05em; padding:9px 12px; text-align:center; }
.pad { padding:12px; text-align:center; }
.specs { width:100%; border-collapse:collapse; }
.specs td { border-bottom:1px solid var(--line); padding:9px 10px; vertical-align:middle; }
.specs .n { width:34px; text-align:center; color:var(--ink); font-weight:700; }
.label { display:block; font-size:10px; letter-spacing:.05em; color:var(--muted); text-transform:uppercase; }
.overall { margin:0 0 6px; text-align:left; font-size:12px; color:var(--muted); }
.overall strong { font-size:24px; color:var(--ink); }
.elements { margin-bottom:14px; }
.elements-table { width:100%; border-collapse:collapse; font-size:12px; }
.elements-table th { background:#f2f2f2; text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); font-size:11px; letter-spacing:.03em; }
.elements-table td { padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
.muted { color:var(--muted); font-size:11px; }
.disclosures { display:grid; grid-template-columns:repeat(2,1fr); gap:0 22px; }
.block h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.05em; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; }
.block ul { margin:0; padding-left:18px; }
.block li { margin-bottom:3px; }
.disclaimer { margin-top:14px; padding-top:10px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); }
@media print { body { background:#fff; } .sheet { box-shadow:none; margin:0; max-width:none; } }
`;
