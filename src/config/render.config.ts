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
  /**
   * How many of a proof's panels can have their generative enhance pass
   * (`EnhanceService.enhance`) in flight at once — see `mapWithConcurrency`.
   * Only ever applies to panels that don't need the shared Playwright page
   * (every day panel; night panels too, when `ENHANCE_NIGHT_MODE` is not
   * `layered`) — a layered night panel still renders its own layers through
   * that one page and stays one-at-a-time, unconditionally.
   *
   * 2, not higher: this project's own test runs have hit OpenAI's image-edit
   * rate limit ("enhancement skipped: rate limited") well before saturating
   * it — the number of independent calls at once, not the total per job,
   * is what trips it. Raise it only against an account whose actual limit is
   * known to clear it.
   */
  panelEnhanceConcurrency: Number(process.env.RENDER_PANEL_ENHANCE_CONCURRENCY ?? 2),
  /**
   * Total `RenderService.render()` calls allowed in flight at once, across
   * every caller — Channel Letters' queue worker, and Dimensional Letters'
   * and Sign Cabinets' own (`queue.concurrency`). All three share one
   * `RenderService` singleton (one headless Chromium `Browser`, software
   * rendered — see `headlessArgs` above), so each queue capping only itself
   * does not cap the total; this does. Same number `PROOF_CONCURRENCY`
   * already uses, same reasoning, same resource — a render holds a
   * Chromium page, and more than a few at once thrashes the CPU that has to
   * rasterise all of them.
   */
  globalConcurrency: Number(process.env.RENDER_GLOBAL_CONCURRENCY ?? 2),
}));
