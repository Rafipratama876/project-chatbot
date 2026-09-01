import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesignReferenceEntity } from '#/modules/database/entities/design-reference.entity.js';
import { EmbeddingService } from './embedding.service.js';
import type { SignSpec } from '#/kb/domain/spec.js';
import { TYPES, MOUNTS, CONSTRUCTION_FACTS, ROLES } from '#/kb/domain/taxonomy.js';
import { formatInches } from '#/kb/domain/units.js';

export interface SimilarSign {
  id: string;
  businessName: string;
  summary: string;
  signType: string;
  proofId: string | null;
  score: number;
}

/**
 * "We did something like this before."
 *
 * Advisory only. §9.5 design guidance is explicitly soft and runs after every
 * hard rule has passed, which is exactly the shape retrieval suits. Nothing
 * here feeds a rule, a dimension or a material — those come from the engine,
 * and a similar past job is not evidence about the current one.
 */
@Injectable()
export class DesignReferenceService {
  constructor(
    @InjectRepository(DesignReferenceEntity)
    private readonly repo: Repository<DesignReferenceEntity>,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Called after a proof is assembled, so the next job can find it. */
  async record(spec: SignSpec, proofId: string): Promise<void> {
    const summary = summarise(spec);
    const vector = await this.embeddings.embedOne(summary, 'document');

    await this.repo.save(this.repo.create({
      proofId,
      businessName: spec.businessName,
      summary,
      signType: spec.type,
      constructions: [...new Set(spec.elements.map((e) => e.construction))],
      mountMethod: spec.mount,
      embedding: vector ? EmbeddingService.toVector(vector) : null,
    }));
  }

  async findSimilar(spec: SignSpec, limit = 5): Promise<SimilarSign[]> {
    const vector = await this.embeddings.embedOne(summarise(spec), 'query');

    if (vector) {
      const rows = await this.repo.manager.query<Array<Record<string, unknown>>>(
        `SELECT id, business_name, summary, sign_type, proof_id,
                1 - (embedding <=> $1::vector) AS score
         FROM cl_design_reference
         WHERE embedding IS NOT NULL AND (proof_id IS NULL OR proof_id <> $3)
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [EmbeddingService.toVector(vector), limit, spec.jobId],
      );
      return rows.map(toSimilar);
    }

    // Without embeddings, same type and mount is a reasonable proxy — a halo
    // sign on a raceway has more in common with another one than with a
    // front-lit flush-mounted set, whatever the copy says.
    const rows = await this.repo.manager.query<Array<Record<string, unknown>>>(
      `SELECT id, business_name, summary, sign_type, proof_id, 0 AS score
       FROM cl_design_reference
       WHERE sign_type = $1 AND mount_method = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [spec.type, spec.mount, limit],
    );
    return rows.map(toSimilar);
  }
}

/** One line, because that is what gets embedded and compared. */
function summarise(spec: SignSpec): string {
  const parts = spec.elements.map(
    (e) => `${ROLES[e.role].label} "${e.content}" as ${CONSTRUCTION_FACTS[e.construction].label} at ${formatInches(e.capHeight)} cap height`,
  );
  return [
    `${spec.businessName}: ${TYPES[spec.type].name} channel letters`,
    `${MOUNTS[spec.mount].label}`,
    spec.backer.present ? `on a ${spec.backer.shape} backer` : 'no backer',
    `${spec.elements.length} element(s) — ${parts.join('; ')}`,
  ].join(', ');
}

const toSimilar = (row: Record<string, unknown>): SimilarSign => ({
  id: String(row.id),
  businessName: String(row.business_name),
  summary: String(row.summary),
  signType: String(row.sign_type),
  proofId: (row.proof_id as string | null) ?? null,
  score: Number(row.score),
});
