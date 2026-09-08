import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '#/modules/render/concurrency.js';

describe('mapWithConcurrency', () => {
  it('returns results in input order, regardless of which finishes first', async () => {
    const delays = [30, 10, 20, 0];
    const out = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it('never runs more than `limit` mappers at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return i * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // proves it is not accidentally sequential either
  });

  it('processes every item exactly once even when limit exceeds the item count', async () => {
    const seen: number[] = [];
    const out = await mapWithConcurrency([1, 2, 3], 100, async (n) => {
      seen.push(n);
      return n * 10;
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(out).toEqual([10, 20, 30]);
  });

  it('returns an empty array for an empty input without touching the mapper', async () => {
    let called = false;
    const out = await mapWithConcurrency([], 3, async () => { called = true; return 1; });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('fails fast — the first rejection propagates, same as Promise.all', async () => {
    const items = [1, 2, 3, 4, 5];
    await expect(mapWithConcurrency(items, 2, async (n) => {
      if (n === 3) throw new Error('boom at 3');
      await new Promise((r) => setTimeout(r, 10));
      return n;
    })).rejects.toThrow('boom at 3');
  });

  it('rejects a non-positive or non-integer limit rather than silently coercing it', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(/positive integer/);
    await expect(mapWithConcurrency([1], -1, async (n) => n)).rejects.toThrow(/positive integer/);
    await expect(mapWithConcurrency([1], 1.5, async (n) => n)).rejects.toThrow(/positive integer/);
  });
});
