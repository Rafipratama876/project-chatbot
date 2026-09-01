# KB → code

Where every layer of `CHANNEL LETTERS — WOLF STUDIO KNOWLEDGE BASE v2.2` lives.
A copy of the KB is in `docs/kb/`.

| KB | Code | Model involved? |
|---|---|---|
| §1.1 Types | `kb/domain/taxonomy.ts` — `TYPES` | no |
| §1.2 Form mapping | `kb/domain/taxonomy.ts` — `FORM_TYPE_MAP`; `modules/llm/free-text-resolver.service.ts` for `Custom` only | only the `Custom` branch |
| §1.3 Sub-types | `kb/domain/taxonomy.ts` — `SUBTYPES` | no |
| §2 Anatomy (34 parts) | `kb/domain/anatomy.ts` — `PARTS`, and `lintCallout` enforcing *"no callout may name a part that isn't on this list"* | no |
| §3.1 Roles | `kb/geometry/grouping.ts` — `assignRoles` (CL-R-49) | no |
| §3.2 Grouping | `kb/geometry/grouping.ts` — `groupIntoElements` (CL-R-48) | no |
| §3.3 Constructions | `kb/domain/taxonomy.ts` — `CONSTRUCTION_FACTS` | no |
| §3.4 Copy treatment | `kb/domain/taxonomy.ts` — `COPY_TREATMENT_FACTS`; drives `kb/render/scene.ts` | no |
| §3.5 Decision tree | `kb/geometry/decisionTree.ts` — `decideConstruction` | step 1 only (CL-R-54) |
| §3.6 Box sizing `[DER]` | `kb/geometry/boxSizing.ts`; numbers in `kb/domain/thresholds.ts` | no |
| §3.7 Patterns | `SignElement.suggestions` — offered, never applied | no |
| §4 Materials | `kb/domain/materials.ts` — face, returns, GemTrim/Jewelite catalogues, backer, raceway, colour systems, LEDs | no |
| §5 Production methods | `kb/domain/taxonomy.ts` — `PRODUCTION_METHODS` | no |
| §6.0–§6.7 (56 rules) | `kb/engine/rules/gate2-composition.ts`, `gate4-*.ts` | CL-R-54 only |
| §6.9 Standing notes | `kb/domain/boilerplate.ts` — strings, never evaluated | no |
| §7.1 Mount methods | `kb/domain/taxonomy.ts` — `MOUNTS`, `FORM_MOUNT_MAP` | only the `Other` branch |
| §7.2 Type × mount matrix | `kb/domain/compat.ts` — `TYPE_MOUNT_MATRIX` | no |
| §8.1 Defaults | `kb/engine/rules/gate3-defaults.ts` — `DEFAULTS` | no |
| §8.2 Precedence | `kb/engine/precedence.ts` — `PrecedenceResolver` | no |
| §9.1 Views | `kb/render/contract.ts` — `buildRenderContract` | no |
| §9.2 Visual truth | `kb/render/contract.ts` + `kb/render/scene.ts` + `kb/render/lighting.ts` | no — three.js |
| §9.3 Spec block | `kb/output/specBlock.ts` — template interpolation | no |
| §9.4 Disclosures | `kb/output/disclosures.ts`, generated from the trace | wording only |
| §9.5 Guidance | `kb/output/proof.ts` — `guidanceFor` | no |
| §10 Visibility chart | `kb/domain/visibility.ts` | no |
| §11 Open questions | `docs/GATES.md` | — |
| Appendix A & B | **not loaded** — the KB says the Stage 1 bot does not read them | — |

## Why the KB is not in a vector store

It is 53 KB. It fits in a context window whole, so there is nothing to retrieve.
More to the point: if the rules were chunked and retrieved, a retrieval miss
would mean a rule silently did not run, and nothing would ever surface that. A
rule engine cannot be probabilistic at the level of *"was this rule read?"*

Layers 1–10 are in code as structured data. `test/coverage.spec.ts` asserts that
all 56 rule IDs, all 34 parts, all 13 types, all 31 GemTrim colours and all 29
defaults are present — a rule that goes missing fails the build.

pgvector is still the right tool for the things that are genuinely retrieval
problems, and it is used for exactly those: `cl_vendor_reference` (Appendix A/B)
and `cl_design_reference` (past proofs, advisory under §9.5). See
`docs/ARCHITECTURE.md`.

## Where a model is actually used

Four places, none of them in the renderer:

1. **`modules/llm/free-text-resolver.service.ts`** — §1.2 `Custom` and §7.1 `Other`. Returns a
   confidence; below 0.75 the job escalates. The closed set of allowed answers
   is enforced in code, not trusted from the model.
2. **`modules/llm/logo-complexity.service.ts`** — CL-R-54. The one rule in Layer 6 that no
   measurement settles. Gets the computed counter count and stroke minimum as
   input; returns a confidence; escalates when unsure.
3. **`modules/llm/callout-writer.service.ts`** — §9.4 wording. Rewrites the trace into customer
   language. It does not decide *what* is disclosed, and a rewrite that names a
   part outside Layer 2 is discarded in favour of the deterministic text.
4. **`modules/llm/revision-patch.service.ts`** — turns a revision request into a patch to the
   *form*, then the engine re-runs every gate. The model never edits the spec:
   a spec edited outside the gates has not been validated by them.

Without credentials the engine still runs all 56 rules; the two decision points
escalate instead of guessing, which is the outcome the KB asks for.

## Things that still need wiring before customer use

- **Colour conversion (§4.7, CL-R-38/39).** PMS, Sherwin-Williams, Matthews and
  the four film lines are licensed colour data this package does not ship.
  `ColourConverter` in `kb/domain/materials.ts` is a port, injected through
  `EngineService`; the default names the system and marks the value indicative
  *without inventing a colour number*, because a made-up "PMS 186 C" on a proof
  is worse than no number — a fabricator would order against it.
- **Appendix A/B ingestion.** `VendorReferenceService.ingest()` exists and the
  table is indexed, but nothing chunks the appendices yet.
- **`[DER]` thresholds.** Five values are derived, not vendor-confirmed. They
  live in `cl_threshold` as rows so they can be corrected without a
  deploy, and every proof footnotes the ones it read.
- **Artwork intake.** `kb/geometry/outline.ts` covers fonts via opentype.js. SVG
  and PDF logo import is not built.
