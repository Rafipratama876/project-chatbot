import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PlacementInput } from '#/kb/domain/spec.js';

type FacadeRect = NonNullable<PlacementInput['facadeRect']>;

/**
 * What the wizard actually has after its Logo and Wall &amp; Placement steps
 * — a logo/graphic file reference and box fractions on a wall image, not yet
 * an `SCJobInput`. `SCJobBuilderService.build` is the SC equivalent of
 * `DesignsService['buildJob']`/`DLJobBuilderService.build`: it turns this
 * into artwork (via the reused `ArtworkService`) and a `PlacementInput` (via
 * the reused `buildPlacement`), the same way a Channel Letters or
 * Dimensional Letters design does — without a persisted "design" draft row,
 * since SC has none in v1.
 */
export class CreateSCProofFromWizardDto {
  @ApiProperty() logoText!: string;
  @ApiProperty() logoUrl!: string;

  @ApiPropertyOptional() wallPresetId?: string;
  @ApiPropertyOptional() customWallImageUrl?: string;

  @ApiProperty() widthInches!: number;
  @ApiProperty() heightInches!: number;
  @ApiPropertyOptional() maxSignAreaAllowed?: number;
  @ApiProperty({ description: 'Fractions of the wall image the sign box occupies.' })
  box!: { xFrac: number; yFrac: number; widthFrac: number; heightFrac: number };
  @ApiPropertyOptional() facadeRect?: FacadeRect;

  @ApiProperty() faceMaterial!: string;
  @ApiPropertyOptional() faceColour?: string;
  @ApiPropertyOptional() illuminated?: boolean;
  @ApiPropertyOptional() ledColour?: string;
  @ApiPropertyOptional() extrusionDepth?: number;
  @ApiPropertyOptional() cornerStyle?: 'square' | 'radius';
  @ApiPropertyOptional() cornerRadius?: number;
  @ApiPropertyOptional() retainerType?: string;
  @ApiProperty() mountingMethod!: string;
  @ApiPropertyOptional() mountingSurfaceColour?: string;
  @ApiPropertyOptional() mountingSurfaceTexture?: 'smooth' | 'uneven' | 'unspecified';
  @ApiPropertyOptional() attachmentDetail?: string;
  @ApiPropertyOptional() quantity?: number;
  @ApiPropertyOptional() showSizesOnProof?: boolean;
  @ApiPropertyOptional() showMaterialThickness?: boolean;
  @ApiPropertyOptional() additionalInformation?: string;

  @ApiPropertyOptional() skipRender?: boolean;
  @ApiPropertyOptional() deterministicOnly?: boolean;
}
