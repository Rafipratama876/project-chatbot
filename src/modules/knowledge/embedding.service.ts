import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Embeddings for the pgvector stores.
 *
 * Anthropic does not offer an embeddings endpoint and points at a third-party
 * provider, so this is a separate credential and a separate call — not the
 * Claude client in `src/modules/llm/`. Voyage is the documented recommendation
 * and is the implementation here; the interface is small enough that swapping
 * it is one method.
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

  constructor(config: ConfigService) {
    this.provider = config.get<string>('llm.embeddings.provider') ?? 'none';
    this.apiKey = config.get<string>('llm.embeddings.apiKey') ?? '';
    this.model = config.get<string>('llm.embeddings.model') ?? 'voyage-3';
    this.dimensions = config.get<number>('llm.embeddings.dimensions') ?? 1024;
  }

  get enabled(): boolean {
    return this.provider === 'voyage' && this.apiKey.length > 0;
  }

  /** `null` when no provider is configured — callers fall back to full text. */
  async embed(texts: string[], inputType: 'document' | 'query' = 'document'): Promise<number[][] | null> {
    if (!this.enabled || texts.length === 0) return null;

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: inputType,
        output_dimension: this.dimensions,
      }),
    });

    if (!response.ok) {
      this.logger.error(`embedding request failed: ${response.status} ${await response.text()}`);
      return null;
    }

    const body = (await response.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const ordered = [...body.data].sort((a, b) => a.index - b.index);

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
