/**
 * CL-R-05 — "Offset Path applied to A B D G R P Q. Counters close up. Inspect
 * before rendering." NOTE severity.
 *
 * The KB says inspect. Inspection is countable: compare the number and area of
 * hole contours before and after the offset. No vision model is involved and no
 * human has to look at anything unless the count actually changed.
 */
import type { Contour } from '../domain/spec.js';
import type { OffsetResult } from './offset.js';

/** §6.1 CL-R-05, verbatim. */
export const COUNTER_LETTERS = new Set(['A', 'B', 'D', 'G', 'R', 'P', 'Q']);

export const hasCounterLetter = (text: string): boolean =>
  [...text.toUpperCase()].some((ch) => COUNTER_LETTERS.has(ch));

export const countersIn = (contours: Contour[]): number => contours.filter((c) => c.hole).length;

export interface CounterInspection {
  /** The rule's own trigger: one of A B D G R P Q was offset. */
  ruleTriggered: boolean;
  /** Measured: a counter actually disappeared or mostly filled in. */
  closed: boolean;
  lost: number;
  areaRetained: number;
  affectedLetters: string[];
  summary: string;
}

export function inspectCounters(text: string, result: OffsetResult): CounterInspection {
  const affected = [...new Set([...text.toUpperCase()].filter((ch) => COUNTER_LETTERS.has(ch)))];
  const ruleTriggered = affected.length > 0 && result.delta > 0;
  const lost = result.holesBefore - result.holesAfter;
  const areaRetained = result.holeAreaBefore > 0 ? result.holeAreaAfter / result.holeAreaBefore : 1;

  const summary = !ruleTriggered
    ? 'No counter-bearing letters were offset.'
    : result.countersClosed
      ? `${lost > 0 ? `${lost} counter(s) closed` : 'counters shrank'} on ${affected.join(' ')} — ${Math.round(areaRetained * 100)}% of counter area retained.`
      : `Counters on ${affected.join(' ')} survived the offset — ${Math.round(areaRetained * 100)}% of counter area retained.`;

  return { ruleTriggered, closed: result.countersClosed, lost, areaRetained, affectedLetters: affected, summary };
}
