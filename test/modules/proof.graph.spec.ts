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
import { BoardService } from '#/modules/render/board.service.js';
import { CalloutWriterService } from '#/modules/llm/callout-writer.service.js';
import { RevisionPatchService } from '#/modules/llm/revision-patch.service.js';
import { AnthropicClient } from '#/modules/llm/anthropic.client.js';
import { runEngine } from '#/kb/engine/engine.js';
import { heavenCrepes } from '../fixtures/jobs.js';
import type { JobInput } from '#/kb/domain/spec.js';

const build = async (overrides: {
  render?: ReturnType<typeof vi.fn>;
  compose?: ReturnType<typeof vi.fn>;
  llmEnabled?: boolean;
  blocked?: boolean;
}) => {
  const render = overrides.render ?? vi.fn(async () => [
    { label: 'day · front elevation', view: 'day' as const, camera: 'front-elevation', file: '/tmp/day.png' },
    { label: 'night · front elevation', view: 'night' as const, camera: 'front-elevation', file: '/tmp/night.png' },
  ]);

  const compose = overrides.compose ?? vi.fn(async () => ({
    dataUrl: 'data:image/png;base64,Ym9hcmQ=',
    html: '<main class="proof-board"></main>',
    panels: [{ kind: 'day', dataUrl: 'data:image/png;base64,ZA==', engine: 'ai', seedHash: 'aaa' }],
  }));

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
      { provide: BoardService, useValue: { compose } },
      { provide: CalloutWriterService, useValue: { rewrite: async (_s: unknown, b: unknown) => b } },
      { provide: RevisionPatchService, useValue: { toPatch: vi.fn() } },
      { provide: AnthropicClient, useValue: { enabled: overrides.llmEnabled ?? false, minConfidence: 0.75 } },
      { provide: ConfigService, useValue: { get: () => '/tmp/proofs-test' } },
    ],
  }).compile();

  return { graph: moduleRef.get(ProofGraph), render, compose };
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
    const { graph, render, compose } = await build({ blocked: true });
    const state = await graph.run({ ...heavenCrepes(), jobId: 'blocked-job' });

    expect(render).not.toHaveBeenCalled();
    // And nothing is paid for: the board is where the image model is called.
    expect(compose).not.toHaveBeenCalled();
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

  it('composes the board from the rendered panels and carries it on the proof', async () => {
    const { graph, compose } = await build({});
    const state = await graph.run({ ...heavenCrepes(), jobId: 'board-job' });

    expect(compose).toHaveBeenCalledOnce();
    // The board edits the three.js panels; it never sees the spec's numbers as
    // an instruction, only as the render they already produced.
    expect(compose.mock.calls[0]![0]).toMatchObject({ panels: state.panels });
    expect(state.board).toBe('data:image/png;base64,Ym9hcmQ=');
    expect(state.proof!.board).toBe('data:image/png;base64,Ym9hcmQ=');
  });

  it('a board failure still yields the proof and its panels', async () => {
    // The board is delivery, not truth. Losing it must not lose the spec.
    const compose = vi.fn(async () => { throw new Error('chromium unavailable'); });
    const { graph } = await build({ compose });
    const state = await graph.run({ ...heavenCrepes(), jobId: 'board-fail' });

    expect(state.spec).not.toBeNull();
    expect(state.panels.length).toBeGreaterThan(0);
    expect(state.board).toBeNull();
    expect(state.proof!.problems.some((p) => p.includes('chromium unavailable'))).toBe(true);
  });

  it('skipRender is distinguishable from a renderer that produced nothing', async () => {
    const { graph, render } = await build({});
    const state = await graph.run({ ...heavenCrepes(), jobId: 'no-render' }, { skipRender: true });

    expect(render).not.toHaveBeenCalled();
    // Deliberately not rendering is not a §9.1 violation.
    expect(state.proof!.problems.filter((p) => p.includes('§9.1'))).toEqual([]);
  });
});
