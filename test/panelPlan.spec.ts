/**
 * Which ground each panel gets.
 *
 * The 3/4 night panel silently sat on a black card for the whole life of the
 * camera-recovery code, because nothing in the wizard ever supplied a wall
 * face — so `obliquityDeg` was never computed and the composite branch was
 * unreachable. The failure had no error and no visible cause on the proof.
 */
import { describe, it, expect } from 'vitest';
import {
  panelGround, groundNote, preferredPanel, MIN_OBLIQUITY_DEG,
} from '#/kb/render/panelPlan.js';

describe('panel ground', () => {
  it('with no photograph, nothing composites', () => {
    for (const camera of ['front-elevation', 'detail-perspective']) {
      expect(panelGround({ camera, hasPhoto: false, obliquityDeg: 40 }).composite).toBe(false);
    }
  });

  it('the front elevation goes on the photograph without any camera recovery', () => {
    // This is the panel the customer checks placement on, and it needs only the
    // calibration — demanding a marked wall face for it would lose the
    // building on every job that skipped an optional step.
    const g = panelGround({ camera: 'front-elevation', hasPhoto: true, obliquityDeg: null });
    expect(g.composite).toBe(true);
    expect(g.reason).toBe('front-elevation');
  });

  it('a 3/4 goes on the photograph when the photograph was taken at an angle', () => {
    const g = panelGround({ camera: 'detail-perspective', hasPhoto: true, obliquityDeg: 34 });
    expect(g.composite).toBe(true);
    expect(g.reason).toBe('oblique-photo');
  });

  it('an unmarked wall face is reported, not silently rendered in studio', () => {
    const g = panelGround({ camera: 'detail-perspective', hasPhoto: true, obliquityDeg: null });
    expect(g.composite).toBe(false);
    expect(g.reason).toBe('no-facade-marked');
    expect(groundNote(g.reason)).toMatch(/no wall face was marked/);
  });

  it('a square-on photograph stays in studio for the 3/4, and says so', () => {
    const g = panelGround({
      camera: 'detail-perspective', hasPhoto: true, obliquityDeg: MIN_OBLIQUITY_DEG,
    });
    expect(g.composite).toBe(false);
    expect(groundNote(g.reason)).toMatch(/square-on/);
  });

  it('a composited panel carries no note — there is nothing to excuse', () => {
    expect(groundNote('oblique-photo')).toBeNull();
    expect(groundNote('front-elevation')).toBeNull();
  });
});

describe('which panel stands for a view', () => {
  // The full set a rendered proof carries.
  const panels = [
    { view: 'day', camera: 'front-elevation' },
    { view: 'day', camera: 'perspective' },
    { view: 'day', camera: 'detail-perspective' },
    { view: 'night', camera: 'front-elevation' },
    { view: 'night', camera: 'perspective' },
    { view: 'night', camera: 'detail-perspective' },
  ];

  it('day is the elevation — the panel placement is checked on', () => {
    expect(preferredPanel(panels, 'day')?.camera).toBe('front-elevation');
  });

  it('night is the three-quarter — the only angle that shows the construction', () => {
    // A flat night elevation is a glowing shape: no return depth, no standoff
    // gap, no halo falling on the wall behind.
    expect(preferredPanel(panels, 'night')?.camera).toBe('detail-perspective');
  });

  it('the proof sheet and the review page cannot disagree', () => {
    // They each used to make this choice themselves and picked differently,
    // so one job produced two documents showing different pictures.
    for (const view of ['day', 'night'] as const) {
      expect(preferredPanel(panels, view)).toBe(preferredPanel([...panels], view));
    }
  });

  it('falls back down the order when a camera is missing', () => {
    const sparse = [{ view: 'night', camera: 'front-elevation' }];
    expect(preferredPanel(sparse, 'night')?.camera).toBe('front-elevation');
  });

  it('takes anything for the view rather than blanking the panel', () => {
    // A render contract that gains a camera must not leave the page empty
    // until this list is updated.
    const odd = [{ view: 'night', camera: 'something-new' }];
    expect(preferredPanel(odd, 'night')?.camera).toBe('something-new');
  });

  it('returns nothing when the view was not rendered at all', () => {
    expect(preferredPanel([{ view: 'day', camera: 'front-elevation' }], 'night')).toBeUndefined();
  });
});
