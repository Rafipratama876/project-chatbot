import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobInputSchema, type JobInput } from '#/kb/domain/spec.js';

/**
 * The intake boundary.
 *
 * Validation is Zod, not class-validator, because the same schema defines the
 * `JobInput` type the rule engine consumes. Two definitions of one shape drift,
 * and here the drift would land as a runtime failure halfway through Gate 2.
 */
export class CreateProofDto {
  @ApiProperty({ description: 'Wolf Studio job reference.' })
  jobId!: string;

  @ApiProperty({ description: 'The Wolf Studio intake form.' })
  form!: JobInput['form'];

  @ApiProperty({ description: 'Per-item measured artwork, in inches.' })
  artwork!: JobInput['artwork'];

  @ApiPropertyOptional({
    description: 'Background photo, scale reference and where the sign goes. Drives the composited day view.',
  })
  placement?: JobInput['placement'];

  @ApiPropertyOptional({
    description: 'Whether the geometry is a vector outline or traced from a bitmap. Disclosed on the proof.',
  })
  artworkProvenance?: JobInput['artworkProvenance'];

  @ApiPropertyOptional({ description: 'Skip the three.js capture; spec block and disclosures only.' })
  skipRender?: boolean;

  @ApiPropertyOptional({ description: 'Run the 56 rules with no model calls. Judgments escalate.' })
  deterministicOnly?: boolean;

  static parse(body: unknown): {
    job: JobInput; skipRender: boolean; deterministicOnly: boolean;
  } {
    const raw = body as Record<string, unknown>;
    // Every field the schema knows about is passed through. Listing them by
    // hand is what dropped `placement` silently: the job validated, the proof
    // rendered, and the only symptom was a sign on a studio wall instead of on
    // the customer's building.
    const job = JobInputSchema.parse({
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

export class ReviseProofDto {
  @ApiProperty({ description: 'What the customer asked to change, in their words.' })
  request!: string;
}
