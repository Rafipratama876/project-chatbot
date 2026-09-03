import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import path from 'node:path';
import type { SignSpec, SignElement } from '#/kb/domain/spec.js';
import { sqFt, depthOf, returnColourOf, faceColourOf, isBoxConstruction } from '#/kb/domain/spec.js';
import { CONSTRUCTION_FACTS, MOUNTS } from '#/kb/domain/taxonomy.js';
import { SCOPE_HARD_STOP } from '#/kb/domain/boilerplate.js';
import { renderSpecBlock } from '#/kb/output/specBlock.js';
import { renderElevation, renderSectionDetail, sectionSubject } from '#/kb/output/sectionDetail.js';
import type { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import type {
  BundleConstruction, BundlePanel, BundleSpecRow, RenderBundle,
} from './render-bundle.js';

/**
 * Turns a finished proof into the bundle a downstream proposal service
 * composes from.
 *
 * Everything here is projection: the values were decided by the 56 rules, and
 * this reads them off the stored spec. Nothing is inferred, nothing is
 * defaulted a second time, and a value the gates left unset is emitted as
 * `null` rather than as a hopeful string.
 */
@Injectable()
export class RenderBundleService {
  constructor(private readonly config: ConfigService) {}

  build(proof: ProofEntity): RenderBundle {
    const spec = proof.spec;
    const origin = this.config.getOrThrow<string>('app.publicUrl').replace(/\/$/, '');

    return {
      proofId: proof.id,
      jobId: proof.jobId,
      kbVersion: proof.kbVersion,
      businessName: proof.businessName,
      // The stored row types view and camera as plain strings; §9.1 only ever
      // produces the two views, and a row that somehow holds anything else is
      // dropped rather than passed on as a view the consumer cannot render.
      panels: proof.panels.flatMap((panel): BundlePanel[] => (
        panel.view === 'day' || panel.view === 'night'
          ? [{
              view: panel.view,
              camera: panel.camera as BundlePanel['camera'],
              label: panel.label,
              url: `${origin}/api/v1/proofs/${proof.id}/panels/${path.basename(panel.file)}`,
              note: panel.note ?? null,
            }]
          : []
      )),
      // A blocked job never reached the renderer, so there is no geometry to
      // draw from and an empty <svg> is the honest answer.
      drawings: spec
        ? { elevation: renderElevation(spec), section: renderSectionDetail(spec) }
        : { elevation: EMPTY_SVG, section: EMPTY_SVG },
      specRows: spec ? specRows(spec) : [],
      construction: spec ? construction(spec) : EMPTY_CONSTRUCTION,
      disclosures: proof.disclosureText ?? '',
      escalations: proof.escalations ?? [],
      problems: proof.problems ?? [],
      blocked: proof.blocked,
      hardStop: SCOPE_HARD_STOP,
    };
  }
}

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

const EMPTY_CONSTRUCTION: BundleConstruction = {
  channelLetterType: null, faceColor: null, faceColorTreatment: null,
  trimCapColor: null, returnColor: null, returnDepth: null,
  overallWidth: null, overallHeight: null, overallArea: null, letterHeight: null,
  installationMethod: null, backerPanel: null, backerPanelColor: null,
  signQuantity: null, standoff: null, illumination: null,
};

/**
 * §9.3 as label/value pairs.
 *
 * Parsed back out of `renderSpecBlock` rather than rebuilt: the block is the
 * one authority on what §9.3 prints and in what order, and a second
 * implementation beside it is a second thing to keep correct.
 *
 * The block pads every label to 18 columns, so "two or more spaces" is exactly
 * the label/value boundary — and it is also what rejects the prose, since a
 * section header ("── ELEMENT 1 · …") and a standing note ("· Colours are
 * indicative.") are single-spaced throughout. One rule, not a rule plus a
 * filter that would silently stop being load-bearing.
 */
function specRows(spec: SignSpec): BundleSpecRow[] {
  const rows: BundleSpecRow[] = [];
  for (const line of renderSpecBlock(spec).split('\n')) {
    const match = /^(\S(?:.*?\S)?)\s{2,}(.+)$/.exec(line.trim());
    if (match) rows.push({ label: match[1]!, value: match[2]! });
  }
  return rows;
}

function construction(spec: SignSpec): BundleConstruction {
  const primary = sectionSubject(spec);
  const lit = spec.elements.filter((el) => el.lit);

  return {
    channelLetterType: primary ? CONSTRUCTION_FACTS[primary.construction].label : null,
    faceColor: primary ? faceColourOf(primary) : null,
    faceColorTreatment: copyTreatment(primary),
    trimCapColor: primary?.trimCap.kind === 'none' ? null : primary?.trimCap.colour ?? null,
    // §9.3 omits the return on applied vinyl and flat-cut letters, because
    // neither has one. A colour reported here would describe a surface that
    // does not exist.
    returnColor: primary && hasReturn(primary) ? returnColourOf(primary) : null,
    returnDepth: primary && hasReturn(primary) ? round(primary.box?.depth ?? depthOf(primary)) : null,
    overallWidth: round(spec.overall.w),
    overallHeight: round(spec.overall.h),
    overallArea: round(sqFt(spec.overall)),
    letterHeight: primary ? round(primary.capHeight) : null,
    installationMethod: MOUNTS[spec.mount].label,
    backerPanel: spec.backer.present
      ? `${spec.backer.shape}, ${spec.backer.material.toUpperCase()}`
      : 'No backer panel',
    backerPanelColor: spec.backer.present ? spec.backer.colour : null,
    signQuantity: spec.quantity,
    standoff: primary?.standoff ? round(primary.standoff) : null,
    illumination: lit.length
      ? `LED ${[...new Set(lit.map((el) => el.ledColour ?? 'white'))].join(', ')}`
      : 'Non-illuminated',
  };
}

/** §9.3 prints a copy treatment for box constructions only. */
function copyTreatment(el: SignElement | undefined): string | null {
  if (!el?.copyTreatment || !isBoxConstruction(el.construction)) return null;
  return el.copyTreatment;
}

const hasReturn = (el: SignElement): boolean =>
  el.construction !== 'CL-C-06' && el.construction !== 'CL-C-04' && el.construction !== 'CL-C-05';

/** One decimal is the precision the spec block itself prints. */
const round = (value: number): number => Math.round(value * 10) / 10;
