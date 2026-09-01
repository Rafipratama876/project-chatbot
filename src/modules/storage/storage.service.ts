import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

/** The prefix every stored file is served and referenced under. */
export const STATIC_PREFIX = '/static';

export interface StoredFile {
  /** Relative path, e.g. "/static/logos/<uuid>.png". */
  url: string;
  /** Absolute path on disk. */
  file: string;
  bytes: number;
}

export interface ImageSize { width: number; height: number }

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/** 20 MB. A building photograph off a phone lands well under this. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Uploaded artwork and wall photographs, on disk.
 *
 * Stored as files rather than inlined in the database because the renderer
 * reads them, the proof sheet references them, and a base64 wall photograph
 * repeated across every revision of a design turns a row into megabytes.
 *
 * The URL handed back is always relative. An absolute one bakes today's host
 * into a stored record, and the same design opened from a different origin —
 * a colleague's laptop, a deployed instance — would then load nothing.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('storage.dir') ?? 'storage');
  }

  /** Absolute path for a stored "/static/…" URL, refusing anything outside. */
  resolve(url: string): string {
    const relative = url.startsWith(`${STATIC_PREFIX}/`)
      ? url.slice(STATIC_PREFIX.length + 1)
      : url.replace(/^\/+/, '');

    const file = path.resolve(this.root, relative);
    // A stored path arrives from the database, and a row is not automatically
    // trustworthy — "../../etc/passwd" resolves perfectly well without this.
    if (file !== this.root && !file.startsWith(this.root + path.sep)) {
      throw new BadRequestException(`"${url}" is outside the storage directory.`);
    }
    return file;
  }

  async save(folder: string, buffer: Buffer, mime: string): Promise<StoredFile> {
    if (buffer.length === 0) throw new BadRequestException('The uploaded file is empty.');
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `That file is ${(buffer.length / 1e6).toFixed(1)} MB. The limit is ${MAX_BYTES / 1e6} MB.`,
      );
    }
    const extension = EXTENSIONS[mime.toLowerCase()];
    if (!extension) {
      throw new BadRequestException(
        `Unsupported file type "${mime}". PNG, JPEG, WEBP and SVG are accepted.`,
      );
    }

    const name = `${randomUUID()}${extension}`;
    const dir = path.join(this.root, folder);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await fs.writeFile(file, buffer);

    this.logger.log(`stored ${folder}/${name} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return { url: `${STATIC_PREFIX}/${folder}/${name}`, file, bytes: buffer.length };
  }

  async read(url: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolve(url));
    } catch {
      throw new BadRequestException(
        `The file "${url}" is no longer on disk. Re-upload it, or start the design again.`,
      );
    }
  }

  /** The mime a stored URL implies, from its extension. */
  mimeOf(url: string): string {
    const extension = path.extname(url).toLowerCase();
    const found = Object.entries(EXTENSIONS).find(([, e]) => e === extension);
    return found ? found[0] : 'application/octet-stream';
  }

  async dataUrl(url: string): Promise<string> {
    const buffer = await this.read(url);
    return `data:${this.mimeOf(url)};base64,${buffer.toString('base64')}`;
  }

  /**
   * Pixel dimensions, without decoding the whole image where the header will
   * do. The wizard works in fractions of the wall image, so every calibration
   * downstream is denominated in these two numbers — a wrong size here is a
   * sign built to the wrong dimensions, not a cosmetic error.
   */
  static measure(buffer: Buffer, mime: string): ImageSize {
    if (/png/i.test(mime)) {
      const png = PNG.sync.read(buffer);
      return { width: png.width, height: png.height };
    }
    if (/jpe?g/i.test(mime)) {
      const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 1024 });
      return { width: decoded.width, height: decoded.height };
    }
    throw new BadRequestException(
      `Cannot measure a "${mime}" image. Upload the wall photograph as PNG or JPEG.`,
    );
  }
}
