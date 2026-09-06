/**
 * SC GATE 1 — intake and normalisation.
 *
 * The SC equivalent of `../intake.ts`/`../dl/dl-intake.ts`: turns the wizard
 * form into an `SCSpec` later gates can assume is well-formed — a real
 * `SCFaceMaterial`, a real `SCMount`, the cabinet's geometry from the
 * artwork's own bbox. Everything else is filled in Gate 3.
 */
import type { SCJobInput, SCSpec } from '../../domain/sc-spec.js';
import { bboxOf } from '../../domain/spec.js';
import {
  SC_FORM_FACE_MATERIAL_MAP, SC_FORM_MOUNT_MAP, SC_FACE_MATERIAL_FACTS, SC_MOUNT_FACTS,
  SC_RETAINER_TYPES, faceMaterialFromAlias, type SCFaceMaterial, type SCMount,
} from '../../domain/sc-taxonomy.js';
import { resolveFormValue } from '../../domain/taxonomy.js';
import type { ThresholdStore } from '../../domain/thresholds.js';
import { TraceLog } from '../trace.js';
import { Authority, PrecedenceResolver } from '../precedence.js';
import { SC_GATES } from './sc-gates.js';
import type { SCEngineServices } from './sc-rule.js';

export interface SCIntakeResult { spec: SCSpec; customerFields: string[] }

export async function runSCIntake(
  job: SCJobInput,
  _th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: SCEngineServices = {},
): Promise<SCIntakeResult> {
  const form = job.form;
  const minConfidence = services.minConfidence ?? 0.75;
  const emit = (ruleId: string, message: string, path: string, after: unknown, severity: 'AUTOFIX' | 'WARN' | 'NOTE' = 'NOTE') =>
    trace.push({
      ruleId, gate: SC_GATES.INTAKE, tier: 'SPEC', severity, critical: false,
      path, before: null, after, message, kbRef: 'PDF §5 (cabinet faces)',
    });

  const escalations: SCSpec['escalations'] = [];

  // ── SC-IN-01 · face material ─────────────────────────────────────────────
  let faceMaterial: SCFaceMaterial | null = null;
  let resolvedFrom: SCSpec['resolvedFrom'];

  const faceRes = resolveFormValue(SC_FORM_FACE_MATERIAL_MAP, form.faceMaterial);
  if (faceRes.value) {
    faceMaterial = faceRes.value;
  } else if (!faceRes.known) {
    faceMaterial = faceMaterialFromAlias(form.faceMaterial);
    if (faceMaterial) emit('SC-IN-01', `Form value "${form.faceMaterial}" matched alias for ${faceMaterial}.`, 'faceMaterial', faceMaterial);
  }

  if (!faceMaterial && faceRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'faceMaterial',
      text: form.additionalInformation ?? '',
      allowed: Object.keys(SC_FACE_MATERIAL_FACTS),
      labels: Object.fromEntries(Object.values(SC_FACE_MATERIAL_FACTS).map((m) => [m.id, m.label])),
    });
    if (r?.value && r.confidence >= minConfidence && r.value in SC_FACE_MATERIAL_FACTS) {
      faceMaterial = r.value as SCFaceMaterial;
      resolvedFrom = { field: 'faceMaterial', text: form.additionalInformation ?? '', confidence: r.confidence };
      emit('SC-IN-01', `"Custom" resolved to ${faceMaterial} from Additional Information (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'faceMaterial', faceMaterial, 'AUTOFIX');
    }
  }

  if (!faceMaterial) {
    escalations.push({
      ruleId: 'SC-IN-01',
      reason: `Face material "${form.faceMaterial}" could not be resolved to one of the 7 Sign Cabinet face materials.`,
      question: 'Which face material is this actually being fabricated in? A guess here would misprice and mis-render the job.',
    });
    faceMaterial = 'panel-with-vinyl'; // placeholder so downstream code has a shape; blocked below
  }

  // ── SC-IN-02 · mounting method ───────────────────────────────────────────
  let mount: SCMount | null = null;
  const mountRes = resolveFormValue(SC_FORM_MOUNT_MAP, form.mountingMethod);
  if (mountRes.value) {
    mount = mountRes.value;
  } else if (mountRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'mountingMethod',
      text: form.additionalInformation ?? '',
      allowed: Object.keys(SC_MOUNT_FACTS),
      labels: Object.fromEntries(Object.values(SC_MOUNT_FACTS).map((m) => [m.id, m.label])),
    });
    if (r?.value && r.confidence >= minConfidence) {
      mount = r.value as SCMount;
      emit('SC-IN-02', `"Other" mounting method resolved to ${mount} (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'mount', mount, 'AUTOFIX');
    }
  }
  if (!mount) {
    escalations.push({
      ruleId: 'SC-IN-02',
      reason: `Mounting method "${form.mountingMethod}" could not be resolved to one of the 5 PDF-listed installation options.`,
      question: 'Wall, blade, ceiling, pole or base mounted?',
    });
    mount = 'wall';
  }

  // The cabinet's own geometry: one rectangle sized from the artwork's
  // combined bbox (the face graphic, as placed on the wall) — SC Gate 2
  // (composition) is folded into intake here since there is only ever one
  // element, unlike CL/DL where composition groups N artwork items into
  // elements first.
  const bbox = bboxOf(job.artwork);

  const spec: SCSpec = {
    jobId: job.jobId,
    businessName: form.businessName,
    form,
    faceMaterial,
    resolvedFrom,
    artwork: job.artwork,
    cabinet: {
      bbox,
      contours: [],
      lit: false,
    },
    mount,
    mountingSurface: {
      colour: form.mountingSurfaceColour ?? 'unspecified',
      texture: form.mountingSurfaceTexture ?? 'unspecified',
    },
    attachmentDetail: form.attachmentDetail,
    overall: { w: bbox.w, h: bbox.h },
    quantity: form.quantity ?? 1,
    proofOptions: {
      showSizes: form.showSizesOnProof ?? true,
      showThickness: form.showMaterialThickness ?? false,
    },
    views: ['day'],
    site: form.site ?? {},
    placement: job.placement,
    artworkProvenance: job.artworkProvenance,
    escalations,
    blocked: false,
  };

  // ── SC-IN-03 · artwork provenance (same disclosure shape as CL-IN-06/DL-IN-03) ──
  const provenance = job.artworkProvenance;
  if (provenance && provenance.source === 'traced') {
    emit(
      'SC-IN-03',
      `Artwork was traced from a bitmap at ${(provenance.confidence * 100).toFixed(0)}% confidence. `
      + 'The outline approximates the original, and every dimension below is approximate with it. '
      + 'Vector artwork is needed before fabrication.'
      + (provenance.notes.length > 0 ? ` ${provenance.notes.join(' ')}` : ''),
      'artworkProvenance', provenance, 'WARN',
    );
  }

  // ── SC-IN-04 · claim customer-explicit fields ───────────────────────────
  const customerFields: string[] = [];
  const claim = (path: string, present: unknown) => {
    if (present !== undefined && present !== null && present !== '') {
      precedence.claim(path, Authority.CUSTOMER, 'SC-IN-04', present);
      customerFields.push(path);
    }
  };
  claim('faceMaterial', faceRes.value);
  claim('mount', mountRes.value);
  claim('quantity', form.quantity);
  claim('mountingSurface.colour', form.mountingSurfaceColour);
  if (form.extrusionDepth !== undefined) { precedence.claim('cabinet.depth', Authority.CUSTOMER, 'SC-IN-04', form.extrusionDepth); spec.cabinet.depth = form.extrusionDepth; customerFields.push('cabinet.depth'); }
  if (form.faceColour) { precedence.claim('cabinet.faceColour', Authority.CUSTOMER, 'SC-IN-04', form.faceColour); spec.cabinet.faceColour = form.faceColour; customerFields.push('cabinet.faceColour'); }
  if (form.cornerStyle) { precedence.claim('cabinet.cornerStyle', Authority.CUSTOMER, 'SC-IN-04', form.cornerStyle); spec.cabinet.cornerStyle = form.cornerStyle; customerFields.push('cabinet.cornerStyle'); }
  if (form.cornerRadius !== undefined) { precedence.claim('cabinet.cornerRadius', Authority.CUSTOMER, 'SC-IN-04', form.cornerRadius); spec.cabinet.cornerRadius = form.cornerRadius; customerFields.push('cabinet.cornerRadius'); }
  if (form.retainerType && (SC_RETAINER_TYPES as readonly string[]).includes(form.retainerType)) {
    const rt = form.retainerType as NonNullable<SCSpec['cabinet']['retainerType']>;
    precedence.claim('cabinet.retainerType', Authority.CUSTOMER, 'SC-IN-04', rt);
    spec.cabinet.retainerType = rt;
    customerFields.push('cabinet.retainerType');
  }

  return { spec, customerFields };
}
