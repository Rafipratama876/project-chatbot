import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { runDLEngine } from '#/kb/engine/dl/dl-engine.js';
import { assembleDLProof } from '#/kb/output/dl-proof.js';
import { compileDLSpecToSignSpec } from '#/kb/render/dl-compile.js';
import { buildSignScene } from '#/kb/render/scene.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';
import { DL_MATERIALS } from '#/kb/domain/dl-taxonomy.js';

/**
 * Smoke tests for the independent Dimensional Letters pipeline — proves it
 * runs end to end (its own intake, composition, defaults, validation) without
 * touching `runEngine`/`ALL_RULES`, and that it compiles into a `SignSpec`
 * the shared renderer can draw with the real, un-clamped depth.
 */
function baseJob(overrides: Partial<DLJobInput['form']> = {}): DLJobInput {
  return {
    jobId: 'dl-test-1',
    form: {
      businessName: 'Acme Cast Co.',
      materialFamily: 'Cast Metal',
      mountingMethod: 'Stud Mounted',
      ...overrides,
    },
    artwork: [{
      id: 'a1',
      kind: 'glyph',
      char: 'A',
      text: 'ACME',
      bbox: { x: 0, y: 0, w: 40, h: 12 },
      capHeight: 12,
      baselineY: 0,
      narrowestStroke: 1.5,
      contours: [{
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 12 }, { x: 0, y: 12 }],
        hole: false,
      }],
    }],
  };
}

describe('Dimensional Letters engine', () => {
  it('runs intake → composition → defaults → validation → render-contract without touching CL rules', async () => {
    const { spec, trace } = await runDLEngine(baseJob());

    expect(spec.materialFamily).toBe('cast-metal');
    expect(spec.mount).toBe('stud-mounted');
    expect(spec.elements).toHaveLength(1);
    expect(spec.blocked).toBe(false);

    const el = spec.elements[0]!;
    // Depth was not given — defaulted (AUTOFIX) within cast-metal's range, not a CL default.
    expect(el.depth).toBeGreaterThanOrEqual(DL_MATERIALS['cast-metal'].minDepth);
    expect(el.depth).toBeLessThanOrEqual(DL_MATERIALS['cast-metal'].maxDepth);
    expect(el.finish).toBeTruthy();
    expect(el.colour).toBeTruthy();
    expect(el.lit).toBe(false);

    expect(trace.entries.some((t) => t.ruleId === 'DL-DEF-01')).toBe(true);
    // No CL-R-* / CL-D-* id should ever appear in a DL trace.
    expect(trace.entries.every((t) => !t.ruleId.startsWith('CL-'))).toBe(true);
  });

  it('resolves the finish SELECT label (not id) to a DLFinish, same as materialFamily/mountingMethod', async () => {
    const { spec } = await runDLEngine(baseJob({ materialFamily: 'Flat Cut Metal', finish: 'Mirror Polish (up to 24″)' }));
    expect(spec.elements[0]!.finish).toBe('mirror-polish');
  });

  it('an unrecognised finish label defaults instead of crashing the output layer', async () => {
    const { spec, trace } = await runDLEngine(baseJob({ finish: 'Not A Real Finish' }));
    expect(spec.elements[0]!.finish).toBe('satin-brushed'); // cast-metal's default
    expect(trace.entries.some((t) => t.message.includes('Not A Real Finish'))).toBe(true);
    // The bug this guards: DL_FINISH_FACTS[el.finish].label must not throw.
    expect(() => assembleDLProof(spec, trace, {})).not.toThrow();
  });

  it('escalates an unresolved material family rather than guessing', async () => {
    const { spec } = await runDLEngine(baseJob({ materialFamily: 'Unobtainium' }));
    expect(spec.escalations.some((e) => e.ruleId === 'DL-IN-01')).toBe(true);
  });

  it('compiles to a SignSpec that carries the real depth, not the flat-cut 0.5" placeholder', async () => {
    const { spec } = await runDLEngine(baseJob({ mountingMethod: 'Spacer Mount' }));
    const compiled = compileDLSpecToSignSpec(spec);

    expect(compiled.elements).toHaveLength(1);
    const el = compiled.elements[0]!;
    expect(el.returnDepth).toBe(spec.elements[0]!.depth);
    // Not the CL flat-cut render placeholder.
    expect(el.returnDepth).not.toBe(0.5);
    expect(el.face.colour).toBe(el.returnColour); // one uniform material
    expect(el.trimCap.kind).toBe('none');
    expect(compiled.renderContract?.elements[0]?.returnDepth).toBe(el.returnDepth);
  });

  it('assembles a Proof whose spec block reads as Dimensional Letters, not Channel Letters', async () => {
    const { spec, trace, unverifiedThresholds } = await runDLEngine(baseJob());
    const proof = assembleDLProof(spec, trace, { unverifiedThresholds });

    expect(proof.blocked).toBe(false);
    expect(proof.specBlock).toContain('Dimensional Letters');
    expect(proof.specBlock).toContain('Cast Metal');
    expect(proof.specBlock).not.toContain('Channel Letters');
    expect(proof.specBlock).not.toContain('TRIM CAP');
    expect(proof.sheetHtml).toContain('<html');
    expect(proof.sheetHtml).toContain('Dimensional Letters');
  });

  it('renders at its real depth — not the CL flat-cut 0.5" placeholder — without touching the CL-C-04/05 code path', async () => {
    const { spec } = await runDLEngine(baseJob());
    const el = spec.elements[0]!;
    el.depth = 1.75; // a depth CL-C-04/CL-C-05's hardcoded 0.5" would visibly get wrong
    const compiled = compileDLSpecToSignSpec(spec);

    const scene = buildSignScene(compiled, 'studio');
    let can: THREE.Mesh | undefined;
    scene.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name === 'CL-P-02 return') can = o as THREE.Mesh;
    });
    expect(can).toBeDefined();
    can!.geometry.computeBoundingBox();
    const depth = can!.geometry.boundingBox!.max.z - can!.geometry.boundingBox!.min.z;
    expect(depth).toBeCloseTo(1.75, 5);
    scene.dispose();
  });

  it('blocks a size wildly outside the material family range instead of shipping it', async () => {
    const job = baseJob();
    job.artwork[0]!.capHeight = 500; // >> 3x cast-metal's ~36" max
    job.artwork[0]!.bbox.h = 500;
    const { spec } = await runDLEngine(job);
    expect(spec.blocked).toBe(true);
  });
});
