/**
 * DL GATES — execution order for the Dimensional Letters engine.
 *
 * Deliberately its own file rather than a reuse of `../gates.js`: the numbers
 * happen to line up with the CL gate numbers (both run Intake → Composition →
 * Defaults → Validation → Render contract → Output) because that is a sound
 * shape for *any* deterministic sign-spec pipeline, not because DL rules are
 * an extension of the CL gate list. Nothing here is read by `runEngine` and
 * nothing in `../engine.ts` reads this file.
 */

export const DL_GATES = {
  INTAKE: 1,
  COMPOSITION: 2,
  DEFAULTS: 3,
  VALIDATION: 4,
  RENDER_CONTRACT: 5,
  OUTPUT: 6,
} as const;

export type DLGateId = (typeof DL_GATES)[keyof typeof DL_GATES];

export const DL_GATE_ORDER: DLGateId[] = [1, 2, 3, 4, 5, 6];

export const DL_GATE_NAME: Record<DLGateId, string> = {
  1: 'Intake & normalisation',
  2: 'Composition',
  3: 'Defaults',
  4: 'Validation',
  5: 'Render contract',
  6: 'Output',
};

export const DL_MAX_VALIDATION_PASSES = 2;
