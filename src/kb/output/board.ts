/**
 * The presentation board.
 *
 * One 1536×951 page: two scene panels across the top, then specifications,
 * logo elevation and the section detail, then the fabrication footer. It is the
 * artefact the customer is shown, and the format TSP already reviews proofs in.
 *
 * Only the two scene panels are images of a *rendered* sign. Everything else —
 * the specification rows, the elevation, the section drawing, the dimensions
 * and the footer — is drawn here from the finished spec, because those are the
 * parts a customer reads numbers off. A model that writes a dimension is a
 * model that can write the wrong dimension, and there is no gate downstream of
 * a picture of text.
 */
import type { SignSpec } from '../domain/spec.js';
import { sqFt, depthOf, returnColourOf, faceColourOf } from '../domain/spec.js';
import { TYPES, MOUNTS } from '../domain/taxonomy.js';
import { formatInches } from '../domain/units.js';
import { renderSectionDetail, renderElevation } from './sectionDetail.js';

export interface BoardPanelImage {
  /** Data URL. The board is screenshotted, so every image must be inline. */
  src: string;
  /** Set when the panel could not use the customer's photograph. */
  note?: string | null;
}

export interface BoardInput {
  spec: SignSpec;
  day?: BoardPanelImage;
  night?: BoardPanelImage;
  /** Non-empty means the board is watermarked and must not ship. */
  problems?: string[];
}

export const BOARD_WIDTH = 1536;
export const BOARD_HEIGHT = 951;
export const BOARD_SELECTOR = '.proof-board';

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * §9.1 gives the night panel a different question to answer on a sign that does
 * not light: there is no night, so the second panel is the angle that shows the
 * construction instead.
 */
export function nightLabel(spec: SignSpec): string {
  // The contract, not `spec.views`: Gate 5 decides the view list from what is
  // actually lit, and the renderer obeys the contract. Labelling a panel
  // "NIGHT VIEW" that the renderer drew in daylight is the mismatch this
  // avoids.
  const views = spec.renderContract?.views ?? spec.views;
  return views.includes('night') ? 'NIGHT VIEW' : 'PERSPECTIVE VIEW';
}

export function renderBoard(input: BoardInput): string {
  const { spec } = input;

  // The row a fabricator reads first. Taken from the letter element, because a
  // logo box does not have a trim cap or a return colour to report.
  const primary = spec.elements.find((e) => e.construction === 'CL-C-01') ?? spec.elements[0];
  const specRows: Array<[string, string]> = primary ? [
    ['CHANNEL LETTER TYPE', TYPES[spec.type].name],
    ['FACE COLOR', faceColourOf(primary)],
    ['FACE COLOR TREATMENT', primary.face.vinylApplication ? 'Vinyl application' : 'Per Logo'],
    ['TRIM CAP COLOR', trimLabel(primary.trimCap)],
    ['RETURN COLOR', returnColourOf(primary)],
    ['RETURN DEPTH', formatInches(depthOf(primary))],
    // "Do not show on proof" is an instruction to us, not a specification. When
    // the option is off the row is dropped, never printed with its own switch
    // as the value.
    ...(spec.proofOptions.showThickness
      ? [['MATERIALS THICKNESS', MATERIALS_STANDARD] as [string, string]]
      : []),
  ] : [];

  const footer: Array<[string, string]> = [
    ['INSTALLATION METHOD', MOUNTS[spec.mount].label],
    ['BACKER PANEL OPTIONS', spec.backer.present ? spec.backer.shape.replace(/-/g, ' ') : 'No Backer'],
    ['BACKER PANEL COLOR', spec.backer.present ? spec.backer.colour : '—'],
    ['SIGN QUANTITY', String(spec.quantity)],
    ['MAX SIGN AREA ALLOWED', spec.site?.permittedAreaSqFt ? `${spec.site.permittedAreaSqFt} sq ft` : 'Not provided'],
  ];

  // §9.4's "show sizes on proof" is display control, not a fabrication fact:
  // the dimensions come off the same spec either way.
  const hide = spec.proofOptions.showSizes ? '' : ' hide-measurements';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(spec.businessName)} — channel letter proof</title>
<style>${STYLES}</style></head>
<body>
<main class="proof-board${hide}${input.problems?.length ? ' flagged' : ''}">

  ${input.problems?.length ? `<div class="banner"><strong>This proof failed its own output contract and must not ship.</strong> ${esc(input.problems[0])}</div>` : ''}

  <section class="top-grid">
    ${scenePanel('DAY VIEW', input.day)}
    ${scenePanel(nightLabel(spec), input.night)}
  </section>

  <section class="bottom-grid">
    <article class="panel">
      <header class="panel-title">SIGN SPECIFICATIONS</header>
      <table class="spec-table"><tbody>${specRows.map(([label, value], i) => `
        <tr>
          <td class="spec-icon"><span class="spec-glyph">${i + 1}</span></td>
          <td><span class="field-name">${esc(label)}</span><span class="field-value">${esc(value)}</span></td>
        </tr>`).join('')}</tbody></table>
    </article>

    <article class="panel dimension-panel">
      <header class="panel-title">LOGO ELEVATION / DIMENSIONS</header>
      <div class="dimension-content">
        <div class="overall-copy"><span>Overall:</span><strong>${sqFt(spec.overall).toFixed(1)} sq ft</strong></div>
        <div class="elevation">${renderElevation(spec)}</div>
      </div>
    </article>

    <article class="panel side-section-panel">
      <header class="panel-title">SIDE / SECTION DETAIL (TYPICAL CHANNEL LETTER)</header>
      <div class="side-section-content">${renderSectionDetail(spec)}</div>
    </article>
  </section>

  <footer>
    <table class="facts-footer"><tbody><tr>${footer.map(([label, value]) => `
      <td class="footer-fact"><span class="field-name">${esc(label)}</span><span class="field-value">${esc(value)}</span></td>`).join('')}
    </tr></tbody></table>
  </footer>
</main>
</body></html>`;
}

const scenePanel = (title: string, panel?: BoardPanelImage): string => `
  <article class="view-card">
    ${panel
      ? `<img src="${esc(panel.src)}" alt="${esc(title)}">`
      : '<div class="missing">not rendered</div>'}
    <div class="view-label">${esc(title)}</div>
    ${panel?.note ? `<div class="view-note">${esc(panel.note)}</div>` : ''}
  </article>`;

const trimLabel = (trim: SignSpec['elements'][number]['trimCap']): string => {
  if (!trim || trim.kind === 'none') return 'None';
  return [trim.colour, trim.brand].filter(Boolean).join(' · ') || 'Standard';
};

const MATERIALS_STANDARD =
  'Standards: .177" acrylic face, .063" aluminum returns, .050" aluminum backs';

const STYLES = `
*{box-sizing:border-box}
html,body{width:${BOARD_WIDTH}px;height:${BOARD_HEIGHT}px;margin:0;overflow:hidden;
  background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#050505}
.proof-board{width:${BOARD_WIDTH}px;height:${BOARD_HEIGHT}px;padding:13px 17px 16px;background:#f7f7f7}
.banner{margin-bottom:8px;padding:6px 12px;border-radius:6px;background:#7f1d1d;color:#fff;font-size:13px}
.top-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:17px}
.view-card{position:relative;overflow:hidden;aspect-ratio:742/464;border-radius:9px;background:#ddd;
  box-shadow:0 1px 3px rgba(0,0,0,.22)}
.view-card img{display:block;width:100%;height:100%;object-fit:cover}
.missing{display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#666;font-size:15px}
.view-label{position:absolute;top:13px;left:14px;padding:8px 15px 7px;border-radius:5px;
  background:rgba(0,0,0,.92);color:#fff;font-size:18px;font-weight:800;line-height:1}
.view-note{position:absolute;left:14px;right:14px;bottom:12px;padding:6px 10px;border-radius:5px;
  background:rgba(0,0,0,.78);color:#fff;font-size:11px;line-height:1.25}
.bottom-grid{display:grid;grid-template-columns:366px 460px minmax(0,1fr);gap:7px;height:353px;margin-bottom:8px}
.panel{overflow:hidden;border:1px solid #b8b8b8;border-radius:8px;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.panel-title{height:32px;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;
  background:linear-gradient(180deg,#1d1d1d 0%,#080808 100%);color:#fff;font-size:15px;font-weight:800}
.spec-table{width:100%;border-collapse:collapse;table-layout:fixed}
.spec-table tr+tr{border-top:1px solid #c6c6c6}
.spec-table td{height:45px;padding:0 10px;font-size:14px;line-height:1.25;vertical-align:middle}
.spec-icon{width:60px;padding:0;border-right:1px solid #a8a8a8;text-align:center}
.spec-glyph{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;
  border-radius:50%;background:#050505;color:#fff;font-size:15px;font-weight:800}
.field-name{display:block;margin-bottom:3px;color:#666;font-size:10px;font-weight:800;line-height:1.1;text-transform:uppercase}
.field-value{display:block;color:#050505;font-size:14px;font-weight:700;overflow-wrap:anywhere}
.dimension-content{position:relative;height:calc(100% - 32px);padding:12px 16px 10px;
  background:radial-gradient(circle at center,#fff 0%,#fff 43%,#f8f8f8 100%)}
.overall-copy{position:absolute;left:16px;top:12px}
.overall-copy span{display:block;font-size:15px}
.overall-copy strong{display:block;margin-top:2px;font-size:24px;line-height:1.05}
.elevation{display:flex;height:100%;align-items:center;justify-content:center;padding-top:44px}
.elevation svg{max-width:100%;max-height:100%;height:auto}
.side-section-content{height:calc(100% - 32px);padding:6px 12px;background:#fff;
  display:flex;align-items:center;justify-content:center}
.side-section-content svg{max-width:100%;max-height:100%;height:auto}
.hide-measurements .overall-copy,
.hide-measurements .dim,
.hide-measurements .dimension{display:none}
.facts-footer{width:100%;height:78px;overflow:hidden;border:1px solid #b8b8b8;border-radius:8px;
  border-collapse:separate;border-spacing:0;table-layout:fixed;background:#fff;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.footer-fact{height:76px;padding:9px 14px 8px;vertical-align:middle}
.footer-fact+.footer-fact{border-left:1px solid #c6c6c6}
.footer-fact .field-value{display:-webkit-box;overflow:hidden;font-size:15px;line-height:1.15;
  -webkit-box-orient:vertical;-webkit-line-clamp:2}
`;
