import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import fs from 'node:fs/promises';
import { AppModule } from '#/modules/app.module.js';
import { ProofsService } from '#/modules/proofs/proofs.service.js';
import { JobInputSchema } from '#/kb/domain/spec.js';
import { renderSpecBlock } from '#/kb/output/specBlock.js';
import { renderDisclosures, buildDisclosures } from '#/kb/output/disclosures.js';
import { GATE_NAME } from '#/kb/engine/gates.js';

/**
 * npm run cli -- <job.json> [--no-render] [--deterministic] [--trace] [--persist]
 *
 * Without --persist the job never touches the database: the engine runs, the
 * proof is printed, nothing is stored. That is the shape most useful when
 * arguing with a rule.
 */
const argv = process.argv.slice(2);
const has = (flag: string): boolean => argv.includes(flag);
const file = argv.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('usage: npm run cli -- <job.json> [--no-render] [--deterministic] [--trace] [--persist]');
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: has('--trace') ? ['log', 'warn', 'error'] : ['warn', 'error'],
});

try {
  const job = JobInputSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  const proofs = app.get(ProofsService);

  if (has('--persist')) {
    const record = await proofs.create(job, {
      skipRender: has('--no-render'),
      deterministicOnly: has('--deterministic'),
    });
    console.log(`proof ${record.id} — status ${record.status}`);
    console.log(record.specBlock ?? '');
    console.log(record.disclosureText ?? '');
    if (record.problems.length) {
      console.error('\n── PROOF MUST NOT SHIP ──');
      for (const p of record.problems) console.error(`  ✗ ${p}`);
      process.exitCode = 1;
    }
  } else {
    const { spec, trace, unverifiedThresholds } = await proofs.preview(job);

    if (has('--trace')) {
      console.log('── RULE TRACE ─────────────────────────────────────────────');
      for (const t of trace.ordered()) {
        const tag = t.critical ? '⚠' : ' ';
        console.log(
          `${tag} G${t.gate} ${(GATE_NAME[t.gate] ?? '').slice(0, 12).padEnd(12)} ` +
          `${t.ruleId.padEnd(9)} ${t.severity.padEnd(7)} ${t.message}`,
        );
      }
      for (const r of trace.refusals) {
        console.log(`  precedence   ${r.path}: ${r.attemptedBy} did not override ${r.heldBy}`);
      }
      console.log('');
    }

    console.log('── SPEC ───────────────────────────────────────────────────');
    console.log(renderSpecBlock(spec));
    console.log('\n── DISCLOSURES ────────────────────────────────────────────');
    console.log(renderDisclosures(buildDisclosures(spec, trace, unverifiedThresholds)));
    if (spec.blocked) {
      console.error('\nBLOCKED by CL-R-46. Escalated, no proof issued.');
      process.exitCode = 3;
    }
  }
} finally {
  await app.close();
}
