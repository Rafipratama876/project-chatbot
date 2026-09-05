/**
 * The graph's job is routing, not deciding. These tests are about the edges:
 * a blocked job must skip the renderer, a render failure must not lose the
 * spec, and a revision must re-enter at Gate 1 rather than patch the spec.
 */
import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProofGraph } from '#/modules/graph/proof.graph.js';
import { EngineService } from '#/modules/engine/engine.service.js';
import { RenderService } from '#/modules/render/render.service.js';
import { CalloutWriterService } from '#/modules/llm/callout-writer.service.js';
import { RevisionPatchService } from '#/modules/llm/revision-patch.service.js';
import { OpenAIClient } from '#/modules/llm/openai.client.js';
import { runEngine } from '#/kb/engine/engine.js';
import { heavenCrepes } from '../fixtures/jobs.js';
import type { JobInput } from '#/kb/domain/spec.js';

const build = async (overrides: {
  render?: ReturnType<typeof vi.fn>;
  llmEnabled?: boolean;
  blocked?: boolean;
}) => {
  const render = overrides.render ?? vi.fn(async () => [
    { label: 'day · front elevation', view: 'day' as const, camera: 'front-elevation', file: '/tmp/day.png' },
    { label: 'night · front elevation', view: 'night' as const, camera: 'front-elevation', file: '/tmp/night.png' },
  ]);

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProofGraph,
      {
        provide: EngineService,
        useValue: {
          run: async (job: JobInput) => {
            const result = await runEngine(job);
            if (overrides.blocked) result.spec.blocked = true;
            return result;
          },
        },
      },
      { provide: RenderService, useValue: { render } },
      { provide: CalloutWriterService, useValue: { rewrite: async (_s: unknown, b: unknown) => b } },
      { provide: RevisionPatchService, useValue: { toPatch: vi.fn() } },
      { provide: OpenAIClient, useValue: { enabled: overrides.llmEnabled ?? false, minConfidence: 0.75 } },
      { provide: ConfigService, useValue: { get: () => '/tmp/proofs-test' } },
    ],
  }).compile();

  return { graph: moduleRef.get(ProofGraph), render };
};

describe('ProofGraph', () => {
  it('runs validate → draw → assemble and produces a proof', async () => {
    const { graph, render } = await build({});
    const state = await graph.run(heavenCrepes());

    expect(render).toHaveBeenCalledTimes(1);
    expect(state.proof).not.toBeNull();
    expect(state.proof!.specBlock).toContain('Channel Letters — 3 elements');
    expect(state.panels).toHaveLength(2);
  });

  it('a blocked job skips the renderer entirely', async () => {
    // CL-R-46 is the only blocking rule. A picture of a sign that cannot be
    // built is the worst possible output, so the edge routes around `draw`.
    const { graph, render } = await build({ blocked: true });
    const state = await graph.run({ ...heavenCrepes(), jobId: 'blocked-job' });

    expect(render).not.toHaveBeenCalled();
    expect(state.panels).toEqual([]);
    expect(state.proof).not.toBeNull();
    // The spec block and the disclosures still exist — that is what a human acts on.
    expect(state.proof!.specBlock.length).toBeGreaterThan(0);
  });

  it('a render failure keeps the spec and reports itself as a problem', async () => {
    const render = vi.fn(async () => { throw new Error('swiftshader unavailable'); });
    const { graph } = await build({ render });
    const state = await graph.run({ ...heavenCrepes(), jobId: 'render-fail' });

    expect(state.spec).not.toBeNull();
    expect(state.proof!.problems.some((p) => p.includes('swiftshader unavailable'))).toBe(true);
    // §9.1 also notices the missing views rather than shipping a half proof.
    expect(state.proof!.problems.some((p) => p.includes('§9.1'))).toBe(true);
  });

  it('skipRender is distinguishable from a renderer that produced nothing', async () => {
    const { graph, render } = await build({});
    const state = await graph.run({ ...heavenCrepes(), jobId: 'no-render' }, { skipRender: true });

    expect(render).not.toHaveBeenCalled();
    // Deliberately not rendering is not a §9.1 violation.
    expect(state.proof!.problems.filter((p) => p.includes('§9.1'))).toEqual([]);
  });
});
