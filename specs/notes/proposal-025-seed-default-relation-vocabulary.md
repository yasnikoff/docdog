---
id: PROPOSAL-025
title: "Seed a curated default relation vocabulary at init — concept files on the template rail"
collection: proposals
status: shipped
date: 2026-07-11
description: "docdog init emits a small curated set of relation concept records into .docdog/concepts/ (core 8 for every template, +3 process types for workflows), wires the concepts collection and scan path into all templates, and leaves the registry advisory. Restores DP-002's shipped-defaults clause in v3 disk-canonical form."
relationships:
  - discussed_in: DISC-023
    context: the origin conversation — corpus usage evidence and the decision to seed small rather than ship all 17
  - implements: DP-002
    context: its shipped-defaults clause ("pre-seeded at docdog init time"), translated from v2 Arango meta rows to v3 concept files
  - references: DP-001
    context: pre-blessed Tier 2 by its deliberate-exceptions clause; files on disk are the strongest form of "point at the default on disk"
  - references: OQ-42
    context: the hybrid shipped+user commitment whose shipped half this restores in v3
  - references: PROPOSAL-003
    context: the vocabulary and inverse-label tables the seed set descends from
  - supersedes: PROPOSAL-006
    context: the v2 seeding path (meta-seed into dd_relation_meta) whose death at v3 step 6 created the gap — this proposal replaces its relations half as the active commitment
  - references: PROPOSAL-015
    context: the template rail this rides — template name resolves the shipped concept set, config holds only user extensions
  - references: PROPOSAL-016
    context: source of the workflows-tier process types (follows_workflow, reconciles) seeded only by that template
  - references: DD-070
    context: v3 disk-canonical constraint — seeds are files, the SQLite cache stays disposable and rebuildable
  - references: DD-035
    context: .docdog/concepts/ placement per path-based namespacing, so shipped vocabulary cannot collide with project vocabulary
  - references: FRICTION-012
    context: the failure class seeding removes — shipped content referencing vocabulary the corpus never registered
  - references: DD-034
    context: seed bodies mirror their frontmatter as prose so a vanilla agent reading the file gets the full semantics — artifact resilience within `.docdog/`
  - references: FRICTION-010
    context: the collision class the `.docdog/concepts/` placement avoids — a project's own `specs/concepts/` stays free for its domain vocabulary
  - references: DP-003
    context: "DP walk-through verdict — the escape hatch is intact and simpler than v2's: the files are the interface, and `docdog_create`/`docdog_update` cover tool-mediated authoring"
  - references: PROPOSAL-026
    context: the deliberate follow-up that took this proposal's carved-out scope — seeding collection concept records, done the same day, and moving `collection-concepts.md` onto the collections rail
---

# PROPOSAL-025: Seed a default relation vocabulary at init

## Motivation

A fresh v3 `docdog init` project has an **empty relation registry**.
`init` creates `.docdog/skills|patches|scripts/` but no `concepts/`;
no template ships the `concepts` collection or the
`.docdog/concepts/` scan path. `RelationsRegistry` loads from indexed
`concept_kind: relation` records (src/storage/relations.ts), so on a
fresh project it has zero entries. Three costs:

1. **Warning noise.** Every relationship an agent authors resolves
   `known: false` and warns, from day one, forever.
2. **Degraded traversal display.** INBOUND edges lose inverse labels
   — `supersedes` renders as "supersedes" from the target side
   instead of "revised by" (PROPOSAL-003 §8.1's `effective_type`
   falls through to the raw type).
3. **Dialect drift — the real cost.** An agent with no discoverable
   vocabulary coins its own (`relates_to`, `see_also`, `linked`),
   differently per project. Cross-project skills, workflows, and
   habits stop transferring. DP-002's argument applies one step
   earlier than it was written: worse than inferring meaning from a
   token is inventing the token.

This was a ratified commitment that v3 lost, not a new idea. DP-002
commits to pre-seeding at init (Tier 2 per DP-001); OQ-42 ratified
the hybrid shipped+user model; DP-001's deliberate-exceptions clause
names shipped relation vocabulary as allowed. v2 implemented it via
PROPOSAL-006's meta-seed into `dd_relation_meta`; that path died at
v3 step 6 (DD-070) and never returned as file emission. Even this
repo's 17 concept records were hand-authored, with `concepts`
registered as a *user* collection.

**Evidence for seeding small** (DISC-023, measured 2026-07-11,
~1,040 typed frontmatter edges in this repo): `references` alone is
89%; six types cover >98%; five of the 17 registered types have zero
uses. And drift happens even with a registry — one `blocked_by` edge
authored with an inverse label as its type. The default should be
the proven core, not the accreted whole.

## Specification

### 1. Seed sets

**Core — seeded by every template** (8 relation records + 1
collection record). Semantics, inverse labels, and symmetry flags
descend verbatim from this repo's live concept records:

| Type | Inverse label | Semantics |
|---|---|---|
| `references` | referenced by | Conceptual cross-reference without causal weight — the default type. |
| `supersedes` | revised by | A replaces B as the active commitment. |
| `sourced_from` | source of | A was derived from or based on B (provenance). |
| `discussed_in` | discusses | A was discussed in B. |
| `implements` | implemented by | A is an implementation of B's requirement or spec. |
| `depends_on` | depended on by | A needs B to be present or resolved first. |
| `constrains` | constrained by | A imposes a boundary on B's behavior or design. |
| `part_of` | contains | A is a component of B's larger whole. |

All eight are `symmetric: false`. The ninth core file is
`collection-concepts.md` — the `concepts` collection's own concept
record, bootstrap-required so the collection the seeds land in
self-describes per DP-002.

**Workflows-template additions** (+3) — process types that pair
with collections only that template ships (`workflows`,
`reconciliations`, `tasks`):

| Type | Inverse label | Semantics |
|---|---|---|
| `follows_workflow` | followed by | A task executes the steps of a workflow document. |
| `reconciles` | reconciled by | A reconciliation record targets an upstream spec that needs update. |
| `blocks` | blocked by | A blocks B from progressing until A is resolved. |

`reconciles` has zero uses in this repo yet is seeded: it is the
defining edge of the `reconciliations` collection — it ships with
the collection, not on usage evidence.

### 2. Not seeded, and why

| Type | Rationale |
|---|---|
| `derived_from`, `extends` | Near-synonyms of `sourced_from`; one provenance type in the default keeps boundaries crisp. Projects that need the finer split add them deliberately. |
| `parent` | Redundant with `part_of` (one structural composition type suffices; `parent`/`child of` vs `part_of`/`contains` say the same thing). |
| `companion` | Zero uses; the only symmetric type — niche enough to be opt-in. |
| `cross_cutting` | Zero uses; v2 routing-category residue. |
| `uses_term` | Zero uses in ~1,040 edges despite this repo shipping a `terms` collection — pairing logic loses to usage evidence (open question §8.1). |

The user path is unchanged and is the answer for all of these: write
a `concept_kind: relation` record under `.docdog/concepts/`, index.

### 3. File shape

One file per type in `templates/concepts/`, copied at init. Same
shape as this repo's records:

```yaml
---
id: CONCEPT-RELATION-SUPERSEDES
title: "Relation: supersedes"
collection: concepts
status: current
concept_kind: relation
name: supersedes
scope: shipped
description: A replaces B as the active commitment.
when_to_use: When writing a new decision or proposal that revises an older one.
inverse_label: revised by
symmetric: false
---
```

`scope: shipped` is the provenance marker (DP-002's field); the
required field is `description`. Seeds carry `when_to_use` — and
`when_not_to_use` where a cut near-synonym exists (e.g.
`sourced_from` notes it covers the `derived_from`/`extends` ground).
Body mirrors frontmatter as prose, per the existing records, so a
vanilla agent reading the file gets the full semantics (DD-034/DD-035
artifact-resilience within `.docdog/`).

### 4. Mechanism — the template rail

Mirrors how skills already ship:

- New `templates/concepts/_common/` (the 9 core files) and
  `templates/concepts/workflows/` (the 3 process types).
- `docdog init` copies them to `.docdog/concepts/` via the existing
  `copyTemplateFiles` — **idempotent** (skip-if-exists: an edited seed
  is never overwritten; a deleted seed reappears only if init is
  explicitly re-run — repair semantics, same as shipped skills; wording
  corrected at build time, the draft overclaimed "never resurrected")
  and **verbatim** (`applyResolveTemplates: false`; no `{{config:*}}`
  in concept records).
- Editing or deleting the file *is* the override. No hardcoded
  fallback registry in code — an invisible default is not Tier 2.

### 5. Collection and scan-path wiring

Seeded files must be indexed to reach the registry, so
(`src/config/templates.ts`):

- Every template's `collections` gains `concepts`.
- Every template gains `.docdog/concepts/` in `defaultScanPaths`
  (`minimal`/`structured`: `["specs/", ".docdog/concepts/"]`;
  `workflows`: appended to its existing four `.docdog/` paths).
- Runtime resolution needs no new code — PROPOSAL-015's
  template-union already makes `concepts` shipped for existing
  configs that name a template.
- If the user passes `--scan` at init, their list wins untouched;
  init still copies the seeds but prints one line noting
  `.docdog/concepts/` is not in `scan_paths` (visible, mechanical,
  no silent config mutation).

Placement per DD-035's path-based namespacing: concept records are
docdog-native, so they live under `.docdog/`, and a project's own
`specs/concepts/` (FRICTION-010's collision class) stays free.

### 6. Registry behavior — unchanged

Advisory, warn-only (`known: false` still records the edge
verbatim). The seed is a shared dialect, not a schema. No change to
`relations-registry.ts`, the indexer, or any MCP tool.

### 7. Existing projects

No auto-refresh (the PROPOSAL-015 template-versioning carve-out,
same rationale). Manual path: re-run `docdog init` (idempotent —
copies missing seeds, touches nothing else) and, because init never
rewrites an existing config, add `.docdog/concepts/` to `scan_paths`
by hand — init prints the exact line when it detects the gap. This
repo needed only one hygiene edit: `concepts` removed from
`vertex_collections` in `.docdog/config.yaml`, since the workflows
template now ships it (PROPOSAL-015: config holds user extensions
only). All seeded types already exist here (grandfathered,
`scope: shipped` already set).

## DP walk-through

- **DP-001** — pre-decided: the deliberate-exceptions clause names
  shipped relation vocabulary Tier 2 ("convenience, not
  concealment"), and templates are the named scaffolding exception.
  v3 files are a *stronger* Tier 2 than v2's DB rows — the default
  is literally a file you can point at, edit, and delete. The v2-era
  follow-up ("routing map hardcoded in source is Tier 3 in
  disguise") is moot: routing died with Arango; the remaining
  registry data (inverse labels, symmetry) ships in the visible
  files. Copy mechanics are Tier 1. No inference anywhere.
- **DP-002** — this proposal *implements* its shipped-defaults
  clause in v3 form. Every seed carries the required `description`
  plus `when_to_use`; `scope: shipped` provenance; meaning lives in
  the graph (indexed, searchable), not in YAML config and not in
  code.
- **DP-003** — the escape hatch is intact and simpler than v2's:
  the files are the interface (edit/delete directly), and
  `docdog_create`/`docdog_update` cover tool-mediated authoring. No
  new CLI surface needed.

## Not in scope

- **Seeding collection concept records for the other shipped
  collections** (`decisions`, `notes`, …). Same DP-002 clause, same
  mechanism, ~3× the authoring surface — deliberate follow-up
  proposal so this one stays reviewable. Only `concepts`' own record
  ships here (bootstrap necessity, §1). *(Done the same day as
  PROPOSAL-026, which also moved `collection-concepts.md` onto its
  collections rail.)*
- **Seed refresh / template versioning** when the shipped set
  evolves — PROPOSAL-015 carved this out for collections; identical
  position here.
- **Traverse type-filter** (OBS-011's future-proposal material) —
  independent, evidence-gated on the orchestrator corpus.
- **Validation changes** — unknown types keep warning, never
  blocking.

## Open questions embedded

1. **`uses_term` for templates that ship `terms`?** Pairing logic
   says yes, usage evidence (0 uses here) says no. Seeding on first
   real usage signal keeps the default honest; revisit via the
   orchestrator dogfood.
2. **Should re-running `init` on a legacy-config project offer to
   append the scan path?** Current stance: print the line, never
   rewrite config. A `--write-config` opt-in could come later if the
   manual step recurs as friction.

## Estimated effort

Small.

- 12 seed files under `templates/concepts/` (~15 lines each,
  content ports from this repo's records)
- `init.ts`: concepts copy step + `--scan` notice (~20 LOC)
- `templates.ts`: `concepts` in three collection lists +
  `defaultScanPaths` updates (~10 LOC)
- Tests (~100 LOC): init seeds per template (minimal vs workflows
  sets); re-init idempotency (edited seed survives); index →
  registry resolves seeded types with correct inverse labels;
  `--scan` override notice; fresh-project end-to-end (init → index →
  zero unknown-type warnings for core vocabulary).

## Status

Shipped, same day as proposed (2026-07-11). Landed in one commit:

- `templates/concepts/_common/` — 9 seed files (core 8 relations +
  `collection-concepts.md`); `templates/concepts/workflows/` — 3
  process types. Content ported from this repo's live records, minus
  repo-specific `examples` ids; `when_not_to_use` boundaries added to
  `references`, `sourced_from`, `part_of`; the collection record
  rephrased without self-hosting citations.
- `src/config/templates.ts` — `concepts` added to all three
  collection lists; `.docdog/concepts/` added to every template's
  `defaultScanPaths` (minimal/structured gained the field);
  optional `conceptsDir` field, set only on `workflows`.
- `src/cli/commands/init.ts` — exported `seedConcepts` (mkdir +
  `_common` + `conceptsDir` copy, verbatim) and
  `scanPathsCoverConcepts` (pure normalization over `ScanPathEntry`
  string/object forms — exact entry, parent dir, or repo root);
  action seeds after skills/scripts and prints the notice when scan
  paths don't cover the directory; `copyTemplateFiles` accepts a
  null config when template resolution is off.
- `tests/unit/init-concept-seeds.test.ts` — 9 tests: per-template
  sets (9 vs 12 files), edited-seed survival, deleted-seed repair on
  re-init, template wiring assertions, scan-path coverage cases, and
  end-to-end seed → `runCacheIndexer` (fake embedder) →
  `loadRegistryFromCache` resolving all core types with correct
  inverse labels and zero warnings; workflows-tier types stay
  unknown on minimal.
- `.docdog/config.yaml` (this repo) — `concepts` dropped from
  `vertex_collections` (now template-shipped).

Suite 221/221 green (212 + 9 new); `npm run lint` clean; installed
CLI rebuilt; scratch-dir smoke: minimal init seeds 9 with
`.docdog/concepts/` written to `scan_paths`, workflows seeds 12,
re-init copies 0 and stays silent, `--scan docs/` triggers the
two-line notice; `docdog index` on this repo a clean no-op
(templates/ is not scanned, so seed ids cannot collide with the
grandfathered records).
