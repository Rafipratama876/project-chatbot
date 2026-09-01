import { ApiProperty } from '@nestjs/swagger';
import type { ProofEntity, ProofStatus } from '#/modules/database/entities/proof.entity.js';
import type { Proof } from '#/kb/output/proof.js';

/**
 * What a caller gets back.
 *
 * The rule trace is summarised rather than dumped: the full trace is the audit
 * record and stays in Postgres, but a proof consumer needs the disclosures §9.4
 * requires, not 80 rows of `before`/`after`.
 */
export class ProofResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty() status!: ProofStatus;
  @ApiProperty() kbVersion!: string;
  @ApiProperty({ description: 'KB §9.3, one block per element.' })
  specBlock!: string | null;
  @ApiProperty({ description: 'KB §9.4, generated from the trace.' })
  disclosures!: string | null;
  @ApiProperty() panels!: Array<{ label: string; view: string; camera: string; file: string }>;
  @ApiProperty({ description: 'Non-empty means the proof failed its own contract and must not ship.' })
  problems!: string[];
  @ApiProperty({ description: 'CL-R-46 fired — the only blocking rule in the KB.' })
  blocked!: boolean;
  @ApiProperty() escalations!: Array<{ ruleId: string; reason: string; question: string }>;
  @ApiProperty({ description: 'Rules that fired, by ID and severity.' })
  rulesFired!: Array<{ ruleId: string; severity: string; critical: boolean; count: number }>;
  @ApiProperty() createdAt!: Date;

  static from(entity: ProofEntity): ProofResponseDto {
    // Keyed by rule AND severity: one rule routinely emits several entries at
    // different severities — CL-R-01 writes the offset outline as an AUTOFIX
    // and the counter inspection as a NOTE. Collapsing on the rule id alone
    // reports whichever fired first and hides the rest.
    const counts = new Map<string, { ruleId: string; severity: string; critical: boolean; count: number }>();
    for (const t of entity.trace) {
      const key = `${t.ruleId}|${t.severity}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { ruleId: t.ruleId, severity: t.severity, critical: t.critical, count: 1 });
    }

    return {
      id: entity.id,
      jobId: entity.jobId,
      status: entity.status,
      kbVersion: entity.kbVersion,
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

export const toProofResponse = (entity: ProofEntity): ProofResponseDto => ProofResponseDto.from(entity);
export type { Proof };
