/**
 * GATES — execution order.
 *
 * ⚠ The KB does not define these. v2.2 states that "each rule now carries a
 * gate so execution order no longer depends on ID order", and it names exactly
 * two: Gate 2 (§6.0 composition, "runs before everything else") and Gate 4
 * (§6.1–§6.7 validation). Gates 1, 3, 5 and 6 are reconstructed here from what
 * the rules require to already be true when they run.
 *
 * This file is the single place the ordering lives. It is the component that
 * makes the whole engine deterministic, so it must be confirmed by the KB owner
 * rather than inherited silently. See docs/GATES.md for the derivation and the
 * open questions.
 *
 * Derivation:
 *   G1 INTAKE      §1.2 and §7.1 must be resolved to a taxonomy ID before any
 *                  rule can read `spec.type`. Free-text branches escalate here.
 *   G2 COMPOSITION §6.0 states it. Assigns roles and constructions; §6.1 is
 *                  explicitly "CL-C-01 elements only", so it cannot run first.
 *   G3 DEFAULTS    §8.1 says "apply to every empty field". §6.3 CL-R-19 reads
 *                  return depth, and §6.2 CL-R-09 reads face material — both
 *                  are Gate 4 and both need a populated field to test.
 *                  Defaults that a Gate-4 rule owns outright (CL-D-01 → R-19,
 *                  CL-D-15 → R-36, CL-D-10/11 → R-28) are applied here at
 *                  Authority.HOUSE and re-asserted by the rule if needed.
 *   G4 VALIDATION  §6.1–§6.7 state it.
 *   G5 RENDER      §9.1 view selection and §9.2 visual-truth assertions. Reads
 *                  the finished spec; writes only render directives.
 *   G6 OUTPUT      §9.3 spec block and §9.4 disclosures, generated from the
 *                  trace produced by G1–G5.
 */

export const GATES = {
  INTAKE: 1,
  COMPOSITION: 2,
  DEFAULTS: 3,
  VALIDATION: 4,
  RENDER_CONTRACT: 5,
  OUTPUT: 6,
} as const;

export type GateId = (typeof GATES)[keyof typeof GATES];

export const GATE_ORDER: GateId[] = [1, 2, 3, 4, 5, 6];

export const GATE_NAME: Record<GateId, string> = {
  1: 'Intake & normalisation',
  2: 'Composition',
  3: 'Defaults',
  4: 'Validation',
  5: 'Render contract',
  6: 'Output',
};

/** Gates whose rules are stated by the KB rather than reconstructed. */
export const KB_STATED_GATES: GateId[] = [GATES.COMPOSITION, GATES.VALIDATION];

/**
 * §6.1 CL-R-01/02/03 say "Offset Path … Revalidate." A revalidation pass is a
 * second run of Gate 4 over the modified geometry. Bounded to stop an offset
 * from chasing its own tail.
 */
export const MAX_VALIDATION_PASSES = 3;
