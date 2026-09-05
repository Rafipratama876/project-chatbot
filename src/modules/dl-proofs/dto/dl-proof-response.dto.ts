import { ApiProperty } from '@nestjs/swagger';
import type { DLProofEntity, DLProofStatus } from '#/modules/database/entities/dl-proof.entity.js';

export class DLProofResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty() status!: DLProofStatus;
  @ApiProperty() dlVersion!: string;
  @ApiProperty({ description: 'One block per element.' })
  specBlock!: string | null;
  @ApiProperty({ description: 'Generated from the trace.' })
  disclosures!: string | null;
  @ApiProperty() panels!: Array<{ label: string; view: string; camera: string; file: string }>;
  @ApiProperty({ description: 'Non-empty means the proof failed its own contract and must not ship.' })
  problems!: string[];
  @ApiProperty() blocked!: boolean;
  @ApiProperty() escalations!: Array<{ ruleId: string; reason: string; question: string }>;
  @ApiProperty({ description: 'Rules that fired, by ID and severity.' })
  rulesFired!: Array<{ ruleId: string; severity: string; count: number }>;
  @ApiProperty() createdAt!: Date;

  static from(entity: DLProofEntity): DLProofResponseDto {
    const counts = new Map<string, { ruleId: string; severity: string; count: number }>();
    for (const t of entity.trace) {
      const key = `${t.ruleId}|${t.severity}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { ruleId: t.ruleId, severity: t.severity, count: 1 });
    }

    return {
      id: entity.id,
      jobId: entity.jobId,
      status: entity.status,
      dlVersion: entity.dlVersion,
      specBlock: entity.specBlock,
      disclosures: entity.disclosureText,
      panels: entity.panels,
      problems: entity.problems,
      blocked: entity.blocked,
      escalations: entity.escalations,
      rulesFired: [...counts.values()],
      createdAt: entity.createdAt,
    };
  }
}
