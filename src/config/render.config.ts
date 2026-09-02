import { registerAs } from '@nestjs/config';

export default registerAs('render', () => {
  const aiEnabled = process.env.AI_RENDER_ENABLED === 'true';
  return {
  width: Number(process.env.RENDER_WIDTH ?? (aiEnabled ? 1536 : 1600)),
  height: Number(process.env.RENDER_HEIGHT ?? (aiEnabled ? 1024 : 1000)),
  aiEnabled,
  aiApiKey: process.env.OPENAI_API_KEY ?? '',
  aiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  aiTextModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.1',
  aiImageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
  aiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 180_000),
  /**
   * Chromium launch is ~300 ms and the esbuild bundle is ~1 s. Both are reused
   * across jobs, so a warm worker renders a proof in the time it takes to draw
   * it rather than the time it takes to start a browser.
   */
  keepBrowserWarm: process.env.RENDER_KEEP_WARM !== 'false',
  headlessArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  };
});
