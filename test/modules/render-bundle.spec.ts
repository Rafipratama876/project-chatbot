import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { runEngine } from '#/kb/engine/engine.js';
import { RenderBundleService } from '#/modules/compat/render-bundle.service.js';
import type { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import type { SignSpec } from '#/kb/domain/spec.js';
import { heavenCrepes, nonLitTagline } from '../fixtures/jobs.js';

const service = new RenderBundleService(
  new ConfigService({ app: { publicUrl: 'https://render.test/' } }),
);

/**
 * A stored proof row. Built from a real engine run rather than a hand-written
 * spec: the bundle projects values the 56 rules settled, so a fixture spec
 * would let it agree with something the gates never produce.
 */
async function proofFor(job: Parameters<typeof runEngine>[0]): Promise<ProofEntity> {
  const { spec, trace, unverifiedThresholds } = await runEngine(job);
  void trace;
  void unverifiedThresholds;
  return {
    id: 'proof-1',
    jobId: spec.jobId,
    businessName: spec.businessName,
    kbVersion: 'v2.2',
    spec,
    blocked: spec.blocked,
    escalations: spec.escalations,
    problems: [],
    disclosureText: 'Return depth defaulted to 5" per §8.1 CL-D-11.',
    panels: [
      { label: 'day · front elevation', view: 'day', camera: 'front-elevation', file: '/tmp/p/a.png', note: null },
      { label: 'night · construction detail', view: 'night', camera: 'detail-perspective', file: '/tmp/p/b.png', note: 'Studio card used.' },
    ],
  } as unknown as ProofEntity;
}

describe('RenderBundleService', () => {
  it('maps panels to absolute fetchable URLs, keeping the view/camera pair', async () => {
    const bundle = service.build(await proofFor(heavenCrepes()));

    expect(bundle.panels).toEqual([
      {
        view: 'day',
        camera: 'front-elevation',
        label: 'day · front elevation',
        url: 'https://render.test/api/v1/proofs/proof-1/panels/a.png',
        note: null,
      },
      {
        view: 'night',
        camera: 'detail-perspective',
        label: 'night · construction detail',
        url: 'https://render.test/api/v1/proofs/proof-1/panels/b.png',
        note: 'Studio card used.',
      },
    ]);
  });

  it('drops a panel whose view is not one §9.1 produces', async () => {
    const proof = await proofFor(heavenCrepes());
    proof.panels.push({
      label: 'x', view: 'twilight', camera: 'perspective', file: '/tmp/p/c.png', note: null,
    });

    expect(service.build(proof).panels.map((panel) => panel.view)).toEqual(['day', 'night']);
  });

  it('emits the drawings as SVG source, so the consumer rasterizes at its own size', async () => {
    const bundle = service.build(await proofFor(heavenCrepes()));

    expect(bundle.drawings.elevation).toMatch(/^<svg[\s\S]+<\/svg>$/);
    expect(bundle.drawings.section).toMatch(/^<svg[\s\S]+<\/svg>$/);
    expect(bundle.drawings.section).toContain('BUILDING WALL');
    expect(bundle.drawings.elevation).not.toContain('data:image');
  });

  it('reports construction as measured data, under the consumer\'s field ids', async () => {
    const bundle = service.build(await proofFor(heavenCrepes()));

    expect(bundle.construction.channelLetterType).toBe('Individual channel letters');
    expect(bundle.construction.installationMethod).toBe('Raceway');
    expect(bundle.construction.signQuantity).toBe(1);
    expect(bundle.construction.illumination).toMatch(/^LED /);
    // Numbers stay numbers: a consumer laying out a dimension line cannot
    // measure with the string '24"'.
    expect(typeof bundle.construction.returnDepth).toBe('number');
    expect(typeof bundle.construction.overallWidth).toBe('number');
    expect(typeof bundle.construction.letterHeight).toBe('number');
    expect(bundle.construction.overallArea).toBeCloseTo(
      (bundle.construction.overallWidth! * bundle.construction.overallHeight!) / 144,
      0,
    );
  });

  it('says null for a value no rule settled, never a placeholder string', async () => {
    const bundle = service.build(await proofFor(nonLitTagline()));

    expect(bundle.construction.illumination).toBe('Non-illuminated');
    expect(bundle.construction.backerPanel).toBe('No backer panel');
    expect(bundle.construction.backerPanelColor).toBeNull();
    expect(bundle.construction.standoff).toBeNull();
    for (const value of Object.values(bundle.construction)) {
      if (typeof value === 'string') expect(value).not.toMatch(/TBD|TBA|Not provided/i);
    }
  });

  it('splits §9.3 into label/value rows and drops its prose', async () => {
    const bundle = service.build(await proofFor(heavenCrepes()));
    const labels = bundle.specRows.map((row) => row.label);

    expect(labels).toContain('SIGN TYPE');
    expect(labels).toContain('QUANTITY');
    expect(labels).toContain('MOUNTING');
    // The element headers and the standing notes are prose. §9.3 single-spaces
    // both, which is what keeps them out; if the block's own formatting ever
    // changes, this is the assertion that notices.
    expect(labels.some((label) => label.startsWith('──'))).toBe(false);
    expect(labels.some((label) => label.startsWith('·'))).toBe(false);
    expect(bundle.specRows.every((row) => !row.value.startsWith('·'))).toBe(true);
    for (const row of bundle.specRows) {
      expect(row.label).not.toMatch(/\s{2}/);
      expect(row.value.trim()).toBe(row.value);
      expect(row.value).not.toBe('');
    }
  });

  it('carries a blocked proof through without inventing geometry', async () => {
    const proof = await proofFor(heavenCrepes());
    proof.spec = null as unknown as SignSpec;
    proof.blocked = true;

    const bundle = service.build(proof);
    expect(bundle.blocked).toBe(true);
    expect(bundle.specRows).toEqual([]);
    expect(bundle.construction.returnDepth).toBeNull();
    expect(bundle.drawings.elevation).toContain('<svg');
    // The panels a blocked run did render are still real pictures of the sign.
    expect(bundle.panels).toHaveLength(2);
  });
});
