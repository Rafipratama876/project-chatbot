/**
 * DL rule mechanics — the Dimensional Letters equivalent of `../rule.ts`.
 *
 * Same shape (a rule sets/notes/escalates through a context that gates writes
 * by precedence and logs everything to the trace) so DL rules read like CL
 * rules and the disclosure generator can treat both traces the same way. It
 * is a separate file, typed against `DLSpec`/`DLElement`, so that a change to
 * CL's `EngineServices` (adding a CL-specific port) can never change what a
 * DL rule is allowed to do.
 *
 * `TraceLog`, `PrecedenceResolver`/`Authority` and the path helpers in
 * `../path.js` ARE reused as-is — they are generic (string path + JSON value),
 * with no reference to `SignSpec` anywhere in their own types.
 */
import type { DLSpec, DLElement } from '../../domain/dl-spec.js';
import type { ThresholdStore } from '../../domain/thresholds.js';
import type { DLGateId } from './dl-gates.js';
import type { Severity, Tier, TraceLog } from '../trace.js';
import { Authority, PrecedenceResolver } from '../precedence.js';
import { getPath, setPath, snapshot } from '../path.js';

export interface DLFreeTextRequest {
  /** 'materialFamily' or 'mountingMethod' — the DL equivalents of §1.2/§7.1. */
  field: string;
  text: string;
  allowed: string[];
  labels: Record<string, string>;
}

export interface DLFreeTextResolution { value: string | null; confidence: number; reason: string }

export interface DLEngineServices {
  /** Cannot resolve → escalate, never guess — same contract as CL's port. */
  resolveFreeText?: (req: DLFreeTextRequest) => Promise<DLFreeTextResolution>;
  colourConverter?: import('../../domain/materials.js').ColourConverter;
  minConfidence?: number;
}

export interface DLRuleContext {
  readonly spec: DLSpec;
  readonly thresholds: ThresholdStore;
  readonly trace: TraceLog;
  readonly precedence: PrecedenceResolver;
  readonly services: DLEngineServices;
  readonly pass: number;

  set(path: string, value: unknown, opts: DLSetOptions): boolean;
  note(message: string, opts?: DLNoteOptions): void;
  escalate(reason: string, question: string, ruleId?: string): void;
  get(path: string): unknown;
  pathOf(el: DLElement, field?: string): string;
}

export interface DLSetOptions {
  message: string;
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  authority?: Authority;
  elementId?: string;
  thresholdKeys?: string[];
  severity?: Severity;
}

export interface DLNoteOptions {
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  path?: string;
  elementId?: string;
  thresholdKeys?: string[];
  severity?: Severity;
  value?: unknown;
}

export const DL_ESCALATION_PREFIX = 'ESCALATE: ';

export interface DLRule {
  id: string;
  gate: DLGateId;
  tier: Tier;
  severity: Severity;
  critical?: boolean;
  /** PDF page reference, e.g. 'PDF p.9 (Gemini mounting options)'. */
  kbRef: string;
  title: string;
  applies?(ctx: DLRuleContext): boolean;
  run(ctx: DLRuleContext): void | Promise<void>;
}

export class DLRuleRunContext implements DLRuleContext {
  constructor(
    readonly spec: DLSpec,
    readonly thresholds: ThresholdStore,
    readonly trace: TraceLog,
    readonly precedence: PrecedenceResolver,
    readonly services: DLEngineServices,
    readonly pass: number,
    private readonly rule: DLRule,
  ) {}

  get(path: string): unknown { return getPath(this.spec, path); }

  pathOf(el: DLElement, field?: string): string {
    const i = this.spec.elements.indexOf(el);
    const base = `elements[${i}]`;
    return field ? `${base}.${field}` : base;
  }

  set(path: string, value: unknown, opts: DLSetOptions): boolean {
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

  note(message: string, opts: DLNoteOptions = {}): void {
    const ruleId = opts.ruleId ?? this.rule.id;
    const path = opts.path ?? '';

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
    const e = { ruleId: ruleId ?? this.rule.id, reason, question };
    this.spec.escalations.push(e);
    this.note(`${DL_ESCALATION_PREFIX}${reason}`, { severity: 'WARN', ruleId: e.ruleId });
  }
}
