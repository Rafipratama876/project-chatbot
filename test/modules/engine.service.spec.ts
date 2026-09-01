/**
 * The Nest layer around the engine. What matters here is the wiring — that the
 * ports are supplied when the LLM is on, withheld when it is off, and that a
 * per-job threshold store is handed out rather than a shared one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EngineService } from '#/modules/engine/engine.service.js';
import { ThresholdService } from '#/modules/knowledge/threshold.service.js';
import { AnthropicClient } from '#/modules/llm/anthropic.client.js';
import { FreeTextResolverService } from '#/modules/llm/free-text-resolver.service.js';
import { LogoComplexityService } from '#/modules/llm/logo-complexity.service.js';
import { MemoryThresholdStore } from '#/kb/domain/thresholds.js';
import { heavenCrepes, unresolvableCustom } from '../fixtures/jobs.js';

const makeModule = async (opts: { llmEnabled: boolean; logoComplex?: boolean }) => {
  const logoJudge = vi.fn(async () => ({
    complex: opts.logoComplex ?? true, confidence: 0.9, reason: 'stub',
  }));
  const freeTextResolve = vi.fn(async () => ({
    value: 'CL-T-05', confidence: 0.9, reason: 'stub',
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      EngineService,
      { provide: ThresholdService, useValue: { createStore: () => new MemoryThresholdStore() } },
      {
        provide: AnthropicClient,
        useValue: { enabled: opts.llmEnabled, minConfidence: 0.75, model: 'claude-opus-5' },
      },
      { provide: FreeTextResolverService, useValue: { resolve: freeTextResolve } },
      { provide: LogoComplexityService, useValue: { forRun: () => logoJudge } },
      { provide: ConfigService, useValue: { get: () => undefined } },
    ],
  }).compile();

  return { service: moduleRef.get(EngineService), logoJudge, freeTextResolve };
};

describe('EngineService', () => {
  it('runs all 56 rules with no model calls when the LLM is disabled', async () => {
    const { service, logoJudge, freeTextResolve } = await makeModule({ llmEnabled: false });
    const { spec, trace } = await service.run(heavenCrepes());

    expect(logoJudge).not.toHaveBeenCalled();
    expect(freeTextResolve).not.toHaveBeenCalled();
    expect(spec.elements).toHaveLength(3);
    expect(trace.fired('CL-R-51')).toBe(true);
    // CL-R-54 has no judgment available, so it escalates rather than guessing.
    expect(spec.escalations.some((e) => e.ruleId === 'CL-R-54')).toBe(true);
  });

  it('wires the CL-R-54 port when the LLM is enabled', async () => {
    const { service, logoJudge } = await makeModule({ llmEnabled: true, logoComplex: true });
    const { spec } = await service.run(heavenCrepes());

    expect(logoJudge).toHaveBeenCalledTimes(1);
    expect(spec.elements.find((e) => e.role === 'CL-E-04')!.construction).toBe('CL-C-03');
    expect(spec.escalations.some((e) => e.ruleId === 'CL-R-54')).toBe(false);
  });

  it('a confident "not complex" judgment builds the mark as a channel shape', async () => {
    const { service } = await makeModule({ llmEnabled: true, logoComplex: false });
    const { spec } = await service.run(heavenCrepes());
    expect(spec.elements.find((e) => e.role === 'CL-E-04')!.construction).toBe('CL-C-01');
  });

  it('deterministicOnly withholds the ports even with credentials present', async () => {
    const { service, logoJudge } = await makeModule({ llmEnabled: true });
    const { spec } = await service.run(heavenCrepes(), { deterministicOnly: true });
    expect(logoJudge).not.toHaveBeenCalled();
    expect(spec.escalations.some((e) => e.ruleId === 'CL-R-54')).toBe(true);
  });

  it('§1.2 Custom resolves through the port when it is wired', async () => {
    const { service, freeTextResolve } = await makeModule({ llmEnabled: true });
    const { spec } = await service.run(unresolvableCustom());
    expect(freeTextResolve).toHaveBeenCalled();
    expect(spec.type).toBe('CL-T-05');
  });

  it('hands out a fresh threshold store per job, so [DER] read sets do not mix', async () => {
    const { service } = await makeModule({ llmEnabled: false });
    const a = await service.run(heavenCrepes());
    const b = await service.run({ ...heavenCrepes(), jobId: 'other' });
    expect(a.unverifiedThresholds.map((t) => t.key).sort())
      .toEqual(b.unverifiedThresholds.map((t) => t.key).sort());
    expect(a.unverifiedThresholds.length).toBeGreaterThan(0);
  });
});
