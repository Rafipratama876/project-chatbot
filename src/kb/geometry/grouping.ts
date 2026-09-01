/**
 * KB §3.2 — grouping, and §3.1 role assignment (CL-R-48, CL-R-49).
 * A pure function of the per-item dimensions the artwork tool produces.
 */
import type { ArtworkItem, Contour, Rect } from '../domain/spec.js';
import type { ElementRole } from '../domain/taxonomy.js';
import type { ThresholdStore } from '../domain/thresholds.js';
import { bboxOf } from '../domain/spec.js';

export interface ProtoElement {
  id: string;
  items: ArtworkItem[];
  content: string;
  bbox: Rect;
  baselineY: number;
  capHeight: number;
  narrowestStroke: number;
  contours: Contour[];
  typographic: boolean;
  fontStyle: ArtworkItem['fontStyle'];
  /** §3.2: a two-colour word stays one element with a colour break noted. */
  colourBreaks: string[];
  role?: ElementRole;
}

const ARTICLES = new Set(['the', 'a', 'an', '&', 'and', 'at', 'of', 'or', 'to', '+', 'n']);
const CONTACT_RE = /(\bwww\.|\.com\b|\.ca\b|\d{3}[-. ]\d{3}[-. ]\d{4}|\bsuite\b|\bunit\b|\bhours\b|@)/i;

/**
 * §3.2, in order:
 *   same cap height (±15%) + same baseline + same colour + contiguous → one
 *   a distinct baseline → a new element
 *   a distinct colour → new only if scale or baseline also changed
 *   any non-typographic shape → its own element
 *   a short word at a markedly different scale → its own element (CL-E-05)
 */
export function groupIntoElements(items: ArtworkItem[], th: ThresholdStore): ProtoElement[] {
  const capTol = th.get('grouping.cap_height_tolerance');
  const groups: ArtworkItem[][] = [];

  const shapes = items.filter((i) => i.kind === 'shape');
  const glyphs = items
    .filter((i) => i.kind === 'glyph')
    .sort((a, b) => b.baselineY - a.baselineY || a.bbox.x - b.bbox.x);

  for (const s of shapes) groups.push([s]);

  let current: ArtworkItem[] = [];
  for (const g of glyphs) {
    if (current.length === 0) { current = [g]; continue; }
    const last = current[current.length - 1]!;
    const ref = current[0]!;

    const sameBaseline = Math.abs(g.baselineY - ref.baselineY) <= Math.max(0.1 * ref.capHeight, 0.05);
    const sameScale = ref.capHeight === 0
      ? g.capHeight === 0
      : Math.abs(g.capHeight - ref.capHeight) / ref.capHeight <= capTol;
    const gap = g.bbox.x - (last.bbox.x + last.bbox.w);
    const contiguous = gap <= Math.max(ref.capHeight * 1.0, 0.5);

    if (sameBaseline && sameScale && contiguous) current.push(g);
    else { groups.push(current); current = [g]; }
  }
  if (current.length > 0) groups.push(current);

  return groups.map((g, i) => toProto(g, i));
}

function toProto(items: ArtworkItem[], index: number): ProtoElement {
  const typographic = items.every((i) => i.kind === 'glyph');
  const content = typographic
    ? joinWithSpaces(items)
    : (items[0]?.text ?? 'logo mark');
  // Colour breaks come from the items' own declarations as well as from the
  // spread across items: an imported logo arrives as one item that already
  // knows it is two colours.
  const colours = [...new Set([
    ...items.flatMap((i) => i.colourBreaks ?? []),
    ...items.map((i) => i.colour).filter((c): c is string => !!c),
  ])];
  const strokes = items.map((i) => i.narrowestStroke).filter((s) => s > 0);

  return {
    id: `E${index + 1}`,
    items,
    content,
    bbox: bboxOf(items),
    baselineY: items[0]?.baselineY ?? 0,
    capHeight: Math.max(...items.map((i) => i.capHeight), 0),
    narrowestStroke: strokes.length ? Math.min(...strokes) : 0,
    contours: items.flatMap((i) => i.contours),
    typographic,
    fontStyle: items[0]?.fontStyle,
    colourBreaks: colours.length > 1 ? colours : [],
  };
}

/** Reinsert word spaces the glyph stream implies, so "content" reads right. */
function joinWithSpaces(items: ArtworkItem[]): string {
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (i > 0) {
      const prev = items[i - 1]!;
      const gap = it.bbox.x - (prev.bbox.x + prev.bbox.w);
      if (gap > it.capHeight * 0.22) out += ' ';
    }
    out += it.char ?? it.text ?? '';
  }
  return out.trim();
}

/**
 * CL-R-49 — role assignment.
 *   tallest typographic = CL-E-01 primary
 *   25–40% of primary on its own baseline = CL-E-03 tagline
 *   70–100% of primary, own baseline = CL-E-02 secondary
 *   non-typographic = CL-E-04
 *   short word at a different scale = CL-E-05
 *   smallest copy, contact-shaped = CL-E-06
 */
export function assignRoles(protos: ProtoElement[], th: ThresholdStore): ProtoElement[] {
  const typographic = protos.filter((p) => p.typographic);
  const primary = typographic.reduce<ProtoElement | undefined>(
    (best, p) => (!best || p.capHeight > best.capHeight ? p : best), undefined,
  );
  const P = primary?.capHeight ?? 0;

  const tagMax = th.get('role.tagline.max_ratio');
  const secMin = th.get('role.secondary.min_ratio');

  for (const p of protos) {
    if (!p.typographic) { p.role = 'CL-E-04'; continue; }
    if (p === primary) { p.role = 'CL-E-01'; continue; }

    const ratio = P > 0 ? p.capHeight / P : 1;
    const words = p.content.trim().split(/\s+/);
    const isShortWord = words.length === 1 && (p.content.length <= 3 || ARTICLES.has(p.content.toLowerCase()));

    // §3.1 recognises CL-E-06 by CONTENT — "phone, web address, hours, suite
    // number" — not by size. The 25–40% band for a tagline is "typically",
    // so copy below it is still a tagline unless it reads like a contact line.
    // The KB's own worked example is a 4" tagline under 24" primary (17%).
    if (CONTACT_RE.test(p.content)) p.role = 'CL-E-06';
    else if (isShortWord && Math.abs(ratio - 1) > th.get('grouping.cap_height_tolerance')) p.role = 'CL-E-05';
    else if (ratio >= secMin && ratio <= 1.0) p.role = 'CL-E-02';
    else if (ratio <= tagMax) p.role = 'CL-E-03';
    else p.role = 'CL-E-02';
  }
  return protos;
}
