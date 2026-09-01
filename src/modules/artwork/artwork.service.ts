import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { importSvg, type SvgImportResult } from '#/kb/geometry/svg.js';
import {
  calibrate, fitArtwork, artworkExtent, checkCalibration, placementSize,
  CalibrationError, type CalibrationWarning,
} from '#/kb/geometry/calibration.js';
import type { ArtworkItem, PlacementInput } from '#/kb/domain/spec.js';
import { RasterService } from './raster.service.js';

export interface ImportedArtwork {
  items: ArtworkItem[];
  colours: string[];
  /** Extent in the artwork's own units, before any placement scales it. */
  extent: { w: number; h: number };
  aspect: number;
  warnings: string[];
  /** 'vector' is exact; 'traced' is inferred from pixels and says so. */
  source: 'vector' | 'traced';
  /** 0–1 for a trace; 1 for a vector, where there is nothing to infer. */
  confidence: number;
}

/** What the caller hands in: an SVG string, or an encoded bitmap. */
export type ArtworkSource =
  | { kind: 'svg'; svg: string }
  | { kind: 'raster'; buffer: Buffer; mime: string };

/** Accepts a data URL, a raw SVG string, or a base64 payload with a mime. */
export function readSource(input: { svg?: string; data?: string; mime?: string }): ArtworkSource {
  const raw = input.svg ?? input.data ?? '';
  if (!raw) throw new BadRequestException('no artwork supplied');

  const dataUrl = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(raw);
  if (dataUrl) {
    const mime = dataUrl[1]!;
    const body = dataUrl[3]!;
    const decoded = dataUrl[2]
      ? Buffer.from(body, 'base64')
      : Buffer.from(decodeURIComponent(body), 'utf8');
    if (/svg/i.test(mime)) return { kind: 'svg', svg: decoded.toString('utf8') };
    return { kind: 'raster', buffer: decoded, mime };
  }

  if (input.mime && RasterService.supports(input.mime)) {
    return { kind: 'raster', buffer: Buffer.from(raw, 'base64'), mime: input.mime };
  }
  return { kind: 'svg', svg: raw };
}

export interface PlacedArtwork extends ImportedArtwork {
  widthInches: number;
  heightInches: number;
  /** Whether the box and the mark disagree about aspect, and by how much. */
  fit: 'exact' | 'width' | 'height';
  calibrationWarnings: CalibrationWarning[];
}

@Injectable()
export class ArtworkService {
  private readonly logger = new Logger(ArtworkService.name);

  constructor(private readonly raster: RasterService) {}

  /**
   * A logo file becomes geometry here, once. Everything downstream — the
   * stroke §6.1 measures, the silhouette that gets extruded, the outline the
   * shop cuts — is this polygon, so the import is the last point at which the
   * artwork is a picture.
   */
  import(
    source: ArtworkSource,
    opts: { name?: string; splitByColour?: boolean; targetWidth?: number } = {},
  ): ImportedArtwork {
    if (source.kind === 'raster') {
      if (!RasterService.supports(source.mime)) {
        throw new BadRequestException(
          `Unsupported artwork type "${source.mime}". SVG, PNG and JPEG are accepted.`,
        );
      }
      const traced = this.raster.trace(source.buffer, source.mime, {
        name: opts.name,
        targetWidth: opts.targetWidth,
      });
      return {
        items: traced.items,
        colours: traced.colours,
        extent: traced.extent,
        aspect: traced.extent.w / traced.extent.h,
        warnings: traced.warnings,
        source: 'traced',
        confidence: traced.quality.confidence,
      };
    }

    const svg = source.svg;
    if (!svg.includes('<svg')) {
      throw new BadRequestException(
        'The file does not look like SVG, PNG or JPEG artwork.',
      );
    }

    const result: SvgImportResult = importSvg(svg, {
      targetWidth: opts.targetWidth,
      name: opts.name,
      splitBy: opts.splitByColour ? 'colour' : 'mark',
    });

    if (result.items.length === 0) {
      throw new BadRequestException(
        `No drawable shapes found in the artwork. ${result.warnings.join(' ')}`.trim(),
      );
    }

    const extent = artworkExtent(result.items);
    if (result.warnings.length > 0) {
      this.logger.warn(`artwork import: ${result.warnings.join('; ')}`);
    }

    return {
      items: result.items,
      colours: result.colours,
      extent,
      aspect: extent.w / extent.h,
      warnings: result.warnings,
      // A vector outline is the artwork, not a reading of it.
      source: 'vector',
      confidence: 1,
    };
  }

  /**
   * Re-imports the artwork at the size the placement says it is.
   *
   * Scaling the already-imported polygons would work, but re-importing keeps
   * one code path from file to geometry — and the flattening tolerance is
   * absolute, so a mark flattened at SVG scale and then blown up to 43 inches
   * carries visibly coarser curves than one flattened at its final size.
   */
  place(source: ArtworkSource, placement: PlacementInput, opts: { name?: string } = {}): PlacedArtwork {
    let cal;
    try {
      cal = calibrate(
        {
          a: placement.reference.a,
          b: placement.reference.b,
          inches: placement.reference.inches,
          label: placement.reference.label,
        },
        placement.imageWidth,
        placement.imageHeight,
      );
    } catch (error) {
      if (error instanceof CalibrationError) throw new BadRequestException(error.message);
      throw error;
    }

    const probe = this.import(source, opts);
    const target = { calibration: cal, rect: placement.rect };
    const fitted = fitArtwork(probe.extent, target);

    // Re-imported at the final size: the flattening and simplification
    // tolerances are absolute, so artwork prepared at its own scale and then
    // blown up to 43 inches carries visibly coarser curves than artwork
    // prepared at 43 inches.
    const placed = this.import(source, { ...opts, targetWidth: fitted.width });
    const size = placementSize(target);

    this.logger.log(
      `placed ${opts.name ?? 'artwork'} at ${fitted.width.toFixed(2)}″ × ${fitted.height.toFixed(2)}″ ` +
      `in a ${size.width.toFixed(2)}″ × ${size.height.toFixed(2)}″ box ` +
      `(${cal.pixelsPerInch.toFixed(2)} px/in)`,
    );

    return {
      items: placed.items,
      colours: placed.colours,
      extent: artworkExtent(placed.items),
      aspect: probe.aspect,
      warnings: placed.warnings,
      source: placed.source,
      confidence: placed.confidence,
      widthInches: fitted.width,
      heightInches: fitted.height,
      fit: fitted.letterboxed,
      calibrationWarnings: checkCalibration(target, probe.aspect),
    };
  }
}
