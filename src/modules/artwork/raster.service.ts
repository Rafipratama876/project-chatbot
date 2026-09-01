import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { traceImage, MIN_TRACE_CONFIDENCE, type RasterImage, type TraceQuality } from '#/kb/geometry/trace.js';
import type { ArtworkItem, Contour } from '#/kb/domain/spec.js';
import { bounds } from '#/kb/geometry/poly.js';
import { measureStroke } from '#/kb/geometry/metrics.js';

export interface TracedArtwork {
  items: ArtworkItem[];
  colours: string[];
  extent: { w: number; h: number };
  quality: TraceQuality;
  /** Plain-language warnings, headed for §9.4. */
  warnings: string[];
}

/** Ceiling on decoded pixels — a 40 MP phone photo is not a logo. */
const MAX_PIXELS = 12_000_000;

@Injectable()
export class RasterService {
  private readonly logger = new Logger(RasterService.name);

  static supports(mime: string): boolean {
    return /^image\/(png|jpe?g)$/i.test(mime);
  }

  /**
   * PNG or JPEG → contours.
   *
   * The result is an inference, not a measurement, and it is labelled as one.
   * §6.1 tests the narrowest stroke against a 1/50″ tolerance; measured off a
   * traced outline that number carries the trace's own error, and on a small or
   * blurry source the error is larger than the thing being tested. So the trace
   * reports a confidence and the caller decides — nothing here quietly promotes
   * a screenshot to a fabrication outline.
   */
  trace(
    buffer: Buffer,
    mime: string,
    opts: { name?: string; targetWidth?: number; targetHeight?: number } = {},
  ): TracedArtwork {
    const image = this.decode(buffer, mime);
    const result = traceImage(image);

    if (result.contours.length === 0) {
      throw new BadRequestException(
        `Nothing traceable in the image. ${result.quality.notes.join(' ')}`.trim(),
      );
    }

    // Image space is y-down and in pixels; the model is y-up and in inches.
    const raw = bounds(result.contours);
    const scale =
      opts.targetWidth !== undefined ? opts.targetWidth / raw.w
      : opts.targetHeight !== undefined ? opts.targetHeight / raw.h
      : 1;

    const contours: Contour[] = result.contours.map((c) => ({
      ...c,
      points: c.points.map((p) => ({
        x: (p.x - raw.x) * scale,
        y: (raw.y + raw.h - p.y) * scale,
      })),
    }));

    const b = bounds(contours);
    const items: ArtworkItem[] = [{
      id: 'T1',
      // Non-typographic, like an SVG import: nothing in a raster says which
      // glyph a blob was, and §3.5 branches on exactly that.
      kind: 'shape',
      text: opts.name ?? 'logo mark',
      bbox: b,
      capHeight: b.h,
      baselineY: b.y,
      narrowestStroke: round4(measureStroke(contours).narrowest),
      colour: result.colours[0],
      colourBreaks: result.colours.length > 1 ? result.colours : undefined,
      contours,
    }];

    const warnings = this.warningsFor(result.quality);
    this.logger.log(
      `traced ${opts.name ?? 'artwork'}: ${result.contours.length} contour(s), ` +
      `${result.colours.length} colour(s), confidence ${result.quality.confidence.toFixed(2)}`,
    );

    return { items, colours: result.colours, extent: { w: b.w, h: b.h }, quality: result.quality, warnings };
  }

  private warningsFor(quality: TraceQuality): string[] {
    const warnings = [
      'Artwork was traced from a bitmap. The outline is an approximation of the original, ' +
      'and dimensions taken from it are approximate. Supply vector artwork before fabrication.',
      ...quality.notes,
    ];

    if (quality.confidence < MIN_TRACE_CONFIDENCE) {
      warnings.push(
        `Trace confidence is ${(quality.confidence * 100).toFixed(0)}%, below the ` +
        `${MIN_TRACE_CONFIDENCE * 100}% needed to measure a stroke against the §6.1 minimums. ` +
        'Treat the stroke and height figures on this proof as indicative only.',
      );
    }
    return warnings;
  }

  private decode(buffer: Buffer, mime: string): RasterImage {
    try {
      if (/png/i.test(mime)) {
        const png = PNG.sync.read(buffer);
        this.checkSize(png.width, png.height);
        return { width: png.width, height: png.height, data: png.data };
      }
      const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
      this.checkSize(decoded.width, decoded.height);
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Could not read the image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private checkSize(width: number, height: number): void {
    if (width * height > MAX_PIXELS) {
      throw new BadRequestException(
        `The image is ${width}×${height}. Tracing works on artwork, not on photographs — ` +
        'export the logo on its own, ideally with a transparent background.',
      );
    }
  }
}

const round4 = (v: number): number => Math.round(v * 10000) / 10000;
