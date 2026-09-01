/** The KB's own worked example (§3), plus the cases each gate needs. */
import type { JobInput } from '#/kb/domain/spec.js';
import { blockWord, logoMark } from './blockGlyphs.js';

/**
 * "HEAVEN CREPES AND WAFFLES" — §3 worked example.
 *   ELEMENT 1  wing mark        → logo box
 *   ELEMENT 2  "HEAVEN"         → individual channel letters, front lit
 *   ELEMENT 3  "CREPES AND WAFFLES" at 4" → pill box, copy reversed out
 */
export const heavenCrepes = (): JobInput => ({
  jobId: 'heaven-crepes',
  form: {
    businessName: 'Heaven Crepes and Waffles',
    channelLetterType: 'Front Lit',
    installationMethod: 'Raceway',
    mountingSurfaceColour: 'Bronze',
    faceColour: 'Magenta',
  },
  artwork: [
    logoMark({ x: 0, y: 6, size: 18 }),
    ...blockWord('HEAVEN', { capHeight: 24, stroke: 3, baselineY: 6, startX: 24 }, 'H'),
    ...blockWord('CREPES AND WAFFLES', { capHeight: 4, stroke: 0.7, baselineY: 0, startX: 24 }, 'T'),
  ],
});

/** Halo lit specified flush — CL-R-24, the ⚠ substitution. */
export const haloFlush = (): JobInput => ({
  jobId: 'halo-flush',
  form: {
    businessName: 'Northside Dental',
    channelLetterType: 'Back Lit',
    installationMethod: 'Flush Mounted',
    mountingSurfaceColour: '#8a8f94',
  },
  artwork: blockWord('NORTHSIDE', { capHeight: 18, stroke: 2.2 }),
});

/** Primary copy under the minimum stroke — CL-R-01 offset, CL-R-05 counters. */
export const thinPrimary = (): JobInput => ({
  jobId: 'thin-primary',
  form: {
    businessName: 'Bloom',
    channelLetterType: 'Front Lit',
    installationMethod: 'Direct Mounted with Spacers',
  },
  artwork: blockWord('BOD', { capHeight: 20, stroke: 0.9 }),
});

/** Non-lit, tagline under the minimum — CL-R-52 flat cut, not a pill box. */
export const nonLitTagline = (): JobInput => ({
  jobId: 'nonlit-tagline',
  form: {
    businessName: 'Ridgeway Legal',
    channelLetterType: 'Non-Lit',
    installationMethod: 'Flush Mounted',
    returnColour: 'Brushed Silver',
  },
  artwork: [
    ...blockWord('RIDGEWAY', { capHeight: 14, stroke: 1.6, baselineY: 6 }),
    ...blockWord('LEGAL', { capHeight: 4.5, stroke: 0.6, baselineY: 0 }, 'T'),
  ],
});

/** "Custom" type with no Additional Information — must escalate, never guess. */
export const unresolvableCustom = (): JobInput => ({
  jobId: 'custom-unresolved',
  form: {
    businessName: 'Atlas Coffee',
    channelLetterType: 'Custom',
    installationMethod: 'Other',
  },
  artwork: blockWord('ATLAS', { capHeight: 16, stroke: 2 }),
});
