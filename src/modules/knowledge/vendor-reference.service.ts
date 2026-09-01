import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorReferenceEntity } from '#/modules/database/entities/vendor-reference.entity.js';
import { EmbeddingService } from './embedding.service.js';

export interface VendorHit {
  id: string;
  section: string;
  vendor: string | null;
  title: string;
  content: string;
  provenance: string;
  score: number;
  method: 'vector' | 'fulltext';
}

/**
 * Appendix A/B lookup. Stage 2 territory.
 *
 * KB Layer 0 and the appendix headings are explicit that the Stage 1 bot does
 * not read this material, so nothing in the rule engine calls it. It exists for
 * the human reviewing a proof and for a Stage 2 quoting flow: vendor minimums,
 * published lines, LED spacing, coil stock, extrusion catalogues.
 *
 * This is the part of the KB that genuinely is a retrieval problem — large,
 * open-ended, queried by paraphrase, and safe to miss. The rules are not, and
 * are not stored here.
 */
@Injectable()
export class VendorReferenceService {
  private readonly logger = new Logger(VendorReferenceService.name);

  constructor(
    @InjectRepository(VendorReferenceEntity)
    private readonly repo: Repository<VendorReferenceEntity>,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(query: string, limit = 5, section?: string): Promise<VendorHit[]> {
    const vector = await this.embeddings.embedOne(query, 'query');

    if (vector) {
      const rows = await this.repo.manager.query<Array<Record<string, unknown>>>(
        `SELECT id, section, vendor, title, content, provenance,
                1 - (embedding <=> $1::vector) AS score
         FROM cl_vendor_reference
         WHERE embedding IS NOT NULL ${section ? 'AND section = $3' : ''}
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        section
          ? [EmbeddingService.toVector(vector), limit, section]
          : [EmbeddingService.toVector(vector), limit],
      );
      if (rows.length > 0) return rows.map((r) => this.toHit(r, 'vector'));
      this.logger.debug('no embedded rows matched; falling back to full text');
    }

    const rows = await this.repo.manager.query<Array<Record<string, unknown>>>(
      `SELECT id, section, vendor, title, content, provenance,
              ts_rank(to_tsvector('english', title || ' ' || content),
                      plainto_tsquery('english', $1)) AS score
       FROM cl_vendor_reference
       WHERE to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
         ${section ? 'AND section = $3' : ''}
       ORDER BY score DESC
       LIMIT $2`,
      section ? [query, limit, section] : [query, limit],
    );
    return rows.map((r) => this.toHit(r, 'fulltext'));
  }

  /** Ingest appendix chunks. Embeds in one batch when a provider is configured. */
  async ingest(
    chunks: Array<Omit<VendorReferenceEntity, 'id' | 'embedding' | 'createdAt'>>,
  ): Promise<number> {
    if (chunks.length === 0) return 0;
    const vectors = await this.embeddings.embed(chunks.map((c) => `${c.title}\n\n${c.content}`), 'document');

    const rows = chunks.map((c, i) => {
      const v = vectors?.[i];
      return this.repo.create({ ...c, embedding: v ? EmbeddingService.toVector(v) : null });
    });
    await this.repo.save(rows);

    if (!vectors) {
      this.logger.warn(`ingested ${rows.length} chunk(s) without embeddings — full-text search only`);
    }
    return rows.length;
  }

  private toHit(row: Record<string, unknown>, method: VendorHit['method']): VendorHit {
    return {
      id: String(row.id),
      section: String(row.section),
      vendor: (row.vendor as string | null) ?? null,
      title: String(row.title),
      content: String(row.content),
      provenance: String(row.provenance),
      score: Number(row.score),
      method,
    };
  }
}
