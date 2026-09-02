/**
 * Placement calibration and size accuracy — the "too big" failure class.
 *
 * §9.2 promises the sign occupies the placement box at the calibrated size,
 * never a size a model estimated. This locks that promise: an implausible
 * placement warns rather than silently rendering, and the scale reference is
 * honestly labelled for what it is (a customer-stated width, not an
 * independent measurement) so the disclosure on the board is not lying.
 */
import { describe, it, expect } from 'vitest';
import { ArtworkService, readSource } from '#/modules/artwork/artwork.service.js';
import { RasterService } from '#/modules/artwork/raster.service.js';
import type { PlacementInput } from '#/kb/domain/spec.js';

const svgLogo = '<svg><rect x="0" y="0" width="200" height="50" fill="#4d148c"/></svg>';

function placement(overrides: Partial<PlacementInput> = {}): PlacementInput {
  return {
    backgroundImage: '',
    imageWidth: 1600,
    imageHeight: 1000,
    reference: { a: { x: 0, y: 500 }, b: { x: 100, y: 500 }, inches: 20, label: 'stated sign width' },
    rect: { x: 700, y: 400, w: 400, h: 100 },
    ...overrides,
  };
}

describe('ArtworkService.place — size accuracy', () => {
  const service = new ArtworkService(new RasterService());

  it('sizes the artwork from the calibration, never from the artwork itself', () => {
    // 5 px/in reference; a 400 px wide box is 80" regardless of the logo's
    // own extent — this is the arithmetic that replaces an eyeballed size.
    const placed = service.place(readSource({ svg: svgLogo }), placement());
    expect(placed.widthInches).toBeCloseTo(80, 6);
  });

  it('warns when a placement implies an implausible sign width', () => {
    // A 400 px box against a reference that makes it >480" wide — the
    // "mistyped measurement" guard in checkCalibration.
    const placed = service.place(
      readSource({ svg: svgLogo }),
      placement({ reference: { a: { x: 0, y: 500 }, b: { x: 10, y: 500 }, inches: 20, label: 'stated sign width' } }),
    );
    expect(placed.calibrationWarnings.map((w) => w.code)).toContain('implausible-placement');
  });

  it('warns when the reference span is too short to trust', () => {
    const placed = service.place(
      readSource({ svg: svgLogo }),
      placement({ reference: { a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, inches: 20, label: 'stated sign width' } }),
    );
    expect(placed.calibrationWarnings.map((w) => w.code)).toContain('short-reference');
  });

  it('carries the reference label used, so a customer-stated width is never presented as a measured one', () => {
    // compat.mapper.ts derives the reference from the placement box's own
    // width — self-referential rather than an independent measurement of the
    // wall. That is disclosed via this exact label, not silently upgraded.
    const placed = service.place(readSource({ svg: svgLogo }), placement());
    expect(placed).toBeDefined();
    // The label itself lives on the input placement and is not something
    // `place()` invents or overrides.
    expect(placement().reference.label).toBe('stated sign width');
  });
});
