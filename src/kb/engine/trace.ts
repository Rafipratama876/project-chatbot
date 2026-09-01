/**
 * The autofix log. §6.9 CL-R-47 requires every autofix to appear on the proof
 * in plain language, and §9.4 requires every AUTOFIX, WARN and defaulted field
 * to be reported. That means the trace is not debug output — it is the source
 * the disclosure section is generated from. A rule that mutates the spec
 * without emitting a trace entry produces a proof that lies.
 */

export type Tier = 'VISUAL' | 'SPEC' | 'STANDING';
export type Severity = 'AUTOFIX' | 'WARN' | 'NOTE' | 'BLOCK';

import type { GateId } from './gates.js';

export interface RuleTrace {
  ruleId: string;
  gate: GateId;
  tier: Tier;
  severity: Severity;
  /** ⚠ CRITICAL SUBSTITUTION — gets its own callout above the notes list. */
  critical: boolean;
  /** `elements[2].construction`, or '' for a whole-spec observation. */
  path: string;
  before: unknown;
  after: unknown;
  /** Machine-readable reason; the customer-facing wording is generated later. */
  message: string;
  elementId?: string;
  /** Thresholds this decision read, so a `[DER]` correction can be traced back. */
  thresholdKeys?: string[];
  kbRef: string;
  at: number;
}

export interface DefaultTrace {
  defaultId: string;
  path: string;
  value: unknown;
  label: string;
  elementId?: string;
  /** Proof-ready rendering of `value` — inches, not a raw float. */
  display: string;
}

export interface PrecedenceRefusal {
  path: string;
  attemptedBy: string;
  attemptedAuthority: number;
  heldBy: string;
  heldAuthority: number;
  attemptedValue: unknown;
}

export class TraceLog {
  readonly entries: RuleTrace[] = [];
  readonly defaults: DefaultTrace[] = [];
  readonly refusals: PrecedenceRefusal[] = [];

  /**
   * Writes that actually changed a value. The Gate 4 fixpoint is measured on
   * this, not on `entries.length`: WARN and NOTE rules re-report the same
   * observation on every pass by design (a 6″ return depth is still
   * on-request the second time CL-R-20 looks at it), so counting trace entries
   * would never converge and would report a spurious non-fixpoint on healthy
   * jobs.
   */
  mutations = 0;

  push(t: Omit<RuleTrace, 'at'>): void {
    this.entries.push({ ...t, at: this.entries.length });
  }

  recordMutation(): void { this.mutations += 1; }

  pushDefault(d: DefaultTrace): void { this.defaults.push(d); }
  pushRefusal(r: PrecedenceRefusal): void { this.refusals.push(r); }

  bySeverity(s: Severity): RuleTrace[] { return this.entries.filter((e) => e.severity === s); }
  criticals(): RuleTrace[] { return this.entries.filter((e) => e.critical); }
  fired(ruleId: string): boolean { return this.entries.some((e) => e.ruleId === ruleId); }
  forElement(id: string): RuleTrace[] { return this.entries.filter((e) => e.elementId === id); }

  get blocked(): boolean { return this.entries.some((e) => e.severity === 'BLOCK'); }

  /** Stable ordering for snapshot tests: gate, then emission order. */
  ordered(): RuleTrace[] {
    return [...this.entries].sort((a, b) => a.gate - b.gate || a.at - b.at);
  }
}
