/**
 * KB §3.5 — the decision tree. The KB marks it "deterministic, runs per
 * element", and it is: one branch (step 1, the logo-mark judgment) is the only
 * place the whole tree needs something a program cannot see, and that branch is
 * a port, not an inline model call. If the port is absent or unsure, the tree
 * escalates instead of choosing.
 */
import type { Construction, CopyTreatment, SignType } from '../domain/taxonomy.js';
import type { ThresholdStore } from '../domain/thresholds.js';
import { TYPES } from '../domain/taxonomy.js';
import { STROKE_TOLERANCE } from './offset.js';
import { formatInches } from '../domain/units.js';

export interface TreeInput {
  typographic: boolean;
  /** H — cap height. */
  capHeight: number;
  /** S — narrowest stroke. */
  narrowestStroke: number;
  /** P — primary element cap height, for context only. */
  primaryCapHeight: number;
  signType: SignType;
  /** True when the sign's returns are metal-finished — picks CL-C-05 over -04. */
  metalFinishedReturns: boolean;
  /** Step 1 answer for a logo mark. `undefined` = not yet judged. */
  logoComplex?: boolean;
  /**
   * §3.5's note — "Do not thicken a tagline. The Offset Path autofixes in §6.1
   * apply to CL-E-01 and CL-E-02 only … the correct answer is to change the
   * construction, not the letterform" — says the opposite for primary and
   * secondary copy: for those, the correct answer IS to change the letterform.
   *
   * ⚠ AMBIGUITY IN KB v2.2, worth confirming with the KB owner. Read literally,
   * §3.5 tests the CURRENT stroke, so any thin primary would be kicked to a
   * pill box in Gate 2 and CL-R-01/02/03 could never fire on anything — which
   * would make the most-used autofix in the source material unreachable. The
   * reading implemented here is that for offset-eligible roles the tree tests
   * the stroke the letterform can REACH, and Gate 4 then performs the offset.
   */
  offsetEligible: boolean;
  /** Narrowest stroke achievable by Offset Path. Defaults to the current one. */
  strokeAfterOffset?: number;
}

export interface TreeOutcome {
  construction: Construction;
  copyTreatment?: CopyTreatment;
  /** The §6.0 rule that owns this branch. */
  ruleId: string;
  /** Machine-readable reason; wording for the customer is generated later. */
  reason: string;
  critical: boolean;
  thresholdKeys: string[];
  /** Set when the tree could not decide — step 1 with no judgment available. */
  escalate?: { reason: string; question: string };
}

export function minStrokeFor(signType: SignType, th: ThresholdStore): { value: number; key: string } {
  const t = TYPES[signType];
  if (t.illumination === 'none') return { value: th.get('stroke.min.non_illuminated'), key: 'stroke.min.non_illuminated' };
  if (t.illumination === 'front+halo') return { value: th.get('stroke.min.front_and_back'), key: 'stroke.min.front_and_back' };
  return { value: th.get('stroke.min.illuminated'), key: 'stroke.min.illuminated' };
}

export function minHeightFor(
  signType: SignType,
  fontStyle: string | undefined,
  th: ThresholdStore,
): { value: number; key: string } {
  const t = TYPES[signType];
  if (t.illumination === 'none') return { value: th.get('height.min.non_illuminated'), key: 'height.min.non_illuminated' };
  if (fontStyle === 'serif' || fontStyle === 'script') {
    return { value: th.get('height.min.illuminated.serif_script'), key: 'height.min.illuminated.serif_script' };
  }
  return { value: th.get('height.min.illuminated'), key: 'height.min.illuminated' };
}

export function decideConstruction(
  input: TreeInput,
  th: ThresholdStore,
  fontStyle?: string,
): TreeOutcome {
  const lit = TYPES[input.signType].illumination !== 'none';

  // ── 1. NON-TYPOGRAPHIC (CL-E-04 logo mark) ──────────────────────────────
  if (!input.typographic) {
    if (input.logoComplex === undefined) {
      return {
        construction: 'CL-C-03',
        ruleId: 'CL-R-54',
        reason: 'logo-mark complexity not assessed',
        critical: false,
        thresholdKeys: [],
        escalate: {
          reason: 'Step 1 of the §3.5 decision tree needs a judgment about the logo mark that no measurement provides.',
          question: 'Does the mark have fine detail, enclosed counters or colour breaks that cannot be separate cans?',
        },
      };
    }
    return input.logoComplex
      ? { construction: 'CL-C-03', ruleId: 'CL-R-54', reason: 'logo mark has detail that cannot be separate cans', critical: false, thresholdKeys: [] }
      : { construction: 'CL-C-01', ruleId: 'CL-R-50', reason: 'logo mark buildable as an individual channel shape', critical: false, thresholdKeys: [] };
  }

  // ── 2. TYPOGRAPHIC ──────────────────────────────────────────────────────
  const minS = minStrokeFor(input.signType, th);
  const minH = minHeightFor(input.signType, fontStyle, th);
  const keys = [minS.key, minH.key];

  // Cap height is not something an offset can change, so it is always tested
  // as measured. Stroke is, but only for CL-E-01 and CL-E-02.
  const effectiveStroke = input.offsetEligible
    ? Math.max(input.narrowestStroke, input.strokeAfterOffset ?? input.narrowestStroke)
    : input.narrowestStroke;

  if (input.capHeight >= minH.value && effectiveStroke >= minS.value - STROKE_TOLERANCE) {
    const viaOffset = effectiveStroke > input.narrowestStroke;
    return {
      construction: 'CL-C-01',
      ruleId: 'CL-R-50',
      reason: viaOffset
        ? `H ${formatInches(input.capHeight)} ≥ ${formatInches(minH.value)}; stroke ${formatInches(input.narrowestStroke)} reaches the ${formatInches(minS.value)} minimum with Offset Path (§6.1 CL-R-01)`
        : `meets minimums: H ${formatInches(input.capHeight)} ≥ ${formatInches(minH.value)}, S ${formatInches(input.narrowestStroke)} ≥ ${formatInches(minS.value)}`,
      critical: false,
      thresholdKeys: keys,
    };
  }

  const minDimensional = th.get('composition.min_dimensional_cap_height');
  if (input.capHeight < minDimensional) {
    return {
      construction: 'CL-C-06',
      ruleId: 'CL-R-53',
      reason: `cap height ${formatInches(input.capHeight)} < ${formatInches(minDimensional)} — too small for any dimensional build`,
      critical: false,
      thresholdKeys: [...keys, 'composition.min_dimensional_cap_height'],
    };
  }

  if (lit) {
    return {
      construction: 'CL-C-02',
      copyTreatment: 'CL-CT-02',
      ruleId: 'CL-R-51',
      reason: `below minimum for individual letters (H ${formatInches(input.capHeight)} vs ${formatInches(minH.value)}, S ${formatInches(input.narrowestStroke)} vs ${formatInches(minS.value)}${input.offsetEligible ? ', not reachable by Offset Path' : '; §3.5 forbids thickening this role'}) and the sign is illuminated`,
      critical: true,
      thresholdKeys: [...keys, 'composition.min_dimensional_cap_height'],
    };
  }

  return {
    construction: input.metalFinishedReturns ? 'CL-C-05' : 'CL-C-04',
    ruleId: 'CL-R-52',
    reason: `below minimum for individual letters and the sign is not illuminated`,
    critical: true,
    thresholdKeys: [...keys, 'composition.min_dimensional_cap_height'],
  };
}
