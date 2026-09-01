/**
 * KB §9.4 — required disclosures, generated from the trace.
 *
 * This is why the trace is the real product. §9.4 requires the proof to report
 * every critical substitution, every other autofix, every warning and every
 * defaulted field. If each rule emits a trace entry, this section writes
 * itself and cannot drift from what the engine actually did. If the trace is
 * skipped, someone has to write these callouts by hand — and then the proof and
 * the spec stop agreeing the first time a rule changes.
 *
 * Every string here has a deterministic fallback. The LLM in src/llm/
 * writeCallouts.ts only rewrites item 1 and item 2 into customer language; it
 * never decides what is disclosed.
 */
import type { SignSpec } from '../domain/spec.js';
import type { RuleTrace, TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import { DISCLAIMER } from '../domain/boilerplate.js';
import { lintCallout } from '../domain/anatomy.js';
import { AUTHORITY_LABEL, type Authority } from '../engine/precedence.js';
import { ESCALATION_PREFIX } from '../engine/rule.js';

export interface Callout {
  /** §9.4 item 1 gets its own callout above the notes list. */
  kind: 'critical' | 'autofix' | 'warning' | 'default' | 'escalation';
  ruleId: string;
  elementId?: string;
  /** Deterministic wording. Always present. */
  text: string;
  /** Customer-facing rewrite, when one was generated. */
  customerText?: string;
}

export interface DisclosureBundle {
  criticals: Callout[];
  autofixes: Callout[];
  warnings: Callout[];
  defaults: Callout[];
  escalations: Callout[];
  /** `[DER]` values this proof depended on. */
  derivedValues: Threshold[];
  precedenceNotes: string[];
  disclaimer: string;
}

export function buildDisclosures(
  spec: SignSpec,
  trace: TraceLog,
  unverified: Threshold[],
): DisclosureBundle {
  const seen = new Set<string>();
  const dedupe = (t: RuleTrace): boolean => {
    const key = `${t.ruleId}|${t.elementId ?? ''}|${t.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const criticals = trace.entries
    .filter((t) => t.critical && t.severity !== 'NOTE')
    .filter(dedupe)
    .map((t) => toCallout('critical', t));

  const autofixes = trace.entries
    .filter((t) => t.severity === 'AUTOFIX' && !t.critical)
    .filter(dedupe)
    .map((t) => toCallout('autofix', t));

  const warnings = trace.entries
    .filter((t) => t.severity === 'WARN' || t.severity === 'BLOCK')
    // Escalations get their own section; listing them twice makes a proof read
    // as if two separate things went wrong.
    .filter((t) => !t.message.startsWith(ESCALATION_PREFIX))
    .filter(dedupe)
    .map((t) => toCallout('warning', t));

  // §9.4 item 4 requires every defaulted field to be reported. Three elements
  // that all took the same default are one fact, not three: printing it three
  // times buries the defaults that actually differ.
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

  const defaults = [...grouped.values()].map((g) => ({
    kind: 'default' as const,
    ruleId: g.id,
    elementId: g.ids.length === 1 ? g.ids[0] : undefined,
    text: g.ids.length === 0
      ? `${g.label} was not specified; defaulted to ${g.display}.`
      : g.ids.length === spec.elements.length
        ? `${g.label} was not specified on any element; defaulted to ${g.display}.`
        : `${g.label} was not specified on ${g.ids.map(elementName).join(', ')}; defaulted to ${g.display}.`,
  }));

  const escalations = spec.escalations.map((e) => ({
    kind: 'escalation' as const,
    ruleId: e.ruleId,
    text: `${e.reason} ${e.question}`,
  }));

  const precedenceNotes = trace.refusals.map((r) =>
    `${r.path}: ${r.attemptedBy} (${AUTHORITY_LABEL[r.attemptedAuthority as Authority]}) did not override ${r.heldBy} (${AUTHORITY_LABEL[r.heldAuthority as Authority]}).`,
  );

  return { criticals, autofixes, warnings, defaults, escalations, derivedValues: unverified, precedenceNotes, disclaimer: DISCLAIMER };
}

const toCallout = (kind: Callout['kind'], t: RuleTrace): Callout => ({
  kind, ruleId: t.ruleId, elementId: t.elementId, text: t.message,
});

const format = (v: unknown): string =>
  typeof v === 'number' ? `${v}` :
  typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);

/**
 * CL-R-47 enforcement. Every AUTOFIX in the trace must have reached a callout,
 * and every callout must pass the Layer 2 vocabulary check. Returns problems;
 * empty means the proof satisfies §9.4.
 */
export function verifyDisclosureCoverage(trace: TraceLog, bundle: DisclosureBundle): string[] {
  const problems: string[] = [];
  const covered = new Set([...bundle.criticals, ...bundle.autofixes, ...bundle.warnings].map((c) => c.ruleId));

  for (const t of trace.bySeverity('AUTOFIX')) {
    if (!covered.has(t.ruleId)) {
      problems.push(`CL-R-47: autofix ${t.ruleId} ("${t.message}") is not disclosed on the proof.`);
    }
  }
  for (const t of trace.criticals()) {
    if (!bundle.criticals.some((c) => c.ruleId === t.ruleId)) {
      problems.push(`§9.4 item 1: critical substitution ${t.ruleId} has no callout of its own.`);
    }
  }

  for (const c of [...bundle.criticals, ...bundle.autofixes, ...bundle.warnings]) {
    const text = c.customerText ?? c.text;
    const lint = lintCallout(text, { forbidHardware: true });
    if (lint.unknownPartTerms.length > 0) {
      problems.push(`Layer 2: callout for ${c.ruleId} names "${lint.unknownPartTerms.join('", "')}", which is not in the part vocabulary.`);
    }
    if (lint.hardwareMentions.length > 0) {
      problems.push(`§9.2: callout for ${c.ruleId} names fabrication hardware (${lint.hardwareMentions.join(', ')}) in customer-facing text.`);
    }
  }

  return problems;
}

/** Plain-text rendering of §9.4, in the order the KB lists it. */
export function renderDisclosures(b: DisclosureBundle): string {
  const out: string[] = [];

  if (b.criticals.length) {
    out.push('⚠ IMPORTANT CHANGES TO WHAT WAS REQUESTED');
    for (const c of b.criticals) out.push(`   ${c.customerText ?? c.text}`);
    out.push('');
  }
  if (b.autofixes.length) {
    out.push('ADJUSTMENTS MADE');
    for (const c of b.autofixes) out.push(`   · ${c.customerText ?? c.text}`);
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

  out.push(b.disclaimer);
  return out.join('\n');
}
