import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, type Browser } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import { STATIC_PREFIX } from '#/modules/storage/storage.service.js';

/**
 * The proof sheet, as a PDF.
 *
 * Printed from the same HTML the review page shows rather than laid out again
 * for print: a second layout is a second chance for the printed spec to
 * disagree with the on-screen one, and the sheet is the document the customer
 * signs. The panels are inlined as data URLs at assembly time, so nothing here
 * has to resolve an image over the network — which also means the PDF renders
 * identically on a machine that cannot reach this server.
 */
@Injectable()
export class ExportService implements OnModuleDestroy {
  private readonly logger = new Logger(ExportService.name);
  private browser: Browser | null = null;

  constructor(
    @InjectRepository(ProofEntity) private readonly proofs: Repository<ProofEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  /** Returns the relative "/static/exports/…" path the file was written to. */
  async pdf(designId: string): Promise<string> {
    const proof = await this.proofs.findOne({
      where: { designId, status: 'ready' },
      order: { version: 'DESC' },
    });
    if (!proof?.sheetHtml) {
      throw new BadRequestException(
        'There is no completed proof on this design to export yet.',
      );
    }

    const root = path.resolve(this.config.get<string>('storage.dir') ?? 'storage');
    const dir = path.join(root, 'exports');
    await fs.mkdir(dir, { recursive: true });

    // Named for the design, not the proof: the customer asked for "the PDF of
    // this design", and a directory accumulating one file per revision is a
    // directory nobody prunes. The version is stamped inside the sheet.
    const file = path.join(dir, `${designId}.pdf`);

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

    this.logger.log(`design ${designId} → ${file} (proof v${proof.version})`);
    return `${STATIC_PREFIX}/exports/${designId}.pdf`;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const args = this.config.get<string[]>('render.headlessArgs') ?? [];
    this.browser = await chromium.launch({ args });
    return this.browser;
  }
}
