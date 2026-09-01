/**
 * The wizard's numbers → the engine's numbers.
 *
 * Everything the engine decides is denominated in the calibration this module
 * derives. A factor-of-two error here does not throw and does not look wrong
 * on screen — it produces a proof for a sign of the wrong size, with a spec
 * block that agrees with itself.
 */
import { describe, it, expect } from 'vitest';
import {
  buildForm, buildPlacement, signBox, signSize, pixelsPerInch, areaSqFt,
  DesignIncompleteError, type DesignLike,
} from '#/modules/designs/job-from-design.js';
import { PlacementSchema } from '#/kb/domain/spec.js';
import { calibrate } from '#/kb/geometry/calibration.js';

const wall = { dataUrl: 'data:image/png;base64,AAAA', width: 1600, height: 1000 };

function design(overrides: Partial<DesignLike> = {}): DesignLike {
  return {
    id: 'd1',
    name: 'Heaven Crepes',
    logoText: 'HEAVEN CREPES',
    positionX: 0.5,
    positionY: 0.4,
    scale: 0.5,
    scaleY: null,
    widthInches: 100,
    heightInches: 25,
    maxSignAreaAllowed: null,
    wallImageWidth: 1600,
    wallImageHeight: 1000,
    facadeRect: null,
    spec: {
      channelLetterType: 'Front Lit',
      installationMethod: 'Flush Mounted',
      returnDepth: '5"',
      quantity: 1,
    },
    ...overrides,
  };
}

describe('signBox', () => {
  it('centres the box on the stored centre point', () => {
    const box = signBox(design());
    expect(box.w).toBe(800);          // 0.5 × 1600
    expect(box.x).toBe(400);          // centred at 0.5
    expect(box.x + box.w / 2).toBe(800);
  });

  it('uses the stored box height when there is one', () => {
    // The box exactly as dragged: 0.25 of a 1000 px image.
    expect(signBox(design({ scaleY: 0.25 })).h).toBe(250);
  });

  it('falls back to the stated proportions for a design saved before that', () => {
    // 100" × 25" is 4:1, so an 800 px box is 200 px tall.
    expect(signBox(design({ scaleY: null })).h).toBe(200);
  });

  it('a taller sign gets a taller box at the same width', () => {
    const short = signBox(design({ widthInches: 100, heightInches: 25 }));
    const tall = signBox(design({ widthInches: 100, heightInches: 50 }));
    expect(tall.h).toBe(short.h * 2);
    expect(tall.w).toBe(short.w);
  });

  it('refuses an unfinished wall step instead of inventing a position', () => {
    expect(() => signBox(design({ scale: null }))).toThrow(DesignIncompleteError);
    expect(() => signBox(design({ widthInches: null }))).toThrow(/width and height/);
  });
});

describe('calibration', () => {
  it('pixels per inch follows from the box and its stated width', () => {
    // 800 px across a sign the customer says is 100" wide.
    expect(pixelsPerInch(design())).toBe(8);
  });

  it('the placement the engine calibrates matches what this module computed', () => {
    // The real check: not that the arithmetic here is self-consistent, but that
    // the engine's own calibrate() reads the same number off the placement.
    const placement = buildPlacement(design(), wall);
    const cal = calibrate(
      {
        a: placement.reference.a,
        b: placement.reference.b,
        inches: placement.reference.inches,
        label: placement.reference.label,
      },
      placement.imageWidth,
      placement.imageHeight,
    );
    expect(cal.pixelsPerInch).toBeCloseTo(pixelsPerInch(design()), 10);
  });

  it('halving the stated width doubles the pixels per inch', () => {
    expect(pixelsPerInch(design({ widthInches: 50 }))).toBe(16);
  });

  it('the reference says what it actually is', () => {
    // Labelling this "door width" would put a measurement on the proof that
    // nobody took.
    expect(buildPlacement(design(), wall).reference.label).toBe('stated sign width');
  });
});

describe('one scale, when a wall face is marked', () => {
  // The bug this exists to prevent: the marked face said the image was 240"
  // across, the typed size said the sign box was 20" across, and the two
  // disagreed by 3.4x. The engine calibrated from one and the renderer's
  // recovered camera from the other, so the sign landed at a third of its size
  // somewhere other than where it was dragged — with no error anywhere.
  const wholeImage = {
    corners: [
      { x: 0, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 1000 }, { x: 0, y: 1000 },
    ],
    widthInches: 240,
    heightInches: 150,
  };

  it('measures the sign off the marked face instead of believing the form', () => {
    // The box spans half the image; the face says the image is 240" across.
    // So the sign is 120", whatever the form was left saying.
    const size = signSize(design({ facadeRect: wholeImage, widthInches: 20, heightInches: 10 }));
    expect(size.widthInches).toBeCloseTo(120, 6);
  });

  it('the height is measured too, not carried over from the form', () => {
    const d = design({ facadeRect: wholeImage, scaleY: 0.2, widthInches: 20, heightInches: 10 });
    // 0.2 of a 1000 px image that is 150" tall.
    expect(signSize(d).heightInches).toBeCloseTo(30, 6);
  });

  it('the calibration agrees with the marked face — the whole point', () => {
    const d = design({ facadeRect: wholeImage, widthInches: 20, heightInches: 10 });
    const fromFace = wholeImage.corners[1]!.x / wholeImage.widthInches; // px per inch
    expect(pixelsPerInch(d)).toBeCloseTo(fromFace, 6);
  });

  it('says on the proof which measurement it used', () => {
    const marked = buildPlacement(design({ facadeRect: wholeImage }), wall);
    expect(marked.reference.label).toMatch(/marked wall face/);
    expect(buildPlacement(design(), wall).reference.label).toBe('stated sign width');
  });

  it('an angled face measures the box against the wall, not against the photo', () => {
    // A face receding to the right: the same box is worth more inches at the
    // far end than at the near one. A flat pixel scale cannot express that,
    // which is exactly why this path exists.
    const angled = {
      corners: [
        { x: 100, y: 100 }, { x: 1500, y: 250 }, { x: 1500, y: 800 }, { x: 100, y: 950 },
      ],
      widthInches: 480,
      heightInches: 200,
    };
    const near = signSize(design({ facadeRect: angled, positionX: 0.2, scale: 0.2 }));
    const far = signSize(design({ facadeRect: angled, positionX: 0.8, scale: 0.2 }));
    expect(far.widthInches).toBeGreaterThan(near.widthInches);
  });

  it('with no face marked, the typed size is the only scale there is', () => {
    expect(signSize(design()).widthInches).toBe(100);
    expect(signSize(design()).heightInches).toBe(25);
  });
});

describe('placement', () => {
  it('is accepted by the schema the engine validates against', () => {
    expect(() => PlacementSchema.parse(buildPlacement(design(), wall))).not.toThrow();
  });

  it('carries a marked wall face through, and omits it when there is none', () => {
    const corners = [
      { x: 100, y: 100 }, { x: 1500, y: 160 }, { x: 1500, y: 900 }, { x: 100, y: 860 },
    ];
    const withFacade = buildPlacement(
      design({ facadeRect: { corners, widthInches: 480, heightInches: 200 } }),
      wall,
    );
    expect(withFacade.facadeRect?.corners).toHaveLength(4);
    expect(PlacementSchema.parse(withFacade).facadeRect?.widthInches).toBe(480);

    expect(buildPlacement(design(), wall).facadeRect).toBeUndefined();
  });
});

describe('form', () => {
  it('reads a return depth out of the wizard\'s string values', () => {
    expect(buildForm(design()).returnDepth).toBe(5);
    expect(buildForm(design({ spec: { ...design().spec, returnDepth: '3"' } })).returnDepth).toBe(3);
  });

  it('reads a custom return depth out of the detail beside it', () => {
    const form = buildForm(design({
      spec: { ...design().spec, returnDepth: 'Custom', returnDepthCustomDetail: '7.5 inch returns' },
    }));
    expect(form.returnDepth).toBe(7.5);
  });

  it('leaves an unreadable depth unset so §8.1 fills and discloses it', () => {
    // Better an acknowledged house standard on the proof than a number nobody
    // chose and nothing explains.
    const form = buildForm(design({
      spec: { ...design().spec, returnDepth: 'Custom', returnDepthCustomDetail: 'as deep as needed' },
    }));
    expect(form.returnDepth).toBeUndefined();
  });

  it('keeps the customer\'s custom detail rather than the word "Custom"', () => {
    const form = buildForm(design({
      spec: {
        ...design().spec,
        installationMethod: 'Custom',
        installationMethodCustomDetail: 'sleeved through the parapet',
      },
    }));
    expect(form.installationMethod).toBe('Custom: sleeved through the parapet');
  });

  it('refuses a Custom with no detail rather than sending the literal word', () => {
    // "Custom" is not a mounting method, and passing it on would put it in the
    // spec block as though it were one.
    expect(() => buildForm(design({
      spec: { ...design().spec, installationMethod: 'Custom' },
    }))).toThrow(DesignIncompleteError);
  });

  it('requires the two fields the schema requires', () => {
    expect(() => buildForm(design({ spec: { installationMethod: 'Flush Mounted' } })))
      .toThrow(/channel letter type and the installation method/);
  });

  it('passes a permitted area through as site information', () => {
    const form = buildForm(design({ maxSignAreaAllowed: 40 }));
    expect(form.site?.permittedAreaSqFt).toBe(40);
  });

  it('falls back to the design name when there is no sign text', () => {
    expect(buildForm(design({ logoText: null })).businessName).toBe('Heaven Crepes');
  });

  it('does not put "Per Logo" in the notes as though it were a colour', () => {
    const form = buildForm(design({
      spec: { ...design().spec, faceColor: 'Per Logo', faceColorTreatment: 'Per Logo' },
    }));
    expect(form.additionalInformation ?? '').not.toMatch(/Per Logo/);
  });

  it('carries a real face colour into the notes for the intake node', () => {
    const form = buildForm(design({
      spec: { ...design().spec, faceColor: 'Warm white', faceColorTreatment: 'Day/Night Vinyl' },
    }));
    expect(form.additionalInformation).toMatch(/Warm white/);
    expect(form.additionalInformation).toMatch(/Day\/Night Vinyl/);
  });
});

describe('area', () => {
  it('is square feet, not square inches', () => {
    expect(areaSqFt(144, 1)).toBe(1);
    expect(areaSqFt(100, 25)).toBeCloseTo(17.36, 2);
  });
});
