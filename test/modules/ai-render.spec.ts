/**
 * The photorealism pass is the one place a model touches a customer-facing
 * image, so what it is *sent* matters as much as what comes back: the three.js
 * capture has to be the first input, and a previous panel is only ever context.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AiRenderService } from '#/modules/render/ai-render.service.js';

const config = (values: Record<string, unknown>) => new ConfigService(values);

const enabled = config({
  render: {
    aiEnabled: true,
    aiApiKey: 'test-key',
    aiBaseUrl: 'https://api.openai.com/v1',
    aiTextModel: 'gpt-5.1',
    aiImageModel: 'gpt-image-2',
    aiTimeoutMs: 1000,
  },
});

const ok = (result: Buffer) => new Response(JSON.stringify({
  output: [{ type: 'image_generation_call', result: result.toString('base64') }],
}));

describe('AiRenderService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('edits the three.js render, pinned to the image model', async () => {
    const out = Buffer.from('enhanced');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools[0]).toMatchObject({ model: 'gpt-image-2', action: 'edit', output_format: 'png' });
      // The render is input 1 — it is the authority on what the sign is.
      expect(body.input[0].content[1].image_url)
        .toBe(`data:image/png;base64,${Buffer.from('render').toString('base64')}`);
      return ok(out);
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiRenderService(enabled);
    const result = await service.scene({ render: Buffer.from('render'), kind: 'day', jobId: 'job' });

    expect(result).toEqual(out);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('day and night get different instructions', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(String(init.body)).instructions);
      return ok(Buffer.from('x'));
    }));

    const service = new AiRenderService(enabled);
    await service.scene({ render: Buffer.from('r'), kind: 'day', jobId: 'job' });
    await service.scene({ render: Buffer.from('r'), kind: 'night', jobId: 'job' });

    expect(seen[0]).not.toBe(seen[1]);
    // The night panel is where an unlit backer gets invented, so it says so.
    expect(seen[1]).toContain('never a light source');
  });

  it('a revision keeps the render first and the previous panel second', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const content = JSON.parse(String(init.body)).input[0].content;
      expect(content[1].image_url).toContain(Buffer.from('render').toString('base64'));
      expect(content[2].image_url).toContain(Buffer.from('previous').toString('base64'));
      expect(content[0].text).toContain('warmer light');
      return ok(Buffer.from('revised'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiRenderService(enabled);
    await service.scene({
      render: Buffer.from('render'),
      kind: 'day',
      jobId: 'job',
      intent: 'warmer light',
      previous: Buffer.from('previous'),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fails closed when enabled without credentials', async () => {
    const service = new AiRenderService(config({ render: { aiEnabled: true, aiApiKey: '' } }));
    await expect(service.scene({ render: Buffer.from('r'), kind: 'day', jobId: 'job' }))
      .rejects.toThrow('AI_RENDER_ENABLED=true requires OPENAI_API_KEY');
  });
});
