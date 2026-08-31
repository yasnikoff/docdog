---
id: PROPOSAL-015
title: "Symmetrize vertex-collection lifecycle — template-owned shipped set, config holds only user extensions"
collection: proposals
status: shipped
date: 2026-04-12
related:
  - OBS-004
  - EJ-021
  - EJ-010
  - PROPOSAL-006
  - DP-001
  - DP-002
  - DP-003
relationships:
  - sourced_from: OBS-004
    context: "direct follow-up to OBS-004's finding that shipped vertices live in config while shipped edges are hardcoded"
  - references: EJ-021
    context: "operationalizes EJ-021's 'extend the built-in set' wording by making the built-in set actually separate"
  - references: PROPOSAL-006
    context: "extends PROPOSAL-006 §4's 'lifecycle in code, taxonomy in DB' rationale from edges to vertices"
  - references: DP-001
    context: template-to-shipped-list is a static lookup, bucket tagging a set-membership check
  - references: DP-002
  - references: DP-003
  - references: OQ-31
    context: OQ-31's option-A flagged-entry shape considered and rejected as verbose duplication
description: "Make .docdog/config.yaml list only user-added vertex collections. Shipped collections come from the template the project was init'd with, resolved at runtime by getVertexCollections, matching how shipped dd_edges_* collections already work. Adds a `template:` field to config, warns on legacy duplication, fixes the `docdog collections add` drift vector."
---

# PROPOSAL-015: Vertex-collection lifecycle symmetry

## Motivation

OBS-004 captured the asymmetry: shipped dd_edges_* collections are
hardcoded in `SYSTEM_EDGE_COLLECTIONS` while every shipped
user-facing vertex collection sits in the project's
`.docdog/config.yaml` alongside any real user additions. EJ-021's
model says projects "extend the built-in set" — but for vertices
today, the built-in set and the extension set are indistinguishable.

PROPOSAL-006 §4 already articulated the right rationale for edges:
*"lifecycle is a code concern, taxonomy is a DB concern."* The
argument applies equally to vertices; it was only spelled out for
edges because PROPOSAL-006's scope was the taxonomy reshape.

Three concrete problems follow from the asymmetry:

1. **EJ-021's extension model isn't reflected in code.** There's no
   way for a tool or a reader to say "this entry in config is
   shipped, that one the user added." Every entry looks user-owned.
2. **`docdog collections add` drifts.** PROPOSAL-006 §5 lets that
   command create an Arango collection without touching config.
   Next index, `getVertexCollections(config)` doesn't return the
   new collection — the agent's own `docdog_collections_list`
   output and the runtime view diverge.
3. **Onboarding confusion.** A new contributor reading
   `vertex_collections:` can't distinguish "remove at your own
   peril" shipped defaults from this project's additions. The
   edge list has no such ambiguity.

## The template complication

A straight port of the edge model — one
`SHIPPED_VERTEX_COLLECTIONS` constant — does not work. Unlike
edges (one shipped set), `src/cli/commands/init.ts:186` defines
three different templates:

- `minimal` — `[notes]`
- `structured` — 9 collections
- `workflow` — 12 collections

Shipped-ness is **template-dependent** for vertices. The proposal
has to carry the template identity forward at runtime so that
`getVertexCollections` can resolve the correct shipped set.

## Specification

### 1. New config field: `template`

`.docdog/config.yaml` gains an optional top-level field:

```yaml
version: 1
project:
  name: docdog
template: structured       # new — one of: minimal, structured, workflow
scan_paths: [...]
vertex_collections: []     # now: user-added collections only
```

`docdog init` writes the template name at init time and leaves
`vertex_collections: []`. The chosen template's collection list
moves out of config entirely.

Rationale over alternatives considered:

- **Object-form `vertex_collections` with a `shipped: true` flag
  per entry** (cf. OQ-31 option A) — verbose, duplicates data
  every init, still has to match a source-of-truth somewhere.
- **Drop config-side vertex_collections entirely and let
  `dd_collection_meta` drive everything** — breaks init
  bootstrap (meta collections themselves need collections to
  exist first), and conflates lifecycle with taxonomy again.
- **Leave vertex_collections as-is and fix only the drift
  vector** — doesn't close OBS-004's structural concern.

### 2. Runtime resolution

`getVertexCollections` in `src/arango/collections.ts:48`:

```ts
export function getVertexCollections(config: DocdogConfig): string[] {
  const system = SYSTEM_VERTEX_COLLECTIONS;
  const shipped = getTemplateCollections(config.template ?? "minimal");
  const user = config.vertex_collections ?? [];
  return [...new Set([...system, ...shipped, ...user])];
}
```

`getTemplateCollections(name)` is a pure lookup in the existing
`TEMPLATES` record. No new template infrastructure — just
promoting the existing constant from init-only to runtime.

Missing template → fall back to `minimal` with a one-time warning:
*"`.docdog/config.yaml` has no `template:` field; defaulting to
`minimal`. Set `template: structured` (or another) to match your
project's shipped collection set."*

### 3. `docdog collections add` writes back to config

The PROPOSAL-006 drift vector closes:

```
docdog collections add use_cases --description "..."
  ✓ Created dd_collection_meta entry: use_cases
  ✓ Created Arango collection: use_cases
  ✓ Added to .docdog/config.yaml vertex_collections
```

Mechanical yaml rewrite — append the new name to the
`vertex_collections` array, preserve comments and ordering via
the existing yaml writer used by `docdog migrate`. If the file is
unwritable, fall back to printing the line the user should paste
and exit with a non-zero status.

### 4. `docdog collections list` tags each entry by source

Visible distinction between the three buckets:

```
$ docdog collections list
SHIPPED (template: structured):
  decisions        Durable commitments about architecture...
  notes            Miscellaneous context...
  principles       Design principles...
  ... (9 total)

USER:
  observations     Dogfooding notes captured during dual-track work
  discussions      Captured design conversations

SYSTEM:
  dd_patches       (internal)
```

The bucket for each entry is derived mechanically: in
`SYSTEM_VERTEX_COLLECTIONS` → system; in the resolved template
list → shipped; otherwise → user. No inference.

### 5. Consistency check at index time

On `docdog index` and `docdog collections check`:

- **Each entry in `config.vertex_collections` that is already in
  the template's shipped list** → warn: *"`decisions` is already
  shipped by template `structured`; remove it from
  `vertex_collections:` to clean up the config."* Non-blocking.
- **`config.template` references a template name the code
  doesn't know** → warn + fall back to `minimal`.
- **Existing shipped-entry duplicates in config** are always
  deduplicated by the set-union in `getVertexCollections`, so the
  warning is guidance, not correctness.

### 6. Migration for existing projects

**This repo's config** currently lists 14 collections — nine from
`structured`, plus `questions`, `issues`, `proposals`,
`discussions`, `observations`. The migration is:

1. Pick the nearest shipped template. `structured` covers 9 of
   14; no shipped template covers the other 5.
2. `docdog migrate` gains a new step: read the current
   `vertex_collections`, diff against each template's shipped
   list, write `template: <best match>` + reduce
   `vertex_collections` to the residual.

For docdog's own config, expected outcome:

```yaml
template: structured
vertex_collections:
  - questions
  - issues
  - proposals
  - discussions
  - observations
```

The five residual entries are genuine user additions (all grew
during the v2 session arc). That matches what OBS-004 wants:
*"user-added collections are obvious from the config."*

`docdog migrate` is idempotent: re-running against an
already-migrated config is a no-op except for the warning pass.

Projects that don't run `docdog migrate` keep working — the
runtime set-union tolerates shipped entries in
`config.vertex_collections`, it just warns.

### 7. Command surface touched

Minimal:

- `docdog init` — writes `template:` field, empty
  `vertex_collections: []`.
- `docdog migrate` — new migration step for the config shape.
- `docdog collections list` — rendered output gains bucket
  grouping.
- `docdog collections add` — yaml write-back on success.
- `docdog index` — new warning class (three consistency cases
  from §5).

No new commands. No MCP tool changes.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001 — mechanical code, no inference.** Template → shipped
  list is a static lookup. Bucket tagging for each entry is a
  deterministic set-membership check. Migration picks "the
  template that covers the most current entries" — still
  deterministic, no semantic judgment. ✅
- **DP-002 — concepts carry meaning.** Orthogonal. Lifecycle
  lists don't carry semantics; `dd_collection_meta` still owns
  the descriptions. This proposal actually makes DP-002 *easier*
  to honor because the shipped list lives in one place (the
  template constant) and the shipped seed lives in one place
  (`meta-seed.ts`), with the template name as the join key. ✅
- **DP-003 — toolbelt with escape hatch.** Editing
  `.docdog/config.yaml` by hand still works. Direct DB edits on
  `dd_collection_meta` still work. The new command surface is
  additive. ✅

## Not in scope

- **Template versioning.** If a future `structured` template
  gains `use_cases`, existing projects don't auto-acquire it.
  Template drift handling is a separate problem (later proposal,
  maybe under the "seed refresh" family of features PROPOSAL-006
  §7 gestures at).
- **Dropping collections when a shipped entry is removed from
  the template code.** Lifecycle is add-only by design; removals
  go through `docdog gc`. The runtime union handles the
  transitional state correctly.
- **Custom templates on disk.** The `TEMPLATES` record stays a
  code constant. Users adding many project-specific collections
  just put them in `vertex_collections`.
- **Edge-side symmetric changes.** Edges already follow this
  model. No work needed.
- **Changing `default_collection`.** Still template-driven at
  init, still a plain string in config thereafter.

## Estimated effort

Small-to-medium.

- `getVertexCollections` + helper (~30 LOC in
  `src/arango/collections.ts`)
- `docdog init` writes template name + empty vertex_collections
  (~10 LOC)
- `docdog migrate` new step (~80 LOC — yaml rewrite + diff logic)
- `docdog collections list` bucket rendering (~40 LOC)
- `docdog collections add` yaml write-back (~60 LOC)
- Consistency warnings in indexer (~30 LOC)
- Fallback + deprecation warning for missing template field
  (~10 LOC)
- Unit tests for `getVertexCollections` union cases (~50 LOC)
- Integration test: `docdog init` → `docdog collections list`
  shows bucket tags; migrate existing config → residual-only
  vertex_collections (~120 LOC)

**Total:** ~260 LOC + ~170 LOC tests.

## Dependencies

- **Soft dependency on PROPOSAL-006** — already shipped. Steps 5
  and 6 assume `dd_collection_meta` and `docdog collections add`
  exist. PROPOSAL-006 consistency checks and this proposal's
  consistency checks coexist; same warning channel.
- **No blocker** — can ship in isolation.

## Status

Shipped. Landed in one commit:

- `src/config/templates.ts` — shared `TEMPLATES` record, moved out of
  `init.ts` so runtime and init can both read it.
- `src/arango/collections.ts` — `getVertexCollections` unions
  `system ∪ template-shipped ∪ config.vertex_collections`;
  `getVertexCollectionSource` classifies any name by lifecycle bucket;
  `getDefaultCollection` now checks the union.
- `src/types/config.ts` — optional `template?: string` field.
- `src/cli/commands/init.ts` — writes `template: <name>` + empty
  `vertex_collections: []` for new projects.
- `src/config/writer.ts` — mechanical `appendUserVertexCollection`
  helper; `docdog collections add` uses it to update config in one
  step with the meta write.
- `src/cli/commands/collections.ts` — `list` renders SHIPPED (with
  template label) / USER / META-ONLY buckets based on lifecycle
  source, not meta scope.
- `src/arango/meta.ts` — consistency check gains
  `template_shipped_in_config` and `unknown_template` warning kinds.
- `src/migrations/0002-vertex-lifecycle-symmetry.ts` — config-only
  migration. `pickBestTemplate` picks the covering template (ties
  broken by smaller shipped set), writes `template:`, reduces
  `vertex_collections` to the residual. Idempotent.
- `tests/unit/vertex-lifecycle.test.ts` — 16 unit tests covering
  the union, the source classifier, template picking, and direct
  migration invocation.

Migration applied to this repo: `template: structured` with 5
residual user collections (`questions`, `issues`, `proposals`,
`discussions`, `observations`) — exactly matches the prediction in
§6. All 107 unit tests green, all 96 integration tests green,
`docdog index` + `docdog collections list` + `docdog collections
check` + `docdog search` smoke-tested against the live DB.
