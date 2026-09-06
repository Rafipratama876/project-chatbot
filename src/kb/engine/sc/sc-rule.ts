/**
 * SC rule mechanics — the Sign Cabinets equivalent of `../rule.ts`/`../dl/dl-rule.ts`.
 *
 * Same shape (a rule sets/notes/escalates through a context that gates writes
 * by precedence and logs everything to the trace) so SC rules read like CL/DL
 * rules and the disclosure generator can treat all three traces the same way.
 * Typed against `SCSpec`/`SCCabinet` so a change to CL's or DL's engine
 * services can never change what an SC rule is allowed to do.
 *
 * `TraceLog`, `PrecedenceResolver`/`Authority` and the path helpers in
 * `../path.js` ARE reused as-is — generic (string path + JSON value), no
 * reference to `SignSpec`/`DLSpec` anywhere in their own types.
 */
import type { SCSpec } from '../../domain/sc-spec.js';
import type { ThresholdStore } from '../../domain/thresholds.js';
import type { SCGateId } from './sc-gates.js';
import type { Severity, Tier, TraceLog } from '../trace.js';
import { Authority, PrecedenceResolver } from '../precedence.js';
import { getPath, setPath, snapshot } from '../path.js';

export interface SCFreeTextRequest {
  /** 'faceMaterial' or 'mountingMethod' — the SC equivalents of §1.2/§7.1. */
  field: string;
  text: string;
  allowed: string[];
  labels: Record<string, string>;
}

export interface SCFreeTextResolution { value: string | null; confidence: number; reason: string }

export interface SCEngineServices {
  /** Cannot resolve → escalate, never guess — same contract as CL's/DL's port. */
  resolveFreeText?: (req: SCFreeTextRequest) => Promise<SCFreeTextResolution>;
  colourConverter?: import('../../domain/materials.js').ColourConverter;
  minConfidence?: number;
}

export interface SCRuleContext {
  readonly spec: SCSpec;
  readonly thresholds: ThresholdStore;
  readonly trace: TraceLog;
  readonly precedence: PrecedenceResolver;
  readonly services: SCEngineServices;
  readonly pass: number;

  set(path: string, value: unknown, opts: SCSetOptions): boolean;
  note(message: string, opts?: SCNoteOptions): void;
  escalate(reason: string, question: string, ruleId?: string): void;
  get(path: string): unknown;
  pathOf(field?: string): string;
}

export interface SCSetOptions {
  message: string;
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  authority?: Authority;
  thresholdKeys?: string[];
  severity?: Severity;
}

export interface SCNoteOptions {
  ruleId?: string;
  kbRef?: string;
  critical?: boolean;
  path?: string;
  thresholdKeys?: string[];
  severity?: Severity;
  value?: unknown;
}

export const SC_ESCALATION_PREFIX = 'ESCALATE: ';

export interface SCRule {
  id: string;
  gate: SCGateId;
  tier: Tier;
  severity: Severity;
  critical?: boolean;
  /** PDF page reference, e.g. 'PDF p.5 (cabinet faces)'. */
  kbRef: string;
  title: string;
  applies?(ctx: SCRuleContext): boolean;
  run(ctx: SCRuleContext): void | Promise<void>;
}

export class SCRuleRunContext implements SCRuleContext {
  constructor(
    readonly spec: SCSpec,
    readonly thresholds: ThresholdStore,
    readonly trace: TraceLog,
    readonly precedence: PrecedenceResolver,
    readonly services: SCEngineServices,
    readonly pass: number,
    private readonly rule: SCRule,
  ) {}

  get(path: string): unknown { return getPath(this.spec, path); }

  /** There is exactly one cabinet per job, so this is always `cabinet[.field]`. */
  pathOf(field?: string): string {
    return field ? `cabinet.${field}` : 'cabinet';
  }

  set(path: string, value: unknown, opts: SCSetOptions): boolean {
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
      thresholdKeys: opts.thresholdKeys,
      kbRef: opts.kbRef ?? this.rule.kbRef,
    });
    return true;
  }

  note(message: string, opts: SCNoteOptions = {}): void {
    const ruleId = opts.ruleId ?? this.rule.id;
    const path = opts.path ?? '';

    const alreadyObserved = this.trace.entries.some(
      (e) => e.ruleId === ruleId && e.path === path && e.message === message,
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
      thresholdKeys: opts.thresholdKeys,
      kbRef: opts.kbRef ?? this.rule.kbRef,
    });
  }

  escalate(reason: string, question: string, ruleId?: string): void {
    const e = { ruleId: ruleId ?? this.rule.id, reason, question };
    this.spec.escalations.push(e);
    this.note(`${SC_ESCALATION_PREFIX}${reason}`, { severity: 'WARN', ruleId: e.ruleId });
  }
}
