import { BadRequestException, Injectable } from '@nestjs/common';
import { ArtworkService, readSource } from '#/modules/artwork/artwork.service.js';
import { StorageService } from '#/modules/storage/storage.service.js';
import { WallPresetsService } from '#/modules/wall-presets/wall-presets.service.js';
import { buildPlacement, resolveFacade, type DesignLike } from '#/modules/designs/job-from-design.js';
import type { DLJobInput } from '#/kb/domain/dl-spec.js';
import { CreateDLProofFromWizardDto } from './dto/create-dl-proof-from-wizard.dto.js';

/**
 * The DL equivalent of `DesignsService['buildJob']` — turns what the wizard
 * collected (a logo file reference, a wall image + box fractions) into a
 * `DLJobInput`'s `artwork` and `placement`. Reuses `ArtworkService` (turns a
 * logo file into measured geometry) and `buildPlacement`/`resolveFacade`
 * (the wall-box-to-inches calibration) exactly as the Channel Letters wizard
 * does — both are generic, with no channel-letters vocabulary in either.
 *
 * There is no persisted "dl_design" draft row in v1 (see the plan's scope
 * limits), so this builds the `DesignLike` shape `buildPlacement` expects
 * directly from the wizard payload instead of loading it from a table.
 */
@Injectable()
export class DLJobBuilderService {
  constructor(
    private readonly artwork: ArtworkService,
    private readonly storage: StorageService,
    private readonly wallPresets: WallPresetsService,
  ) {}

  async build(dto: CreateDLProofFromWizardDto, jobId: string): Promise<DLJobInput> {
    if (!dto.logoUrl) {
      throw new BadRequestException(
        'This proof needs the logo/mark artwork — upload an SVG, PNG or JPEG on the first step.',
      );
    }

    // Sign text is optional on the wizard's Logo step (only the file is
    // required) — same as Channel Letters, where `ensureDesign()` falls back
    // to 'Untitled Sign' at creation. DL has no draft row to bake that
    // fallback into up front, so it happens here instead; without it, a blank
    // logoText reaches DLJobFormSchema's `businessName: min(1)` as an empty
    // string and the job fails deep inside the engine with a ZodError instead
    // of a page the wizard could react to.
    const businessName = dto.logoText.trim() || 'Untitled Sign';

    const wallUrl = await this.resolveWallUrl(dto);
    const wallBuffer = await this.storage.read(wallUrl);
    const wallMime = this.storage.mimeOf(wallUrl);
    const size = StorageService.measure(wallBuffer, wallMime);

    const designLike: DesignLike = {
      id: jobId,
      name: businessName,
      logoText: businessName,
      positionX: dto.box.xFrac + dto.box.widthFrac / 2,
      positionY: dto.box.yFrac + dto.box.heightFrac / 2,
      scale: dto.box.widthFrac,
      scaleY: dto.box.heightFrac,
      widthInches: dto.widthInches,
      heightInches: dto.heightInches,
      maxSignAreaAllowed: dto.maxSignAreaAllowed ?? null,
      wallImageWidth: size.width,
      wallImageHeight: size.height,
      facadeRect: dto.facadeRect
        ? { corners: dto.facadeRect.corners, widthInches: dto.facadeRect.widthInches, heightInches: dto.facadeRect.heightInches }
        : null,
      spec: null,
    };

    const placement = buildPlacement(designLike, {
      dataUrl: `data:${wallMime};base64,${wallBuffer.toString('base64')}`,
      width: size.width,
      height: size.height,
    });
    if (dto.facadeRect) placement.facadeRect = resolveFacade(dto.facadeRect);

    const logoBuffer = await this.storage.read(dto.logoUrl);
    const logoMime = this.storage.mimeOf(dto.logoUrl);
    const source = readSource(
      logoMime === 'image/svg+xml'
        ? { svg: logoBuffer.toString('utf8') }
        : { data: logoBuffer.toString('base64'), mime: logoMime },
    );
    const placed = this.artwork.place(source, placement, { name: businessName });

    return {
      jobId,
      form: {
        businessName,
        materialFamily: dto.materialFamily,
        finish: dto.finish,
        colour: dto.colour,
        mountingMethod: dto.mountingMethod,
        mountingSurfaceColour: dto.mountingSurfaceColour,
        mountingSurfaceTexture: dto.mountingSurfaceTexture,
        depth: dto.depth,
        quantity: dto.quantity,
        illuminated: dto.illuminated,
        ledColour: dto.ledColour,
        showSizesOnProof: dto.showSizesOnProof,
        showMaterialThickness: dto.showMaterialThickness,
        additionalInformation: dto.additionalInformation,
        ...(dto.maxSignAreaAllowed ? { site: { permittedAreaSqFt: dto.maxSignAreaAllowed } } : {}),
      },
      artwork: placed.items,
      placement,
      artworkProvenance: {
        source: placed.source,
        confidence: placed.confidence,
        notes: [...placed.warnings, ...placed.calibrationWarnings.map((w) => w.message)],
      },
    };
  }

  private async resolveWallUrl(dto: CreateDLProofFromWizardDto): Promise<string> {
    if (dto.customWallImageUrl) return dto.customWallImageUrl;
    if (dto.wallPresetId) {
      const preset = (await this.wallPresets.list()).find((p) => p.id === dto.wallPresetId);
      if (preset) return preset.imageUrl;
    }
    throw new BadRequestException('No wall image or preset selected.');
  }
}
