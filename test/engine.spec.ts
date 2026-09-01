import { describe, it, expect } from 'vitest';
import { runEngine } from '#/kb/engine/engine.js';
import { heavenCrepes, haloFlush, thinPrimary, nonLitTagline, unresolvableCustom } from './fixtures/jobs.js';
import { assembleProof } from '#/kb/output/proof.js';

describe('§3 worked example — HEAVEN CREPES AND WAFFLES', () => {
  it('produces three elements with three different constructions', async () => {
    const { spec } = await runEngine(heavenCrepes());
    expect(spec.elements).toHaveLength(3);

    const byContent = Object.fromEntries(spec.elements.map((e) => [e.content, e]));
    expect(byContent['HEAVEN']!.construction).toBe('CL-C-01');
    expect(byContent['CREPES AND WAFFLES']!.construction).toBe('CL-C-02');
    expect(byContent['CREPES AND WAFFLES']!.copyTreatment).toBe('CL-CT-02');
  });

  it('assigns roles per §3.1', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const roles = Object.fromEntries(spec.elements.map((e) => [e.content, e.role]));
    expect(roles['HEAVEN']).toBe('CL-E-01');
    expect(roles['CREPES AND WAFFLES']).toBe('CL-E-03');
    expect(roles['wing mark']).toBe('CL-E-04');
  });

  it('CL-R-51 is a critical substitution and earns its own callout', async () => {
    const { spec, trace, unverifiedThresholds } = await runEngine(heavenCrepes());
    expect(trace.fired('CL-R-51')).toBe(true);
    const proof = assembleProof(spec, trace, { unverifiedThresholds });
    expect(proof.disclosures.criticals.some((c) => c.ruleId === 'CL-R-51')).toBe(true);
  });

  it('CL-R-55/56 put the box face in the letter face plane', async () => {
    const { spec } = await runEngine(heavenCrepes());
    const letters = spec.elements.find((e) => e.construction === 'CL-C-01')!;
    for (const el of spec.elements.filter((e) => e.box)) {
      expect(el.box!.depth).toBe(letters.returnDepth);
      // §3.6: max(cap + 2", 4")
      expect(el.box!.h).toBeCloseTo(Math.max(el.capHeight + 2, 4), 6);
    }
  });

  it('escalates the logo mark rather than guessing (no CL-R-54 judge wired)', async () => {
    const { spec } = await runEngine(heavenCrepes());
    expect(spec.escalations.some((e) => e.ruleId === 'CL-R-54')).toBe(true);
  });
});

describe('§6.4 mounting substitutions', () => {
  it('CL-R-24 substitutes spacers for a flush-mounted halo sign', async () => {
    const { spec, trace } = await runEngine(haloFlush());
    expect(spec.mount).toBe('CL-MT-02');
    const t = trace.entries.find((e) => e.ruleId === 'CL-R-24')!;
    expect(t.critical).toBe(true);
    expect(t.before).toBe('CL-MT-01');
  });

  it('CL-R-37 draws a 1.5″–2″ standoff on every rear-illuminated element', async () => {
    const { spec } = await runEngine(haloFlush());
    for (const el of spec.elements.filter((e) => e.construction === 'CL-C-01')) {
      expect(el.standoff).toBeGreaterThanOrEqual(1.5);
      expect(el.standoff).toBeLessThanOrEqual(2);
    }
  });
});

describe('§6.1 stroke minimums', () => {
  it('CL-R-01 offsets primary copy up to the 1.5″ minimum', async () => {
    const { spec, trace } = await runEngine(thinPrimary());
    expect(trace.fired('CL-R-01')).toBe(true);
    const el = spec.elements[0]!;
    expect(el.narrowestStroke).toBeGreaterThanOrEqual(1.5 - 0.02);
    expect(el.originalContours).toBeDefined();
  });

  it('CL-R-05 reports counters from measurement, not assertion', async () => {
    const { trace } = await runEngine(thinPrimary());
    const t = trace.entries.find((e) => e.ruleId === 'CL-R-05');
    expect(t).toBeDefined();
    expect(t!.message).toMatch(/counter/i);
    expect(t!.after).toHaveProperty('holesBefore');
  });
});

describe('§3.5 non-illuminated branch', () => {
  it('CL-R-52 sends the tagline to flat cut, not a pill box', async () => {
    const { spec, trace } = await runEngine(nonLitTagline());
    expect(trace.fired('CL-R-52')).toBe(true);
    const tagline = spec.elements.find((e) => e.content === 'LEGAL')!;
    // Returns are "Brushed Silver" → CL-C-05 metal per §3.5
    expect(['CL-C-04', 'CL-C-05']).toContain(tagline.construction);
    expect(tagline.lit).toBe(false);
  });
});

describe('§1.2 / §7.1 free text', () => {
  it('escalates "Custom" and "Other" instead of guessing', async () => {
    const { spec } = await runEngine(unresolvableCustom());
    expect(spec.escalations.map((e) => e.ruleId)).toContain('CL-IN-01');
    expect(spec.escalations.map((e) => e.ruleId)).toContain('CL-IN-02');
  });
});

describe('determinism', () => {
  it('two runs of the same job produce an identical trace', async () => {
    const a = await runEngine(heavenCrepes());
    const b = await runEngine(heavenCrepes());
    const strip = (t: typeof a.trace) => t.ordered().map(({ at, ...rest }) => rest);
    expect(strip(a.trace)).toEqual(strip(b.trace));
    expect(JSON.stringify(a.spec)).toEqual(JSON.stringify(b.spec));
  });
});
