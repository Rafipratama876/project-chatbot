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

/**
 * Which panel represents a view, when only one can be shown.
 *
 * The two views answer different questions, so they want different cameras.
 * The day view answers "what will this look like on my building", so it is the
 * elevation on the customer's photograph. The night view answers "how is it
 * built and how does it light" — that is the three-quarter, the only angle
 * where the return depth, the standoff gap and the halo are visible at once. A
 * flat night elevation shows a glowing shape and none of the construction.
 *
 * Shared rather than restated. The proof sheet and the review page each had
 * their own copy of this choice, and they disagreed: the sheet showed the
 * three-quarter at night while the page showed the elevation, so the two
 * documents for one job did not match and neither was obviously wrong.
 */
export function preferredPanel<T extends { view: string; camera: string }>(
  panels: readonly T[],
  view: 'day' | 'night',
): T | undefined {
  // Day is the elevation: it is what placement is checked on, and it goes on
  // the customer's photograph. Night is the three-quarter — the only angle
  // where the return depth, the standoff gap and the halo are visible at once.
  // A flat night elevation shows a glowing shape and none of the construction,
  // which is what the night panel exists to show.
  const order = view === 'day'
    ? ['front-elevation', 'perspective', 'detail-perspective']
    : ['detail-perspective', 'perspective', 'front-elevation'];

  for (const camera of order) {
    const found = panels.find((p) => p.view === view && p.camera === camera);
    if (found) return found;
  }
  // Anything for that view beats nothing: a render contract that gains a
  // camera should not blank the panel until this list catches up. Except a
  // concept scene, which is an illustration with a generated setting — it must
  // never stand in for the panel a customer checks their building against.
  return panels.find((p) => p.view === view && p.camera !== 'concept');
}
