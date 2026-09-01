import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArtworkService, readSource } from './artwork.service.js';
import { PlacementSchema } from '#/kb/domain/spec.js';

interface ArtworkBody {
  /** Raw SVG, or a data URL of any accepted type. */
  svg?: string;
  /** Base64 payload, when sent alongside an explicit mime. */
  data?: string;
  mime?: string;
  name?: string;
  splitByColour?: boolean;
}

@ApiTags('artwork')
@Controller({ path: 'artwork', version: '1' })
export class ArtworkController {
  constructor(private readonly artwork: ArtworkService) {}

  @Post('import')
  @ApiOperation({
    summary: 'Turn logo artwork into measured geometry.',
    description:
      'SVG, PNG or JPEG. A vector outline is the artwork; a bitmap is traced, and the ' +
      'response says which it was and how much to trust it — §6.1 measures strokes ' +
      'against a 1/50″ tolerance, and a trace of a small or blurry source cannot hold it.',
  })
  importArtwork(@Body() body: ArtworkBody) {
    const result = this.artwork.import(readSource(body), {
      name: body.name,
      splitByColour: body.splitByColour,
    });
    return {
      elements: result.items.length,
      colours: result.colours,
      extent: result.extent,
      aspect: result.aspect,
      source: result.source,
      confidence: result.confidence,
      warnings: result.warnings,
    };
  }

  @Post('place')
  @ApiOperation({
    summary: 'Size the artwork against a calibrated photo.',
    description:
      'Applies the scale reference, fits the mark inside the placement box without ' +
      'distorting it (§9.2), and returns the artwork ready to submit as a job.',
  })
  place(@Body() body: ArtworkBody & { placement: unknown }) {
    const placement = PlacementSchema.parse(body.placement);
    const result = this.artwork.place(readSource(body), placement, { name: body.name });
    return {
      artwork: result.items,
      widthInches: result.widthInches,
      heightInches: result.heightInches,
      fit: result.fit,
      colours: result.colours,
      source: result.source,
      confidence: result.confidence,
      warnings: [...result.warnings, ...result.calibrationWarnings.map((w) => w.message)],
      calibrationWarnings: result.calibrationWarnings,
    };
  }
}
