/**
 * KB Layer 10 — letter visibility chart `[SP]`. A lookup table.
 * Used to sanity-check copy size and to write the design-guidance note (§9.5).
 */
import type { Inches } from './units.js';

export interface VisibilityRow { height: Inches; bestImpactFt: number; maxReadableFt: number }

export const VISIBILITY_CHART: VisibilityRow[] = [
  { height: 3, bestImpactFt: 30, maxReadableFt: 100 },
  { height: 4, bestImpactFt: 40, maxReadableFt: 150 },
  { height: 6, bestImpactFt: 60, maxReadableFt: 200 },
  { height: 8, bestImpactFt: 80, maxReadableFt: 350 },
  { height: 10, bestImpactFt: 100, maxReadableFt: 450 },
  { height: 12, bestImpactFt: 120, maxReadableFt: 525 },
  { height: 15, bestImpactFt: 150, maxReadableFt: 630 },
  { height: 18, bestImpactFt: 180, maxReadableFt: 750 },
  { height: 24, bestImpactFt: 240, maxReadableFt: 1000 },
  { height: 30, bestImpactFt: 300, maxReadableFt: 1250 },
  { height: 36, bestImpactFt: 360, maxReadableFt: 1500 },
  { height: 48, bestImpactFt: 480, maxReadableFt: 2000 },
  { height: 60, bestImpactFt: 600, maxReadableFt: 2500 },
];

/** Exact chart row, or linear interpolation between the two nearest rows. */
export function visibilityFor(capHeight: Inches): VisibilityRow {
  const rows = VISIBILITY_CHART;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (capHeight <= first.height) return { ...first, height: capHeight };
  if (capHeight >= last.height) {
    return { height: capHeight, bestImpactFt: capHeight * 10, maxReadableFt: Math.round((last.maxReadableFt / last.height) * capHeight) };
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (capHeight >= a.height && capHeight <= b.height) {
      const t = (capHeight - a.height) / (b.height - a.height);
      return {
        height: capHeight,
        bestImpactFt: Math.round(a.bestImpactFt + t * (b.bestImpactFt - a.bestImpactFt)),
        maxReadableFt: Math.round(a.maxReadableFt + t * (b.maxReadableFt - a.maxReadableFt)),
      };
    }
  }
  return { ...last, height: capHeight };
}

/** §10: best-impact distance ≈ 10 ft per inch of letter height. */
export const bestImpactFt = (capHeight: Inches): number => capHeight * 10;
