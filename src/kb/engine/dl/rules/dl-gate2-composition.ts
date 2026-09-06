/**
 * DL GATE 2 — composition.
 *
 * The PDF's Dimensional Letters scope is, overwhelmingly, one name or mark
 * (a business name, a house number, a logotype) rather than the multi-role
 * hierarchy (primary/secondary/tagline/logo/legal) Channel Letters' §3.1
 * defines for a full storefront sign — so there is no role/hierarchy concept
 * here, deliberately simpler than CL-R-48/§3.2.
 *
 * There IS still a decomposition, though: a dimensional letter is one
 * uniform material per PIECE (cast, cut or molded as one solid), not per
 * sign — a real shop building a multi-colour mark fabricates one piece per
 * colour and assembles them, exactly the way a two-colour channel-letter
 * word is two cans. So DL-COMP-01 groups the measured artwork BY COLOUR:
 * every contour that shares a colour becomes one element; a mark drawn in
 * one colour still yields one element, unchanged from before. What changed
 * is that a multi-colour mark no longer collapses onto whichever colour the
 * artwork extraction happened to list first — that discarded the rest of
 * the design instead of representing it.
 */
import type { ArtworkItem, Contour, Rect } from '../../../domain/spec.js';
import type { DLElement } from '../../../domain/dl-spec.js';
import { dlBboxOf } from '../../../domain/dl-spec.js';
import type { DLRule } from '../dl-rule.js';
import { DL_GATES } from '../dl-gates.js';

/** More elements than this from one job is almost certainly trace noise, not real colour separations. */
const UNUSUAL_ELEMENT_COUNT = 6;

interface ContourRef { itemId: string; item: ArtworkItem; contour: Contour }

const flattenContours = (items: ArtworkItem[]): ContourRef[] =>
  items.flatMap((item) => item.contours.map((contour) => ({ itemId: item.id, item, contour })));

/** Contour colour wins over the item's own — a traced multi-colour mark commonly carries colour per contour. */
const colourOf = (ref: ContourRef): string | undefined => ref.contour.colour ?? ref.item.colour;

function boundsOfContours(contours: Contour[]): Rect {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const c of contours) for (const p of c.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Text where there is any; "Mark N" for a colour group that is pure graphic (an icon, not a glyph). */
function labelFor(items: ArtworkItem[], index: number): string {
  const text = items.map((i) => i.text ?? i.char ?? '').join('').trim();
  return text || `Mark ${index + 1}`;
}

export const DL_COMP_01: DLRule = {
  id: 'DL-COMP-01', gate: DL_GATES.COMPOSITION, tier: 'SPEC', severity: 'NOTE',
  kbRef: 'v1 scope: one element per colour', title: 'Group measured artwork into one dimensional-letters element per colour',
  applies: (ctx) => ctx.spec.elements.length === 0 && ctx.spec.artwork.length > 0,
  run(ctx) {
    const items = ctx.spec.artwork;
    const overall = dlBboxOf(items);

    const groups = new Map<string, ContourRef[]>();
    const order: string[] = [];
    for (const ref of flattenContours(items)) {
      const key = colourOf(ref) ?? '';
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(ref);
    }

    const elements: DLElement[] = order.map((colour, i) => {
      const refs = groups.get(colour)!;
      const groupItems = [...new Set(refs.map((r) => r.item))];
      const contours = refs.map((r) => r.contour);
      return {
        id: `dl-el-${i + 1}`,
        content: labelFor(groupItems, i),
        itemIds: [...new Set(refs.map((r) => r.itemId))],
        bbox: boundsOfContours(contours),
        baselineY: Math.min(...groupItems.map((it) => it.baselineY)),
        capHeight: Math.max(...groupItems.map((it) => it.capHeight)),
        contours,
        colour: colour || undefined, // '' means no colour info at all on that contour — DL-DEF-02 defaults it
        lit: false,
      };
    });

    ctx.set('elements', elements, {
      message: elements.length > 1
        ? `Grouped ${items.length} artwork item(s) into ${elements.length} dimensional-letters elements, one per colour: ${elements.map((e) => `"${e.content}"${e.colour ? ` (${e.colour})` : ''}`).join(', ')}.`
        : `Grouped ${items.length} artwork item(s) into one dimensional-letters element${elements[0]?.colour ? ` (${elements[0].colour})` : ''}.`,
    });
    ctx.set('overall', { w: overall.w, h: overall.h }, {
      message: `Overall size ${overall.w.toFixed(1)}″ × ${overall.h.toFixed(1)}″.`,
    });

    if (elements.length > UNUSUAL_ELEMENT_COUNT) {
      ctx.note(
        `Artwork decomposed into ${elements.length} colour-based elements — unusually many for one job. `
        + 'If this came from a raster trace, check for anti-aliasing noise rather than real colour separations '
        + 'before this ships as a fabrication count.',
        { severity: 'WARN' },
      );
    }
  },
};

export const DL_GATE2_RULES: DLRule[] = [DL_COMP_01];
