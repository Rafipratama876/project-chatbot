import { BadRequestException, Injectable } from '@nestjs/common';
import { ArtworkService, readSource } from '#/modules/artwork/artwork.service.js';
import { StorageService } from '#/modules/storage/storage.service.js';
import { WallPresetsService } from '#/modules/wall-presets/wall-presets.service.js';
import { buildPlacement, resolveFacade, type DesignLike } from '#/modules/designs/job-from-design.js';
import type { SCJobInput } from '#/kb/domain/sc-spec.js';
import { CreateSCProofFromWizardDto } from './dto/create-sc-proof-from-wizard.dto.js';

/**
 * The SC equivalent of `DesignsService['buildJob']`/`DLJobBuilderService.build`
 * — turns what the wizard collected (a face-graphic file reference, a wall
 * image + box fractions) into an `SCJobInput`'s `artwork` and `placement`.
 * Reuses `ArtworkService` (turns a graphic file into measured geometry) and
 * `buildPlacement`/`resolveFacade` (the wall-box-to-inches calibration)
 * exactly as the Channel Letters and Dimensional Letters wizards do — both
 * are generic, with no product-specific vocabulary in either.
 *
 * There is no persisted "sc_design" draft row in v1 (same scope limit as
 * DL), so this builds the `DesignLike` shape `buildPlacement` expects
 * directly from the wizard payload instead of loading it from a table.
 */
@Injectable()
export class SCJobBuilderService {
  constructor(
    private readonly artwork: ArtworkService,
    private readonly storage: StorageService,
    private readonly wallPresets: WallPresetsService,
  ) {}

  async build(dto: CreateSCProofFromWizardDto, jobId: string): Promise<SCJobInput> {
    if (!dto.logoUrl) {
      throw new BadRequestException(
        'This proof needs the face graphic/logo — upload an SVG, PNG or JPEG on the first step.',
      );
    }

    // Sign text is optional on the wizard's Logo step (only the file is
    // required) — same as Channel Letters and DL.
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
        faceMaterial: dto.faceMaterial,
        faceColour: dto.faceColour,
        illuminated: dto.illuminated,
        ledColour: dto.ledColour,
        extrusionDepth: dto.extrusionDepth,
        cornerStyle: dto.cornerStyle,
        cornerRadius: dto.cornerRadius,
        retainerType: dto.retainerType,
        mountingMethod: dto.mountingMethod,
        mountingSurfaceColour: dto.mountingSurfaceColour,
        mountingSurfaceTexture: dto.mountingSurfaceTexture,
        attachmentDetail: dto.attachmentDetail,
        quantity: dto.quantity,
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

  private async resolveWallUrl(dto: CreateSCProofFromWizardDto): Promise<string> {
    if (dto.customWallImageUrl) return dto.customWallImageUrl;
    if (dto.wallPresetId) {
      const preset = (await this.wallPresets.list()).find((p) => p.id === dto.wallPresetId);
      if (preset) return preset.imageUrl;
    }
    throw new BadRequestException('No wall image or preset selected.');
  }
}
