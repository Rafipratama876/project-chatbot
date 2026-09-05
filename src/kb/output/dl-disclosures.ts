/**
 * Dimensional Letters disclosures — the DL equivalent of `disclosures.ts`,
 * generated from the trace the same way (a rule that mutates the spec without
 * a trace entry produces a proof that lies, same discipline as CL). Does not
 * import `disclosures.ts` — it does reuse `DISCLAIMER` from
 * `domain/boilerplate.ts` (that text — "pre-sales concept only" — is generic,
 * not channel-letters-specific) and `DL_ESCALATION_PREFIX` from the DL rule
 * engine, but nothing that encodes CL's own part vocabulary.
 */
import type { RuleTrace, TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import type { DLSpec } from '../domain/dl-spec.js';
import { DISCLAIMER } from '../domain/boilerplate.js';
import { AUTHORITY_LABEL, type Authority } from '../engine/precedence.js';
import { DL_ESCALATION_PREFIX } from '../engine/dl/dl-rule.js';
import { DL_INSTALL_TEMPLATE_REQUIRED } from '../domain/dl-taxonomy.js';

export interface DLCallout {
  kind: 'autofix' | 'warning' | 'default' | 'escalation';
  ruleId: string;
  elementId?: string;
  text: string;
}

export interface DLDisclosureBundle {
  autofixes: DLCallout[];
  warnings: DLCallout[];
  defaults: DLCallout[];
  escalations: DLCallout[];
  derivedValues: Threshold[];
  precedenceNotes: string[];
  standingNotes: string[];
  disclaimer: string;
}

export function buildDLDisclosures(spec: DLSpec, trace: TraceLog, unverified: Threshold[]): DLDisclosureBundle {
  const seen = new Set<string>();
  const dedupe = (t: RuleTrace): boolean => {
    const key = `${t.ruleId}|${t.elementId ?? ''}|${t.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const autofixes = trace.entries
    .filter((t) => t.severity === 'AUTOFIX')
    .filter(dedupe)
    .map((t): DLCallout => ({ kind: 'autofix', ruleId: t.ruleId, elementId: t.elementId, text: t.message }));

  const warnings = trace.entries
    .filter((t) => t.severity === 'WARN' || t.severity === 'BLOCK')
    .filter((t) => !t.message.startsWith(DL_ESCALATION_PREFIX))
    .filter(dedupe)
    .map((t): DLCallout => ({ kind: 'warning', ruleId: t.ruleId, elementId: t.elementId, text: t.message }));

  const grouped = new Map<string, { label: string; display: string; ids: string[]; id: string }>();
  for (const d of trace.defaults) {
    const key = `${d.defaultId}|${d.display}`;
    const g = grouped.get(key) ?? { label: d.label, display: d.display, ids: [], id: d.defaultId };
    if (d.elementId) g.ids.push(d.elementId);
    grouped.set(key, g);
  }
  const elementName = (id: string): string => {
    const el = spec.elements.find((e) => e.id === id);
    return el ? `"${el.content}"` : id;
  };
  const defaults: DLCallout[] = [...grouped.values()].map((g) => ({
    kind: 'default',
    ruleId: g.id,
    elementId: g.ids.length === 1 ? g.ids[0] : undefined,
    text: g.ids.length === 0
      ? `${g.label} was not specified; defaulted to ${g.display}.`
      : g.ids.length === spec.elements.length
        ? `${g.label} was not specified on any element; defaulted to ${g.display}.`
        : `${g.label} was not specified on ${g.ids.map(elementName).join(', ')}; defaulted to ${g.display}.`,
  }));

  const escalations: DLCallout[] = spec.escalations.map((e) => ({
    kind: 'escalation', ruleId: e.ruleId, text: `${e.reason} ${e.question}`,
  }));

  const precedenceNotes = trace.refusals.map((r) =>
    `${r.path}: ${r.attemptedBy} (${AUTHORITY_LABEL[r.attemptedAuthority as Authority]}) did not override ${r.heldBy} (${AUTHORITY_LABEL[r.heldAuthority as Authority]}).`,
  );

  const standingNotes: string[] = [];
  if (DL_INSTALL_TEMPLATE_REQUIRED) {
    standingNotes.push('A printed installation template is required on-site; stud/pad locations must match it exactly.');
  }

  return { autofixes, warnings, defaults, escalations, derivedValues: unverified, precedenceNotes, standingNotes, disclaimer: DISCLAIMER };
}

/** Lighter than CL's coverage check: confirms every AUTOFIX reached a callout. No part-vocabulary lint — DL text is template-generated, not free text. */
export function verifyDLDisclosureCoverage(trace: TraceLog, bundle: DLDisclosureBundle): string[] {
  const problems: string[] = [];
  const covered = new Set([...bundle.autofixes, ...bundle.warnings].map((c) => c.ruleId));
  for (const t of trace.bySeverity('AUTOFIX')) {
    if (!covered.has(t.ruleId)) problems.push(`DL: autofix ${t.ruleId} ("${t.message}") is not disclosed on the proof.`);
  }
  return problems;
}

export function renderDLDisclosures(b: DLDisclosureBundle): string {
  const out: string[] = [];

  if (b.autofixes.length) {
    out.push('ADJUSTMENTS MADE');
    for (const c of b.autofixes) out.push(`   · ${c.text}`);
    out.push('');
  }
  if (b.warnings.length) {
    out.push('THINGS TO CONFIRM');
    for (const c of b.warnings) out.push(`   · ${c.text}`);
    out.push('');
  }
  if (b.defaults.length) {
    out.push('DEFAULTS APPLIED');
    for (const c of b.defaults) out.push(`   · ${c.text}`);
    out.push('');
  }
  if (b.escalations.length) {
    out.push('NEEDS A HUMAN');
    for (const c of b.escalations) out.push(`   · [${c.ruleId}] ${c.text}`);
    out.push('');
  }
  if (b.derivedValues.length) {
    out.push('DERIVED VALUES USED (not vendor-confirmed)');
    for (const t of b.derivedValues) out.push(`   · ${t.key} = ${t.value}${t.unit === 'in' ? '"' : ''} [${t.source}] ${t.kbRef}${t.note ? ` — ${t.note}` : ''}`);
    out.push('');
  }
  if (b.standingNotes.length) {
    out.push('INSTALLATION NOTES');
    for (const n of b.standingNotes) out.push(`   · ${n}`);
    out.push('');
  }

  out.push(b.disclaimer);
  return out.join('\n');
}
