import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * pgvector store — Appendix A and B only.
 *
 * WHAT IS DELIBERATELY NOT HERE: Layers 1–10, the 56 rules, the decision tree,
 * the defaults and the output contract. Those are code (`src/kb/`), not
 * retrieved text. The KB is 53 KB — it fits in a context window whole, so there
 * is nothing to retrieve — and more importantly, a rule engine cannot be
 * probabilistic at the level of "was this rule read?". A retrieval miss on a
 * chunked rule means the rule silently did not run, and nothing surfaces that.
 * `test/coverage.spec.ts` asserts all 56 rule IDs exist in the registry; a rule
 * that goes missing fails the build instead of failing a customer's proof.
 *
 * Appendix A and B are the opposite case. The KB itself says "Parked. The
 * Stage 1 bot does not read this" — vendor minimums, published product lines,
 * LED module spacing, coil stock, extrusion catalogues. Large, open-ended,
 * queried by similarity, and safe to miss: a missing vendor note produces a
 * less specific answer, not a wrong sign.
 */
@Entity('cl_vendor_reference')
export class VendorReferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 'A.2', 'B.1' — the appendix section this chunk came from. */
  @Index()
  @Column({ type: 'text' })
  section!: string;

  @Index()
  @Column({ type: 'text', nullable: true })
  vendor!: string | null;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  /** `[EXT]`, `[AVG]`, `[SP]`, `[DER]` — carried through to any citation. */
  @Column({ type: 'text' })
  provenance!: string;

  @Column({ name: 'kb_version', type: 'text' })
  kbVersion!: string;

  /**
   * Nullable on purpose: a chunk is stored and citable whether or not an
   * embedding provider is configured. Without one, lookup falls back to
   * full-text search rather than failing.
   */
  @Column({ type: 'text', nullable: true })
  embedding!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
