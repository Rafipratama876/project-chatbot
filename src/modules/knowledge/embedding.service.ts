import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Embeddings for the pgvector stores — OpenAI (`text-embedding-3-small` by
 * default), the same `OPENAI_API_KEY` as `OpenAIClient` and the image
 * enhancement client. One provider, one credential, for every model call this
 * app makes. The interface is small enough that swapping providers, if ever
 * needed again, is still one method.
 *
 * `provider: 'none'` is a supported configuration, not a broken one. Vendor
 * lookup falls back to Postgres full-text search, which is worse at paraphrase
 * and perfectly adequate for "what depth coil does Gemini stock".
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;
  readonly dimensions: number;
  private client: OpenAI | null = null;

  constructor(config: ConfigService) {
    this.provider = config.get<string>('llm.embeddings.provider') ?? 'none';
    this.apiKey = config.get<string>('llm.embeddings.apiKey') ?? '';
    this.model = config.get<string>('llm.embeddings.model') ?? 'text-embedding-3-small';
    this.dimensions = config.get<number>('llm.embeddings.dimensions') ?? 1536;
  }

  get enabled(): boolean {
    return this.provider === 'openai' && this.apiKey.length > 0;
  }

  /**
   * `null` when no provider is configured — callers fall back to full text.
   *
   * `inputType` is a Voyage-era distinction (asymmetric document/query
   * embeddings) that OpenAI's `text-embedding-3-*` models have no equivalent
   * for — kept as an accepted, unused parameter rather than touching every
   * call site in `design-reference.service.ts`/`vendor-reference.service.ts`
   * for a difference that no longer changes behaviour.
   */
  async embed(texts: string[], _inputType: 'document' | 'query' = 'document'): Promise<number[][] | null> {
    if (!this.enabled || texts.length === 0) return null;

    this.client ??= new OpenAI({ apiKey: this.apiKey });

    let response;
    try {
      response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      });
    } catch (error) {
      this.logger.error(`embedding request failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    const ordered = [...response.data].sort((a, b) => a.index - b.index);

    // A dimension mismatch against the column would be rejected by Postgres
    // with an opaque error; catch it where the cause is obvious.
    const wrong = ordered.find((d) => d.embedding.length !== this.dimensions);
    if (wrong) {
      throw new Error(
        `embedding provider returned ${wrong.embedding.length} dimensions, but the vector columns are ${this.dimensions}. ` +
        'Set EMBEDDING_DIMENSIONS to match and re-run the migration.',
      );
    }

    return ordered.map((d) => d.embedding);
  }

  async embedOne(text: string, inputType: 'document' | 'query' = 'query'): Promise<number[] | null> {
    const result = await this.embed([text], inputType);
    return result?.[0] ?? null;
  }

  /** pgvector's literal format. */
  static toVector(values: number[]): string {
    return `[${values.join(',')}]`;
  }
}
