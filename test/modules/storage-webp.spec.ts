import { describe, expect, it } from 'vitest';
import { StorageService } from '#/modules/storage/storage.service.js';
import { sniffImageMime } from '#/modules/compat/compat.service.js';

describe('StorageService.measure WebP', () => {
  it('reads extended WebP dimensions', () => {
    const image = header('VP8X');
    image.writeUIntLE(1599, 24, 3);
    image.writeUIntLE(899, 27, 3);
    expect(StorageService.measure(image, 'image/webp')).toEqual({ width: 1600, height: 900 });
  });

  it('reads lossless WebP dimensions', () => {
    const image = header('VP8L');
    const width = 640 - 1;
    const height = 480 - 1;
    image[20] = 0x2f;
    image[21] = width & 0xff;
    image[22] = ((width >> 8) & 0x3f) | ((height & 0x03) << 6);
    image[23] = (height >> 2) & 0xff;
    image[24] = (height >> 10) & 0x0f;
    expect(StorageService.measure(image, 'image/webp')).toEqual({ width: 640, height: 480 });
  });

  it('reads lossy WebP dimensions', () => {
    const image = header('VP8 ');
    image.set([0x9d, 0x01, 0x2a], 23);
    image.writeUInt16LE(1920, 26);
    image.writeUInt16LE(1080, 28);
    expect(StorageService.measure(image, 'image/webp')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('remote image signature', () => {
  it('recognizes JPEG bytes even when HTTP metadata says WebP', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe1]))).toBe('image/jpeg');
  });
});

function header(format: string): Buffer {
  const result = Buffer.alloc(30);
  result.write('RIFF', 0, 'ascii');
  result.write('WEBP', 8, 'ascii');
  result.write(format, 12, 'ascii');
  return result;
}
