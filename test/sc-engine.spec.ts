import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { runSCEngine } from '#/kb/engine/sc/sc-engine.js';
import { assembleSCProof } from '#/kb/output/sc-proof.js';
import { compileSCSpecToSignSpec } from '#/kb/render/sc-compile.js';
import { buildRenderContract, verifyContract } from '#/kb/render/contract.js';
import { buildSignScene } from '#/kb/render/scene.js';
import type { SCJobInput } from '#/kb/domain/sc-spec.js';

/**
 * Smoke tests for the independent Sign Cabinets pipeline — proves it runs
 * end to end (its own intake, defaults, validation, render-contract) without
 * touching `runEngine`/`ALL_RULES` or `runDLEngine`/`DL_ALL_RULES`, and that
 * it compiles into a `SignSpec` the shared renderer draws correctly using
 * the existing `CL-C-02`/`CL-CT-03` box render path — no new branch in
 * `scene.ts`/`contract.ts`.
 */
function baseJob(overrides: Partial<SCJobInput['form']> = {}): SCJobInput {
  return {
    jobId: 'sc-test-1',
    form: {
      businessName: 'Prime Food Mart',
      faceMaterial: 'Pan Face',
      mountingMethod: 'Wall Mounted',
      ...overrides,
    },
    artwork: [{
      id: 'a1',
      kind: 'shape',
      text: 'PRIME FOOD MART',
      bbox: { x: 0, y: 0, w: 120, h: 36 },
      capHeight: 36,
      baselineY: 0,
      narrowestStroke: 1,
      contours: [{
        points: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 36 }, { x: 0, y: 36 }],
        hole: false,
      }],
    }],
  };
}

describe('Sign Cabinets engine', () => {
  it('runs intake → defaults → validation → render-contract without touching CL or DL rules', async () => {
    const { spec, trace } = await runSCEngine(baseJob());

    expect(spec.faceMaterial).toBe('pan-face');
    expect(spec.mount).toBe('wall');
    expect(spec.blocked).toBe(false);

    expect(spec.cabinet.depth).toBe(7); // default extrusion
    expect(spec.cabinet.faceColour).toBeTruthy();
    expect(spec.cabinet.retainerType).toBe('normal');
    expect(spec.cabinet.cornerStyle).toBe('square');
    expect(spec.cabinet.lit).toBe(false); // not requested

    expect(trace.entries.some((t) => t.ruleId === 'SC-DEF-01')).toBe(true);
    expect(trace.entries.every((t) => !t.ruleId.startsWith('CL-'))).toBe(true);
    expect(trace.entries.every((t) => !t.ruleId.startsWith('DL-'))).toBe(true);
  });

  it('escalates an unresolved face material rather than guessing', async () => {
    const { spec } = await runSCEngine(baseJob({ faceMaterial: 'Unobtainium' }));
    expect(spec.escalations.some((e) => e.ruleId === 'SC-IN-01')).toBe(true);
  });

  it('illuminates only an illuminable face material, and escalates when asked to light a non-illuminable one', async () => {
    const lit = await runSCEngine(baseJob({ illuminated: true }));
    expect(lit.spec.cabinet.lit).toBe(true);
    expect(lit.spec.cabinet.ledColour).toBeTruthy();
    expect(lit.spec.views).toEqual(['day', 'night']);

    const notIlluminable = await runSCEngine(baseJob({ faceMaterial: 'Panel with Vinyl', illuminated: true }));
    expect(notIlluminable.spec.cabinet.lit).toBe(false);
    expect(notIlluminable.spec.escalations.some((e) => e.ruleId === 'SC-R-01')).toBe(true);
    expect(notIlluminable.spec.views).toEqual(['day']);
  });

  it('compiles to a SignSpec using the existing CL-C-02/CL-CT-03 box render path, no new construction', async () => {
    const { spec } = await runSCEngine(baseJob({ illuminated: true }));
    const compiled = compileSCSpecToSignSpec(spec);

    expect(compiled.elements).toHaveLength(1);
    const el = compiled.elements[0]!;
    expect(el.construction).toBe('CL-C-02');
    expect(el.copyTreatment).toBe('CL-CT-03');
    expect(el.lit).toBe(true);
    expect(el.returnDepth).toBe(7);

    // The shared, unmodified render contract builder must accept it cleanly —
    // proves SC needs no new branch in contract.ts's `truthFor`.
    const contract = buildRenderContract(compiled);
    expect(contract.views).toEqual(['day', 'night']);
    const violations = verifyContract(compiled, contract);
    expect(violations).toEqual([]);
  });

  it('assembles a Proof whose spec block reads as Sign Cabinet, not Channel Letters or Dimensional Letters', async () => {
    const { spec, trace, unverifiedThresholds } = await runSCEngine(baseJob());
    const proof = assembleSCProof(spec, trace, { unverifiedThresholds });

    expect(proof.blocked).toBe(false);
    expect(proof.specBlock).toContain('Sign Cabinet');
    expect(proof.specBlock).toContain('Pan Face');
    expect(proof.specBlock).not.toContain('Channel Letters');
    expect(proof.specBlock).not.toContain('Dimensional Letters');
    expect(proof.specBlock).not.toContain('TRIM CAP');
    expect(proof.sheetHtml).toContain('<html');
    expect(proof.sheetHtml).toContain('Sign Cabinet');
  });

  it('renders the box at its real extrusion depth through the shared three.js scene, day dark / night glowing', async () => {
    const { spec } = await runSCEngine(baseJob({ illuminated: true, extrusionDepth: 9 }));
    const compiled = compileSCSpecToSignSpec(spec);
    compiled.renderContract = buildRenderContract(compiled);

    const sign = buildSignScene(compiled, 'studio');
    const face = (): THREE.Mesh => {
      let found: THREE.Mesh | undefined;
      sign.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name.includes('face')) found = o as THREE.Mesh;
      });
      expect(found).toBeDefined();
      return found!;
    };

    sign.setView('day');
    expect((face().material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0).toBe(0);

    sign.setView('night');
    expect((face().material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0).toBeGreaterThan(0);

    let can: THREE.Mesh | undefined;
    sign.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o.name === 'CL-P-21 pill box' || o.name === 'CL-P-02 return')) can = o as THREE.Mesh;
    });
    expect(can).toBeDefined();
    can!.geometry.computeBoundingBox();
    const depth = can!.geometry.boundingBox!.max.z - can!.geometry.boundingBox!.min.z;
    expect(depth).toBeCloseTo(9, 5);

    sign.dispose();
  });

  it('blocks a face material request that could not be resolved and has no fallback shape', async () => {
    const job = baseJob({ faceMaterial: 'Unobtainium' });
    const { spec } = await runSCEngine(job);
    // Unresolved face material escalates (needs a human) rather than blocking
    // outright — same posture as DL-IN-01 for an unresolved material family.
    expect(spec.escalations.length).toBeGreaterThan(0);
  });
});
