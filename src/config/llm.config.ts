import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  /**
   * The four bounded nodes are optional. With this false the engine still runs
   * all 56 rules; the two decision points escalate instead of guessing, which
   * is the outcome KB §1.2 and §3.5 ask for.
   */
  enabled: process.env.LLM_ENABLED === 'true',
  model: process.env.CL_MODEL ?? 'claude-opus-5',
  /** Below this a resolver's answer is discarded and the job escalates. */
  minConfidence: Number(process.env.CL_MIN_CONFIDENCE ?? 0.75),

  /**
   * Embeddings for the pgvector stores. Anthropic does not offer an embeddings
   * endpoint and recommends a third-party provider, so this is a separate
   * credential from ANTHROPIC_API_KEY.
   */
  embeddings: {
    provider: process.env.EMBEDDING_PROVIDER ?? 'none',
    apiKey: process.env.VOYAGE_API_KEY ?? '',
    model: process.env.EMBEDDING_MODEL ?? 'voyage-3',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1024),
  },
}));
