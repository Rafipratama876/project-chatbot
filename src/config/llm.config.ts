import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  /**
   * The four bounded nodes are optional. With this false the engine still runs
   * all 56 rules; the two decision points escalate instead of guessing, which
   * is the outcome KB §1.2 and §3.5 ask for.
   */
  enabled: process.env.LLM_ENABLED === 'true',
  /**
   * The same OPENAI_API_KEY that `enhance.config.ts` reads for image
   * generation — one provider, one credential, for every model call this app
   * makes.
   */
  model: process.env.LLM_MODEL ?? 'gpt-5.1',
  /** Below this a resolver's answer is discarded and the job escalates. */
  minConfidence: Number(process.env.LLM_MIN_CONFIDENCE ?? 0.75),

  /** Embeddings for the pgvector stores — OpenAI, same credential as above. */
  embeddings: {
    provider: process.env.EMBEDDING_PROVIDER ?? 'none',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? 1536),
  },
}));
