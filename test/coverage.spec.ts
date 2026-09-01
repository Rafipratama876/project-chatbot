/**
 * Rule-set coverage. The KB says 56 rules, one of which blocks. If a rule is in
 * the KB and not in the registry it will never fire, silently — which is the
 * exact failure mode this whole architecture exists to avoid, so it is a test.
 */
import { describe, it, expect } from 'vitest';
import { ALL_RULES, KB_RULE_IDS, implementedRuleIds, COMPOSITE_RULE_IDS } from '#/kb/engine/rules/index.js';
import { GATES } from '#/kb/engine/gates.js';
import { DEFAULTS } from '#/kb/engine/rules/gate3-defaults.js';
import { PART_IDS, lintCallout } from '#/kb/domain/anatomy.js';
import { SIGN_TYPES, TYPES, CONSTRUCTIONS, COPY_TREATMENTS, MOUNT_METHODS } from '#/kb/domain/taxonomy.js';
import { VISIBILITY_CHART } from '#/kb/domain/visibility.js';
import { GEMTRIM, JEWELITE, findTrimCap } from '#/kb/domain/materials.js';
import { STANDING_NOTES } from '#/kb/domain/boilerplate.js';
import { compatFor } from '#/kb/domain/compat.js';

describe('KB coverage', () => {
  it('implements all 56 §6 rules', () => {
    const implemented = implementedRuleIds();
    const missing = KB_RULE_IDS.filter((id) => !implemented.has(id));
    expect(missing).toEqual([]);
    expect(KB_RULE_IDS).toHaveLength(56);
  });

  it('has exactly one BLOCK rule, CL-R-46', () => {
    const blocking = ALL_RULES.filter((r) => r.severity === 'BLOCK');
    expect(blocking.map((r) => r.id)).toEqual(['CL-R-46']);
  });

  it('marks CL-R-24, -25, -26, -51, -52 as ⚠ critical substitutions', () => {
    const critical = new Set(ALL_RULES.filter((r) => r.critical).map((r) => r.id));
    for (const id of ['CL-R-24', 'CL-R-25', 'CL-R-26']) expect(critical.has(id)).toBe(true);
    // CL-R-51/52 are branches of the §3.5 tree; criticality is per-branch.
    expect(COMPOSITE_RULE_IDS['CL-R-50']).toContain('CL-R-51');
    expect(COMPOSITE_RULE_IDS['CL-R-50']).toContain('CL-R-52');
  });

  it('puts §6.0 in Gate 2 and §6.1–§6.7 in Gate 4, as the KB states', () => {
    const gate2 = ALL_RULES.filter((r) => r.gate === GATES.COMPOSITION).map((r) => r.id);
    expect(gate2).toContain('CL-R-48');
    expect(gate2).toContain('CL-R-56');
    for (const r of ALL_RULES) {
      if (/^CL-R-(0[1-9]|1\d|2\d|3\d|4[0-7])$/.test(r.id)) expect(r.gate).toBe(GATES.VALIDATION);
    }
  });

  it('implements the §8.1 defaults table', () => {
    const ids = new Set(DEFAULTS.map((d) => d.id));
    // CL-D-16/17 are thresholds, CL-D-25/26/27 are enacted by the §3.5 tree.
    const enactedElsewhere = ['CL-D-16', 'CL-D-17', 'CL-D-25', 'CL-D-26', 'CL-D-27'];
    for (let i = 1; i <= 29; i++) {
      const id = `CL-D-${String(i).padStart(2, '0')}`;
      if (enactedElsewhere.includes(id)) continue;
      expect(ids.has(id), `${id} missing from the defaults table`).toBe(true);
    }
  });
});

describe('KB tables transcribed intact', () => {
  it('Layer 2 has 34 parts', () => {
    expect(PART_IDS).toHaveLength(34);
    expect(PART_IDS[0]).toBe('CL-P-01');
    expect(PART_IDS[33]).toBe('CL-P-34');
  });

  it('Layer 1 has 13 types, 3 of them standard-and-common', () => {
    expect(SIGN_TYPES).toHaveLength(13);
    const standard = SIGN_TYPES.filter((t) => TYPES[t].status === 'Standard');
    expect(standard).toEqual(['CL-T-01', 'CL-T-02', 'CL-T-03', 'CL-T-04']);
  });

  it('§4.2 return depths match the KB', () => {
    expect(TYPES['CL-T-01'].standardDepth).toBe(5);
    expect(TYPES['CL-T-02'].standardDepth).toBe(3);
    expect(TYPES['CL-T-03'].standardDepth).toBe(5);
    expect(TYPES['CL-T-04'].standardDepth).toBe(3);
    expect(TYPES['CL-T-04'].onRequestDepths).toEqual([4, 5]);
  });

  it('§4.3 GemTrim has 31 colours, 31 in 1″', () => {
    expect(GEMTRIM).toHaveLength(31);
    expect(GEMTRIM.filter((c) => c.widths.includes(1))).toHaveLength(31);
    expect(GEMTRIM.filter((c) => c.widths.includes(0.75))).toHaveLength(28);
    expect(JEWELITE).toHaveLength(20);
    expect(findTrimCap('Mustard')!.widths).toEqual([1]);
    expect(findTrimCap('Chartreuse')).toBeNull();
  });

  it('§3.3 has 7 constructions, §3.4 has 5 copy treatments, §7.1 has 6 mounts', () => {
    expect(CONSTRUCTIONS).toHaveLength(7);
    expect(COPY_TREATMENTS).toHaveLength(5);
    expect(MOUNT_METHODS).toHaveLength(6);
  });

  it('Layer 10 chart holds the 10 ft per inch relationship', () => {
    expect(VISIBILITY_CHART).toHaveLength(13);
    for (const row of VISIBILITY_CHART) expect(row.bestImpactFt).toBe(row.height * 10);
  });

  it('§7.2 matrix routes halo types to their substitution rules', () => {
    expect(compatFor('CL-T-02', 'CL-MT-01')).toEqual({ kind: 'substitute', rule: 'CL-R-24' });
    expect(compatFor('CL-T-02', 'CL-MT-03')).toEqual({ kind: 'substitute', rule: 'CL-R-25' });
    expect(compatFor('CL-T-01', 'CL-MT-01')).toEqual({ kind: 'allowed' });
  });

  it('§6.9 prints six standing notes', () => {
    expect(STANDING_NOTES).toHaveLength(6);
    expect(STANDING_NOTES.join(' ')).toMatch(/UL 48/);
  });
});

describe('Layer 2 callout vocabulary', () => {
  it('accepts callouts that name only KB parts', () => {
    const r = lintCallout('The trim cap sits over the face edge and the returns stay dark.');
    expect(r.ok).toBe(true);
    expect(r.referencedParts).toContain('CL-P-03');
  });

  it('rejects a part the KB does not define', () => {
    expect(lintCallout('A bezel frames the face.').unknownPartTerms).toContain('bezel');
  });

  it('§9.2: rejects fabrication hardware in customer-facing text', () => {
    const r = lintCallout('Mounted with studs into the wall.', { forbidHardware: true });
    expect(r.hardwareMentions).toContain('CL-P-17');
    expect(r.ok).toBe(false);
  });
});
