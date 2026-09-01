/**
 * The rule engine. Runs every gate in order; inside a gate, every rule that
 * applies. Gate 4 re-runs while its geometry rules keep changing the spec,
 * because §6.1 says "Offset Path to 1.5″. Revalidate."
 *
 * Deterministic by construction: no rule reads a clock, a random number, or a
 * model. The one judgment the KB genuinely needs (CL-R-54) arrives through a
 * port, and if it is absent or unsure the job escalates rather than guessing.
 */
import type { JobInput, SignSpec } from '../domain/spec.js';
import { JobInputSchema } from '../domain/spec.js';
import { defaultThresholds, type ThresholdStore, type Threshold } from '../domain/thresholds.js';
import { GATE_ORDER, GATES, MAX_VALIDATION_PASSES, type GateId } from './gates.js';
import { TraceLog } from './trace.js';
import { Authority, PrecedenceResolver } from './precedence.js';
import { RuleRunContext, type EngineServices, type Rule } from './rule.js';
import { ALL_RULES } from './rules/index.js';
import { runIntake } from './intake.js';

export interface EngineOptions {
  thresholds?: ThresholdStore;
  services?: EngineServices;
  rules?: Rule[];
  /** Set false to skip Gate 5 when only the spec block is wanted. */
  renderContract?: boolean;
}

export interface EngineResult {
  spec: SignSpec;
  trace: TraceLog;
  precedence: PrecedenceResolver;
  /** `[DER]` thresholds this run actually read — footnoted on the proof. */
  unverifiedThresholds: Threshold[];
  passes: number;
}

export async function runEngine(job: JobInput, options: EngineOptions = {}): Promise<EngineResult> {
  const input = JobInputSchema.parse(job);
  const th = options.thresholds ?? defaultThresholds();
  const services = options.services ?? {};
  const rules = options.rules ?? ALL_RULES;

  const trace = new TraceLog();
  const precedence = new PrecedenceResolver(trace);

  // ── Gate 1 ───────────────────────────────────────────────────────────────
  const { spec } = await runIntake(input, th, trace, precedence, services);

  let passes = 0;
  for (const gate of GATE_ORDER) {
    if (gate === GATES.INTAKE) continue;
    if (gate === GATES.OUTPUT) continue; // owned by src/output
    if (gate === GATES.RENDER_CONTRACT && options.renderContract === false) continue;

    if (gate === GATES.VALIDATION) {
      passes = await runValidationToFixpoint(spec, rules, th, trace, precedence, services);
    } else {
      await runGate(gate, spec, rules, th, trace, precedence, services, 1);
    }

    // Element-level customer claims can only be made once elements exist.
    if (gate === GATES.COMPOSITION) claimCustomerElementFields(input, spec, precedence);
    if (trace.blocked) { spec.blocked = true; break; }
  }

  return {
    spec,
    trace,
    precedence,
    unverifiedThresholds: th.unverifiedReads(),
    passes,
  };
}

async function runGate(
  gate: GateId,
  spec: SignSpec,
  rules: Rule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: EngineServices,
  pass: number,
): Promise<void> {
  for (const rule of rules) {
    if (rule.gate !== gate) continue;
    const ctx = new RuleRunContext(spec, th, trace, precedence, services, pass, rule);
    if (rule.applies && !rule.applies(ctx)) continue;
    await rule.run(ctx);
    if (trace.blocked) return;
  }
}

/**
 * §6.1: "Offset Path to 1.5″. Revalidate." An offset changes the bounding box,
 * which can trip §6.2 face-size rules, which can change the face material.
 * Re-run until nothing changes, bounded — a rule set that will not settle is a
 * bug in the rule set, and silently looping would hide it.
 */
async function runValidationToFixpoint(
  spec: SignSpec,
  rules: Rule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: EngineServices,
): Promise<number> {
  let pass = 0;
  let before = -1;

  while (pass < MAX_VALIDATION_PASSES && before !== trace.mutations) {
    before = trace.mutations;
    pass += 1;
    await runGate(GATES.VALIDATION, spec, rules, th, trace, precedence, services, pass);
    if (trace.blocked) break;
  }

  if (pass >= MAX_VALIDATION_PASSES && before !== trace.mutations) {
    trace.push({
      ruleId: 'CL-ENG-01', gate: GATES.VALIDATION, tier: 'SPEC', severity: 'WARN',
      critical: false, path: '', before: null, after: pass,
      message: `Gate 4 did not reach a fixpoint in ${MAX_VALIDATION_PASSES} passes — the spec may still violate a rule.`,
      kbRef: '§6.1',
    });
  }
  return pass;
}

/** §8.2 level 3 — the customer's explicit values, once elements exist. */
function claimCustomerElementFields(job: JobInput, spec: SignSpec, precedence: PrecedenceResolver): void {
  // CL-R-48 has already seeded these from the form; this records WHO owns each
  // field so §8.2 can stop a house default from overwriting a customer value.
  const f = job.form;
  spec.elements.forEach((el, i) => {
    const p = `elements[${i}]`;
    if (f.returnDepth !== undefined) precedence.claim(`${p}.returnDepth`, Authority.CUSTOMER, 'CL-IN-05', f.returnDepth);
    if (f.returnColour) precedence.claim(`${p}.returnColour`, Authority.CUSTOMER, 'CL-IN-05', f.returnColour);
    if (f.faceColour) precedence.claim(`${p}.face.colour`, Authority.CUSTOMER, 'CL-IN-05', f.faceColour);
    if (f.faceMaterial) precedence.claim(`${p}.face.material`, Authority.CUSTOMER, 'CL-IN-05', f.faceMaterial);
    if (f.ledColour) precedence.claim(`${p}.ledColour`, Authority.CUSTOMER, 'CL-IN-05', f.ledColour);
    if (f.trimCapColour) precedence.claim(`${p}.trimCap.colour`, Authority.CUSTOMER, 'CL-IN-05', f.trimCapColour);
    if (f.trimCapWidth !== undefined) precedence.claim(`${p}.trimCap.width`, Authority.CUSTOMER, 'CL-IN-05', f.trimCapWidth);
    if (f.ledColour) el.ledColour ??= f.ledColour;
  });
}
