/**
 * The boundary that makes the rest of this work.
 *
 * `src/kb/` is the 56 rules, the geometry and the output contract. If it ever
 * imports NestJS, TypeORM or the Anthropic SDK, then "does CL-R-51 fire at 4
 * inches?" stops being answerable without booting an application, and the rule
 * engine stops being a thing you can reason about on its own. So it is a test,
 * not a convention.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const KB_ROOT = path.resolve(import.meta.dirname, '../src/kb');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const FORBIDDEN = [
  { pattern: /from '@nestjs\//, why: 'the rule engine must not need a DI container' },
  { pattern: /from 'typeorm'/, why: 'the rule engine must not reach a database' },
  { pattern: /from '@anthropic-ai\//, why: 'the rules are deterministic; judgment arrives through a port' },
  { pattern: /from 'pg'/, why: 'the rule engine must not reach a database' },
  { pattern: /from '#\/modules\//, why: 'src/kb must not depend on the application layer' },
];

describe('src/kb stays framework-free', () => {
  const files = walk(KB_ROOT);

  it('finds the core files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const forbidden of FORBIDDEN) {
    it(`imports nothing matching ${forbidden.pattern} — ${forbidden.why}`, () => {
      const offenders = files.filter((f) => forbidden.pattern.test(readFileSync(f, 'utf8')));
      expect(offenders.map((f) => path.relative(KB_ROOT, f))).toEqual([]);
    });
  }

  it('the engine reaches judgment only through EngineServices', () => {
    const rule = readFileSync(path.join(KB_ROOT, 'engine/rule.ts'), 'utf8');
    // Both ports are optional: absent, the rules escalate rather than guess.
    expect(rule).toMatch(/logoComplexity\?:/);
    expect(rule).toMatch(/resolveFreeText\?:/);
  });

  it('the renderer contains no model call at all', () => {
    const renderFiles = files.filter((f) => f.includes(`${path.sep}render${path.sep}`));
    expect(renderFiles.length).toBeGreaterThan(3);
    for (const f of renderFiles) {
      const source = readFileSync(f, 'utf8');
      expect(source, `${path.basename(f)} must not call a model`).not.toMatch(/anthropic|messages\.parse|openai/i);
    }
  });
});
