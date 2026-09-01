/**
 * Which ground each panel gets.
 *
 * The 3/4 night panel silently sat on a black card for the whole life of the
 * camera-recovery code, because nothing in the wizard ever supplied a wall
 * face — so `obliquityDeg` was never computed and the composite branch was
 * unreachable. The failure had no error and no visible cause on the proof.
 */
import { describe, it, expect } from 'vitest';
import { panelGround, groundNote, MIN_OBLIQUITY_DEG } from '#/kb/render/panelPlan.js';

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
