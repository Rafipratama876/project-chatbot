import type { SignSpec, SignElement, Escalation } from '../domain/spec.js';
import type { ThresholdStore } from '../domain/thresholds.js';
import type { GateId } from './gates.js';
import type { Severity, Tier, TraceLog } from './trace.js';
import { Authority, PrecedenceResolver } from './precedence.js';
import { getPath, setPath, snapshot } from './path.js';

/**
 * Ports for the four places the KB genuinely needs judgment. Every one of them
 * is optional: without them the engine still runs, and the rules that need them
 * escalate instead of guessing. Nothing in Gate 2–5 calls a model to decide
 * geometry, lighting or materials.
 */
export interface FreeTextRequest {
  /** 'channelLetterType' (§1.2 Custom) or 'installationMethod' (§7.1 Other). */
  field: string;
  text: string;
  /** The closed set the answer must come from. */
  allowed: string[];
  labels: Record<string, string>;
}

export interface FreeTextResolution {
  value: string | null;
  confidence: number;
  reason: string;
}

export interface EngineServices {
  /** CL-R-54 / §3.5 step 1 — the only rule in Layer 6 that is not decidable. */
  logoComplexity?: (el: SignElement) => Promise<{
    complex: boolean; confidence: number; reason: string;
  }>;
  /** §1.2 Custom and §7.1 Other. Cannot resolve → escalate, never guess. */
  resolveFreeText?: (req: FreeTextRequest) => Promise<FreeTextResolution>;
  /**
   * §4.7 / CL-R-38 / CL-R-39. Without one, the spec block names the colour
   * system and marks the value indicative rather than inventing a colour
   * number. See ColourConverter in domain/materials.ts.
   */
  colourConverter?: import('../domain/materials.js').ColourConverter;
  /**
   * Below this the resolver's answer is discarded and the job escalates.
   * Default 0.75.
   */
  minConfidence?: number;
}

export interface RuleContext {
  readonly spec: SignSpec;
  readonly thresholds: ThresholdStore;
  readonly trace: TraceLog;
  readonly precedence: PrecedenceResolver;
  readonly services: EngineServices;
  /** Which validation pass this is (CL-R-01 "Revalidate"). */
  readonly pass: number;

  /** Mutate + record. The only sanctioned way a rule changes the spec. */
  set(path: string, value: unknown, opts: SetOptions): boolean;
  /** Record an observation with no mutation (WARN / NOTE rules). */
  note(message: string, opts?: NoteOptions): void;
  escalate(reason: string, question: string, ruleId?: string): void;
  get(path: string): unknown;
  /** `elements[2]` for the given element. */
  pathOf(el: SignElement, field?: string): string;
}

export interface SetOptions {
  message: string;
  /**
   * Attribute this write to a different rule. §3.5 is one decision tree whose
   * branches are numbered CL-R-50…54; running it as five separate rules would
   * mean re-deriving the same measurements five times and hoping the branches
   * stay mutually exclusive. It runs once and attributes the branch it took.
   */
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  authority?: Authority;
  elementId?: string;
  thresholdKeys?: string[];
  /** Override the rule's declared severity for this write. */
  severity?: Severity;
}

export interface NoteOptions {
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  path?: string;
  elementId?: string;
  thresholdKeys?: string[];
  severity?: Severity;
  value?: unknown;
}

/** Marks a trace entry that is an escalation rather than a plain warning. */
export const ESCALATION_PREFIX = 'ESCALATE: ';

export interface Rule {
  id: string;
  gate: GateId;
  tier: Tier;
  severity: Severity;
  /** ⚠ CRITICAL SUBSTITUTION in §6 — earns its own callout on the proof. */
  critical?: boolean;
  /** e.g. '§6.4' — printed in the audit log next to the ID. */
  kbRef: string;
  title: string;
  /** Cheap guard so `run` can assume its preconditions. */
  applies?(ctx: RuleContext): boolean;
  run(ctx: RuleContext): void | Promise<void>;
}

/** Concrete RuleContext; one instance per rule invocation. */
export class RuleRunContext implements RuleContext {
  constructor(
    readonly spec: SignSpec,
    readonly thresholds: ThresholdStore,
    readonly trace: TraceLog,
    readonly precedence: PrecedenceResolver,
    readonly services: EngineServices,
    readonly pass: number,
    private readonly rule: Rule,
  ) {}

  get(path: string): unknown { return getPath(this.spec, path); }

  pathOf(el: SignElement, field?: string): string {
    const i = this.spec.elements.indexOf(el);
    const base = `elements[${i}]`;
    return field ? `${base}.${field}` : base;
  }

  set(path: string, value: unknown, opts: SetOptions): boolean {
    const ruleId = opts.ruleId ?? this.rule.id;
    const authority = opts.authority ?? Authority.HOUSE;
    if (!this.precedence.canWrite(path, authority, ruleId, value)) return false;

    const before = snapshot(getPath(this.spec, path));
    const changed = JSON.stringify(before) !== JSON.stringify(snapshot(value));
    setPath(this.spec, path, value);
    this.precedence.claim(path, authority, ruleId, value);
    if (changed) this.trace.recordMutation();

    this.trace.push({
      ruleId,
      gate: this.rule.gate,
      tier: this.rule.tier,
      severity: opts.severity ?? this.rule.severity,
      critical: opts.critical ?? this.rule.critical ?? false,
      path,
      before,
      after: snapshot(value),
      message: opts.message,
      elementId: opts.elementId,
      thresholdKeys: opts.thresholdKeys,
      kbRef: opts.kbRef ?? this.rule.kbRef,
    });
    return true;
  }

  note(message: string, opts: NoteOptions = {}): void {
    const ruleId = opts.ruleId ?? this.rule.id;
    const path = opts.path ?? '';

    // Gate 4 re-runs to a fixpoint (§6.1 "Revalidate"), so a WARN or NOTE rule
    // observes the same thing on every pass. An observation that has not
    // changed is not a new event: recording it again inflates the audit log and
    // makes a two-pass job look like it had twice the problems.
    const alreadyObserved = this.trace.entries.some(
      (e) => e.ruleId === ruleId && e.path === path && e.message === message
        && e.elementId === opts.elementId,
    );
    if (alreadyObserved) return;

    this.trace.push({
      ruleId,
      gate: this.rule.gate,
      tier: this.rule.tier,
      severity: opts.severity ?? this.rule.severity,
      critical: opts.critical ?? this.rule.critical ?? false,
      path,
      before: opts.value !== undefined ? undefined : null,
      after: opts.value ?? null,
      message,
      elementId: opts.elementId,
      thresholdKeys: opts.thresholdKeys,
      kbRef: opts.kbRef ?? this.rule.kbRef,
    });
  }

  escalate(reason: string, question: string, ruleId?: string): void {
    const e: Escalation = { ruleId: ruleId ?? this.rule.id, reason, question };
    this.spec.escalations.push(e);
    // Recorded in the trace for the audit log, but tagged so §9.4 lists it
    // under "needs a human" rather than duplicating it under warnings.
    this.note(`${ESCALATION_PREFIX}${reason}`, { severity: 'WARN', ruleId: e.ruleId });
  }
}

/** Sugar used by most Layer 6 rules. */
export function forEachElement(
  ctx: RuleContext,
  fn: (el: SignElement, path: string) => void | Promise<void>,
): Promise<void> {
  return (async () => {
    for (const el of [...ctx.spec.elements]) {
      await fn(el, ctx.pathOf(el));
    }
  })();
}
