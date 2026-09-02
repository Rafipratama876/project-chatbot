/**
 * The enhancement pass, against a model that does not cooperate.
 *
 * The interesting case is not a well-behaved model. It is one that ignores the
 * mask, repaints the sign, and returns something plausible — because that is
 * what a diffusion sampler actually does, and the guarantee has to hold anyway.
 */
import { describe, it, expect, vi } from 'vitest';
import { PNG } from 'pngjs';
import { ConfigService } from '@nestjs/config';
import { EnhanceService } from '#/modules/enhance/enhance.service.js';
import type { SignSpec } from '#/kb/domain/spec.js';

const W = 64;
const H = 48;
const SIGN = { x0: 20, y0: 16, x1: 44, y1: 32 };

function png(fill: (x: number, y: number) => [number, number, number, number]): Buffer {
  const image = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = fill(x, y);
      const o = (y * W + x) * 4;
      image.data[o] = r; image.data[o + 1] = g; image.data[o + 2] = b; image.data[o + 3] = a;
    }
  }
  return PNG.sync.write(image);
}

const inSign = (x: number, y: number) =>
  x >= SIGN.x0 && x < SIGN.x1 && y >= SIGN.y0 && y < SIGN.y1;

/** A panel: a black studio ground with a purple sign block on it. */
const basePng = () => png((x, y) => (inSign(x, y) ? [77, 20, 140, 255] : [8, 8, 8, 255]));
/** Everything the renderer drew — here, just the sign block. */
const coveragePng = () => png((x, y) => {
  const a = inSign(x, y) ? 255 : 0;
  return [a, a, a, 255];
});

function service(overrides: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = {
    'enhance.enabled': true,
    'enhance.apiKey': 'test-key',
    'enhance.model': 'gpt-image-1',
    'enhance.margin': 0,
    'enhance.minEditableFraction': 0.05,
    'enhance.timeoutMs': 1000,
    ...overrides,
  };
  const config = {
    get: (k: string) => settings[k],
    getOrThrow: (k: string) => settings[k],
  } as unknown as ConfigService;
  return new EnhanceService(config);
}

// A real enough spec: `elements` is read to size the contact occlusion, and a
// stub without it fails earlier for an unrelated reason — which would make the
// concept-scene tests below pass without exercising anything.
const spec = {
  jobId: 'j',
  businessName: 'B',
  elements: [{ returnDepth: 5 }],
} as unknown as SignSpec;

/** Replaces the network call with a model that returns `image`. */
function withModel(svc: EnhanceService, image: Buffer | (() => never)) {
  vi.spyOn(svc as never, 'callModel' as never).mockImplementation((async () => {
    if (typeof image === 'function') image();
    const decoded = PNG.sync.read(image as Buffer);
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }) as never);
}

describe('the enhancement pass', () => {
  const input = () => ({
    base: basePng(),
    renderedCoverage: coveragePng(),
    onPhotograph: false,
    view: 'night' as const,
    spec,
  });

  it('does nothing at all when it is switched off', async () => {
    const svc = service({ 'enhance.enabled': false });
    const out = await svc.enhance(input());
    expect(out.applied).toBe(false);
    expect(out.png).toEqual(input().base);
  });

  it('refuses to touch a panel that is the customer\'s photograph', async () => {
    // Their building is evidence. A repainted facade is a picture of a
    // building that does not exist, and every clearance and colour read off it
    // would describe that one instead of theirs.
    const svc = service();
    const called = vi.fn();
    vi.spyOn(svc as never, 'callModel' as never).mockImplementation(called as never);

    const out = await svc.enhance({ ...input(), onPhotograph: true });
    expect(called).not.toHaveBeenCalled();
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/own photograph/);
  });

  it('keeps what a model does to the ground', async () => {
    const svc = service();
    withModel(svc, png((x, y) => (inSign(x, y) ? [77, 20, 140, 255] : [40, 60, 90, 255])));

    const out = await svc.enhance(input());
    expect(out.applied).toBe(true);
    const result = PNG.sync.read(out.png);
    expect([...result.data.subarray(0, 3)]).toEqual([40, 60, 90]);
  });

  it('undoes what it does to the sign, however confidently it did it', async () => {
    // A sampler repaints the whole canvas. The mask is a request; this is what
    // makes it an outcome.
    const svc = service();
    withModel(svc, png(() => [255, 0, 0, 255]));

    const out = await svc.enhance(input());
    const result = PNG.sync.read(out.png);
    const o = (20 * W + 24) * 4;
    expect([...result.data.subarray(o, o + 3)]).toEqual([77, 20, 140]);
    expect(out.stats?.violations).toBe((SIGN.x1 - SIGN.x0) * (SIGN.y1 - SIGN.y0));
  });

  it('reports how much of the result was the model\'s opinion', async () => {
    const svc = service();
    withModel(svc, png(() => [255, 0, 0, 255]));
    const out = await svc.enhance(input());
    expect(out.stats?.worstViolation).toBeGreaterThan(0);
    expect(out.stats?.changedPixels).toBeGreaterThan(0);
  });

  it('discards a resized result rather than recombining misaligned pixels', async () => {
    const svc = service();
    const wrong = new PNG({ width: W + 8, height: H });
    withModel(svc, PNG.sync.write(wrong));

    const out = await svc.enhance(input());
    expect(out.applied).toBe(false);
    expect(out.reason).toMatch(/discarded/);
    expect(out.png).toEqual(input().base);
  });

  it('falls back to the deterministic render when the call fails', async () => {
    // A failed enhancement is never a failed proof.
    const svc = service();
    withModel(svc, () => { throw new Error('rate limited'); });

    const out = await svc.enhance(input());
    expect(out.applied).toBe(false);
    expect(out.png).toEqual(input().base);
    expect(out.reason).toMatch(/deterministic render is shown/);
  });

  it('will not run without the sign layer to protect it with', async () => {
    // A guessed silhouette is worse than no enhancement.
    const svc = service();
    const called = vi.fn();
    vi.spyOn(svc as never, 'callModel' as never).mockImplementation(called as never);

    const out = await svc.enhance({ ...input(), renderedCoverage: null });
    expect(called).not.toHaveBeenCalled();
    expect(out.applied).toBe(false);
  });

  it('composites the real sign over a generated setting', async () => {
    const svc = service();
    const setting = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) {
      setting.data[i * 4] = 70; setting.data[i * 4 + 1] = 80;
      setting.data[i * 4 + 2] = 95; setting.data[i * 4 + 3] = 255;
    }
    vi.spyOn(svc as never, 'generateSetting' as never)
      .mockImplementation((async () => setting) as never);

    // A sign layer on transparency: the block is opaque, the rest is not.
    const layer = png((x, y) => (inSign(x, y) ? [255, 102, 0, 255] : [0, 0, 0, 0]));
    const out = await svc.conceptScene({ signLayer: layer, view: 'day', spec });

    expect(out.png).not.toBeNull();
    const result = PNG.sync.read(out.png!);
    // The sign survives byte for byte; the setting shows through elsewhere.
    const onSign = (20 * W + 24) * 4;
    expect([...result.data.subarray(onSign, onSign + 3)]).toEqual([255, 102, 0]);
    expect(result.data[2]).toBeGreaterThan(0);
  });

  it('discards a concept scene whose setting came back blank', async () => {
    // The first live run produced a solid black panel with the sign invisible
    // inside it, and nothing upstream failed: the request succeeded, the
    // decode succeeded, and the verification passed vacuously because black
    // over black is unchanged. Only looking at the pixels catches it.
    const svc = service();
    vi.spyOn(svc as never, 'generateSetting' as never).mockImplementation((async () => {
      throw new Error('the generated setting is blank (peak channel 0)');
    }) as never);

    const layer = png((x, y) => (inSign(x, y) ? [255, 102, 0, 255] : [0, 0, 0, 0]));
    const out = await svc.conceptScene({ signLayer: layer, view: 'night', spec });
    expect(out.png).toBeNull();
    expect(out.reason).toMatch(/not available/);
  });

  it('always says what it did, for the proof to carry', async () => {
    // Both halves matter: that a model was involved, and that the parts a
    // customer is held to were not its work.
    const svc = service();
    withModel(svc, png((x, y) => (inSign(x, y) ? [77, 20, 140, 255] : [40, 60, 90, 255])));
    const out = await svc.enhance(input());
    expect(out.reason).toMatch(/generative model/);
    expect(out.reason).toMatch(/deterministic render/);
    expect(out.reason).toMatch(/verified/);
  });
});
