/**
 * GATE 1 — intake and normalisation.
 *
 * Turns the Wolf Studio form plus measured artwork into a SignSpec that later
 * gates can assume is well-formed: a taxonomy ID for the type, a CL-MT-## for
 * the mount, and one proto-element per §3.2 group.
 *
 * The IDs emitted here (`CL-IN-##`) are engine-internal, not KB rule IDs — the
 * KB has no Gate-1 rules. They are distinguishable on purpose so an audit can
 * tell a KB rule from a pipeline step. See docs/GATES.md.
 */
import type { JobInput, SignSpec, Contour } from '../domain/spec.js';
import {
  FORM_TYPE_MAP, FORM_MOUNT_MAP, FORM_BACKER_MAP, TYPES, CUSTOM_RESOLVABLE, MOUNTS,
  resolveFormValue, typeFromAlias,
  type SignType, type MountMethod,
} from '../domain/taxonomy.js';
import type { BackerShape } from '../domain/materials.js';
import type { ThresholdStore } from '../domain/thresholds.js';
import { bboxOf, sqFt } from '../domain/spec.js';
import { TraceLog } from './trace.js';
import { Authority, PrecedenceResolver } from './precedence.js';
import { GATES } from './gates.js';
import type { EngineServices } from './rule.js';

export interface IntakeResult {
  spec: SignSpec;
  /** Fields the customer filled in — claimed at Authority.CUSTOMER. */
  customerFields: string[];
}

export async function runIntake(
  job: JobInput,
  _th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: EngineServices = {},
): Promise<IntakeResult> {
  const form = job.form;
  const minConfidence = services.minConfidence ?? 0.75;
  const emit = (ruleId: string, message: string, path: string, after: unknown, severity: 'AUTOFIX' | 'WARN' | 'NOTE' = 'NOTE') =>
    trace.push({
      ruleId, gate: GATES.INTAKE, tier: 'SPEC', severity, critical: false,
      path, before: null, after, message, kbRef: '§1.2 / §7.1',
    });

  // ── CL-IN-01 · §1.2 form type → taxonomy ────────────────────────────────
  let type: SignType | null = null;
  let resolvedFrom: SignSpec['resolvedFrom'];

  const typeRes = resolveFormValue(FORM_TYPE_MAP, form.channelLetterType);
  if (typeRes.value) {
    type = typeRes.value;
  } else if (!typeRes.known) {
    type = typeFromAlias(form.channelLetterType);
    if (type) emit('CL-IN-01', `Form value "${form.channelLetterType}" matched alias for ${type}.`, 'type', type);
  }

  if (!type && typeRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'channelLetterType',
      text: form.additionalInformation ?? '',
      allowed: CUSTOM_RESOLVABLE,
      labels: Object.fromEntries(CUSTOM_RESOLVABLE.map((t) => [t, TYPES[t].name])),
    });
    if (r?.value && r.confidence >= minConfidence && CUSTOM_RESOLVABLE.includes(r.value as SignType)) {
      type = r.value as SignType;
      resolvedFrom = { field: 'channelLetterType', text: form.additionalInformation ?? '', confidence: r.confidence };
      emit('CL-IN-01', `"Custom" resolved to ${type} from Additional Information (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'type', type, 'AUTOFIX');
    }
  }

  const escalationsPending: SignSpec['escalations'] = [];
  const escalations = escalationsPending;
  if (!type) {
    escalations.push({
      ruleId: 'CL-IN-01',
      reason: `Channel letter type "${form.channelLetterType}" could not be resolved to a §1.1 taxonomy ID.`,
      question: 'Which construction type is this? §1.2 requires escalation rather than a guess.',
    });
    type = 'CL-T-01'; // placeholder so downstream code has a shape; blocked below
  }

  // ── CL-IN-02 · §7.1 mount method ────────────────────────────────────────
  let mount: MountMethod | null = null;
  const mountRes = resolveFormValue(FORM_MOUNT_MAP, form.installationMethod);
  if (mountRes.value) {
    mount = mountRes.value;
  } else if (mountRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'installationMethod',
      text: form.additionalInformation ?? '',
      allowed: ['CL-MT-01', 'CL-MT-02', 'CL-MT-03', 'CL-MT-04', 'CL-MT-05'],
      labels: Object.fromEntries(Object.entries(MOUNTS).map(([k, v]) => [k, v.label])),
    });
    if (r?.value && r.confidence >= minConfidence) {
      mount = r.value as MountMethod;
      emit('CL-IN-02', `"Other" installation method resolved to ${mount} (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'mount', mount, 'AUTOFIX');
    }
  }
  if (!mount) {
    escalations.push({
      ruleId: 'CL-IN-02',
      reason: `Installation method "${form.installationMethod}" could not be resolved to a §7.1 mount method.`,
      question: 'Tape/adhesive, square tube frame, free-standing base or suspended? §7.1 CL-MT-06 requires escalation.',
    });
    mount = 'CL-MT-01';
  }

  // ── CL-IN-03 · §4.5 backer panel ────────────────────────────────────────
  // Orthogonal to the mount method: the form asks for it separately and any
  // method can carry one. An unmapped value escalates rather than silently
  // producing a sign with no backer — §11 open question 2 flags that the live
  // dropdown may not match the §4.5 shape list.
  const backerRes = resolveFormValue(FORM_BACKER_MAP, form.backerPanelOption);
  let backerShape: BackerShape | null = null;

  if (form.backerPanelOption && !backerRes.known) {
    escalationsPending.push({
      ruleId: 'CL-IN-03',
      reason: `Backer panel option "${form.backerPanelOption}" is not one of the §4.5 shapes.`,
      question: 'Which backer shape is this? §11 open question 2 — the form dropdown may need a mapping table.',
    });
  } else if (backerRes.value) {
    backerShape = backerRes.value as BackerShape;
  }

  // ── CL-IN-03b · scope check, KB Layer 0 ─────────────────────────────────
  // Recorded, not enforced: whether channel letters are present at all is only
  // knowable after Gate 2 assigns constructions.

  // ── CL-IN-04 · measured extent ──────────────────────────────────────────
  // Elements are NOT built here. §6.0 CL-R-48 owns grouping and runs in Gate 2;
  // building elements at intake would put a composition decision outside the
  // gate the KB assigns it to.
  const overall = bboxOf(job.artwork);

  const spec: SignSpec = {
    jobId: job.jobId,
    businessName: form.businessName,
    form,
    type,
    subtypes: [],
    mount,
    resolvedFrom,
    artwork: job.artwork,
    elements: [],
    backer: {
      present: backerShape !== null,
      shape: backerShape ?? 'straight-flat',
      material: 'acm',
      // Sized in Gate 2, once the elements exist and their extent is known.
      w: overall.w, h: overall.h, depth: 0,
      colour: form.backerPanelColour
        ?? form.mountingSurfaceColour
        ?? 'match mounting surface',
      housesSupplies: false,
    },
    mountingSurface: {
      colour: form.mountingSurfaceColour ?? 'unspecified',
      kind: form.mountingSurfaceKind ?? 'wall',
    },
    control: form.control,
    overall: { w: overall.w, h: overall.h },
    quantity: form.quantity ?? 1,
    proofOptions: {
      showSizes: form.showSizesOnProof ?? true,
      showThickness: form.showMaterialThickness ?? false,
    },
    views: ['day'],
    externalIllumination: form.externalIllumination ?? false,
    site: form.site ?? {},
    placement: job.placement,
    artworkProvenance: job.artworkProvenance,
    escalations,
    blocked: false,
  };

  emit('CL-IN-04', `Measured ${job.artwork.length} artwork item(s); overall ${overall.w.toFixed(1)}″ × ${overall.h.toFixed(1)}″ (${sqFt(overall).toFixed(1)} sq ft).`, 'overall', spec.overall, 'NOTE');

  // ── CL-IN-06 · artwork provenance ───────────────────────────────────────
  // A traced outline is an inference about the artwork, and every dimension on
  // the proof rests on it. §9.4 reports anything the customer would want to
  // know before signing, so it reports this.
  const provenance = job.artworkProvenance;
  if (provenance && provenance.source === 'traced') {
    emit(
      'CL-IN-06',
      `Artwork was traced from a bitmap at ${(provenance.confidence * 100).toFixed(0)}% confidence. ` +
      'The outline approximates the original, and every dimension below is approximate with it. ' +
      'Vector artwork is needed before fabrication.' +
      (provenance.notes.length > 0 ? ` ${provenance.notes.join(' ')}` : ''),
      'artworkProvenance',
      provenance,
      'WARN',
    );
  }

  // ── CL-IN-05 · claim customer-explicit fields, §8.2 level 3 ─────────────
  const customerFields: string[] = [];
  const claim = (path: string, present: unknown) => {
    if (present !== undefined && present !== null && present !== '') {
      precedence.claim(path, Authority.CUSTOMER, 'CL-IN-05', present);
      customerFields.push(path);
    }
  };
  claim('type', typeRes.value);
  claim('mount', mountRes.value);
  claim('control', form.control);
  claim('backer.present', form.backerPanelOption);
  claim('backer.colour', form.backerPanelColour);
  claim('quantity', form.quantity);

  // Landlord / permit facts outrank the customer — §8.2 level 2.
  if (form.site?.protrusionLimit !== undefined) {
    precedence.claim('mount', Authority.PERMIT, 'CL-IN-05', form.site.protrusionLimit);
  }

  return { spec, customerFields };
}

/** Utility for callers building artwork by hand or from an SVG import. */
export function contoursBBox(contours: Contour[]): { w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (const p of c.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { w: maxX - minX, h: maxY - minY };
}
