import { registerAs } from '@nestjs/config';

export default registerAs('enhance', () => ({
  /**
   * The optional generative pass over the neutral ground of a panel.
   *
   * Off by default, and that is not timidity: a proof is a document a customer
   * signs, and the deterministic render is the thing the shop builds from. The
   * enhanced image is a presentation layer stored beside the base one, never
   * instead of it.
   */
  enabled: process.env.ENHANCE_ENABLED === 'true',
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.ENHANCE_MODEL ?? 'gpt-image-1',
  /**
   * Pixels of untouchable margin around the sign, so a model cannot work up
   * to the antialiased edge of the letterform.
   */
  margin: Number(process.env.ENHANCE_MARGIN_PX ?? 12),
  /**
   * A panel whose editable area is below this fraction is skipped: there is
   * nothing worth a round trip, and every call is a chance to fail.
   */
  minEditableFraction: Number(process.env.ENHANCE_MIN_EDITABLE ?? 0.05),
  timeoutMs: Number(process.env.ENHANCE_TIMEOUT_MS ?? 90_000),
}));
