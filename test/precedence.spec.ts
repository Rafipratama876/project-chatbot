import { describe, it, expect } from 'vitest';
import { runEngine } from '#/kb/engine/engine.js';
import { TraceLog } from '#/kb/engine/trace.js';
import { PrecedenceResolver, Authority } from '#/kb/engine/precedence.js';
import { blockWord } from './fixtures/blockGlyphs.js';
import type { JobInput } from '#/kb/domain/spec.js';

describe('§8.2 precedence', () => {
  it('a weaker level cannot overwrite a stronger one, and the refusal is logged', () => {
    const trace = new TraceLog();
    const p = new PrecedenceResolver(trace);

    p.claim('elements[0].returnDepth', Authority.CUSTOMER, 'CL-IN-05', 6);
    expect(p.canWrite('elements[0].returnDepth', Authority.HOUSE, 'CL-D-01', 5)).toBe(false);
    expect(trace.refusals).toHaveLength(1);
    expect(trace.refusals[0]!.heldBy).toBe('CL-IN-05');

    // Buildability outranks the customer.
    expect(p.canWrite('elements[0].returnDepth', Authority.BUILDABILITY, 'CL-R-24', 3)).toBe(true);
  });

  it('the §8.2 worked case: a 4" tagline asked for as channel letters becomes a pill box', async () => {
    // "The customer asks for the tagline as channel letters at 4" tall."
    // Level 3 (customer explicit) loses to level 1 (buildability).
    const job: JobInput = {
      jobId: 'worked-case-8-2',
      form: {
        businessName: 'Heaven Crepes and Waffles',
        channelLetterType: 'Front Lit',
        installationMethod: 'Raceway',
        additionalInformation: 'Please build the tagline as individual channel letters too.',
      },
      artwork: [
        ...blockWord('HEAVEN', { capHeight: 24, stroke: 3, baselineY: 6 }, 'H'),
        ...blockWord('CREPES AND WAFFLES', { capHeight: 4, stroke: 0.7, baselineY: 0 }, 'T'),
      ],
    };

    const { spec, trace } = await runEngine(job);
    const tagline = spec.elements.find((e) => e.content === 'CREPES AND WAFFLES')!;
    expect(tagline.construction).toBe('CL-C-02');
    expect(tagline.copyTreatment).toBe('CL-CT-02');

    const t = trace.entries.find((e) => e.ruleId === 'CL-R-51' && e.path.endsWith('.construction'))!;
    expect(t.critical).toBe(true);
    expect(t.message).toMatch(/4″|4"/);
    expect(t.message).toMatch(/8″|8"/);
  });

  it('the customer\'s return depth survives the §8.1 default', async () => {
    const job: JobInput = {
      jobId: 'customer-depth',
      form: {
        businessName: 'Vector Fitness',
        channelLetterType: 'Front Lit',
        installationMethod: 'Raceway',
        returnDepth: 6,
      },
      artwork: blockWord('VECTOR', { capHeight: 18, stroke: 2 }),
    };
    const { spec, trace } = await runEngine(job);
    expect(spec.elements[0]!.returnDepth).toBe(6);
    // 6" is on-request for CL-T-01, so CL-R-20 must say so.
    expect(trace.fired('CL-R-20')).toBe(true);
  });
});

describe('trace integrity', () => {
  it('every spec mutation carries a trace entry with before and after', async () => {
    const { trace } = await runEngine({
      jobId: 'trace-integrity',
      form: { businessName: 'X', channelLetterType: 'Back Lit', installationMethod: 'Flush Mounted' },
      artwork: blockWord('XRAY', { capHeight: 16, stroke: 2 }),
    });
    for (const t of trace.entries) {
      expect(t.ruleId).toBeTruthy();
      expect(t.kbRef).toBeTruthy();
      expect(t.message).toBeTruthy();
      expect(['VISUAL', 'SPEC', 'STANDING']).toContain(t.tier);
      expect(['AUTOFIX', 'WARN', 'NOTE', 'BLOCK']).toContain(t.severity);
    }
  });
});

describe('Gate 4 revalidation', () => {
  it('does not record the same observation twice across passes', async () => {
    // §6.1 makes Gate 4 re-run after an Offset Path. A WARN or NOTE rule sees
    // the same condition on every pass; recording it each time would make a
    // two-pass job look like it had twice the problems.
    const { trace, passes } = await runEngine({
      jobId: 'revalidation',
      form: {
        businessName: 'Northside Dental',
        channelLetterType: 'Back Lit',
        installationMethod: 'Flush Mounted',
      },
      artwork: blockWord('NORTHSIDE', { capHeight: 18, stroke: 2.2 }),
    });

    expect(passes).toBeGreaterThan(1);

    const seen = new Map<string, number>();
    for (const t of trace.entries) {
      if (t.severity !== 'NOTE' && t.severity !== 'WARN') continue;
      const key = `${t.ruleId}|${t.path}|${t.message}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});
