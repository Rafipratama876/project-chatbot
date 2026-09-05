# Running it

Verified from a clean slate on 1 Sep 2026 — every command below was run in this
order, from a shell with no environment set, and produced the output shown.

## What you need

- **Node 20+**
- **Docker** — Postgres with pgvector, and Redis
- **Chromium for Playwright** — the renderer needs a real GL context

No OpenAI key needed to start. The four LLM nodes are off by default and the
engine runs all 56 rules either way; the two judgment points escalate rather
than guess.

## First run

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
cp .env.example .env
```

**Before starting the containers, not after.** Compose reads `DB_NAME`,
`DB_USER`, `DB_PORT` and `REDIS_PORT` from this file, and Postgres only creates
the database the first time its data directory is initialised — see
[Troubleshooting](#database-does-not-exist).

```bash
docker compose up -d
```

Postgres binds **5433** and Redis **6380**, not the usual ports — a stock 5432
is normally already taken by something else on a dev machine.

```bash
npm run migration:run
```

Creates the tables, the pgvector columns and the HNSW indexes, and seeds the 34
thresholds. Expect: `applied: InitialSchema…, ProofSheet…, Designs…`

`Designs` adds `cl_design`, `cl_design_message` and `cl_wall_preset`, and gives
`cl_proof` a `design_id` and a `version`. A design is the editable intake; a
proof stays one immutable run of the gates, so a change makes a new version
rather than editing a spec the gates have already signed off.

```bash
npm run build:web
```

Builds the app into `public/`, which the API serves. Skip it and the API still
runs; you just get no UI at `/`.

## Start it

```bash
npm run start:dev
```

| | |
|---|---|
| http://localhost:3000 | the app — My Designs, the wizard, the review page |
| http://localhost:3000/docs | Swagger |
| http://localhost:3000/api/v1/health | should report `rules 56/56` |

The app is a single-page app with real routes (`/new`, `/designs/:id`), so a
refresh or a pasted link works; unmatched `/api` paths still return a JSON 404
rather than the page.

Uploaded logos, wall photographs, the seeded preset walls and exported PDFs all
live under `STORAGE_DIR` (default `./storage`) and are served read-only at
`/static`. That directory is the whole of what a deployment has to keep between
restarts. The four preset walls are drawn on first boot — deleting the rows
redraws them, deleting the files does not.

`PORT=3100 npm run start:dev` if something else already holds 3000.

If health reports anything other than 56/56, a KB rule is missing from the
registry and no proof from that build is trustworthy.

## Without the UI

Run a job straight through the engine and print §9.3 and §9.4:

```bash
npm run cli -- examples/fedex-facade.json
```

`--no-render` skips the three.js capture (fast, no Chromium).
`--trace` prints every rule that fired, with its gate, severity and before/after.
`--persist` stores the proof instead of only printing it.
`--deterministic` forces the no-model path.

## Tests

```bash
npm test
```

122 tests, no database and no browser required — the rule engine is a pure
function, which is the point of the `src/kb` boundary.

```bash
npm run typecheck
```

## Turning the LLM nodes on

Edit `.env`:

```
LLM_ENABLED=true
OPENAI_API_KEY=sk-…
```

Same key as image enhancement below — one OpenAI credential for the whole app.
This wires four things and nothing else: §1.2 `Custom` and §7.1 `Other`
resolution, the CL-R-54 logo-mark judgment, the §9.4 callout wording, and the
revision loop. The renderer never calls a model.

`LLM_MODEL` defaults to `gpt-5.1`.

## Vector search

`EMBEDDING_PROVIDER=none` is the default and is a supported configuration, not a
broken one: Appendix A/B lookup falls back to Postgres full-text. Embeddings
use the same OpenAI credential as everything else:

```
EMBEDDING_PROVIDER=openai
```

Changing `EMBEDDING_DIMENSIONS` means re-running the migration — the vector
columns are declared at that width.

## Working on the wizard

```bash
cd web && npm run dev
```

Vite on 5173 proxying `/api` to 3000. Note that its HMR websocket dropped
repeatedly during testing and each reconnect resets the wizard's state; if that
happens, `npm run build:web` and use the copy the API serves.

## Troubleshooting

### `database "…" does not exist`

Postgres runs `initdb` — and creates `POSTGRES_DB` — **only when its data
directory is empty**. Once the volume exists, changing `DB_NAME` does nothing:
the container starts, reports healthy, and serves a database under the old name.
Nothing warns you, because from Postgres's point of view nothing is wrong.

Recreate the volume, which deletes the data:

```bash
docker compose down -v && docker compose up -d && npm run migration:run
```

Or add the database to the volume you already have, which keeps it:

```bash
docker compose exec postgres createdb -U postgres "$(grep '^DB_NAME=' .env | cut -d= -f2)"
```

### `relation "cl_proof" does not exist`

The database is there but empty — Postgres creates the database on first boot,
nothing creates the tables.

```bash
npm run migration:run
```

The app now refuses to start in this state rather than accepting jobs it cannot
store, so you should see it named at boot rather than on your first proof. It
happens after `docker compose down -v`, or the first time a new `DB_NAME` is
used.

### `ECONNREFUSED`

The app now refuses to start with the host, the port and the fix, rather than
retrying ten times against an unnamed address. Almost always:

```bash
docker compose up -d
```

If they are already up, `docker compose ps` shows what is actually bound.
Compose reads `DB_PORT` and `REDIS_PORT` from the same `.env` the app does, so
changing one moves both and they cannot drift apart.

**A note on 5432.** The default is 5433 because 5432 is usually already taken —
on this machine `gensigns-local-postgres` holds it. Setting `DB_PORT=5432` works
while that container is stopped, and breaks the moment it starts: compose then
cannot bind the port, and the app connects to the *other* project's Postgres
instead. It fails at boot rather than silently, because `ThresholdService`
checks that every key the rules read is present and throws if it is not — but
the error will be about missing thresholds, not about the port. If you see that,
check which Postgres you are on.

### Health reports fewer than 56 rules

A KB rule is missing from the registry. `npm test` names it — `coverage.spec.ts`
asserts every ID. Do not send proofs from that build.

### A PNG traces badly

Trace confidence is driven mostly by resolution. Under ~200 px across the mark,
a 1.5″ stroke is a handful of pixels and quantisation noise is the same size as
the feature being measured — the proof still generates and still says so, but
the numbers are indicative.

Export the logo on its own, as large as you have it, ideally with a transparent
background. A JPEG of a logo on white also works: the border colour is detected
and dropped. A photograph of a sign does not — it quantises into many colours,
none of which is a fabricable fill, and the trace says that too.

### The wizard resets itself while you work

You are on the Vite dev server and its HMR websocket is dropping. Each
reconnect remounts the app. Use the built copy instead:

```bash
npm run build:web
```

## Stopping

```bash
docker compose down
```

Add `-v` to drop the database volume as well.

## Production

```bash
npm run build && npm run start:prod
```
