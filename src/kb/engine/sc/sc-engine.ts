/**
 * The Sign Cabinets rule engine. Same shape as `../engine.ts`/`../dl/dl-engine.ts`
 * — runs every gate in order, Gate 4 to a fixpoint — but does not call either
 * and does not import `ALL_RULES` or `DL_ALL_RULES`. A future revision to the
 * 56 `CL-R-*` rules or the DL rules cannot change what this function does,
 * and vice versa.
 */
import type { SCJobInput, SCSpec } from '../../domain/sc-spec.js';
import { SCJobInputSchema } from '../../domain/sc-spec.js';
import { defaultThresholds, type ThresholdStore, type Threshold } from '../../domain/thresholds.js';
import { SC_GATE_ORDER, SC_GATES, SC_MAX_VALIDATION_PASSES, type SCGateId } from './sc-gates.js';
import { TraceLog } from '../trace.js';
import { PrecedenceResolver } from '../precedence.js';
import { SCRuleRunContext, type SCEngineServices, type SCRule } from './sc-rule.js';
import { SC_ALL_RULES } from './rules/index.js';
import { runSCIntake } from './sc-intake.js';

export interface SCEngineOptions {
  thresholds?: ThresholdStore;
  services?: SCEngineServices;
  rules?: SCRule[];
}

export interface SCEngineResult {
  spec: SCSpec;
  trace: TraceLog;
  precedence: PrecedenceResolver;
  unverifiedThresholds: Threshold[];
  passes: number;
}

export async function runSCEngine(job: SCJobInput, options: SCEngineOptions = {}): Promise<SCEngineResult> {
  const input = SCJobInputSchema.parse(job);
  const th = options.thresholds ?? defaultThresholds();
  const services = options.services ?? {};
  const rules = options.rules ?? SC_ALL_RULES;

  const trace = new TraceLog();
  const precedence = new PrecedenceResolver(trace);

  const { spec } = await runSCIntake(input, th, trace, precedence, services);

  for (const gate of SC_GATE_ORDER) {
    if (gate === SC_GATES.INTAKE) continue;
    if (gate === SC_GATES.COMPOSITION) continue; // folded into intake — one cabinet, no grouping to do
    if (gate === SC_GATES.OUTPUT) continue; // owned by src/kb/output/sc-*.ts

    if (gate === SC_GATES.VALIDATION) {
      await runValidationToFixpoint(spec, rules, th, trace, precedence, services);
    } else {
      await runGate(gate, spec, rules, th, trace, precedence, services, 1);
    }

    if (trace.blocked) { spec.blocked = true; break; }
  }

  return {
    spec, trace, precedence,
    unverifiedThresholds: th.unverifiedReads(),
    passes: 1,
  };
}

async function runGate(
  gate: SCGateId,
  spec: SCSpec,
  rules: SCRule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: SCEngineServices,
  pass: number,
): Promise<void> {
  for (const rule of rules) {
    if (rule.gate !== gate) continue;
    const ctx = new SCRuleRunContext(spec, th, trace, precedence, services, pass, rule);
    if (rule.applies && !rule.applies(ctx)) continue;
    await rule.run(ctx);
    if (trace.blocked) return;
  }
}

async function runValidationToFixpoint(
  spec: SCSpec,
  rules: SCRule[],
  th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: SCEngineServices,
): Promise<number> {
  let pass = 0;
  let before = -1;

  while (pass < SC_MAX_VALIDATION_PASSES && before !== trace.mutations) {
    before = trace.mutations;
    pass += 1;
    await runGate(SC_GATES.VALIDATION, spec, rules, th, trace, precedence, services, pass);
    if (trace.blocked) break;
  }
  return pass;
}
