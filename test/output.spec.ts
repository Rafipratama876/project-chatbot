import { describe, it, expect } from 'vitest';
import { runEngine } from '#/kb/engine/engine.js';
import { assembleProof } from '#/kb/output/proof.js';
import { verifyDisclosureCoverage } from '#/kb/output/disclosures.js';
import { buildRenderContract, verifyContract } from '#/kb/render/contract.js';
import { heavenCrepes, haloFlush, nonLitTagline } from './fixtures/jobs.js';
import { blockWord, logoMark } from './fixtures/blockGlyphs.js';
import type { JobInput } from '#/kb/domain/spec.js';

/** A sign that is only a logo mark — the §3.5 step 1 branch. */
const logoMarkJob = (): JobInput => ({
  jobId: 'logo-only',
  form: {
    businessName: 'Wing Mark Co',
    channelLetterType: 'Front and Back Lit',
    installationMethod: 'Direct Mounted with Spacers',
  },
  artwork: [logoMark({ x: 0, y: 0, size: 24, counter: true })],
});

describe('§9.3 spec block', () => {
  it('writes one block per element, not one per sign', async () => {
    const { spec, trace, unverifiedThresholds } = await runEngine(heavenCrepes());
    const proof = assembleProof(spec, trace, { unverifiedThresholds });
    expect(proof.specBlock.match(/── ELEMENT /g)).toHaveLength(3);
    expect(proof.specBlock).toContain('SIGN TYPE');
    expect(proof.specBlock).toContain('Channel Letters — 3 elements');
    expect(proof.specBlock).toContain('CL-CT-02');
  });

  it('§4.7: no CMYK, RGB or HEX reaches the spec block', async () => {
    const { spec, trace } = await runEngine({
      jobId: 'hex-colour',
      form: {
        businessName: 'Vermilion',
        channelLetterType: 'Front Lit',
        installationMethod: 'Raceway',
        faceColour: '#e03a2f',
        returnColour: '#101010',
      },
      artwork: blockWord('VERMILION', { capHeight: 20, stroke: 2 }),
    });
    const proof = assembleProof(spec, trace);
    expect(proof.problems.filter((p) => p.includes('§4.7'))).toEqual([]);
    expect(proof.specBlock).not.toMatch(/#[0-9a-f]{6}/i);
    // The device value is kept for the renderer, per §4.7.
    expect(spec.elements[0]!.face.renderColour).toBe('#e03a2f');
    expect(spec.elements[0]!.face.colourIndicative).toBe(true);
  });

  it('prints the six standing notes on every proof', async () => {
    const { spec, trace } = await runEngine(haloFlush());
    expect(assembleProof(spec, trace).specBlock).toMatch(/UL 48 listed components/);
  });
});

describe('§9.4 disclosures', () => {
  it('CL-R-47: every autofix reaches a callout', async () => {
    const { spec, trace, unverifiedThresholds } = await runEngine(heavenCrepes());
    const proof = assembleProof(spec, trace, { unverifiedThresholds });
    expect(verifyDisclosureCoverage(trace, proof.disclosures)).toEqual([]);
  });

  it('critical substitutions get their own section, above the notes', async () => {
    const { spec, trace } = await runEngine(haloFlush());
    const proof = assembleProof(spec, trace);
    expect(proof.disclosures.criticals.some((c) => c.ruleId === 'CL-R-24')).toBe(true);
    const text = proof.disclosureText;
    expect(text.indexOf('IMPORTANT CHANGES')).toBeLessThan(text.indexOf('DEFAULTS APPLIED'));
  });

  it('reports every defaulted field', async () => {
    const { spec, trace } = await runEngine(haloFlush());
    const proof = assembleProof(spec, trace);
    expect(proof.disclosures.defaults.length).toBeGreaterThan(0);
    expect(proof.disclosures.defaults.some((d) => d.ruleId === 'CL-D-02')).toBe(true);
  });

  it('footnotes the [DER] values the run actually depended on', async () => {
    const { spec, trace, unverifiedThresholds } = await runEngine(heavenCrepes());
    const proof = assembleProof(spec, trace, { unverifiedThresholds });
    const keys = proof.disclosures.derivedValues.map((d) => d.key);
    expect(keys).toContain('box.min_height');
    for (const d of proof.disclosures.derivedValues) expect(d.verified).toBe(false);
  });

  it('carries the §9.4 item 5 disclaimer verbatim', async () => {
    const { spec, trace } = await runEngine(nonLitTagline());
    expect(assembleProof(spec, trace).disclosureText).toMatch(/Not for production, permit or engineering use/);
  });
});

describe('§9.1 / §9.2 render contract', () => {
  it('an illuminated sign requires day and night; a non-lit one does not', async () => {
    const lit = await runEngine(heavenCrepes());
    expect(lit.spec.views).toEqual(['day', 'night']);
    const dark = await runEngine(nonLitTagline());
    expect(dark.spec.views).toEqual(['day']);
  });

  it('front lit: the face emits at night, the returns and the wall do not', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const c = buildRenderContract(spec);
    const letters = c.elements.find((e) => e.construction === 'CL-C-01')!;
    expect(letters.night.faceEmissive).toBe(true);
    expect(letters.night.returnsEmissive).toBe(false);
    expect(letters.night.backgroundEmissive).toBe(false);
    expect(letters.day.faceEmissive).toBe(false);
  });

  it('halo: the wall emits at night, the face stays dark and solid', async () => {
    const { spec } = await runEngine(haloFlush());
    const letters = buildRenderContract(spec).elements.find((e) => e.construction === 'CL-C-01')!;
    expect(letters.night.backgroundEmissive).toBe(true);
    expect(letters.night.faceEmissive).toBe(false);
    expect(letters.night.faceOpaque).toBe(true);
    expect(letters.standoffGap).toBeGreaterThanOrEqual(1.5);
  });

  it('CL-CT-02 reversed out: the copy glows, the field stays dark', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const box = buildRenderContract(spec).elements.find((e) => e.construction === 'CL-C-02')!;
    expect(box.night.copyEmissive).toBe(true);
    expect(box.night.fieldEmissive).toBe(false);
  });

  it('non-lit is never self-illuminated in either view', async () => {
    const { spec } = await runEngine(nonLitTagline());
    for (const e of buildRenderContract(spec).elements) {
      expect(e.day.faceEmissive).toBe(false);
      expect(e.night.faceEmissive).toBe(false);
      expect(e.night.backgroundEmissive).toBe(false);
    }
  });

  it('a compliant spec produces no contract violations', async () => {
    for (const job of [heavenCrepes, haloFlush, nonLitTagline]) {
      const { spec } = await runEngine(job());
      expect(verifyContract(spec, buildRenderContract(spec))).toEqual([]);
    }
  });
});

describe('§9.2 logo box', () => {
  it('glows in the logo colours at night, not reversed out', async () => {
    // §9.2 gives CL-C-03 its own row — "Face glows in the logo colours" — and
    // it has no copy treatment. Routing it through the §3.4 table would apply
    // the CL-CT-02 reversed-out default and leave an illuminated sign dark.
    const { spec } = await runEngine(logoMarkJob());
    const box = buildRenderContract(spec).elements.find((e) => e.construction === 'CL-C-03')!;

    expect(box.night.faceEmissive).toBe(true);
    expect(box.day.faceEmissive).toBe(false);
    expect(box.source).toMatch(/silhouette/i);
  });

  it('carries no copy treatment, because it carries no copy', async () => {
    const { spec } = await runEngine(logoMarkJob());
    const box = spec.elements.find((e) => e.construction === 'CL-C-03')!;
    expect(box.copyTreatment).toBeUndefined();
  });
});
