# Gates

KB v2.2 says: *"Rule IDs unchanged; each rule now carries a **gate** so
execution order no longer depends on ID order."*

It then names exactly two of them:

- **Gate 2** — §6.0 Composition, *"runs in Gate 2, before everything else"*
- **Gate 4** — §6.1 through §6.7, on every section heading

Gates 1, 3, 5 and 6 are never listed. There is no table of Gate 1…N anywhere in
the document. This matters more than a missing table normally would: the gate
order is the component that makes the whole rule engine deterministic, so it
cannot be left implicit.

**The order below is reconstructed, not quoted. Confirm it with the KB owner
before this goes to production.** It lives in one file — `src/kb/engine/gates.ts` —
so confirming it is a one-line change, not a refactor.

## The order

| Gate | Name | Owns | Stated by the KB? |
|---|---|---|---|
| 1 | Intake & normalisation | §1.2 form → taxonomy, §7.1 form → mount, free-text resolution, measurement | reconstructed |
| 2 | Composition | §6.0 CL-R-48…56, §3.2 grouping, §3.1 roles, §3.5 tree, §3.6 box sizing | **stated** |
| 3 | Defaults | §8.1 CL-D-01…29 | reconstructed |
| 4 | Validation | §6.1–§6.7 CL-R-01…47 | **stated** |
| 5 | Render contract | §9.1 views, §9.2 visual truth | reconstructed |
| 6 | Output | §9.3 spec block, §9.4 disclosures | reconstructed |

## Why each reconstructed gate sits where it does

**Gate 1 before Gate 2.** Every §6.0 rule reads `spec.type`. §1.2 maps a form
value to a `CL-T-##`, and the `Custom` branch may need free-text resolution or
an escalation. Nothing can run before that resolves.

**Gate 3 between Gate 2 and Gate 4.** Two constraints pin it:

- It cannot precede Gate 2. CL-D-25/26/27 are *per-element* defaults (tagline
  construction, box copy treatment, box depth) and there are no elements until
  CL-R-48 has grouped the artwork.
- It cannot follow Gate 4. §6.3 CL-R-19 tests whether the return depth is an
  on-request value, §6.2 CL-R-09 tests the face material — both need a
  populated field to test, and §8.1 is what populates them.

**Gate 5 after Gate 4.** §9.2 describes the finished sign. Building the contract
before validation would describe a sign that no longer exists after CL-R-24
substitutes the mount or CL-R-51 substitutes a construction.

**Gate 6 last.** §9.4 is generated from the trace that Gates 1–5 produce.

## Overlap between Gate 3 and Gate 4

Four §8.1 defaults are also owned by a §6 rule:

| Default | Gate-4 rule |
|---|---|
| CL-D-01 return depth | CL-R-19 |
| CL-D-15 LED colour | CL-R-36 |
| CL-D-10 / CL-D-11 colours | CL-R-28 |
| CL-D-07 face material | CL-R-09 / CL-R-10 |

Gate 3 seeds them and the Gate-4 rule re-asserts. The precedence resolver makes
the second write a no-op rather than a conflict, and only Gate 3 emits a
`DefaultTrace`, so §9.4 reports each defaulted field exactly once.

## Revalidation

§6.1 CL-R-01/02/03 end with *"Revalidate."* An Offset Path changes the bounding
box, which can trip §6.2 face-size rules, which can change the face material.
Gate 4 therefore re-runs until no rule mutates the spec, bounded at
`MAX_VALIDATION_PASSES = 3`. Hitting the bound emits a WARN — a rule set that
will not settle is a bug, and looping silently would hide it.

The fixpoint is measured on **spec mutations**, not on trace entries: WARN and
NOTE rules re-report the same observation every pass by design, so counting
trace entries would never converge.

## Engine-internal IDs

Gates 1 and 5 emit trace entries under IDs that are **not** KB rule IDs. They
are prefixed differently on purpose, so an audit can tell a KB rule from a
pipeline step:

| ID | What it is |
|---|---|
| `CL-IN-01` | §1.2 form type → taxonomy, incl. the Custom resolver |
| `CL-IN-02` | §7.1 form mount → CL-MT-##, incl. the Other resolver |
| `CL-IN-04` | artwork measurement and overall extent |
| `CL-IN-05` | §8.2 level-3 claims on customer-supplied fields |
| `CL-RC-01` | §9.1 view selection |
| `CL-RC-02` | §9.2 contract construction and verification |
| `CL-RC-03` | §9.2 fit and obstruction clearance |
| `CL-RC-04` | Layer 0 scope check |
| `CL-ENG-01` | engine diagnostic (fixpoint not reached) |

## Open questions for the KB owner

1. **Is this gate order right?** Especially Gate 3's position.
2. **§3.5 stroke test — current or achievable?** §3.5 branches on
   `S ≥ min_stroke`. Read literally against the *measured* stroke, any thin
   primary is re-assigned to a pill box in Gate 2, and §6.1 CL-R-01/02/03 —
   the most-used autofix in the source material — could never fire on anything.
   §3.5's own note points the other way: *"Do not thicken a tagline. The Offset
   Path autofixes in §6.1 apply to CL-E-01 and CL-E-02 only … the correct
   answer is to change the construction, not the letterform"* — which says that
   for primary and secondary copy the correct answer **is** to change the
   letterform. This build therefore tests the stroke the letterform can *reach*
   by Offset Path for CL-E-01/CL-E-02, and the measured stroke for every other
   role. See `src/kb/geometry/decisionTree.ts`.
3. **CL-E-03 vs CL-E-06 below 25%.** §3.1 gives the tagline band as
   *"typically 25–40%"*, but the KB's own worked example is a 4″ tagline under
   24″ primary — 17%. This build recognises CL-E-06 by *content* (phone, web,
   hours, suite) rather than by ratio, so the worked example comes out as
   CL-E-03. Confirm.
4. **§6.9 STANDING tier.** The tier enum is VISUAL / SPEC / STANDING, but no §6
   rule carries STANDING — §6.9 is boilerplate that is "never evaluated". This
   build treats the standing notes as strings, not rules. Confirm nothing was
   meant to evaluate them.
