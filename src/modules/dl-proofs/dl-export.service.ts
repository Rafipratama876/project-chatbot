import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, type Browser } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { DLProofEntity } from '#/modules/database/entities/dl-proof.entity.js';
import { STATIC_PREFIX } from '#/modules/storage/storage.service.js';

/**
 * The DL proof sheet, as a PDF — same approach as CL's `ExportService`:
 * printed from the same `sheetHtml` the review page shows, not laid out
 * again for print, so the PDF can never disagree with what was on screen.
 * Keyed by `rootProofId` (the revision chain), not a design id — the latest
 * `ready` proof in that chain is what gets exported.
 */
@Injectable()
export class DLExportService implements OnModuleDestroy {
  private readonly logger = new Logger(DLExportService.name);
  private browser: Browser | null = null;

  constructor(
    @InjectRepository(DLProofEntity) private readonly proofs: Repository<DLProofEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  async pdf(rootProofId: string): Promise<string> {
    const proof = await this.proofs.findOne({
      where: { rootProofId, status: 'ready' },
      order: { version: 'DESC' },
    });
    if (!proof?.sheetHtml) {
      throw new BadRequestException('There is no completed proof on this design to export yet.');
    }

    const root = path.resolve(this.config.get<string>('storage.dir') ?? 'storage');
    const dir = path.join(root, 'exports');
    await fs.mkdir(dir, { recursive: true });

    const file = path.join(dir, `dl-${rootProofId}.pdf`);

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(proof.sheetHtml, { waitUntil: 'networkidle' });
      await page.pdf({
        path: file,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
    } finally {
      await page.close();
    }

    this.logger.log(`dl design ${rootProofId} → ${file} (proof v${proof.version})`);
    return `${STATIC_PREFIX}/exports/dl-${rootProofId}.pdf`;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const args = this.config.get<string[]>('render.headlessArgs') ?? [];
    this.browser = await chromium.launch({ args });
    return this.browser;
  }
}
