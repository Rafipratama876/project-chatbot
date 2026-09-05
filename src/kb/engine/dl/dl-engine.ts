/**
 * The Dimensional Letters rule engine. Same shape as `../engine.ts`
 * (`runEngine`) — runs every gate in order, Gate 4 to a fixpoint — but does
 * not call it and does not import `ALL_RULES`. A future revision to the 56
 * `CL-R-*` rules cannot change what this function does, and vice versa.
 */
import type { DLJobInput, DLSpec } from '../../domain/dl-spec.js';
import { DLJobInputSchema } from '../../domain/dl-spec.js';
import { finishFromLabel } from '../../domain/dl-taxonomy.js';
import { defaultThresholds, type ThresholdStore, type Threshold } from '../../domain/thresholds.js';
import { DL_GATE_ORDER, DL_GATES, DL_MAX_VALIDATION_PASSES, type DLGateId } from './dl-gates.js';
import { TraceLog } from '../trace.js';
import { Authority, PrecedenceResolver } from '../precedence.js';
import { DLRuleRunContext, type DLEngineServices, type DLRule } from './dl-rule.js';
import { DL_ALL_RULES } from './rules/index.js';
import { runDLIntake } from './dl-intake.js';

export interface DLEngineOptions {
  thresholds?: ThresholdStore;
  services?: DLEngineServices;
  rules?: DLRule[];
}

export interface DLEngineResult {
  spec: DLSpec;
  trace: TraceLog;
  precedence: PrecedenceResolver;
  unverifiedThresholds: Threshold[];
  passes: number;
}

export async function runDLEngine(job: DLJobInput, options: DLEngineOptions = {}): Promise<DLEngineResult> {
  const input = DLJobInputSchema.parse(job);
  const th = options.thresholds ?? defaultThresholds();
  const services = options.services ?? {};
  const rules = options.rules ?? DL_ALL_RULES;

  const trace = new TraceLog();
  const precedence = new PrecedenceResolver(trace);

  const { spec } = await runDLIntake(input, th, trace, precedence, services);

  for (const gate of DL_GATE_ORDER) {
    if (gate === DL_GATES.INTAKE) continue;
    if (gate === DL_GATES.OUTPUT) continue; // owned by src/kb/output/dl-*.ts

    if (gate === DL_GATES.VALIDATION) {
      await runValidationToFixpoint(spec, rules, th, trace, precedence, services);
    } else {
      await runGate(gate, spec, rules, th, trace, precedence, services, 1);
    }

    // Customer-explicit element fields can only be claimed once elements
    // exist, i.e. right after Gate 2 composition.
    if (gate === DL_GATES.COMPOSITION) claimCustomerElementFields(input, spec, precedence);
    if (trace.blocked) { spec.blocked = true; break; }
  }

  return {
    spec, trace, precedence,
    unverifiedThresholds: th.unverifiedReads(),
    passes: 1,
  };
}

async function runGate(
  gate: DLGateId,
  spec: DLSpec,
  rules: DLRule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: DLEngineServices,
  pass: number,
): Promise<void> {
  for (const rule of rules) {
    if (rule.gate !== gate) continue;
    const ctx = new DLRuleRunContext(spec, th, trace, precedence, services, pass, rule);
    if (rule.applies && !rule.applies(ctx)) continue;
    await rule.run(ctx);
    if (trace.blocked) return;
  }
}

async function runValidationToFixpoint(
  spec: DLSpec,
  rules: DLRule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: DLEngineServices,
): Promise<number> {
  let pass = 0;
  let before = -1;

  while (pass < DL_MAX_VALIDATION_PASSES && before !== trace.mutations) {
    before = trace.mutations;
    pass += 1;
    await runGate(DL_GATES.VALIDATION, spec, rules, th, trace, precedence, services, pass);
    if (trace.blocked) break;
  }
  return pass;
}

/** The DL equivalent of CL's post-composition customer-claim step. */
function claimCustomerElementFields(job: DLJobInput, spec: DLSpec, precedence: PrecedenceResolver): void {
  const f = job.form;
  spec.elements.forEach((el, i) => {
    const p = `elements[${i}]`;
    // The finish field carries the SELECT's label ("Mirror Polish (up to
    // 24″)"), same as materialFamily/mountingMethod resolved in dl-intake.ts —
    // it has to become a DLFinish id before it touches `el.finish`, or
    // DL_FINISH_FACTS[el.finish] throws in the output layer. An unresolved
    // label is left unset here so DL-DEF-03 (Gate 3) applies the material's
    // default and logs why, rather than the customer's typed value silently
    // becoming a crash.
    const finish = f.finish ? finishFromLabel(f.finish) : null;

    if (f.depth !== undefined) precedence.claim(`${p}.depth`, Authority.CUSTOMER, 'DL-IN-04', f.depth);
    if (f.colour) precedence.claim(`${p}.colour`, Authority.CUSTOMER, 'DL-IN-04', f.colour);
    if (finish) precedence.claim(`${p}.finish`, Authority.CUSTOMER, 'DL-IN-04', finish);
    if (f.depth !== undefined) el.depth = f.depth;
    if (f.colour) el.colour = f.colour;
    if (finish) el.finish = finish;
  });
}
