import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCJobInputSchema, type SCJobInput } from '#/kb/domain/sc-spec.js';

export class CreateSCProofDto {
  @ApiProperty({ description: 'Job reference.' })
  jobId!: string;

  @ApiProperty({ description: 'The Sign Cabinet intake form.' })
  form!: SCJobInput['form'];

  @ApiProperty({ description: 'Per-item measured artwork (the face graphic), in inches.' })
  artwork!: SCJobInput['artwork'];

  @ApiPropertyOptional({ description: 'Background photo, scale reference and where the sign goes.' })
  placement?: SCJobInput['placement'];

  @ApiPropertyOptional({ description: 'Whether the geometry is a vector outline or traced from a bitmap.' })
  artworkProvenance?: SCJobInput['artworkProvenance'];

  @ApiPropertyOptional({ description: 'Skip the three.js capture; spec block and disclosures only.' })
  skipRender?: boolean;

  @ApiPropertyOptional({ description: 'Run without model calls. Judgments escalate.' })
  deterministicOnly?: boolean;

  static parse(body: unknown): { job: SCJobInput; skipRender: boolean; deterministicOnly: boolean } {
    const raw = body as Record<string, unknown>;
    const job = SCJobInputSchema.parse({
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
