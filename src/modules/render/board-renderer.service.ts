import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';

/**
 * Screenshots the presentation board.
 *
 * The board is HTML because its numbers have to be text: a spec table, a set of
 * dimensions and a section drawing are things a customer reads values off, and
 * text rendered by a browser is the same text that went in. The screenshot is
 * only how it is delivered.
 *
 * Fonts, image decodes and two animation frames are awaited before the capture.
 * Pooled pages are reused, and a board photographed mid-decode is a board with
 * a missing panel.
 */
@Injectable()
export class BoardRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(BoardRendererService.name);
  private browser: Browser | null = null;

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async render(html: string, options: { width: number; height: number; selector: string }): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
      await page.evaluate(async () => {
        await document.fonts?.ready;
        await Promise.all(Array.from(document.images).map(async (image) => {
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            });
          }
          try {
            await image.decode();
          } catch {
            /* keep the browser's own fallback rendering */
          }
        }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const handle = await page.waitForSelector(options.selector, { timeout: 10_000 });
      if (!handle) throw new Error(`board selector not found: ${options.selector}`);
      return await handle.screenshot({ animations: 'disabled' });
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch();
    return this.browser;
  }
}
