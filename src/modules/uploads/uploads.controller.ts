import {
  BadRequestException, Controller, Param, Post, Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { StorageService } from '#/modules/storage/storage.service.js';
import { removeFlatBackground } from '#/kb/geometry/matte.js';

/** Folders a client may write to. An open folder name is an open directory. */
const FOLDERS = new Set(['logos', 'walls']);

@ApiTags('uploads')
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('image/:folder')
  @ApiOperation({ summary: 'Store a logo or a wall photograph.' })
  async image(
    @Param('folder') folder: string,
    @Req() request: FastifyRequest,
  ): Promise<{ url: string; width?: number; height?: number }> {
    if (!FOLDERS.has(folder)) {
      throw new BadRequestException(`Unknown upload folder "${folder}".`);
    }
    const { buffer, mime } = await readOne(request);
    const stored = await this.storage.save(folder, buffer, mime);

    // The wall's pixel size is the denominator of every calibration made
    // against it, so it is measured here — once, from the bytes that were
    // actually stored — rather than read off an <img> in the browser.
    if (folder === 'walls') {
      const size = StorageService.measure(buffer, mime);
      return { url: stored.url, width: size.width, height: size.height };
    }
    return { url: stored.url };
  }

  @Post('logo/remove-background')
  @ApiOperation({
    summary: 'Knock a flat background out of a logo bitmap.',
    description:
      'A flood fill inward from the border, so enclosed counters survive. '
      + 'Returns PNG with an alpha channel, plus what it actually did.',
  })
  async removeBackground(
    @Req() request: FastifyRequest,
  ): Promise<{ url: string; removed: number; notes: string[] }> {
    const { buffer, mime } = await readOne(request);

    const image = decode(buffer, mime);
    const result = removeFlatBackground(image);

    const png = new PNG({ width: result.width, height: result.height });
    png.data = Buffer.from(result.data);
    const encoded = PNG.sync.write(png);

    const stored = await this.storage.save('logos', encoded, 'image/png');
    return { url: stored.url, removed: result.removed, notes: result.notes };
  }
}

/**
 * The one file on a multipart request.
 *
 * Fastify streams multipart rather than buffering it, so this is where the
 * bytes are actually pulled; `storage.save` enforces the size ceiling on what
 * comes out.
 */
async function readOne(
  request: FastifyRequest,
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const file = await (request as FastifyRequest & {
    file?: () => Promise<{
      toBuffer: () => Promise<Buffer>; mimetype: string; filename: string;
    } | undefined>;
  }).file?.();

  if (!file) {
    throw new BadRequestException(
      'Send the file as multipart/form-data under the field name "file".',
    );
  }
  return { buffer: await file.toBuffer(), mime: file.mimetype, filename: file.filename };
}

function decode(buffer: Buffer, mime: string) {
  if (/png/i.test(mime)) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (/jpe?g/i.test(mime)) {
    const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  throw new BadRequestException(
    // An SVG has no background to remove: it is already shapes on nothing.
    `Background removal works on PNG and JPEG, not "${mime}".`,
  );
}
