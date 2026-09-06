/**
 * SC GATE 6 — the proof package. The Sign Cabinets equivalent of `proof.ts`'s
 * `assembleProof`/`dl-proof.ts`'s `assembleDLProof`: assembles the spec
 * block, disclosures and rendered panels, and refuses to hand back a proof
 * that violates its own output contract.
 *
 * Returns the exact same `Proof` interface `assembleProof`/`assembleDLProof`
 * do — that shared shape is what lets `SCProofEntity`, the SC DTOs and the
 * review page's plumbing all work against a type they already understand,
 * without importing a single line of Channel Letters or Dimensional Letters
 * logic.
 */
import type { SCSpec } from '../domain/sc-spec.js';
import type { TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import { renderSCSpecBlock, assertNoSCDeviceColours } from './sc-specBlock.js';
import { buildSCDisclosures, renderSCDisclosures, verifySCDisclosureCoverage } from './sc-disclosures.js';
import { SCOPE_HARD_STOP } from '../domain/boilerplate.js';
import { SC_VERSION } from '../domain/sc-boilerplate.js';
import { renderSCProofSheet } from './sc-proofSheet.js';
import type { Proof, ProofPanel } from './proof.js';
import type { DisclosureBundle } from './disclosures.js';

export interface SCAssembleOptions {
  panels?: ProofPanel[];
  unverifiedThresholds?: Threshold[];
}

export function assembleSCProof(spec: SCSpec, trace: TraceLog, opts: SCAssembleOptions = {}): Proof {
  const disclosures = buildSCDisclosures(spec, trace, opts.unverifiedThresholds ?? []);
  const problems: string[] = [];

  problems.push(...verifySCDisclosureCoverage(trace, disclosures));
  problems.push(...assertNoSCDeviceColours(spec));
  if (opts.panels) {
    for (const v of spec.views) {
      if (!opts.panels.some((p) => p.view === v)) problems.push(`SC: no ${v} panel was rendered.`);
    }
  }

  const panels = opts.panels ?? [];
  const guidance = [...(spec.cabinet.suggestions ?? [])];

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

  // `Proof.disclosures` is typed as CL's `DisclosureBundle` — SC never
  // produces a "critical substitution" (that concept, §6 CRITICAL
  // SUBSTITUTION, is CL-specific), so this is genuinely always empty rather
  // than a cast papering over a mismatch, same reasoning as `dl-proof.ts`.
  const disclosuresForProof: DisclosureBundle = { ...disclosures, criticals: [] };

  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    specBlock: renderSCSpecBlock(spec),
    disclosures: disclosuresForProof,
    disclosureText: renderSCDisclosures(disclosures),
    panels,
    guidance,
    problems,
    blocked: spec.blocked,
    hardStop: SCOPE_HARD_STOP,
    sheetHtml: renderSCProofSheet({
      spec, disclosures, panels, kbVersion: SC_VERSION, problems,
    }),
  };
}
