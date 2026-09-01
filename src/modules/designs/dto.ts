import { z } from 'zod';
import { basename } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { DesignEntity, DesignMessageEntity } from '#/modules/database/entities/design.entity.js';
import type { WallPresetEntity } from '#/modules/database/entities/wall-preset.entity.js';
import type { ProofEntity } from '#/modules/database/entities/proof.entity.js';

const PointSchema = z.object({ x: z.number(), y: z.number() });

export const CreateDesignSchema = z.object({
  name: z.string().trim().min(1).max(200).default('Untitled Sign'),
});

export const UpdateLogoSchema = z.object({
  logoUrl: z.string().optional(),
  logoText: z.string().max(200).optional(),
});
export type UpdateLogoDto = z.infer<typeof UpdateLogoSchema>;

export const UpdateWallPositionSchema = z.object({
  wallPresetId: z.string().uuid().optional(),
  customWallImageUrl: z.string().optional(),
  /** Centre of the sign box, as a fraction of the wall image. */
  positionX: z.number().min(0).max(1),
  positionY: z.number().min(0).max(1),
  /** The box's width, as a fraction of the wall image width. */
  scale: z.number().gt(0).max(1),
  /** The box's height, as a fraction of the wall image height. */
  scaleY: z.number().gt(0).max(1).optional(),
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  maxSignAreaAllowed: z.number().positive().optional(),
  facadeRect: z.object({
    corners: z.array(PointSchema).length(4),
    widthInches: z.number().positive(),
    heightInches: z.number().positive(),
  }).optional(),
});
export type UpdateWallPositionDto = z.infer<typeof UpdateWallPositionSchema>;

/**
 * The specification form, kept loose on purpose.
 *
 * These are the customer's words, not a validated spec — the gates produce
 * that. Rejecting an unrecognised value here would move a judgment the KB owns
 * (§8.1 defaults, §8.2 precedence, the escalations) into a DTO that has no
 * rules to make it with.
 */
export const UpdateSpecSchema = z.object({
  channelLetterType: z.string().optional(),
  faceColor: z.string().optional(),
  faceColorTreatment: z.string().optional(),
  faceColorTreatmentCustomDetail: z.string().nullish(),
  trimCapColor: z.string().optional(),
  returnColor: z.string().optional(),
  returnDepth: z.string().optional(),
  returnDepthCustomDetail: z.string().nullish(),
  installationMethod: z.string().optional(),
  installationMethodCustomDetail: z.string().nullish(),
  backerPanelOption: z.string().optional(),
  backerPanelCustomDetail: z.string().nullish(),
  backerPanelColor: z.string().nullish(),
  quantity: z.number().int().positive().optional(),
  showSizesOnProof: z.boolean().optional(),
  materialsThicknessOption: z.string().optional(),
  additionalInformation: z.string().optional(),
});
export type UpdateSpecDto = z.infer<typeof UpdateSpecSchema>;

export const ReviseSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestException({
      message: 'invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

// ── Response shapes ────────────────────────────────────────────────────────

/**
 * A proof, as the review page reads it.
 *
 * The page thinks in "a render, with a day image and a night image", which is
 * the honest summary of what a customer is looking at. The full panel set,
 * the trace and the sheet stay on the proof endpoints for anyone who needs
 * them — this shape is the picture, not the audit.
 */
export interface RenderView {
  id: string;
  version: number;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'BLOCKED';
  errorMessage: string | null;
  dayImageUrl: string | null;
  nightImageUrl: string | null;
  /** Set when a panel could not use the customer's photograph. */
  dayNote?: string | null;
  nightNote?: string | null;
  blocked: boolean;
  escalations: Array<{ ruleId: string; reason: string; question: string }>;
  problems: string[];
  rulesFired: number;
  sheetUrl: string;
  createdAt: string;
}

const STATUS: Record<ProofEntity['status'], RenderView['status']> = {
  queued: 'PENDING',
  running: 'PROCESSING',
  ready: 'READY',
  blocked: 'BLOCKED',
  failed: 'FAILED',
};

export function toRenderView(proof: ProofEntity, apiPrefix = '/api/v1'): RenderView {
  // The elevation is what the customer checks placement on, so it is the one
  // the page shows. `find` rather than `[0]`: panel order is the render
  // contract's, not this view's, and pinning to an index would silently show
  // a three-quarter the day the contract gains a panel.
  const pick = (view: string) =>
    proof.panels.find((p) => p.view === view && p.camera === 'front-elevation')
    ?? proof.panels.find((p) => p.view === view);

  const day = pick('day');
  const night = pick('night');
  // The panel endpoint keys on the file's basename, so that is what goes in
  // the URL — reconstructing a name from view and camera would work until the
  // renderer changed how it names files, and then serve 404s with no clue why.
  const url = (panel?: { file: string }) =>
    panel ? `${apiPrefix}/proofs/${proof.id}/panels/${basename(panel.file)}` : null;

  return {
    id: proof.id,
    version: proof.version,
    status: STATUS[proof.status],
    errorMessage: proof.errorMessage,
    dayImageUrl: url(day),
    nightImageUrl: url(night),
    dayNote: day?.note ?? null,
    nightNote: night?.note ?? null,
    blocked: proof.blocked,
    escalations: proof.escalations,
    problems: proof.problems,
    rulesFired: proof.trace.length,
    sheetUrl: `${apiPrefix}/proofs/${proof.id}/sheet`,
    createdAt: proof.createdAt.toISOString(),
  };
}

export interface DesignView {
  id: string;
  name: string;
  status: DesignEntity['status'];
  logoUrl: string | null;
  logoText: string | null;
  wallPresetId: string | null;
  wallPreset: WallPresetEntity | null;
  customWallImageUrl: string | null;
  positionX: number | null;
  positionY: number | null;
  scale: number | null;
  scaleY: number | null;
  widthInches: number | null;
  heightInches: number | null;
  areaSqFt: number | null;
  maxSignAreaAllowed: number | null;
  facadeRect: DesignEntity['facadeRect'];
  wallImageWidth: number | null;
  wallImageHeight: number | null;
  spec: Record<string, unknown> | null;
  renders: RenderView[];
  chatMessages: Array<{ id: string; role: string; content: string; createdAt: string }>;
}

export function toDesignView(
  design: DesignEntity,
  renders: ProofEntity[] = [],
  messages: DesignMessageEntity[] = [],
  apiPrefix = '/api/v1',
): DesignView {
  return {
    id: design.id,
    name: design.name,
    status: design.status,
    logoUrl: design.logoUrl,
    logoText: design.logoText,
    wallPresetId: design.wallPresetId,
    wallPreset: design.wallPreset ?? null,
    customWallImageUrl: design.customWallImageUrl,
    positionX: design.positionX,
    positionY: design.positionY,
    scale: design.scale,
    scaleY: design.scaleY,
    widthInches: design.widthInches,
    heightInches: design.heightInches,
    areaSqFt: design.areaSqFt,
    maxSignAreaAllowed: design.maxSignAreaAllowed,
    facadeRect: design.facadeRect,
    wallImageWidth: design.wallImageWidth,
    wallImageHeight: design.wallImageHeight,
    spec: design.spec,
    renders: renders.map((r) => toRenderView(r, apiPrefix)),
    chatMessages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
