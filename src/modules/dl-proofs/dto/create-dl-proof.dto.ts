import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DLJobInputSchema, type DLJobInput } from '#/kb/domain/dl-spec.js';

export class CreateDLProofDto {
  @ApiProperty({ description: 'Job reference.' })
  jobId!: string;

  @ApiProperty({ description: 'The Dimensional Letters intake form.' })
  form!: DLJobInput['form'];

  @ApiProperty({ description: 'Per-item measured artwork, in inches.' })
  artwork!: DLJobInput['artwork'];

  @ApiPropertyOptional({ description: 'Background photo, scale reference and where the sign goes.' })
  placement?: DLJobInput['placement'];

  @ApiPropertyOptional({ description: 'Whether the geometry is a vector outline or traced from a bitmap.' })
  artworkProvenance?: DLJobInput['artworkProvenance'];

  @ApiPropertyOptional({ description: 'Skip the three.js capture; spec block and disclosures only.' })
  skipRender?: boolean;

  @ApiPropertyOptional({ description: 'Run without model calls. Judgments escalate.' })
  deterministicOnly?: boolean;

  static parse(body: unknown): { job: DLJobInput; skipRender: boolean; deterministicOnly: boolean } {
    const raw = body as Record<string, unknown>;
    const job = DLJobInputSchema.parse({
      jobId: raw.jobId,
      form: raw.form,
      artwork: raw.artwork,
      placement: raw.placement,
      artworkProvenance: raw.artworkProvenance,
    });
    return {
      job,
      skipRender: raw.skipRender === true,
      deterministicOnly: raw.deterministicOnly === true,
    };
  }
}
