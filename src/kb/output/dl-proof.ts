/**
 * DL GATE 6 — the proof package. The DL equivalent of `proof.ts`'s
 * `assembleProof`: assembles the spec block, disclosures and rendered panels,
 * and refuses to hand back a proof that violates its own output contract.
 *
 * Returns the exact same `Proof` interface `assembleProof` does — that shared
 * shape is what lets `DLProofEntity`, the DL DTOs and `ReviewPage.tsx` all
 * work against a type they already understand, without importing a single
 * line of Channel Letters logic.
 */
import type { DLSpec } from '../domain/dl-spec.js';
import type { TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import { renderDLSpecBlock, assertNoDLDeviceColours } from './dl-specBlock.js';
import { buildDLDisclosures, renderDLDisclosures, verifyDLDisclosureCoverage } from './dl-disclosures.js';
import { SCOPE_HARD_STOP } from '../domain/boilerplate.js';
import { DL_VERSION } from '../domain/dl-boilerplate.js';
import { visibilityFor } from '../domain/visibility.js';
import { renderDLProofSheet } from './dl-proofSheet.js';
import type { Proof, ProofPanel } from './proof.js';
import type { DisclosureBundle } from './disclosures.js';

export interface DLAssembleOptions {
  panels?: ProofPanel[];
  unverifiedThresholds?: Threshold[];
}

export function assembleDLProof(spec: DLSpec, trace: TraceLog, opts: DLAssembleOptions = {}): Proof {
  const disclosures = buildDLDisclosures(spec, trace, opts.unverifiedThresholds ?? []);
  const problems: string[] = [];

  problems.push(...verifyDLDisclosureCoverage(trace, disclosures));
  problems.push(...assertNoDLDeviceColours(spec));
  if (opts.panels) {
    for (const v of spec.views) {
      if (!opts.panels.some((p) => p.view === v)) problems.push(`DL: no ${v} panel was rendered.`);
    }
  }

  const panels = opts.panels ?? [];
  const guidance = spec.elements.map((el) =>
    `"${el.content}" at ${el.capHeight.toFixed(1)}" cap height reads best from about ${visibilityFor(el.capHeight).bestImpactFt} ft `
    + `and stops being readable past roughly ${visibilityFor(el.capHeight).maxReadableFt} ft.`);
  for (const el of spec.elements) {
    for (const s of el.suggestions ?? []) guidance.push(`Suggestion for "${el.content}": ${s}`);
  }

  const enhanced = panels.filter((p) => p.enhanced);
  if (enhanced.length > 0) {
    disclosures.precedenceNotes.push(
      `The ${enhanced.map((p) => p.view).join(' and ')} view${enhanced.length === 1 ? '' : 's'} `
      + 'shown here had the empty ground behind the sign rendered by a generative model. '
      + 'The sign itself — its outline, colours, dimensions and position — is the '
      + 'deterministic render, restored pixel for pixel and verified against it. '
      + 'Every figure in this document comes from the specification, not from the picture.',
    );
  }

  // `Proof.disclosures` is typed as CL's `DisclosureBundle` — DL never
  // produces a "critical substitution" (that concept, §6 CRITICAL
  // SUBSTITUTION, is CL-specific), so this is genuinely always empty rather
  // than a cast papering over a mismatch. Every other field is structurally
  // the same shape (`DLCallout`'s `kind` union is a subset of `Callout`'s).
  const disclosuresForProof: DisclosureBundle = { ...disclosures, criticals: [] };

  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    specBlock: renderDLSpecBlock(spec),
    disclosures: disclosuresForProof,
    disclosureText: renderDLDisclosures(disclosures),
    panels,
    guidance,
    problems,
    blocked: spec.blocked,
    hardStop: SCOPE_HARD_STOP,
    sheetHtml: renderDLProofSheet({
      spec, disclosures, panels, kbVersion: DL_VERSION, problems,
    }),
  };
}
