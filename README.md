# Channel Letter Proof Engine

Stage-1 pre-sales proofs for channel letter signs, built from
`CHANNEL LETTERS — WOLF STUDIO KNOWLEDGE BASE v2.2` (`docs/kb/`).

The KB is already written as a rule-engine specification rather than as a
prompt: it has rule IDs, tiers, severities, gates, an explicit precedence order,
a decision tree marked *deterministic*, and a hard output contract. This
implements it as one.

**56 rules. One of them blocks. One of them needs a model.**

## Shape of the thing

```
  Wolf Studio form + measured artwork
            │
   Gate 1   ├─ §1.2 / §7.1 → taxonomy IDs          ← LLM only for Custom/Other
   Gate 2   ├─ §6.0 CL-R-48…56  composition        ← LLM only for CL-R-54
   Gate 3   ├─ §8.1 CL-D-01…29  defaults
   Gate 4   ├─ §6.1–§6.7 CL-R-01…47  validation    ← re-runs to a fixpoint
   Gate 5   ├─ §9.1 views, §9.2 visual truth
            │
            ├──► three.js scene ──┬─ day lighting  ──► PNG
            │                     └─ night lighting ─► PNG
   Gate 6   └─ §9.3 spec block + §9.4 disclosures
```

Everything except four bounded nodes is deterministic TypeScript. The renderer
contains no model call at all.

## Why three.js and not image generation

§9.2 is a list of geometry and lighting requirements, not aesthetic preferences:

> *Face glows. Returns and trim dark. Nothing behind glows.*
> *Standoff gap 1.5″–2″ drawn for every rear-illuminated element.*
> *Return depth reads consistently in perspective at the specified value.*
> *Box faces sit in the same plane as the letter faces.*

A channel letter **is** an extrusion of a 2D outline, so
`ExtrudeGeometry(letterShape, { depth: returnDepth })` is not an approximation
of the form — it is the fabrication step. Front lit, halo, front+halo and
non-lit are three material configurations over that one geometry, not three
prompts.

The decisive case is §9.1's day-and-night requirement. Sampled independently,
two images disagree: letterforms drift, framing shifts, raceway height changes.
A proof whose two halves do not match will not be believed. Here they are two
lighting environments over one scene graph, so consistency is a property of the
data structure rather than something to hope for.

## The trace is the product

§9.4 requires the proof to report every critical substitution, every other
autofix, every warning and every defaulted field — and CL-R-47 requires each one
in plain language. So every rule emits a `RuleTrace` alongside its mutation:

```ts
type RuleTrace = {
  ruleId: string;      // "CL-R-51"
  gate: number;
  tier: 'VISUAL' | 'SPEC' | 'STANDING';
  severity: 'AUTOFIX' | 'WARN' | 'NOTE' | 'BLOCK';
  critical: boolean;   // ⚠ gets its own callout
  path: string;        // "elements[2].construction"
  before: unknown;
  after: unknown;
  thresholdKeys?: string[];  // so a [DER] correction is traceable
};
```

The disclosure section is generated from it. Skip the trace and the callouts get
written by hand, and the proof stops matching the spec the first time a rule
changes.

## The app

```
  My Designs ──► New Design ──► the review page
                     │                 │
                     │                 ├─ day / night toggle
                     │                 ├─ spec sheet + the full proof sheet
                     │                 ├─ revision chat (re-runs every gate)
                     │                 └─ approve · export PDF · re-render
                     ▼
  1. Logo          SVG, PNG or JPEG in, measured geometry out.
  2. Wall          A preset or the customer's photo. Drag the sign; its size in
                   inches is MEASURED off the wall, and typing a size resizes
                   the box to match. One scale, both directions.
  3. Specification The Wolf Studio form, with options served from the KB.
        │
        └──► all six gates ──► day + night composited onto the photo ──► proof sheet
```

A **design** is intake the customer can come back to and change. A **proof** is
one immutable run of the gates against it. They are separate rows on purpose:
§9.4's disclosures are derived from the trace, so a spec edited after the gates
ran would carry a disclosure list describing decisions that no longer match it.
Every change makes a new version instead, which is also what makes the version
history real rather than cosmetic.

Both views go on the customer's building. The night panel is the 3/4 — the only
angle where the return depth, the standoff gap and the halo are visible at once
— and it stays on the photograph rather than dropping to a studio backdrop.

That needs the camera to stand where the photographer stood. Mark a rectangle on
the wall whose size you know (a door, a bay, a panel) and the renderer recovers
the viewpoint from it: field of view, distance, and how far off the wall normal
the camera sat. The sign is then rendered from there, so its returns converge
with the building's instead of running parallel across it.

**The marked wall face must agree with its own pixels.** A quad that is still
a rectangle in the photograph has its real aspect fixed by its pixel aspect: a
240″ wall drawn 848 × 522 px *is* 147.8″ tall and cannot be anything else. So
the wizard derives that height instead of asking for it. Accepting a typed
240″ × 120″ there is not a second opinion, it is a contradiction — the
placement homography and the renderer's recovered camera end up describing
different walls, and the sign renders 53 px off and 12 % too large with nothing
to say why. Where the quad *has* perspective the pixels determine nothing, the
typed height is the only source of it, and it is asked for and left alone.

**There is exactly one scale in play.** A marked wall face — or a preset, which
states how wide the wall it depicts really is — already says how many inches a
pixel is worth. The sign's size is then a *measurement* of the dragged box
against that face, not a second independent claim. Letting the two disagree is
not a rounding error: the engine calibrated from one and the renderer's
recovered camera from the other, so the sign landed at a third of its size
somewhere other than where it was dragged, with nothing to say it had. The box
and the inches are now bound in both directions, and `src/kb/geometry/
homography.ts` is aliased into the wizard so the preview and the renderer place
it by the same arithmetic rather than by two copies that drift.

Without that rectangle the composite assumes the wall faces the camera, which is
right for a photograph taken square to the building. **A 3/4 sign cannot be
placed on a head-on photograph** — the sign would be at an angle the wall does
not share, and it reads as a sticker. Photograph the building from the footpath
and the night view is genuinely 3/4, on the building.

Step 2 is the one that matters. Everything the engine decides afterwards is
denominated in inches — whether copy clears the 8″ minimum, whether the area
exceeds what is permitted, how deep the returns read in perspective — and a
photograph has no inches until someone measures something in it. So the scale
reference is required and cannot be defaulted, and the proof states which
measurement it was taken from.

The rendered sign is composited at that scale. It is not pasted at a size that
looks about right: the camera frames a known number of world inches, and the
compositor places the sprite at that many inches on the facade.

**SVG, PNG or JPEG.** A vector outline *is* the artwork. A bitmap is traced —
background removed, colours quantised, boundaries followed at the pixel cracks —
and the result is an inference about the artwork, not the artwork. So the trace
carries a confidence, the wizard shows it, and §9.4 discloses it on the proof:

> *Artwork was traced from a bitmap at 62% confidence. The outline approximates
> the original, and every dimension below is approximate with it.*

Below 55% the figures §6.1 tests against are indicative only and the proof says
so. Refusing the PNG outright would have been easier and less useful — most
customers only have a PNG — but silently treating a trace as a measurement
would put a number on a proof that nothing supports.

## Running it

See **[RUNNING.md](RUNNING.md)** for the verified sequence. The short version:

```bash
npm install && npx playwright install chromium
```

```bash
docker compose up -d && cp .env.example .env && npm run migration:run
```

```bash
npm run build:web && npm run start:dev
```

Then http://localhost:3000 for the wizard, `/docs` for Swagger, and
`/api/v1/health` — which must report 56/56 rules or the build is not
trustworthy.

```bash
npm run cli -- examples/heaven-crepes.json --trace
```

The CLI prints the spec block and disclosures without touching the database;
`--persist` stores the proof, `--no-render` skips the three.js capture,
`--deterministic` forces the no-model path.

`LLM_ENABLED=false` is the default and a supported state: all 56 rules run, and
the two judgment points escalate rather than guess.

`AI_RENDER_ENABLED=true` adds the final image-model stage used by the chatbot:
canonical three.js view captures are sent to OpenAI as the authoritative edit
inputs for concurrent day and night photorealism passes. Both captures come from
the same validated scene, so one AI edit can never become another's input. Set
`OPENAI_API_KEY`; this incurs
one image call per generated scene panel. The resulting scenes are placed in a
deterministic 1536 x 951 HTML board and captured by Chromium; specifications,
dimensions, labels and construction details are never image-generated.

### API

| | |
|---|---|
| `POST /api/v1/proofs` | Run all six gates. `?async=true` queues it and returns an id to poll. |
| `POST /api/v1/proofs/preview` | Rules only — no render, no persistence, no model. |
| `GET /api/v1/proofs/:id/trace` | The full rule trace. This is what §9.4 is generated from. |
| `POST /api/v1/proofs/:id/revisions` | Patch the form, re-run every gate, as a new proof. |
| `GET /api/v1/proofs/by-rule/:ruleId` | Every proof a rule fired on — the post-mortem query. |
| `GET /api/v1/knowledge/gates` | Gate order, flagged KB-stated vs reconstructed. |
| `GET /api/v1/knowledge/thresholds?unverified=true` | The five `[DER]` values awaiting a fabricator. |
| `POST /api/v1/knowledge/thresholds/:key` | Correct one. Returns the proofs that used the old value. |
| `GET /api/v1/knowledge/vendor?q=` | Appendix A/B retrieval (pgvector, full-text fallback). |
| `GET /api/v1/proofs/:id/sheet` | The printable proof sheet. |
| `GET /api/v1/proofs/:id/board` | The composed 1536 x 951 presentation board PNG. |
| `POST /api/v1/artwork/import` | SVG, PNG or JPEG → measured geometry, with provenance. |
| `POST /api/v1/artwork/place` | Size the mark against a calibrated photo. |
| `GET /api/v1/knowledge/options` | The form values §1.2 and §7.1 accept. |
| `GET /api/v1/health` | Rule coverage — 56/56 or the check fails. |

## The §3 worked example

`examples/heaven-crepes.json` is the KB's own case — *"HEAVEN CREPES AND
WAFFLES"*, one sign, three constructions:

| Element | Role | Construction | Fired by |
|---|---|---|---|
| wing mark | `CL-E-04` | `CL-C-03` logo box | CL-R-54 |
| HEAVEN | `CL-E-01` | `CL-C-01` channel letters, front lit | CL-R-50 |
| CREPES AND WAFFLES | `CL-E-03` | `CL-C-02` pill box, copy reversed out | ⚠ CL-R-51 |

The tagline is 4″ against an 8″ minimum, so CL-R-51 substitutes a pill box and
CL-R-47 puts it on the proof as a critical substitution. §8.2's worked case —
the customer asking for that tagline as channel letters anyway — is
`test/precedence.spec.ts`: buildability is level 1 and the customer instruction
is level 3, so level 1 wins and the callout explains why.

## Layout

```
src/kb/         The 56 rules, the geometry, the render contract, the output
                contract. Framework-free — imports nothing from src/modules,
                and test/architecture.spec.ts fails the build if it ever does.
src/modules/    NestJS: database (TypeORM + pgvector), knowledge, artwork, llm,
                engine, render, graph (LangGraph), proofs, queues, health.
src/modules/    …plus designs (the wizard's own layer), uploads, storage and
                wall-presets. Designs never writes a spec — it builds a job and
                asks Proofs to run the gates.
web/            The app: designs list, three-step wizard, review page.
                Vite + React + React Router, built into public/.
docs/           ARCHITECTURE.md, GATES.md, KB-BINDING.md
```

`src/kb/` is a pure function over plain data; Nest supplies the ports —
thresholds from Postgres, judgment from a model, pixels from a browser — and
calls in. `docs/ARCHITECTURE.md` explains why the arrow points that way, and
which three tables use pgvector (none of them holds a rule).

## What pgvector is and is not used for

Two tables: `cl_vendor_reference` (Appendix A/B — vendor minimums, published
lines, LED spacing) and `cl_design_reference` (past proofs, advisory under
§9.5). Both are large, open-ended, queried by paraphrase, and safe to miss.

The rules are none of those things and are not stored there. A retrieval miss on
a chunked rule means the rule silently did not run, and nothing would surface
that; the health check asserts 56/56 coverage instead. Thresholds use neither —
they are exact lookups by key, and the service refuses to boot if one is
missing.

## Read before deploying

- **`docs/GATES.md`.** The KB names Gate 2 and Gate 4 and never defines the
  rest. The order here is reconstructed and needs the KB owner's confirmation —
  along with three other ambiguities the implementation surfaced.
- **Colour conversion is a port with no fan deck loaded** (§4.7, CL-R-38/39).
  It names the system and marks the value indicative rather than inventing a
  colour number.
- **Five `[DER]` values are not vendor-confirmed.** They are database rows, and
  every proof footnotes the ones it read.
