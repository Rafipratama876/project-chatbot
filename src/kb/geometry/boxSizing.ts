/**
 * KB §3.6 — pill box and logo box sizing `[DER]`, and CL-R-55 / CL-R-56.
 *
 * Every number is read from the threshold store, because §3.6 is tagged [DER]:
 * derived, confirm if wrong. The formula itself is `max(cap + 2·margin, min)`.
 */
import type { Inches } from '../domain/units.js';
import type { BoxSpec, Rect } from '../domain/spec.js';
import type { ThresholdStore } from '../domain/thresholds.js';

export interface BoxSizingInput {
  copyCapHeight: Inches;
  copyBBox: Rect;
  /** §3.6: box depth matches the letter return depth. CL-R-56 enforces it. */
  letterReturnDepth: Inches;
  shape?: BoxSpec['shape'];
  faceColour: string;
  returnColour: string;
}

export interface BoxSizing {
  box: BoxSpec;
  /** Thresholds read, for the [DER] footnote on the proof. */
  thresholdKeys: string[];
  /** True when the minimum, not the copy, drove the height. */
  minimumGoverned: boolean;
}

export function sizeBox(input: BoxSizingInput, th: ThresholdStore): BoxSizing {
  const margin = th.get('box.copy_margin');
  const minH = th.get('box.min_height');
  const radMin = th.get('box.corner_radius.rounded_min');

  const fromCopy = input.copyCapHeight + 2 * margin;
  const h = Math.max(fromCopy, minH);

  const shape = input.shape ?? 'capsule';
  const w = input.copyBBox.w + 2 * margin;
  const cornerRadius =
    shape === 'capsule' ? h / 2
    : shape === 'rounded-rectangle' ? radMin
    : 0;

  return {
    box: {
      shape,
      w,
      h,
      depth: input.letterReturnDepth, // §3.6 + CL-R-56: faces sit in one plane
      cornerRadius,
      faceColour: input.faceColour,
      returnColour: input.returnColour,
    },
    thresholdKeys: ['box.copy_margin', 'box.min_height', 'box.corner_radius.rounded_min'],
    minimumGoverned: minH > fromCopy,
  };
}

/** CL-R-55 predicate: is this box under-sized? */
export function boxUndersized(box: BoxSpec, copyCapHeight: Inches, th: ThresholdStore): boolean {
  const required = Math.max(copyCapHeight + 2 * th.get('box.copy_margin'), th.get('box.min_height'));
  return box.h < required - 1e-6;
}
