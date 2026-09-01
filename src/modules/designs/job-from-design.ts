/**
 * A design, as the wizard left it → the job the gates run on.
 *
 * The wizard speaks in fractions of a wall image and a stated sign size. The
 * engine speaks in inches, and needs a pixels-per-inch calibration before any
 * of §6.1 means anything. This module is the whole of that translation, kept
 * free of Nest so it can be tested against its own arithmetic rather than
 * against a running application.
 *
 * The calibration comes from the customer's own two numbers: the sign box
 * spans `scale` of the image width, and they said that box is `widthInches`
 * wide. So one inch is `scale * imageWidth / widthInches` pixels. That is a
 * real measurement of their intent, not a guess — but it is a different claim
 * from measuring a door, and the proof says which one it had.
 */
import type { JobInput, PlacementInput } from '#/kb/domain/spec.js';
import { rectOnWall, impliedHeightInches, type MarkedFacade } from '#/kb/geometry/homography.js';

export interface DesignLike {
  id: string;
  name: string;
  logoText: string | null;
  positionX: number | null;
  positionY: number | null;
  scale: number | null;
  scaleY: number | null;
  widthInches: number | null;
  heightInches: number | null;
  maxSignAreaAllowed: number | null;
  wallImageWidth: number | null;
  wallImageHeight: number | null;
  facadeRect: {
    corners: Array<{ x: number; y: number }>;
    widthInches: number;
    heightInches: number;
  } | null;
  spec: Record<string, unknown> | null;
}

export class DesignIncompleteError extends Error {
  constructor(readonly step: 'logo' | 'wall' | 'spec', message: string) {
    super(message);
    this.name = 'DesignIncompleteError';
  }
}

/** Where the sign sits on the wall image, in image pixels. */
export interface SignBoxPx { x: number; y: number; w: number; h: number }

export function signBox(design: DesignLike): SignBoxPx {
  const { positionX, positionY, scale, wallImageWidth, wallImageHeight } = design;
  if (
    positionX === null || positionY === null || scale === null
    || wallImageWidth === null || wallImageHeight === null
  ) {
    throw new DesignIncompleteError('wall', 'The wall step is not finished: no sign position.');
  }
  if (!design.widthInches || !design.heightInches) {
    throw new DesignIncompleteError(
      'wall',
      'The wall step is not finished: the sign has no stated width and height.',
    );
  }

  // The box exactly as it was dragged. Its height was stored alongside its
  // width rather than rebuilt from the stated proportions: with a marked wall
  // face the stated size is DERIVED from this box, so rebuilding the box from
  // the size would be circular. Older designs have no stored height and fall
  // back to the ratio, which is what they were built from.
  const w = scale * wallImageWidth;
  const h = design.scaleY !== null && design.scaleY > 0
    ? design.scaleY * wallImageHeight
    : w * (design.heightInches / design.widthInches);

  return {
    x: positionX * wallImageWidth - w / 2,
    y: positionY * wallImageHeight - h / 2,
    w,
    h,
  };
}

/**
 * How big the sign really is, in inches.
 *
 * With a marked wall face this is DERIVED from the box rather than taken from
 * the form, and the difference is the whole of a bug that had signs landing at
 * a third of their size somewhere other than where they were dragged.
 *
 * A marked wall face is a second, independent statement of scale: "this quad
 * is 240 inches across". The typed sign width is a third: "that box is 20
 * inches across". Both cannot be true, and the renderer — which has to stand
 * where the photographer stood — can only use the wall. So the wall wins, and
 * the box the customer dragged is measured against it instead of being
 * overridden by a number that contradicts it.
 *
 * Without a marked face there is no second opinion, and the typed size is the
 * only scale there is.
 */
export function signSize(design: DesignLike): { widthInches: number; heightInches: number } {
  const box = signBox(design);
  if (!design.facadeRect) {
    return { widthInches: design.widthInches!, heightInches: design.heightInches! };
  }
  const onWall = rectOnWall(resolveFacade(design.facadeRect), box);
  return { widthInches: onWall.widthInches, heightInches: onWall.heightInches };
}

/**
 * The marked wall face, with a physically impossible height corrected.
 *
 * A quad that is a rectangle in the photograph has its real aspect fixed by
 * its pixel aspect — a 240" wall drawn 848 x 522 px is 147.8" tall, full stop.
 * A height that disagrees is not a second opinion, it is a contradiction, and
 * it does not fail loudly: the placement homography and the renderer's
 * recovered camera end up describing different walls, so the sign renders in
 * the wrong place at the wrong size with nothing to say why. Measured on one
 * real job the sign moved 53 px right, 29 px up and came out 12% too large.
 *
 * Corrected rather than rejected, because the number that has to give is the
 * one the pixels already determine — and a proof is more use than an error.
 * Where the quad HAS perspective the pixels determine nothing, the typed
 * height is the only source of it, and it is left alone.
 */
export function resolveFacade(facade: NonNullable<DesignLike['facadeRect']>): MarkedFacade {
  const implied = impliedHeightInches(facade.corners, facade.widthInches);
  if (implied === null) return facade as MarkedFacade;

  // A percent of slack for a hand-dragged quad and for rounding.
  const off = Math.abs(implied - facade.heightInches) / implied;
  if (off < 0.01) return facade as MarkedFacade;

  return { ...facade, heightInches: implied };
}

/** Whether `resolveFacade` had to overrule the stated height, and by how much. */
export function facadeCorrection(
  design: DesignLike,
): { statedInches: number; correctedInches: number } | null {
  if (!design.facadeRect) return null;
  const resolved = resolveFacade(design.facadeRect);
  if (resolved.heightInches === design.facadeRect.heightInches) return null;
  return {
    statedInches: design.facadeRect.heightInches,
    correctedInches: resolved.heightInches,
  };
}

/** Pixels per inch implied by the sign box and its real width. */
export function pixelsPerInch(design: DesignLike): number {
  const box = signBox(design);
  return box.w / signSize(design).widthInches;
}

export function buildPlacement(
  design: DesignLike,
  wall: { dataUrl: string; width: number; height: number },
): PlacementInput {
  const box = signBox(design);
  const size = signSize(design);

  // The reference is the sign box's own top edge. It is not a door or a bay,
  // and calling it one would put a measurement on the proof that nobody took —
  // so it is labelled for what it is. When a wall face was marked, the width
  // comes from that face, which keeps this reference and the recovered camera
  // describing the same building instead of two buildings 3× apart.
  const reference = {
    a: { x: box.x, y: box.y },
    b: { x: box.x + box.w, y: box.y },
    inches: size.widthInches,
    label: design.facadeRect ? 'sign width, measured on the marked wall face' : 'stated sign width',
  };

  return {
    backgroundImage: wall.dataUrl,
    imageWidth: wall.width,
    imageHeight: wall.height,
    reference,
    rect: box,
    ...(design.facadeRect
      ? {
          // The corrected face, so the renderer's camera and this placement
          // describe the same wall. Sending the stated one is what put the
          // sign somewhere other than where it was dragged.
          facadeRect: resolveFacade(design.facadeRect),
        }
      : {}),
  };
}

/** The wizard's form field names → the engine's intake form. */
export function buildForm(design: DesignLike): JobInput['form'] {
  const spec = design.spec ?? {};
  const str = (key: string): string | undefined => {
    const value = spec[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const businessName = design.logoText?.trim() || design.name.trim();
  if (!businessName) {
    throw new DesignIncompleteError('logo', 'The design has no sign text and no name.');
  }

  // "Custom" is not a specification. §8.1 resolves it from the detail the
  // customer typed beside it, and a Custom left blank has to reach the engine
  // as blank so a rule escalates it — not silently as the literal word.
  const withDetail = (key: string): string | undefined => {
    const value = str(key);
    if (value !== 'Custom') return value;
    const detail = str(`${key}CustomDetail`);
    return detail ? `Custom: ${detail}` : undefined;
  };

  const quantity = typeof spec.quantity === 'number' && spec.quantity > 0
    ? Math.floor(spec.quantity)
    : 1;

  // Required by the schema, and deliberately not defaulted here. Every other
  // unset field is filled by §8.1 with a house standard the proof then
  // discloses; inventing a letter type or a mounting method instead would put
  // a construction on the proof that nobody chose and nothing discloses.
  const channelLetterType = str('channelLetterType');
  const installationMethod = withDetail('installationMethod');
  if (!channelLetterType || !installationMethod) {
    throw new DesignIncompleteError(
      'spec',
      'The specification step is not finished: the channel letter type and the '
      + 'installation method are both required.',
    );
  }

  return {
    businessName,
    channelLetterType,
    installationMethod,
    backerPanelOption: withDetail('backerPanelOption'),
    returnDepth: returnDepthInches(spec),
    returnColour: str('returnColor'),
    trimCapColour: str('trimCapColor'),
    mountingSurfaceColour: str('backerPanelColor'),
    quantity,
    additionalInformation: additionalInformation(spec),
    ...(design.maxSignAreaAllowed
      ? { site: { permittedAreaSqFt: design.maxSignAreaAllowed } }
      : {}),
  } as JobInput['form'];
}

/**
 * '5"' → 5. A depth the engine cannot read is left unset rather than guessed,
 * so §8.1 fills it from the house standard and says on the proof that it did.
 */
function returnDepthInches(spec: Record<string, unknown>): number | undefined {
  const raw = spec.returnDepth;
  if (typeof raw === 'number' && raw > 0) return raw;
  if (typeof raw !== 'string') return undefined;

  const source = raw === 'Custom'
    ? (typeof spec.returnDepthCustomDetail === 'string' ? spec.returnDepthCustomDetail : '')
    : raw;
  const match = /(\d+(?:\.\d+)?)/.exec(source);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Everything the form has no field for, in one place the LLM intake node can
 * read. Face colour lives here rather than in a typed field because §9.2 takes
 * the face colour from the artwork — a form value that disagrees with the logo
 * is a claim about a colour nobody can see.
 */
function additionalInformation(spec: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim() && value !== 'Per Logo') {
      parts.push(`${label}: ${value.trim()}`);
    }
  };

  add('Face colour', spec.faceColor);
  add('Face colour treatment', spec.faceColorTreatment);
  add('Face colour treatment detail', spec.faceColorTreatmentCustomDetail);
  if (spec.materialsThicknessOption === 'Standards') {
    parts.push('Show standard material thicknesses on the proof.');
  }
  add('Notes', spec.additionalInformation);

  return parts.length > 0 ? parts.join('. ') : undefined;
}

/** Sign area in square feet, from the stated size. */
export function areaSqFt(widthInches: number, heightInches: number): number {
  return (widthInches * heightInches) / 144;
}
