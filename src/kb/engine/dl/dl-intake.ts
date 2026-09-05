/**
 * DL GATE 1 — intake and normalisation.
 *
 * The DL equivalent of `../intake.ts`: turns the wizard form into a `DLSpec`
 * later gates can assume is well-formed — a real `DLMaterialFamily`, a real
 * `DLMount`, everything else still empty. Elements are built in Gate 2
 * (`dl-composition.ts`), same separation of concerns as CL.
 */
import type { DLJobInput, DLSpec } from '../../domain/dl-spec.js';
import {
  DL_FORM_MATERIAL_MAP, DL_FORM_MOUNT_MAP, DL_MATERIALS, DL_MOUNT_FACTS,
  materialFromAlias, DL_INSTALL_TEMPLATE_REQUIRED,
  type DLMaterialFamily, type DLMount,
} from '../../domain/dl-taxonomy.js';
import { resolveFormValue } from '../../domain/taxonomy.js';
import type { ThresholdStore } from '../../domain/thresholds.js';
import { TraceLog } from '../trace.js';
import { Authority, PrecedenceResolver } from '../precedence.js';
import { DL_GATES } from './dl-gates.js';
import type { DLEngineServices } from './dl-rule.js';

export interface DLIntakeResult { spec: DLSpec; customerFields: string[] }

export async function runDLIntake(
  job: DLJobInput,
  _th: ThresholdStore,
  trace: TraceLog,
  precedence: PrecedenceResolver,
  services: DLEngineServices = {},
): Promise<DLIntakeResult> {
  const form = job.form;
  const minConfidence = services.minConfidence ?? 0.75;
  const emit = (ruleId: string, message: string, path: string, after: unknown, severity: 'AUTOFIX' | 'WARN' | 'NOTE' = 'NOTE') =>
    trace.push({
      ruleId, gate: DL_GATES.INTAKE, tier: 'SPEC', severity, critical: false,
      path, before: null, after, message, kbRef: 'PDF p.3 (material families)',
    });

  const escalations: DLSpec['escalations'] = [];

  // ── DL-IN-01 · material family ──────────────────────────────────────────
  let materialFamily: DLMaterialFamily | null = null;
  let resolvedFrom: DLSpec['resolvedFrom'];

  const matRes = resolveFormValue(DL_FORM_MATERIAL_MAP, form.materialFamily);
  if (matRes.value) {
    materialFamily = matRes.value;
  } else if (!matRes.known) {
    materialFamily = materialFromAlias(form.materialFamily);
    if (materialFamily) emit('DL-IN-01', `Form value "${form.materialFamily}" matched alias for ${materialFamily}.`, 'materialFamily', materialFamily);
  }

  if (!materialFamily && matRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'materialFamily',
      text: form.additionalInformation ?? '',
      allowed: Object.keys(DL_MATERIALS),
      labels: Object.fromEntries(Object.values(DL_MATERIALS).map((m) => [m.id, m.label])),
    });
    if (r?.value && r.confidence >= minConfidence && r.value in DL_MATERIALS) {
      materialFamily = r.value as DLMaterialFamily;
      resolvedFrom = { field: 'materialFamily', text: form.additionalInformation ?? '', confidence: r.confidence };
      emit('DL-IN-01', `"Custom" resolved to ${materialFamily} from Additional Information (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'materialFamily', materialFamily, 'AUTOFIX');
    }
  }

  if (!materialFamily) {
    escalations.push({
      ruleId: 'DL-IN-01',
      reason: `Material family "${form.materialFamily}" could not be resolved to one of the 8 DL material families.`,
      question: 'Which material is this actually being fabricated in? A guess here would misprice and mis-render the job.',
    });
    materialFamily = 'flat-cut-metal'; // placeholder so downstream code has a shape; blocked below
  }

  // ── DL-IN-02 · mounting method ──────────────────────────────────────────
  let mount: DLMount | null = null;
  const mountRes = resolveFormValue(DL_FORM_MOUNT_MAP, form.mountingMethod);
  if (mountRes.value) {
    mount = mountRes.value;
  } else if (mountRes.needsResolution) {
    const r = await services.resolveFreeText?.({
      field: 'mountingMethod',
      text: form.additionalInformation ?? '',
      allowed: Object.keys(DL_MOUNT_FACTS),
      labels: Object.fromEntries(Object.values(DL_MOUNT_FACTS).map((m) => [m.id, m.label])),
    });
    if (r?.value && r.confidence >= minConfidence) {
      mount = r.value as DLMount;
      emit('DL-IN-02', `"Other" mounting method resolved to ${mount} (confidence ${r.confidence.toFixed(2)}): ${r.reason}`, 'mount', mount, 'AUTOFIX');
    }
  }
  if (!mount) {
    escalations.push({
      ruleId: 'DL-IN-02',
      reason: `Mounting method "${form.mountingMethod}" could not be resolved to one of the 8 PDF-listed mounting methods.`,
      question: 'Tape, stud, jam nut, spacer, corrugated or flat-metal wall mount?',
    });
    mount = 'stud-mounted';
  }

  const spec: DLSpec = {
    jobId: job.jobId,
    businessName: form.businessName,
    form,
    materialFamily,
    resolvedFrom,
    artwork: job.artwork,
    elements: [],
    mount,
    mountingSurface: {
      colour: form.mountingSurfaceColour ?? 'unspecified',
      texture: form.mountingSurfaceTexture ?? 'unspecified',
    },
    requiresInstallTemplate: DL_INSTALL_TEMPLATE_REQUIRED,
    overall: { w: 0, h: 0 }, // sized in Gate 2 once elements exist
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

  // ── DL-IN-03 · artwork provenance (same disclosure shape as CL-IN-06) ───
  const provenance = job.artworkProvenance;
  if (provenance && provenance.source === 'traced') {
    emit(
      'DL-IN-03',
      `Artwork was traced from a bitmap at ${(provenance.confidence * 100).toFixed(0)}% confidence. `
      + 'The outline approximates the original, and every dimension below is approximate with it. '
      + 'Vector artwork is needed before fabrication.'
      + (provenance.notes.length > 0 ? ` ${provenance.notes.join(' ')}` : ''),
      'artworkProvenance', provenance, 'WARN',
    );
  }

  // ── DL-IN-04 · claim customer-explicit fields ───────────────────────────
  const customerFields: string[] = [];
  const claim = (path: string, present: unknown) => {
    if (present !== undefined && present !== null && present !== '') {
      precedence.claim(path, Authority.CUSTOMER, 'DL-IN-04', present);
      customerFields.push(path);
    }
  };
  claim('materialFamily', matRes.value);
  claim('mount', mountRes.value);
  claim('quantity', form.quantity);
  claim('mountingSurface.colour', form.mountingSurfaceColour);

  return { spec, customerFields };
}
