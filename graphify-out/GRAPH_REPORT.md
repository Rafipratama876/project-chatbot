# Graph Report - project-chatbot  (2026-09-01)

## Corpus Check
- 193 files · ~140,759 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1654 nodes · 3651 edges · 91 communities (82 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2cd79ae5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]

## God Nodes (most connected - your core abstractions)
1. `SignSpec` - 37 edges
2. `ProofEntity` - 32 edges
3. `JobInput` - 31 edges
4. `TraceLog` - 23 edges
5. `DesignsService` - 23 edges
6. `formatInches()` - 22 edges
7. `AnthropicClient` - 22 edges
8. `ProofsService` - 22 edges
9. `compilerOptions` - 22 edges
10. `Contour` - 20 edges

## Surprising Connections (you probably didn't know these)
- `StepWall()` --calls--> `rectOnWall()`  [EXTRACTED]
  web/src/components/StepWall.tsx → src/kb/geometry/homography.ts
- `BlockOptions` --references--> `ArtworkItem`  [EXTRACTED]
  test/fixtures/blockGlyphs.ts → src/kb/domain/spec.ts
- `build()` --calls--> `runEngine()`  [EXTRACTED]
  test/modules/proof.graph.spec.ts → src/kb/engine/engine.ts
- `placementErrorPx()` --calls--> `recoverCamera()`  [EXTRACTED]
  test/facade-consistency.spec.ts → src/kb/geometry/cameraFromPlane.ts
- `WallFaceMarker()` --calls--> `impliedHeightInches()`  [EXTRACTED]
  web/src/components/WallFaceMarker.tsx → src/kb/geometry/homography.ts

## Import Cycles
- None detected.

## Communities (91 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (60): ArtworkBody, ArtworkController, ArtworkService, ArtworkSource, ImportedArtwork, PlacedArtwork, readSource(), PlacementSchema (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (44): ALLOWED_NON_PARTS, CalloutLintResult, EXTRA_ALIASES, HARDWARE_PARTS, PartId, PARTS, VOCAB, isContourBacker() (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (25): ArtworkModule, authorize(), CompatController, envelope(), multipartFields(), parseJson(), CompatModule, DatabaseModule (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (14): borderColour(), MatteResult, removeFlatBackground(), StorageModule, EXTENSIONS, ImageSize, measureWebp(), StorageService (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (29): Ap(), bo(), bt(), fh(), ft(), gc, gh, Hf (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (18): CUSTOM_RESOLVABLE, FORM_BACKER_MAP, resolveFormValue(), typeFromAlias(), defaultThresholds(), claimCustomerElementFields(), EngineOptions, runEngine() (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (12): GATE_ORDER, GATES, CL_R_19, CL_R_20, CL_R_21, CL_R_22, CL_R_23, GATE4_DEPTH_RULES (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (33): x, y, artwork, x, y, corners, heightInches, widthInches (+25 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (33): dependencies, @anthropic-ai/sdk, bullmq, class-transformer, class-validator, clipper-lib, esbuild, @fastify/compress (+25 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (21): Contour, boxUndersized(), COUNTER_LETTERS, CounterInspection, countersIn(), hasCounterLetter(), inspectCounters(), ProtoElement (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (15): lintCallout(), DISCLAIMER, JobInputSchema, CreateProofDto, GATE_NAME, AUTHORITY_LABEL, placement, buildDisclosures() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (30): x, y, artwork, x, y, form, backerPanelOption, businessName (+22 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (30): x, y, artwork, x, y, form, backerPanelOption, businessName (+22 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (24): BACKER_MATERIALS, ColourConversion, FACE, FACE_MATERIALS, FILM_SYSTEMS, findTrimCap(), formatConversion(), GEMTRIM (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (29): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+21 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (15): WolfStudioForm, WolfStudioFormSchema, EngineService, ProofGraphState, ProofState, CalloutWriterService, PATCHABLE, PatchSchema (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (12): BACKER_SHAPES, LED_COLOURS, FORM_MOUNT_MAP, FORM_TYPE_MAP, KB_STATED_GATES, VendorReferenceEntity, EmbeddingService, KnowledgeController (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (4): ThresholdStore, PrecedenceResolver, RuleContext, TraceLog

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (12): ColourConverter, RunOptions, FreeTextRequest, FreeTextResolution, AnthropicClient, CalloutsSchema, WriteCalloutsOptions, FreeTextResolverService (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (5): Threshold, EngineResult, HealthController, ThresholdService, AssembleOptions

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (7): dataSource, ENTITIES, MIGRATIONS, DesignReferenceEntity, ThresholdReadEntity, Designs1735862400000, SignBoxHeight1735880000000

### Community 21 - "Community 21"
Cohesion: 0.05
Nodes (30): api, ChatMessage, Design, FacadeRect, KnowledgeOptions, readError(), Render, RenderStatus (+22 more)

### Community 22 - "Community 22"
Cohesion: 0.20
Nodes (15): UpdateWallPositionDto, additionalInformation(), areaSqFt(), buildForm(), buildPlacement(), DesignIncompleteError, DesignLike, facadeCorrection() (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (14): assessTrace(), borderColour(), decimate(), measureEdgeBand(), near(), nearestIndex(), perpendicularDistance(), polygonArea() (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.20
Nodes (14): arc(), cubic(), Element, ellipseContours(), fillOf(), importSvg(), num(), parsePathData() (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (18): depthOf(), returnColourOf(), formatInches(), formatRange(), block(), esc(), renderProofSheet(), SheetPanel (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (9): RasterService, round4(), TracedArtwork, ArtworkItem, BlockOptions, OutlineOptions, SvgImportResult, RasterImage (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (21): OFFSET_ELIGIBLE_ROLES, decideConstruction(), minHeightFor(), minStrokeFor(), APPLY_DEFAULTS, CL_R_43, CL_R_44, CL_R_45 (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (10): SignSpec, VISIBILITY_CHART, visibilityFor(), VisibilityRow, DisclosureBundle, guidanceFor(), Proof, ProofPanel (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (18): A PNG traces badly, `database "…" does not exist`, `ECONNREFUSED`, First run, Health reports fewer than 56 rules, Production, `relation "cl_proof" does not exist`, Running it (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, react-router-dom, devDependencies, @types/react, @types/react-dom, typescript (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.19
Nodes (18): Dc(), _e(), fc(), Ip(), Ir(), jc(), jp, mp() (+10 more)

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (5): DesignsService, UpdateLogoDto, UpdateSpecDto, DesignEntity, DesignMessageEntity

### Community 33 - "Community 33"
Cohesion: 0.20
Nodes (6): measureComponent(), absArea(), area(), pointInContours(), raySegmentHit(), segments()

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (5): MemoryThresholdStore, Provenance, THRESHOLD_SEED, ThresholdEntity, EMBEDDING_DIMENSIONS

### Community 35 - "Community 35"
Cohesion: 0.24
Nodes (11): isDeviceColour(), faceColourOf(), faceMaterialOf(), resolved(), sqFt(), assertNoDeviceColours(), faceLine(), fmt() (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.19
Nodes (10): Escalation, getPath(), parsePath(), PathSegment, setPath(), snapshot(), NoteOptions, RuleRunContext (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.17
Nodes (14): bboxOf(), sizeBox(), ARTICLES, assignRoles(), groupIntoElements(), joinWithSpaces(), toProto(), CL_BK_01 (+6 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (20): Point, scalePlacement(), HANDLE_LABELS, Props, WallFaceMarker(), applyHomography(), gaussianSolve(), HomographyError (+12 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (18): RACEWAY_STANDARD, WIREWAY_STANDARD, Authority, applyOne(), asInches(), DefaultDef, DEFAULTS, format() (+10 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (23): isBoxConstruction(), SignElement, COMMON_TYPES, Construction, COPY_TREATMENT_FACTS, CopyTreatment, ELEMENT_ROLES, ElementRole (+15 more)

### Community 41 - "Community 41"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleResolution (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.05
Nodes (43): CompatProject, facadeFrom(), FieldInput, fieldInputs(), finite(), formFrom(), inches(), isRecord() (+35 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (16): ah(), bf(), c(), ch(), cp(), Kf(), nh(), Qf() (+8 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (15): PART_IDS, HANDOFF_RULES, STANDING_NOTES, A, Compat, compatFor(), Row, TYPE_MOUNT_MATRIX (+7 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (16): devDependencies, @nestjs/cli, @nestjs/schematics, @nestjs/testing, @swc/core, @swc-node/register, tsx, @types/node (+8 more)

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (7): anyLit(), CL_R_33, CL_R_34, CL_R_35, CL_R_36, CL_R_37, GATE4_ILLUMINATION_RULES

### Community 48 - "Community 48"
Cohesion: 0.43
Nodes (6): measureStroke(), flattenPath(), itemsFromText(), orientContours(), round4(), bounds()

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (20): BackerMaterial, BackerShape, FaceMaterial, FaceMaterialFacts, FilmSystem, GemTrimColour, PaintSystem, TrimCapMatch (+12 more)

### Community 52 - "Community 52"
Cohesion: 0.23
Nodes (5): DesignStatus, WallPresetEntity, WallPresetsController, WallPresetsModule, WallPresetsService

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (13): artwork, form, backerPanelColour, backerPanelOption, businessName, channelLetterType, installationMethod, mountingSurfaceColour (+5 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (10): CL_R_09, CL_R_10, CL_R_11, CL_R_12, CL_R_13, CL_R_14, CL_R_15, CL_R_16 (+2 more)

### Community 55 - "Community 55"
Cohesion: 0.21
Nodes (7): backdrop(), Canvas, clamp(), fasciaShadow(), PRESETS, PresetSpec, Rgb

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (13): DesignsController, CreateDesignSchema, DesignView, parseBody(), PointSchema, RenderView, ReviseSchema, STATUS (+5 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (11): API, Channel Letter Proof Engine, Layout, Read before deploying, Running it, Shape of the thing, The §3 worked example, The app (+3 more)

### Community 59 - "Community 59"
Cohesion: 0.18
Nodes (11): 3.1 Element roles, 3.2 Grouping — what counts as one element, 3.3 Constructions, 3.4 Copy treatment inside a box — this decides the day and night read, 3.5 The decision tree — deterministic, runs per element, 3.6 Pill box and logo box sizing `[DER]`, 3.7 Composition patterns worth proposing, 3.8 What composition changes downstream (+3 more)

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (11): 4.1 `CL-P-01` Face, 4.2 `CL-P-02` Return — depth is type-dependent, 4.3 `CL-P-03` Trim Cap, 4.4 `CL-P-05` / `CL-P-25` Back, 4.5 `CL-P-20` Backer panel — orthogonal to mount method, 4.6 `CL-P-18` Raceway / `CL-P-19` Wireway, 4.7 Colour systems — what the spec block may say, 4.8 `CL-P-09` Illumination (+3 more)

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (11): scripts, build, build:web, cli, migration:run, start, start:dev, start:prod (+3 more)

### Community 62 - "Community 62"
Cohesion: 0.22
Nodes (10): aa(), Af(), Cc(), $f(), Gf(), Gl(), tn, Vf() (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (10): Architecture, Embeddings, LangGraph, Module graph, pgvector — and what is deliberately not in it, Post-render AI, Project JSON is the source of truth, Running with the LLM off (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (9): 10. LETTER VISIBILITY CHART `[SP]`, 11. OPEN QUESTIONS, 8.1 Defaults — apply to every empty field, and log that you did, 8.2 Precedence — highest wins, CHANNEL LETTERS — WOLF STUDIO KNOWLEDGE BASE v2.2, LAYER 0 — AGENT SCOPE, LAYER 2 — ANATOMY (part vocabulary), LAYER 5 — PRODUCTION METHODS (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.20
Nodes (10): 6.0 Composition — runs in Gate 2, before everything else, 6.1 Stroke and height — Gate 4, **`CL-C-01` elements only**, 6.2 Face material and size — Gate 4, 6.3 Depth — Gate 4, 6.4 Mounting — Gate 4, 6.5 Illumination and control — Gate 4, 6.6 Colour — Gate 4, 6.7 Artwork — Gate 4 (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.31
Nodes (9): Bp(), ep(), Lr(), Nc(), np(), ra(), tp(), Up() (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.22
Nodes (8): artwork, form, businessName, channelLetterType, faceColour, installationMethod, mountingSurfaceColour, jobId

### Community 69 - "Community 69"
Cohesion: 0.22
Nodes (9): APPENDIX B — STAGE 2 TECHNICAL REFERENCE, B.1 LED module spacing by return depth `[EXT]`, B.2 Power supply sizing `[SP]`, B.3 Aluminium coil `[EXT]`, B.4 Raceway extrusions `[EXT]` Eastern Metal, B.5 Trim cap and film fabrication notes `[EXT]`, B.6 Code detail `[EXT]`, B.7 Esco minimum fabrication dimensions (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (8): dp(), Ec(), fp(), gp(), Lp(), na(), pp(), xp()

### Community 71 - "Community 71"
Cohesion: 0.25
Nodes (7): Engine-internal IDs, Gates, Open questions for the KB owner, Overlap between Gate 3 and Gate 4, Revalidation, The order, Why each reconstructed gate sits where it does

### Community 72 - "Community 72"
Cohesion: 0.25
Nodes (7): artwork, form, businessName, channelLetterType, installationMethod, mountingSurfaceColour, jobId

### Community 73 - "Community 73"
Cohesion: 0.25
Nodes (7): artwork, form, businessName, channelLetterType, installationMethod, returnColour, jobId

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (7): description, engines, node, name, private, type, version

### Community 76 - "Community 76"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, assets, deleteOutDir, $schema, sourceRoot

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (6): en(), hp(), kp(), mc(), Tc(), vp()

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (6): 9.1 Required views, 9.2 What must be visually true — **per construction**, 9.3 Required spec block — **one per element**, 9.4 Required disclosures, 9.5 Design guidance (soft, after every hard rule passes) `[SP]`, LAYER 9 — OUTPUT CONTRACT

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (6): A.1 Where the house numbers came from, A.2 Vendor minimums, A.3 Gemini published lines, A.4 Steel Art published lines, APPENDIX A — STAGE 2 VENDOR REFERENCE, Parked. The Stage 1 bot does not read this.

### Community 83 - "Community 83"
Cohesion: 0.40
Nodes (4): KB → code, Things that still need wiring before customer use, Where a model is actually used, Why the KB is not in a vector store

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (6): CONSTRUCTION_FACTS, MOUNTS, ROLES, DesignReferenceService, SimilarSign, summarise()

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (4): 1.1 Types, 1.2 Wolf Studio form → taxonomy mapping, 1.3 Sub-type modifiers, LAYER 1 — TAXONOMY

### Community 86 - "Community 86"
Cohesion: 0.50
Nodes (4): 7.1 Mount methods — matched to the Wolf Studio form, 7.2 Type × Mount compatibility, 7.3 Installation sequence `[SP]`, LAYER 7 — MOUNTING

### Community 88 - "Community 88"
Cohesion: 0.50
Nodes (3): Clipper, ClipperOffset, IntPoint

## Knowledge Gaps
- **519 isolated node(s):** `jobId`, `businessName`, `channelLetterType`, `installationMethod`, `returnDepth` (+514 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StorageService` connect `Community 3` to `Community 43`, `Community 52`, `Community 22`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `JobInput` connect `Community 43` to `Community 32`, `Community 1`, `Community 5`, `Community 10`, `Community 15`, `Community 18`, `Community 51`, `Community 19`, `Community 22`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `Canvas` connect `Community 55` to `Community 52`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `jobId`, `businessName`, `channelLetterType` to the rest of the system?**
  _519 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08700564971751412 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07743496672716274 - nodes in this community are weakly interconnected._