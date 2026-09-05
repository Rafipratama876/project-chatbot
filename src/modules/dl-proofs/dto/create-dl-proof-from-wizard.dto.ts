import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PlacementInput } from '#/kb/domain/spec.js';

type FacadeRect = NonNullable<PlacementInput['facadeRect']>;

/**
 * What the wizard actually has after its Logo and Wall &amp; Placement steps
 * — a logo file reference and box fractions on a wall image, not yet a
 * `DLJobInput`. `DLJobBuilderService.build` is the DL equivalent of
 * `DesignsService['buildJob']`/`job-from-design.ts`: it turns this into
 * artwork (via the reused `ArtworkService`) and a `PlacementInput` (via the
 * reused `buildPlacement`), the same way a Channel Letters design does —
 * without a persisted "design" draft row, since DL has none in v1.
 */
export class CreateDLProofFromWizardDto {
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

  @ApiProperty() materialFamily!: string;
  @ApiPropertyOptional() finish?: string;
  @ApiPropertyOptional() colour?: string;
  @ApiProperty() mountingMethod!: string;
  @ApiPropertyOptional() mountingSurfaceColour?: string;
  @ApiPropertyOptional() mountingSurfaceTexture?: 'smooth' | 'uneven' | 'unspecified';
  @ApiPropertyOptional() depth?: number;
  @ApiPropertyOptional() quantity?: number;
  @ApiPropertyOptional() illuminated?: boolean;
  @ApiPropertyOptional() ledColour?: string;
  @ApiPropertyOptional() showSizesOnProof?: boolean;
  @ApiPropertyOptional() showMaterialThickness?: boolean;
  @ApiPropertyOptional() additionalInformation?: string;

  @ApiPropertyOptional() skipRender?: boolean;
  @ApiPropertyOptional() deterministicOnly?: boolean;
}
