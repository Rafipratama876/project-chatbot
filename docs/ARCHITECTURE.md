# Architecture

```
src/
  kb/                    ← framework-free. Imports nothing from src/modules.
    domain/              Layers 1, 2, 4, 5, 7, 10 as lookup tables + the spec model
    geometry/            Offset Path, stroke measurement, counters, §3.2, §3.5, §3.6
    engine/              Gates, trace, precedence, all 56 rules
    render/              §9.2 contract, three.js scene, day/night lighting
    output/              §9.3 spec block, §9.4 disclosures, board + proof assembly

  modules/               ← NestJS. Supplies ports, persistence and transport.
    database/            TypeORM entities, migration, pgvector columns
    knowledge/           Thresholds (exact) + Appendix A/B & design refs (retrieval)
    llm/                 The four bounded nodes
    engine/              Assembles the ports from DI and calls into src/kb
    render/              three.js capture, AI scene edits, Chromium board capture
    graph/               LangGraph: validate → draw → compose → assemble → revise
    proofs/              Controller, service, DTOs
    compat/              TSP session facade: Project JSON → measured JobInput
    queues/              BullMQ worker for renders
    health/
```

## The one boundary that matters

`src/kb/` never imports NestJS, TypeORM or the Anthropic SDK.
`test/architecture.spec.ts` fails the build if it ever does.

That is not tidiness. The rule engine is the part that has to be deterministic
and arguable on its own: *"does CL-R-51 fire at 4 inches?"* has to be a question
you answer by running a function, not by booting an application context. The
whole reason this system is a rule engine rather than a prompt is that its
behaviour is inspectable, and a DI container between you and the rule takes that
back.

So the dependency arrow points one way. Nest supplies the ports — thresholds
from Postgres, judgment from a model, pixels from a browser — and calls in.

## Project JSON is the source of truth

The TSP compatibility facade follows the same boundary for design input:

```
Project JSON → fieldName bindings → rule engine → three.js → board → proof
```

`signDetails[0].fieldInputs[]` carries each dynamic field's stable `fieldName`,
source `fieldId`, display title, value, type, options and optional guidance. The
facade binds fabrication semantics by `fieldName`, never by a mutable display
title or free-form `aiMetadata`. Unknown fields remain structured customer
intent and reach the proof disclosures rather than being dropped.

The Project placement state remains authoritative for logo position, measured
size and aspect ratio. The facade scales its canvas coordinates to the actual
downloaded wall raster, traces the exact supplied logo once, and then gives the
result to the rule engine. AI may interpret a revision or an explicitly custom
choice. Post-render AI may change photographic materials, lighting, reflections,
wall interaction, shadows and perspective, but it may not alter artwork, text,
geometry, dimensions, colours, proportions, camera framing or construction.
Each scene edit receives its canonical three.js view capture rather than another
AI-generated panel.

## Module graph

```
   Proofs ──► Graph ──► Engine ──► Knowledge (thresholds, exact lookup)
      │          │          └────► Llm       (CL-R-54, §1.2/§7.1 ports)
       │          ├──► Render     (three.js seed → independent AI scene edits)
      │          └──► Llm        (§9.4 wording, revision → form patch)
      ├──► Knowledge  (design references, advisory)
      └──► Queues     (BullMQ, one Chromium page per concurrent job)
```

## LangGraph

```
   validate ──► draw ──► compose ──► assemble ──┬──► END
      ▲                                        │
      └──────────────── revise ◄───────────────┘
```

Five nodes. `validate` is one call into a pure function; `draw` is three.js;
`compose` independently produces or reuses the day/night scene panels, builds
the deterministic HTML board, and captures it at 1536 x 951. LangGraph earns its
place on one edge: **revise**.

A revision patches the intake **form** and re-enters at `validate`, so all six
gates run again. Patching the spec directly would produce a spec no gate had
validated — and since §9.4's disclosures are derived from the trace, the proof
would then carry a disclosure list describing decisions the spec no longer
matches. `ProofsService.revise` creates a new proof row for the same reason.
Keyword-scoped visual revisions regenerate only the affected scene panel;
ambiguous or combined requests regenerate both. Reused panels retain their seed
digest, making reuse and canonical-seed provenance inspectable.

Two conditional edges carry the rest of the routing:

- A job blocked by CL-R-46 routes around `draw`. There is nothing buildable to
  draw, and a convincing picture of an unbuildable sign is the worst output.
- A render failure is caught inside `draw` and surfaced as a problem, not
  thrown. The spec and the trace are what a human can still act on.

LangGraph rejects a node name that collides with a state channel, which is why
the nodes are `validate`/`draw`/`assemble` rather than `engine`/`render`/`proof`.

## pgvector — and what is deliberately not in it

Three tables use `vector`; **none of them holds a rule.**

| Table | Holds | Why retrieval fits |
|---|---|---|
| `cl_vendor_reference` | Appendix A/B — vendor minimums, published lines, LED spacing, coil stock | Large, open-ended, queried by paraphrase, **safe to miss** |
| `cl_design_reference` | Past proofs as one-line summaries | Advisory only (§9.5); never feeds a rule |

The 56 rules, the decision tree, the defaults, the 34 parts and the output
contract are **code**, in `src/kb/`. Two reasons:

1. The KB is 53 KB. It fits in a context window whole, so there is nothing to
   retrieve.
2. If rules were chunked and retrieved, a retrieval miss would mean a rule
   silently did not run — and nothing would ever surface that. A rule engine
   cannot be probabilistic at the level of *"was this rule read?"*
   `test/coverage.spec.ts` asserts all 56 IDs exist in the registry, and
   `GET /api/v1/health` reports coverage, so a missing rule fails the build and
   then fails the health check — never a customer's proof.

Thresholds are the third case and use **neither**. They are exact lookups by
key, loaded at boot, and `ThresholdService` throws at startup if a key the rules
read is absent from the table. Similarity is the wrong retrieval model for a
number a rule compares against.

### Embeddings

Anthropic has no embeddings endpoint and recommends a third-party provider, so
`EmbeddingService` is a separate credential and a separate call from the Claude
client. `EMBEDDING_PROVIDER=none` is a supported configuration: vendor search
falls back to Postgres full-text, which is worse at paraphrase and perfectly
adequate for *"what depth coil does Gemini stock"*.

## Why thresholds are rows

The KB tags values `[DER]` (derived, confirm if wrong), `[AVG]` (collapsed from
a vendor spread), `[SP]`, `[EXT]`. Five are `[DER]` — guesses until a fabricator
confirms them. Those must be correctable by editing a row, not by shipping a
release:

```bash
curl -X POST localhost:3000/api/v1/knowledge/thresholds/box.min_height \
  -d '{"value": 5, "updatedBy": "shop-foreman", "verified": true}'
```

The response carries `affectedProofIds` — every proof that used the old number,
from `cl_proof_threshold_read`. That is invariably the next question, and it is
why each proof records the threshold keys it read rather than just footnoting
them.

## Running with the LLM off

`LLM_ENABLED=false` is the default and a supported state, not a degraded one.
All 56 rules run. CL-R-54 and the §1.2/§7.1 free-text branches escalate instead
of guessing — which is exactly what the KB asks for:

> Custom → resolve from Additional Information. **Cannot resolve → escalate.**

`GET /api/v1/health` reports it as `"llmNodes": "disabled (judgments escalate)"`.

## Post-render AI

`AI_RENDER_ENABLED=true` runs each completed three.js panel through an OpenAI
image edit before persistence. The three.js PNG is the sole authoritative image
input. The prompt permits photorealistic material, light, shadow, reflection,
and wall-integration improvements while locking glyphs, logo contours, sign
components, colors, fabrication geometry, placement, scale, camera, crop, and
canvas dimensions. Day and night edits run concurrently from canonical captures
of the same validated scene. A failed edit falls back to that deterministic render rather than losing
the proof. HTML, not the image model, supplies all board specifications,
dimensions, labels and construction details.

This stage is independent of `LLM_ENABLED`: Anthropic handles the four bounded
judgment nodes; OpenAI handles only the final visual realism pass.
