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
  /**
   * The presentation board, as a data URL. This is the single image a customer
   * is shown; the sheet is the long-form record behind it. Absent when the
   * board was skipped or a job was blocked before anything was drawn.
   */
  board?: string;
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
  return {
    jobId: spec.jobId,
    businessName: spec.businessName,
    specBlock: renderSpecBlock(spec),
    disclosures,
    disclosureText: renderDisclosures(disclosures),
    panels,
    guidance: guidanceFor(spec),
    problems,
    blocked: spec.blocked,
    hardStop: SCOPE_HARD_STOP,
    sheetHtml: renderProofSheet({
      spec, disclosures, panels, kbVersion: KB_VERSION, problems,
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
