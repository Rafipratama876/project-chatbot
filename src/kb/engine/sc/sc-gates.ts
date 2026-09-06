/**
 * SC GATES — execution order for the Sign Cabinets engine.
 *
 * Deliberately its own file rather than a reuse of `../gates.js` or
 * `../dl/dl-gates.js`: the numbers line up with the CL/DL gate numbers
 * (Intake → Composition → Defaults → Validation → Render contract → Output)
 * because that is a sound shape for any deterministic sign-spec pipeline, not
 * because SC rules extend the CL or DL gate list. Nothing here is read by
 * `runEngine`/`runDLEngine` and nothing in either file reads this one.
 */

export const SC_GATES = {
  INTAKE: 1,
  COMPOSITION: 2,
  DEFAULTS: 3,
  VALIDATION: 4,
  RENDER_CONTRACT: 5,
  OUTPUT: 6,
} as const;

export type SCGateId = (typeof SC_GATES)[keyof typeof SC_GATES];

export const SC_GATE_ORDER: SCGateId[] = [1, 2, 3, 4, 5, 6];

export const SC_GATE_NAME: Record<SCGateId, string> = {
  1: 'Intake & normalisation',
  2: 'Composition',
  3: 'Defaults',
  4: 'Validation',
  5: 'Render contract',
  6: 'Output',
};

export const SC_MAX_VALIDATION_PASSES = 2;
