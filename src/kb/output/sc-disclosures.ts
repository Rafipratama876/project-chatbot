/**
 * Sign Cabinets disclosures — the SC equivalent of `disclosures.ts`/`dl-disclosures.ts`,
 * generated from the trace the same way (a rule that mutates the spec without
 * a trace entry produces a proof that lies, same discipline as CL/DL). Does
 * not import `disclosures.ts`/`dl-disclosures.ts` — it does reuse `DISCLAIMER`
 * from `domain/boilerplate.ts` (generic, not product-specific) and
 * `SC_ESCALATION_PREFIX` from the SC rule engine.
 */
import type { RuleTrace, TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import type { SCSpec } from '../domain/sc-spec.js';
import { DISCLAIMER } from '../domain/boilerplate.js';
import { AUTHORITY_LABEL, type Authority } from '../engine/precedence.js';
import { SC_ESCALATION_PREFIX } from '../engine/sc/sc-rule.js';

export interface SCCallout {
  kind: 'autofix' | 'warning' | 'default' | 'escalation';
  ruleId: string;
  text: string;
}

export interface SCDisclosureBundle {
  autofixes: SCCallout[];
  warnings: SCCallout[];
  defaults: SCCallout[];
  escalations: SCCallout[];
  derivedValues: Threshold[];
  precedenceNotes: string[];
  standingNotes: string[];
  disclaimer: string;
}

export function buildSCDisclosures(spec: SCSpec, trace: TraceLog, unverified: Threshold[]): SCDisclosureBundle {
  const seen = new Set<string>();
  const dedupe = (t: RuleTrace): boolean => {
    const key = `${t.ruleId}|${t.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const autofixes = trace.entries
    .filter((t) => t.severity === 'AUTOFIX')
    .filter(dedupe)
    .map((t): SCCallout => ({ kind: 'autofix', ruleId: t.ruleId, text: t.message }));

  const warnings = trace.entries
    .filter((t) => t.severity === 'WARN' || t.severity === 'BLOCK')
    .filter((t) => !t.message.startsWith(SC_ESCALATION_PREFIX))
    .filter(dedupe)
    .map((t): SCCallout => ({ kind: 'warning', ruleId: t.ruleId, text: t.message }));

  const defaults: SCCallout[] = trace.defaults.map((d) => ({
    kind: 'default',
    ruleId: d.defaultId,
    text: `${d.label} was not specified; defaulted to ${d.display}.`,
  }));

  const escalations: SCCallout[] = spec.escalations.map((e) => ({
    kind: 'escalation', ruleId: e.ruleId, text: `${e.reason} ${e.question}`,
  }));

  const precedenceNotes = trace.refusals.map((r) =>
    `${r.path}: ${r.attemptedBy} (${AUTHORITY_LABEL[r.attemptedAuthority as Authority]}) did not override ${r.heldBy} (${AUTHORITY_LABEL[r.heldAuthority as Authority]}).`,
  );

  const standingNotes: string[] = [
    'A printed installation template matched to the mounting hardware locations is recommended on-site.',
  ];

  return { autofixes, warnings, defaults, escalations, derivedValues: unverified, precedenceNotes, standingNotes, disclaimer: DISCLAIMER };
}

/** Lighter than CL's coverage check, same as DL's: confirms every AUTOFIX reached a callout. */
export function verifySCDisclosureCoverage(trace: TraceLog, bundle: SCDisclosureBundle): string[] {
  const problems: string[] = [];
  const covered = new Set([...bundle.autofixes, ...bundle.warnings].map((c) => c.ruleId));
  for (const t of trace.bySeverity('AUTOFIX')) {
    if (!covered.has(t.ruleId)) problems.push(`SC: autofix ${t.ruleId} ("${t.message}") is not disclosed on the proof.`);
  }
  return problems;
}

export function renderSCDisclosures(b: SCDisclosureBundle): string {
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
