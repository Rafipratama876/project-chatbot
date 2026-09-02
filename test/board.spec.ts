/**
 * The board is the artefact a customer signs off, so the split matters: the two
 * scene panels are images, and everything with a number on it is text drawn
 * from the spec. A model that writes a dimension can write the wrong dimension,
 * and there is no gate downstream of a picture.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderBoard, nightLabel, BOARD_WIDTH, BOARD_HEIGHT } from '#/kb/output/board.js';
import { BoardService, scopeFromIntent } from '#/modules/render/board.service.js';
import { runEngine } from '#/kb/engine/engine.js';
import { heavenCrepes } from './fixtures/jobs.js';
import type { SignSpec } from '#/kb/domain/spec.js';
import type { RenderedProofPanel } from '#/modules/render/render.service.js';

const specFor = async (overrides: Partial<Parameters<typeof runEngine>[0]['form']> = {}) => {
  const job = heavenCrepes();
  const { spec } = await runEngine({ ...job, form: { ...job.form, ...overrides } });
  return spec;
};

const png = (marker: string) => `data:image/png;base64,${Buffer.from(marker).toString('base64')}`;

const panel = (view: 'day' | 'night', camera: string, marker: string): RenderedProofPanel => ({
  label: `${view} · ${camera}`, view, camera, file: `/tmp/${marker}.png`, dataUrl: png(marker),
});

describe('presentation board', () => {
  it('draws the specifications, dimensions and footer as text, not as an image', async () => {
    const spec = await specFor();
    const html = renderBoard({ spec, day: { src: png('day') }, night: { src: png('night') } });

    expect(html).toContain('SIGN SPECIFICATIONS');
    expect(html).toContain('RETURN DEPTH');
    expect(html).toContain('INSTALLATION METHOD');
    expect(html).toContain('MAX SIGN AREA ALLOWED');
    // The elevation and section are SVG built from the spec, so the numbers on
    // them are the numbers the rules settled.
    expect(html).toContain('<svg');
    expect(html).toContain(`${BOARD_WIDTH}px`);
    expect(html).toContain(`${BOARD_HEIGHT}px`);
  });

  it('omits the thickness row rather than printing its own switch as the value', async () => {
    const shown = await specFor({ showMaterialThickness: true });
    const hidden = await specFor({ showMaterialThickness: false });

    expect(renderBoard({ spec: shown })).toContain('MATERIALS THICKNESS');
    // The customer reads this board. "Do not show on proof" is an instruction
    // to us, and a row that reports it is a leaked form control.
    const off = renderBoard({ spec: hidden });
    expect(off).not.toContain('MATERIALS THICKNESS');
    expect(off).not.toContain('Do not show on proof');
  });

  it('escapes customer text rather than letting it into the markup', async () => {
    const spec = { ...(await specFor()), businessName: '<script>alert(1)</script>' } as SignSpec;
    const html = renderBoard({ spec });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('hides the measurements when the customer asked for sizes off the proof', async () => {
    const shown = await specFor({ showSizesOnProof: true });
    const hidden = await specFor({ showSizesOnProof: false });

    const boardClass = (html: string) => html.match(/class="proof-board[^"]*"/)![0];

    expect(boardClass(renderBoard({ spec: shown }))).not.toContain('hide-measurements');
    // Display control only — the sign, and the dimensions behind it, are the same.
    expect(boardClass(renderBoard({ spec: hidden }))).toContain('hide-measurements');
    expect(hidden.overall).toEqual(shown.overall);
  });

  it('relabels the second panel on a sign that does not light', async () => {
    const lit = await specFor({ channelLetterType: 'Front Lit' });
    // One word, no logo box: nothing on this sign is illuminated, so Gate 5
    // drops the night view and the second panel has to answer a different
    // question. heavenCrepes keeps a lit logo box even when set Non-Lit.
    const { spec: unlit } = await runEngine({
      ...heavenCrepes(),
      artwork: heavenCrepes().artwork.filter((a) => a.id.startsWith('H')),
      form: { ...heavenCrepes().form, channelLetterType: 'Non-Lit' },
    });

    expect(lit.renderContract!.views).toContain('night');
    expect(nightLabel(lit)).toBe('NIGHT VIEW');

    expect(unlit.renderContract!.views).not.toContain('night');
    expect(nightLabel(unlit)).toBe('PERSPECTIVE VIEW');
    expect(renderBoard({ spec: unlit })).toContain('PERSPECTIVE VIEW');
  });
});

describe('BoardService', () => {
  const renderer = { render: vi.fn(async () => Buffer.from('board')) };

  const service = (ai: Partial<{ enabled: boolean; scene: unknown }>) =>
    new BoardService(
      { enabled: true, scene: vi.fn(async () => Buffer.from('ai')), ...ai } as never,
      renderer as never,
    );

  const panels = [
    panel('day', 'front-elevation', 'day-elev'),
    panel('day', 'perspective', 'day-persp'),
    panel('night', 'detail-perspective', 'night-detail'),
  ];

  it('sends two scene panels to the model, not one per camera', async () => {
    const scene = vi.fn(async () => Buffer.from('ai'));
    const spec = await specFor();
    const result = await service({ scene }).compose({ spec, panels });

    // Six captures reach the board; exactly two are worth paying for.
    expect(scene).toHaveBeenCalledTimes(2);
    expect(result.panels.map((p) => p.kind)).toEqual(['day', 'night']);
    expect(result.panels.every((p) => p.engine === 'ai')).toBe(true);
  });

  it('falls back to the render when the model fails, rather than losing the board', async () => {
    const scene = vi.fn(async () => { throw new Error('provider down'); });
    const spec = await specFor();
    const result = await service({ scene }).compose({ spec, panels });

    expect(result.panels.every((p) => p.engine === 'render')).toBe(true);
    // The three.js capture is already a true picture of the sign.
    expect(result.panels[0]!.dataUrl).toBe(png('day-elev'));
    expect(result.panels[0]!.note).toContain('photorealistic pass');
  });

  it('reuses a panel whose render is unchanged and which the revision did not touch', async () => {
    const scene = vi.fn(async () => Buffer.from('ai'));
    const spec = await specFor();
    const svc = service({ scene });

    const first = await svc.compose({ spec, panels });
    scene.mockClear();

    // Same sign, and only the day panel was asked about.
    const second = await svc.compose({
      spec, panels, previous: first.panels, regenerate: ['day'], intent: 'warmer light',
    });

    expect(scene).toHaveBeenCalledTimes(1);
    expect(second.panels.find((p) => p.kind === 'night')!.dataUrl)
      .toBe(first.panels.find((p) => p.kind === 'night')!.dataUrl);
  });

  it('regenerates a reused panel once its render moves', async () => {
    const scene = vi.fn(async () => Buffer.from('ai'));
    const spec = await specFor();
    const svc = service({ scene });
    const first = await svc.compose({ spec, panels });
    scene.mockClear();

    // A form change that alters the sign produces different captures, and a
    // different capture is never reused — the picture would be of the old sign.
    const moved = [
      panel('day', 'front-elevation', 'day-elev-2'),
      panel('night', 'detail-perspective', 'night-detail-2'),
    ];
    await svc.compose({ spec, panels: moved, previous: first.panels, regenerate: [] });

    expect(scene).toHaveBeenCalledTimes(2);
  });

  it('scopes a look-only revision to the view the customer named', () => {
    expect(scopeFromIntent('Make the daytime shot warmer, closer to late afternoon light'))
      .toEqual(['day']);
    expect(scopeFromIntent('the night view should glow more')).toEqual(['night']);
    // Ambiguous, or about both: doing the work is the safe way to be wrong.
    expect(scopeFromIntent('make it look more realistic')).toEqual(['day', 'night']);
    expect(scopeFromIntent('brighter in day and at night')).toEqual(['day', 'night']);
    expect(scopeFromIntent(null)).toEqual(['day', 'night']);
  });

  it('skips the model entirely when the AI stage is off', async () => {
    const scene = vi.fn(async () => Buffer.from('ai'));
    const spec = await specFor();
    const result = await service({ enabled: false, scene }).compose({ spec, panels });

    expect(scene).not.toHaveBeenCalled();
    expect(result.panels.every((p) => p.engine === 'render')).toBe(true);
    // The board is still produced: LLM_ENABLED=false is a supported state.
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
