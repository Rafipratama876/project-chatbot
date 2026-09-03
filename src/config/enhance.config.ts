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
  /**
   * `ENHANCE_MODEL` is this module's own override, checked first so it can
   * still be pinned independently of the account-wide image model. Below
   * that, `OPENAI_IMAGE_MODEL` — the model the rest of the account's image
   * generation is configured to use — so setting that one is enough; a
   * deploy is not supposed to need to know this module keeps a second knob.
   * `gpt-image-1` is the last resort only, not a preference.
   */
  model: process.env.ENHANCE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
  /**
   * Pixels of untouchable margin around the sign, so a model cannot work up
   * to the antialiased edge of the letterform.
   */
  margin: Number(process.env.ENHANCE_MARGIN_PX ?? 12),
  /**
   * Pixels of untouchable margin around CL-P-01 alone, used only in the
   * logo-only (material/lighting/environment) pass. Much wider than `margin`
   * on purpose: an inpainting model asked to fill in right at the edge of a
   * sharp letterform tends to keep drawing it, producing a smudged duplicate
   * of the mark just outside the protected pixels.
   */
  logoMargin: Number(process.env.ENHANCE_LOGO_MARGIN_PX ?? 60),
  /**
   * Candidates requested per logo-only pass, scored by `logoColourLeakFraction`
   * and the least-leaked one kept. One call, several draws from the model's
   * own randomness — the fix for an occasional ghosted duplicate of the mark
   * turning up in one draw is another draw, not a tighter mask. Multiplies
   * the cost of the call by this many.
   */
  candidates: Number(process.env.ENHANCE_CANDIDATES ?? 2),
  /**
   * Drops the mask entirely for the logo-only (studio, non-photograph)
   * pass: the whole panel, logo included, goes to the model as a reference
   * photo and comes back unrestored and unverified. Off by default — this
   * gives up the one guarantee (`git grep restoreProtected`) the rest of
   * this module exists to keep, and is only ever on because a client
   * explicitly, and more than once, chose that trade for the night-view
   * pass. See `EnhanceService.enhanceFullAi`.
   */
  fullAi: process.env.ENHANCE_FULL_AI === 'true',
  /**
   * A panel whose editable area is below this fraction is skipped: there is
   * nothing worth a round trip, and every call is a chance to fail.
   */
  minEditableFraction: Number(process.env.ENHANCE_MIN_EDITABLE ?? 0.05),
  timeoutMs: Number(process.env.ENHANCE_TIMEOUT_MS ?? 90_000),
}));
