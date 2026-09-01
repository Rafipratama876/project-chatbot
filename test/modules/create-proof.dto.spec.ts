/**
 * The intake DTO must not drop fields the schema accepts.
 *
 * A dropped `placement` is invisible: the job validates, the engine runs, the
 * proof renders — against a studio wall instead of the customer's building.
 * Nothing errors, so only a test that compares the DTO's output against the
 * schema's own shape catches it.
 */
import { describe, it, expect } from 'vitest';
import { CreateProofDto } from '#/modules/proofs/dto/create-proof.dto.js';
import { JobInputSchema, PlacementSchema } from '#/kb/domain/spec.js';
import { heavenCrepes } from '../fixtures/jobs.js';

const placement = {
  backgroundImage: 'data:image/png;base64,AAAA',
  imageWidth: 1600,
  imageHeight: 1000,
  reference: { a: { x: 0, y: 0 }, b: { x: 480, y: 0 }, inches: 52, label: 'garage bay' },
  rect: { x: 700, y: 560, w: 400, h: 123 },
  sun: { azimuthDeg: -22, elevationDeg: 58 },
  facadeRect: {
    corners: [
      { x: 300, y: 300 }, { x: 1300, y: 240 },
      { x: 1300, y: 800 }, { x: 300, y: 760 },
    ],
    widthInches: 240,
    heightInches: 120,
  },
};

describe('CreateProofDto', () => {
  it('carries every top-level field JobInputSchema accepts', () => {
    // Whatever the schema knows about, the DTO has to forward.
    const accepted = Object.keys(JobInputSchema.shape);
    const parsed = CreateProofDto.parse({ ...heavenCrepes(), placement });
    for (const key of accepted) {
      if (key === 'placement') continue;
      expect(parsed.job, `${key} was dropped`).toHaveProperty(key);
    }
    expect(accepted).toContain('placement');
  });

  it('forwards the placement so the render composites onto the photo', () => {
    const parsed = CreateProofDto.parse({ ...heavenCrepes(), placement });
    expect(parsed.job.placement).toBeDefined();
    expect(parsed.job.placement!.reference.inches).toBe(52);
    expect(parsed.job.placement!.rect.w).toBe(400);
  });

  it('carries every field PlacementSchema accepts, not just the top level', () => {
    // The outer object surviving is not enough. `facadeRect` is the only thing
    // that lets the renderer recover where the photographer stood, and dropped
    // it fails the same silent way `placement` did: the proof renders, and the
    // 3/4 night panel is a studio card instead of the customer's building.
    const parsed = CreateProofDto.parse({ ...heavenCrepes(), placement });
    for (const key of Object.keys(PlacementSchema.shape)) {
      expect(parsed.job.placement, `placement.${key} was dropped`).toHaveProperty(key);
    }
  });

  it('recovers a camera from the marked wall face', () => {
    const parsed = CreateProofDto.parse({ ...heavenCrepes(), placement });
    const facade = parsed.job.placement!.facadeRect!;
    expect(facade.corners).toHaveLength(4);
    expect(facade.widthInches).toBe(240);
  });

  it('leaves placement undefined when none was supplied', () => {
    expect(CreateProofDto.parse(heavenCrepes()).job.placement).toBeUndefined();
  });

  it('reads the render flags off the body, not off the job', () => {
    const parsed = CreateProofDto.parse({ ...heavenCrepes(), skipRender: true, deterministicOnly: true });
    expect(parsed.skipRender).toBe(true);
    expect(parsed.deterministicOnly).toBe(true);
  });
});
