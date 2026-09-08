/**
 * Runs `mapper` over `items`, at most `limit` in flight at once, resolving to
 * the results in the same order as `items` — the same contract as
 * `Promise.all`, just capped.
 *
 * A plain function on purpose, over RxJS's `mergeMap(fn, concurrency)` (RxJS
 * is already a dependency here — it rides in with NestJS — but nothing in
 * this codebase's own logic uses `Observable` anywhere, so bringing it into
 * one call site would be a second async paradigm the team has to already
 * know to review, not a shortcut). Anyone who can read a `for` loop and a
 * `Promise` can read this top to bottom; a stack trace through it is a plain
 * async/await stack, not a scheduler's.
 *
 * Bounded rather than `Promise.all`'s "everything at once": the caller this
 * was written for (`RenderService.render()`'s panel loop) fires requests at
 * OpenAI's image-edit endpoint, which is rate-limited — this project's own
 * test runs have logged "enhancement skipped: rate limited" already. Firing
 * every panel of a proof at once would make that worse, not faster.
 *
 * Fails fast, same as `Promise.all`: the first rejection is thrown. A panel
 * that cannot be produced already aborts the whole render today (there is no
 * per-panel recovery), and this preserves that rather than quietly finishing
 * the rest around a hidden failure. Promises already in flight when that
 * happens are not cancelled — the same is true of `Promise.all` itself.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`concurrency limit must be a positive integer, got ${limit}`);
  }
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  // Each worker pulls the next unclaimed index and processes it, then loops
  // back for another, until none are left. `nextIndex` is read and bumped in
  // the same synchronous step (no `await` between them), so — single-threaded
  // JS — two workers can never claim the same index.
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
