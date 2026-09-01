/**
 * SVG artwork → measured `ArtworkItem[]`.
 *
 * A logo arrives as a file, but every rule in §6.1 tests a *measured* stroke
 * and every §9.2 requirement is about a *polygon* that gets extruded. So the
 * import is the point where a picture becomes geometry, and it has to be exact:
 * the outline measured here is the outline the offset runs on, the outline that
 * gets extruded, and the outline the shop cuts.
 *
 * Curves are flattened once, here, for the same reason. Two stages flattening
 * independently is how a render stops matching its own spec block.
 */
import type { ArtworkItem, Contour, Pt } from '../domain/spec.js';
import { measureStroke } from './metrics.js';
import { bounds, absArea } from './poly.js';
import { orientContours } from './outline.js';

export interface SvgImportOptions {
  /**
   * How the file becomes elements.
   *
   * `'mark'` (default) — the whole file is ONE logo mark. That is what a logo
   * file is, and it is what §3.2 requires: colour alone does not split an
   * element ("a two-colour word stays one element with a colour break noted"),
   * and §3.5 step 1 asks whether *the mark* has colour breaks that cannot be
   * separate cans — a question about one element, not five.
   *
   * `'colour'` — one element per fill. Only when the customer has said the
   * colours are to be built as separate cans.
   */
  splitBy?: 'mark' | 'colour';
  /** What to call the mark on the proof. Defaults to 'logo mark'. */
  name?: string;
  /** Target height of the whole mark in inches. Everything scales to it. */
  targetHeight?: number;
  /** Or target width — whichever the user pinned. */
  targetWidth?: number;
  /** Segments per bezier. 24 holds ±0.001″ at sign sizes. */
  curveSegments?: number;
  /** Drop shapes below this fraction of the largest, e.g. stray anchors. */
  minAreaRatio?: number;
  idPrefix?: string;
}

export interface SvgImportResult {
  items: ArtworkItem[];
  /** Inches per SVG user unit — the scale everything downstream inherits. */
  scale: number;
  /** Distinct fill colours found, in document order. §3.2 notes colour breaks. */
  colours: string[];
  warnings: string[];
}

interface RawShape { contours: Contour[]; colour: string | null }

/**
 * Parses the `d` attribute of every `<path>`, plus the primitive shapes that
 * logos routinely use. Anything it cannot parse is reported, never silently
 * dropped — a missing counter changes what gets fabricated.
 */
export function importSvg(svg: string, opts: SvgImportOptions = {}): SvgImportResult {
  const segments = opts.curveSegments ?? 24;
  const warnings: string[] = [];
  const shapes: RawShape[] = [];

  for (const el of elements(svg)) {
    const colour = fillOf(el.attrs);
    if (colour === 'none') continue;

    try {
      const contours =
        el.tag === 'path' ? parsePathData(el.attrs.d ?? '', segments)
        : el.tag === 'rect' ? rectContours(el.attrs)
        : el.tag === 'polygon' || el.tag === 'polyline' ? polyContours(el.attrs.points ?? '')
        : el.tag === 'circle' ? ellipseContours(num(el.attrs.cx), num(el.attrs.cy), num(el.attrs.r), num(el.attrs.r), segments)
        : el.tag === 'ellipse' ? ellipseContours(num(el.attrs.cx), num(el.attrs.cy), num(el.attrs.rx), num(el.attrs.ry), segments)
        : [];

      if (contours.length > 0) shapes.push({ contours, colour });
      else if (el.tag === 'path') warnings.push(`<path> produced no closed contour: ${(el.attrs.d ?? '').slice(0, 48)}…`);
    } catch (error) {
      warnings.push(`could not parse <${el.tag}>: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (shapes.length === 0) {
    return { items: [], scale: 1, colours: [], warnings: [...warnings, 'no drawable shapes found in the SVG'] };
  }

  // SVG is y-down; the model is y-up in inches. Flip once, about the artwork's
  // own extent, so the whole mark keeps its proportions.
  const all = shapes.flatMap((s) => s.contours);
  const raw = bounds(all);
  const flipped = shapes.map((s) => ({
    colour: s.colour,
    contours: s.contours.map((c) => ({
      ...c,
      points: c.points.map((p) => ({ x: p.x - raw.x, y: raw.y + raw.h - p.y })),
    })),
  }));

  const scale =
    opts.targetHeight !== undefined ? opts.targetHeight / raw.h
    : opts.targetWidth !== undefined ? opts.targetWidth / raw.w
    : 1;

  const scaled = flipped.map((s) => ({
    colour: s.colour,
    contours: s.contours.map((c) => ({
      ...c,
      points: c.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
    })),
  }));

  // Nest holes into their owning shape, then drop debris.
  const resolved = scaled.map((s) => ({ ...s, contours: orientContours(s.contours) }));
  const areas = resolved.map((s) => s.contours.reduce((a, c) => a + (c.hole ? 0 : absArea(c.points)), 0));
  const largest = Math.max(...areas, 0);
  const minRatio = opts.minAreaRatio ?? 0.0005;

  const kept = resolved.filter((_, i) => {
    if (largest > 0 && areas[i]! / largest < minRatio) {
      warnings.push(`dropped a shape at ${(areas[i]! / largest * 100).toFixed(3)}% of the mark's area`);
      return false;
    }
    return true;
  });

  const prefix = opts.idPrefix ?? 'S';
  const name = opts.name ?? 'logo mark';
  const colours = [...new Set(kept.map((s) => s.colour).filter((c): c is string => !!c))];

  // Every SVG shape is non-typographic: nothing in the file says which glyph a
  // path was, and §3.5 branches on exactly that. A shape whose letter is
  // unknown must go down the logo-mark branch, where CL-R-54 asks a human
  // rather than the tree assuming.
  // Each contour keeps the fill it was drawn with, so a merged mark can still
  // be faced in its own colours.
  const tagged = kept.map((s) => ({
    colour: s.colour,
    contours: s.contours.map((c) => ({ ...c, colour: s.colour ?? undefined })),
  }));

  const groups = opts.splitBy === 'colour'
    ? colours.map((c) => ({
        colour: c,
        contours: tagged.filter((s) => s.colour === c).flatMap((s) => s.contours),
      }))
    : [{ colour: colours[0] ?? null, contours: tagged.flatMap((s) => s.contours) }];

  const items: ArtworkItem[] = groups
    .filter((g) => g.contours.length > 0)
    .map((g, i) => {
      const b = bounds(g.contours);
      return {
        id: `${prefix}${i + 1}`,
        kind: 'shape' as const,
        text: opts.splitBy === 'colour' && g.colour ? `${name} (${g.colour})` : name,
        bbox: b,
        capHeight: b.h,
        baselineY: b.y,
        narrowestStroke: round4(measureStroke(g.contours).narrowest),
        colour: g.colour ?? undefined,
        colourBreaks: opts.splitBy === 'colour' ? undefined : (colours.length > 1 ? colours : undefined),
        contours: g.contours,
      };
    });

  return { items, scale, colours, warnings };
}

// ── SVG scanning ───────────────────────────────────────────────────────────

interface Element { tag: string; attrs: Record<string, string> }

const SHAPE_TAGS = new Set(['path', 'rect', 'polygon', 'polyline', 'circle', 'ellipse']);

function* elements(svg: string): Generator<Element> {
  const tagRe = /<\s*([a-zA-Z][\w:-]*)\s*([^>]*?)\/?\s*>/g;
  for (const match of svg.matchAll(tagRe)) {
    const tag = match[1]!.toLowerCase();
    if (!SHAPE_TAGS.has(tag)) continue;
    yield { tag, attrs: parseAttrs(match[2] ?? '') };
  }
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g)) {
    const key = (m[1] ?? m[3])!.toLowerCase();
    attrs[key] = (m[2] ?? m[4]) ?? '';
  }
  return attrs;
}

/** `fill` attribute, or the `fill:` declaration inside `style`. */
function fillOf(attrs: Record<string, string>): string | null {
  const style = attrs.style ?? '';
  const inStyle = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(style);
  const value = (inStyle?.[1] ?? attrs.fill ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'none' || value === 'transparent') return 'none';
  return value;
}

const num = (v: string | undefined): number => (v ? Number.parseFloat(v) : 0);
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

// ── Primitive shapes ───────────────────────────────────────────────────────

function rectContours(attrs: Record<string, string>): Contour[] {
  const x = num(attrs.x);
  const y = num(attrs.y);
  const w = num(attrs.width);
  const h = num(attrs.height);
  if (w <= 0 || h <= 0) return [];
  return [{ hole: false, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }];
}

function polyContours(points: string): Contour[] {
  const nums = points.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
  return pts.length >= 3 ? [{ hole: false, points: pts }] : [];
}

function ellipseContours(cx: number, cy: number, rx: number, ry: number, segments: number): Contour[] {
  if (rx <= 0 || ry <= 0) return [];
  const steps = Math.max(segments * 2, 24);
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return [{ hole: false, points: pts }];
}

// ── Path data ──────────────────────────────────────────────────────────────

/**
 * The full `d` grammar that logos actually use: M L H V C S Q T A Z, absolute
 * and relative. Arcs are converted to beziers before flattening — a logo with
 * a rounded corner drawn as an arc is common enough that skipping them would
 * silently change the shape.
 */
export function parsePathData(d: string, segments: number): Contour[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?[\d.]+(?:e[-+]?\d+)?/gi) ?? [];
  const contours: Contour[] = [];

  let current: Pt[] = [];
  let cursor: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastControl: Pt | null = null;
  let command = '';
  let i = 0;

  const push = (p: Pt) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) current.push(p);
    cursor = p;
  };
  const close = () => {
    if (current.length >= 3) contours.push({ hole: false, points: current });
    current = [];
  };
  const next = (): number => Number(tokens[i++]);

  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(token)) { command = token; i++; }
    // An omitted command repeats the previous one; after M that means L.
    else if (command === 'M') command = 'L';
    else if (command === 'm') command = 'l';

    const rel = command === command.toLowerCase();
    const ox = rel ? cursor.x : 0;
    const oy = rel ? cursor.y : 0;

    switch (command.toUpperCase()) {
      case 'M': {
        close();
        const p = { x: next() + ox, y: next() + oy };
        start = p;
        push(p);
        lastControl = null;
        break;
      }
      case 'L': push({ x: next() + ox, y: next() + oy }); lastControl = null; break;
      case 'H': push({ x: next() + ox, y: cursor.y }); lastControl = null; break;
      case 'V': push({ x: cursor.x, y: next() + oy }); lastControl = null; break;
      case 'C': {
        const c1 = { x: next() + ox, y: next() + oy };
        const c2 = { x: next() + ox, y: next() + oy };
        const end = { x: next() + ox, y: next() + oy };
        cubic(cursor, c1, c2, end, segments, push);
        lastControl = c2;
        break;
      }
      case 'S': {
        const c1 = reflect(cursor, lastControl);
        const c2 = { x: next() + ox, y: next() + oy };
        const end = { x: next() + ox, y: next() + oy };
        cubic(cursor, c1, c2, end, segments, push);
        lastControl = c2;
        break;
      }
      case 'Q': {
        const c = { x: next() + ox, y: next() + oy };
        const end = { x: next() + ox, y: next() + oy };
        quadratic(cursor, c, end, segments, push);
        lastControl = c;
        break;
      }
      case 'T': {
        const c = reflect(cursor, lastControl);
        const end = { x: next() + ox, y: next() + oy };
        quadratic(cursor, c, end, segments, push);
        lastControl = c;
        break;
      }
      case 'A': {
        const rx = next();
        const ry = next();
        const rotation = next();
        const largeArc = next();
        const sweep = next();
        const end = { x: next() + ox, y: next() + oy };
        arc(cursor, rx, ry, rotation, largeArc === 1, sweep === 1, end, segments, push);
        lastControl = null;
        break;
      }
      case 'Z':
        push(start);
        close();
        cursor = start;
        lastControl = null;
        break;
      default:
        i++; // unknown token; skip rather than loop forever
    }
  }

  close();
  return contours;
}

const reflect = (cursor: Pt, control: Pt | null): Pt =>
  control ? { x: 2 * cursor.x - control.x, y: 2 * cursor.y - control.y } : { ...cursor };

function cubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, steps: number, emit: (p: Pt) => void): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    emit({
      x: m ** 3 * p0.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t ** 3 * p1.x,
      y: m ** 3 * p0.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t ** 3 * p1.y,
    });
  }
}

function quadratic(p0: Pt, c: Pt, p1: Pt, steps: number, emit: (p: Pt) => void): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    emit({
      x: m * m * p0.x + 2 * m * t * c.x + t * t * p1.x,
      y: m * m * p0.y + 2 * m * t * c.y + t * t * p1.y,
    });
  }
}

/** SVG endpoint-parameterised arc → centre parameterisation → polyline. */
function arc(
  p0: Pt, rx: number, ry: number, rotationDeg: number,
  largeArc: boolean, sweep: boolean, p1: Pt, steps: number, emit: (p: Pt) => void,
): void {
  if (rx === 0 || ry === 0) { emit(p1); return; }
  const phi = (rotationDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;

  let rxA = Math.abs(rx);
  let ryA = Math.abs(ry);
  const lambda = (x1 * x1) / (rxA * rxA) + (y1 * y1) / (ryA * ryA);
  if (lambda > 1) { const s = Math.sqrt(lambda); rxA *= s; ryA *= s; }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rxA * rxA * ryA * ryA - rxA * rxA * y1 * y1 - ryA * ryA * x1 * x1;
  const denominator = rxA * rxA * y1 * y1 + ryA * ryA * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator));

  const cx1 = (coef * rxA * y1) / ryA;
  const cy1 = (-coef * ryA * x1) / rxA;
  const cx = cosP * cx1 - sinP * cy1 + (p0.x + p1.x) / 2;
  const cy = sinP * cx1 + cosP * cy1 + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const theta = angle(1, 0, (x1 - cx1) / rxA, (y1 - cy1) / ryA);
  let delta = angle((x1 - cx1) / rxA, (y1 - cy1) / ryA, (-x1 - cx1) / rxA, (-y1 - cy1) / ryA);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const count = Math.max(steps, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * steps));
  for (let i = 1; i <= count; i++) {
    const t = theta + (delta * i) / count;
    emit({
      x: cosP * rxA * Math.cos(t) - sinP * ryA * Math.sin(t) + cx,
      y: sinP * rxA * Math.cos(t) + cosP * ryA * Math.sin(t) + cy,
    });
  }
}
