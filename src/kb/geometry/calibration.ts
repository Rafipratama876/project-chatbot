/**
 * Photo → inches.
 *
 * The user draws one reference of known length on the building photo (a door,
 * a course of block, a bay), then places the logo. Everything after that — the
 * cap heights §6.1 tests, the sq ft §6.4 checks against the permitted area,
 * the return depth drawn in perspective — depends on this one scale being
 * right, so it is derived from the reference rather than assumed.
 *
 * This is deliberately not a guess about the photo. It is arithmetic on a
 * measurement the user supplied, and the proof states the reference it used.
 */
import type { Pt, Rect } from '../domain/spec.js';
import type { Inches } from '../domain/units.js';
import { solveHomography as solveHomographyBase, HomographyError } from './homography.js';

export interface ScaleReference {
  /** The two endpoints the user dragged, in image pixels. */
  a: Pt;
  b: Pt;
  /** What that distance is in the real world. */
  inches: Inches;
  /** What they measured, e.g. "garage door width". Printed on the proof. */
  label?: string;
}

/** Where the logo goes, in image pixels, as drawn by the user. */
export interface PlacementRect { x: number; y: number; w: number; h: number }

export interface Calibration {
  pixelsPerInch: number;
  reference: ScaleReference;
  /** Image dimensions, so a stored placement survives a re-render at any size. */
  imageWidth: number;
  imageHeight: number;
}

export interface Placement {
  calibration: Calibration;
  rect: PlacementRect;
  /**
   * Optional facade corners in image pixels, clockwise from top-left. Supplied
   * when the wall is not square to the camera; the composite is warped through
   * the homography they define.
   */
  facadeQuad?: [Pt, Pt, Pt, Pt];
}

export class CalibrationError extends Error {}

export function calibrate(
  reference: ScaleReference,
  imageWidth: number,
  imageHeight: number,
): Calibration {
  const pixels = Math.hypot(reference.b.x - reference.a.x, reference.b.y - reference.a.y);
  if (pixels < 1) {
    throw new CalibrationError('the scale reference is shorter than a pixel — draw it across something you can measure');
  }
  if (reference.inches <= 0) {
    throw new CalibrationError('the scale reference needs a real-world length in inches');
  }
  return { pixelsPerInch: pixels / reference.inches, reference, imageWidth, imageHeight };
}

/** The size the placed logo actually is, in inches. */
export function placementSize(placement: Placement): { width: Inches; height: Inches } {
  const ppi = placement.calibration.pixelsPerInch;
  return { width: placement.rect.w / ppi, height: placement.rect.h / ppi };
}

export const pxToInches = (px: number, c: Calibration): Inches => px / c.pixelsPerInch;
export const inchesToPx = (inches: Inches, c: Calibration): number => inches * c.pixelsPerInch;

/**
 * Scale factor to apply to imported artwork so it fills the placement.
 *
 * Aspect is preserved and the artwork is fitted, never stretched: §9.2 says
 * "per-item proportions match the measured values — do not re-proportion". A
 * placement rect the user dragged to a slightly different aspect is their
 * intent about size, not a licence to distort the mark.
 */
export function fitArtwork(
  artworkSize: { w: number; h: number },
  placement: Placement,
): { scale: number; width: Inches; height: Inches; letterboxed: 'width' | 'height' | 'exact' } {
  const target = placementSize(placement);
  if (artworkSize.w <= 0 || artworkSize.h <= 0) {
    throw new CalibrationError('artwork has no extent to fit');
  }

  const byWidth = target.width / artworkSize.w;
  const byHeight = target.height / artworkSize.h;
  const scale = Math.min(byWidth, byHeight);
  const ratio = byWidth / byHeight;

  return {
    scale,
    width: artworkSize.w * scale,
    height: artworkSize.h * scale,
    letterboxed: Math.abs(ratio - 1) < 0.01 ? 'exact' : byWidth < byHeight ? 'width' : 'height',
  };
}

/**
 * Where the sign's own coordinate origin lands on the photo.
 *
 * The scene is built y-up in inches with its origin at the sign's bottom-left;
 * the photo is y-down in pixels from its top-left. The composite needs the
 * bottom-left corner of the fitted artwork in image pixels.
 */
export function anchorPx(
  fitted: { width: Inches; height: Inches },
  placement: Placement,
): Pt {
  const ppi = placement.calibration.pixelsPerInch;
  const w = fitted.width * ppi;
  const h = fitted.height * ppi;
  return {
    x: placement.rect.x + (placement.rect.w - w) / 2,
    y: placement.rect.y + (placement.rect.h + h) / 2,
  };
}

/**
 * Sanity checks the KB cares about, run before the engine so a bad calibration
 * is reported as a bad calibration rather than as a strange sign.
 */
export interface CalibrationWarning { code: string; message: string }

export function checkCalibration(placement: Placement, artworkAspect: number): CalibrationWarning[] {
  const warnings: CalibrationWarning[] = [];
  const size = placementSize(placement);
  const { reference, imageWidth } = placement.calibration;

  const refPx = Math.hypot(reference.b.x - reference.a.x, reference.b.y - reference.a.y);
  if (refPx < imageWidth * 0.08) {
    warnings.push({
      code: 'short-reference',
      message:
        `The scale reference spans ${Math.round(refPx)} px of a ${imageWidth} px image. ` +
        'A short reference multiplies its own error across the whole sign — measure across something wider.',
    });
  }

  if (size.height < 2) {
    warnings.push({
      code: 'tiny-placement',
      message: `The placement is ${size.height.toFixed(1)}″ tall, below the 2″ minimum for any dimensional build (§3.5).`,
    });
  }
  if (size.width > 12 * 40) {
    warnings.push({
      code: 'implausible-placement',
      message: `The placement is ${(size.width / 12).toFixed(0)} ft wide. Check the scale reference — this is usually a mistyped measurement.`,
    });
  }

  const placedAspect = placement.rect.w / placement.rect.h;
  if (Math.abs(placedAspect / artworkAspect - 1) > 0.15) {
    warnings.push({
      code: 'aspect-mismatch',
      message:
        `The placement box is ${placedAspect.toFixed(2)}:1 but the artwork is ${artworkAspect.toFixed(2)}:1. ` +
        'The mark is fitted inside the box without distortion (§9.2), so it will not fill it.',
    });
  }

  return warnings;
}

/**
 * Homography from the sign's own inch-space rectangle to four image points.
 * Used when the facade is angled: the composited sprite is warped through it,
 * so the return depth and the standoff gap read at the same angle as the wall.
 *
 * Re-exported rather than implemented here. The wizard's preview aliases the
 * same module, so the box someone drags and the sign the renderer places are
 * mapped by one implementation instead of two that can drift apart.
 */
export { applyHomography } from './homography.js';

export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  // Wrapped, not re-exported bare. Every caller in the engine catches
  // CalibrationError, and a degenerate quad is a calibration failure whichever
  // module noticed it — letting a second error type escape here would slip
  // past those handlers and surface as an unhandled crash.
  try {
    return solveHomographyBase(src, dst);
  } catch (error) {
    if (error instanceof HomographyError) throw new CalibrationError(error.message);
    throw error;
  }
}


/** The rect an imported artwork occupies, for `fitArtwork`. */
export const artworkExtent = (items: Array<{ bbox: Rect }>): { w: number; h: number } => {
  if (items.length === 0) return { w: 0, h: 0 };
  const x1 = Math.min(...items.map((i) => i.bbox.x));
  const y1 = Math.min(...items.map((i) => i.bbox.y));
  const x2 = Math.max(...items.map((i) => i.bbox.x + i.bbox.w));
  const y2 = Math.max(...items.map((i) => i.bbox.y + i.bbox.h));
  return { w: x2 - x1, h: y2 - y1 };
};
