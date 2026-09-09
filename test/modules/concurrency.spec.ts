import { describe, expect, it } from 'vitest';
import { mapWithConcurrency, Semaphore } from '#/modules/render/concurrency.js';

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

describe('Semaphore', () => {
  it('lets up to `concurrency` acquires through immediately, blocks the rest', async () => {
    const sem = new Semaphore(2);
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();

    let thirdAcquired = false;
    const third = sem.acquire().then((release) => { thirdAcquired = true; return release; });
    // Give the event loop a turn — the third acquire must NOT have resolved yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(thirdAcquired).toBe(false);

    r1();
    const r3 = await third;
    expect(thirdAcquired).toBe(true);

    r2();
    r3();
  });

  it('never lets more than `n` holders run at once under real concurrent load', async () => {
    const sem = new Semaphore(3);
    let inFlight = 0;
    let maxInFlight = 0;

    const holders = Array.from({ length: 12 }, () => (async () => {
      const release = await sem.acquire();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      release();
    })());

    await Promise.all(holders);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // proves it is not accidentally serialising everything
  });

  it('wakes exactly one waiter per release, never the same one twice', async () => {
    // Real macrotask delays throughout, deliberately: this is checking that a
    // SECOND release doesn't happen on its own, so the assertion has to
    // observe a moment after all of a single release's own microtasks have
    // drained — racing microtask ordering here would make the test's own
    // timing the thing under test, not the semaphore.
    const sem = new Semaphore(1);
    const releaseFirst = await sem.acquire();

    let secondAcquired = false;
    let thirdAcquired = false;
    const secondP = sem.acquire().then((r) => { secondAcquired = true; return r; });
    const thirdP = sem.acquire().then((r) => { thirdAcquired = true; return r; });

    releaseFirst();
    await new Promise((r) => setTimeout(r, 10));
    expect(secondAcquired).toBe(true);
    expect(thirdAcquired).toBe(false); // one release woke exactly one waiter

    const releaseSecond = await secondP;
    releaseSecond();
    await new Promise((r) => setTimeout(r, 10));
    expect(thirdAcquired).toBe(true);

    const releaseThird = await thirdP;
    releaseThird();
  });

  it('rejects a non-positive or non-integer concurrency', () => {
    expect(() => new Semaphore(0)).toThrow(/positive integer/);
    expect(() => new Semaphore(-1)).toThrow(/positive integer/);
    expect(() => new Semaphore(1.5)).toThrow(/positive integer/);
  });
});
