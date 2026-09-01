/**
 * All internal geometry is in INCHES. One three.js world unit == one inch.
 * Clipper works on integers, so geometry crossing the offset layer is scaled
 * by CLIPPER_SCALE and back. Never store a value in mixed units.
 */
export type Inches = number;

export const CLIPPER_SCALE = 1000; // 0.001" resolution

export const inch = (n: number): Inches => n;
export const mm = (n: number): Inches => n / 25.4;
export const ft = (n: number): Inches => n * 12;

/** 1.5 -> `1-1/2"`; used by the spec block and by callouts. */
export function formatInches(v: Inches, denom = 16): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const whole = Math.floor(a + 1e-9);
  let num = Math.round((a - whole) * denom);
  let d = denom;
  if (num === denom) return `${neg ? '-' : ''}${whole + 1}"`;
  while (num > 0 && num % 2 === 0 && d % 2 === 0) { num /= 2; d /= 2; }
  const sign = neg ? '-' : '';
  if (num === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${num}/${d}"`;
  return `${sign}${whole}-${num}/${d}"`;
}

export function formatRange(a: Inches, b: Inches): string {
  return `${formatInches(a).replace(/"$/, '')}″–${formatInches(b)}`;
}

export const round = (v: number, places = 4): number => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};
