/**
 * Which panels go onto the customer's photograph, and which stay in studio.
 *
 * This is a policy, not renderer plumbing, and it decides what the customer
 * actually sees — so it lives where it can be read and tested rather than
 * inline in a WebGL entry point that only runs in a browser.
 */

/**
 * Below this the photograph is effectively head-on, and a 3/4 camera would put
 * the sign at an angle the building does not share. That reads as a sticker —
 * worse than an honest studio card, because it claims to be the building.
 */
export const MIN_OBLIQUITY_DEG = 12;

export interface PanelGround {
  /** Draw the photograph under this panel. */
  composite: boolean;
  /** Why — carried so the proof can say it rather than leaving a black box. */
  reason:
    | 'no-photo'
    | 'front-elevation'
    | 'oblique-photo'
    | 'no-facade-marked'
    | 'photo-too-square-on';
}

export function panelGround(input: {
  camera: string;
  hasPhoto: boolean;
  /** Obliquity of the recovered camera, or null when no wall face was marked. */
  obliquityDeg: number | null;
}): PanelGround {
  if (!input.hasPhoto) return { composite: false, reason: 'no-photo' };

  // The front elevation looks straight at the wall, which is how the
  // photograph was taken often enough that no camera recovery is needed: the
  // sign is placed at the calibrated size and the building shows through.
  if (input.camera === 'front-elevation') {
    return { composite: true, reason: 'front-elevation' };
  }

  if (input.obliquityDeg === null) {
    return { composite: false, reason: 'no-facade-marked' };
  }
  if (input.obliquityDeg <= MIN_OBLIQUITY_DEG) {
    return { composite: false, reason: 'photo-too-square-on' };
  }
  return { composite: true, reason: 'oblique-photo' };
}

/** What the proof says under a 3/4 panel that could not use the photograph. */
export function groundNote(reason: PanelGround['reason']): string | null {
  switch (reason) {
    case 'no-facade-marked':
      return 'Shown against a neutral ground: no wall face was marked, so the '
        + 'angle the photograph was taken at is unknown.';
    case 'photo-too-square-on':
      return 'Shown against a neutral ground: the photograph was taken close to '
        + 'square-on, and a three-quarter view of it would misstate the angle.';
    default:
      return null;
  }
}
