import { registerAs } from '@nestjs/config';

export default registerAs('render', () => ({
  width: Number(process.env.RENDER_WIDTH ?? 1600),
  height: Number(process.env.RENDER_HEIGHT ?? 1000),
  /**
   * Chromium launch is ~300 ms and the esbuild bundle is ~1 s. Both are reused
   * across jobs, so a warm worker renders a proof in the time it takes to draw
   * it rather than the time it takes to start a browser.
   */
  keepBrowserWarm: process.env.RENDER_KEEP_WARM !== 'false',
  headlessArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}));
