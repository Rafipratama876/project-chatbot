/**
 * GATE 6 — the proof package. Assembles §9.3, §9.4 and the rendered panels,
 * and refuses to hand back a proof that violates its own contract.
 */
import type { SignSpec } from '../domain/spec.js';
import type { TraceLog } from '../engine/trace.js';
import type { Threshold } from '../domain/thresholds.js';
import { renderSpecBlock, assertNoDeviceColours } from './specBlock.js';
import { buildDisclosures, renderDisclosures, verifyDisclosureCoverage, type DisclosureBundle } from './disclosures.js';
import { verifyContract, type ContractViolation } from '../render/contract.js';
import { visibilityFor } from '../domain/visibility.js';
import { SCOPE_HARD_STOP, KB_VERSION } from '../domain/boilerplate.js';
import { renderProofSheet } from './proofSheet.js';

export interface ProofPanel {
  label: string;
  view: 'day' | 'night';
  camera: string;
  file: string;
  /** Inline copy, so the sheet is one self-contained file. */
  dataUrl?: string;
  /**
   * Set when the panel could not use the customer's photograph, saying why.
   * Carried explicitly rather than left to structural typing: a proof that
   * shows a studio card where the customer expects their own building has to
   * say so on the sheet, and a field nobody declared is a field that gets
   * dropped by the next `map` someone writes.
   */
  note?: string | null;
  /**
   * A presentation-only variant whose neutral ground was rendered by a
   * generative model. The sign in it is the deterministic render, restored
   * pixel for pixel and verified — see `render/protect.ts`.
   */
  enhanced?: { file: string; dataUrl?: string; reason: string } | null;
}

export interface Proof {
  jobId: string;
  businessName: string;
  specBlock: string;
  disclosures: DisclosureBundle;
  disclosureText: string;
  panels: ProofPanel[];
  /** §9.5 design guidance, derived from Layer 10. */
  guidance: string[];
  /** Non-empty means the proof must not ship. */
  problems: string[];
  blocked: boolean;
  hardStop: string;
  /** The full sheet — §9.3, §9.4, both views, elevation and section. */
  sheetHtml: string;
}

export interface AssembleOptions {
  panels?: ProofPanel[];
  unverifiedThresholds?: Threshold[];
}

export function assembleProof(spec: SignSpec, trace: TraceLog, opts: AssembleOptions = {}): Proof {
  const disclosures = buildDisclosures(spec, trace, opts.unverifiedThresholds ?? []);
  const problems: string[] = [];

  problems.push(...verifyDisclosureCoverage(trace, disclosures));
  problems.push(...assertNoDeviceColours(spec).map((p) => `§4.7: device colour survived to the spec block at ${p}.`));
  if (spec.renderContract) {
    problems.push(...verifyContract(spec, spec.renderContract).map(fmtViolation));
  }
  if (opts.panels && spec.renderContract) {
    for (const v of spec.renderContract.views) {
      if (!opts.panels.some((p) => p.view === v)) problems.push(`§9.1: no ${v} panel was rendered.`);
    }
  }

  const panels = opts.panels ?? [];
  const guidance = guidanceFor(spec);

  // A customer signing this has to know whether the picture in front of them
  // was touched by a generative model, and exactly how far that went. Stated
  // on the proof itself rather than left to a setting nobody sees.
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

  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    specBlock: renderSpecBlock(spec),
    disclosures,
    disclosureText: renderDisclosures(disclosures),
    panels,
    guidance,
    problems,
    blocked: spec.blocked,
    hardStop: SCOPE_HARD_STOP,
    sheetHtml: renderProofSheet({
      spec, disclosures, panels, kbVersion: KB_VERSION, problems,
      guidance,
    }),
  };
}

const fmtViolation = (v: ContractViolation): string =>
  `§9.2: ${v.requirement}${v.elementId ? ` (${v.elementId})` : ''} — ${v.detail}`;

/** §9.5 + Layer 10. Soft, and only after every hard rule has passed. */
function guidanceFor(spec: SignSpec): string[] {
  const out: string[] = [];
  for (const el of spec.elements) {
    const v = visibilityFor(el.capHeight);
    out.push(`"${el.content}" at ${el.capHeight.toFixed(1)}" cap height reads best from about ${v.bestImpactFt} ft and stops being readable past roughly ${v.maxReadableFt} ft.`);
  }
  for (const el of spec.elements) {
    for (const s of el.suggestions ?? []) out.push(`Suggestion for "${el.content}": ${s}`);
  }
  return out;
}
