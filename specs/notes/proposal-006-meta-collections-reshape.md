---
id: PROPOSAL-006
title: Meta collections reshape — `dd_collection_meta`, `dd_relation_meta`, `docdog collections` + `docdog relations` commands
collection: proposals
status: superseded
date: 2026-04-12
related:
  - DP-002
  - DP-003
  - DP-001
  - FR-001
  - DISC-010
  - PROPOSAL-003
  - PROPOSAL-005
relationships:
  - implements: DP-002
    context: PROPOSAL-006 is the direct implementation of the 'concepts carry meaning' principle
  - references: DP-001
    context: seeding shipped meta entries is Tier 2 visible defaults, consistency checks are Tier 1
  - references: DP-003
  - references: FR-001
  - discussed_in: DISC-010
  - blocks: PROPOSAL-003
    context: PROPOSAL-003 edge reconciler reads routing from dd_relation_meta
  - blocks: PROPOSAL-005
    context: PROPOSAL-005 step 1 needs dd_collection_meta for dd_code_refs creation
  - references: OQ-43
  - references: DISC-008
description: "SUPERSEDED by PROPOSAL-025 + PROPOSAL-026: DP-002's shipped-defaults commitment survived the v3 pivot as concept records seeded into .docdog/concepts/ on the template rail — files instead of dd_collection_meta/dd_relation_meta rows and command trees (all dead at v3 step 6). Original v2 pitch: meta vertex collections seeded at init, docdog collections/relations CRUD command trees, consistency checks."
---

# PROPOSAL-006: Meta collections reshape

**Status note (2026-07-11, FEATURE-002):** superseded by
PROPOSAL-025 (relations half) and PROPOSAL-026 (collections half),
which reland DP-002's shipped-defaults clause in v3 disk-canonical
form — concept records seeded at `docdog init` from package
templates, registry advisory. The Arango meta collections, the
`collections`/`relations` command trees, and `collections check`
all died at v3 step 6 (DD-070 §3); what this proposal was *for*
(shipped vocabulary with meaning attached) shipped anyway.

## Motivation

DP-002 ("concepts carry their own meaning") commits docdog to storing
every extensible concept's semantic metadata inside its own graph, in
dedicated meta vertex collections. Today there is no such collection.
PROPOSAL-003's type registry is planned to live in config and needs to
be moved into DB before PROPOSAL-003 can be implemented. And
PROPOSAL-005 needs a meta entry for its new `dd_code_refs` collection
at creation time.

This proposal is the groundwork: build the meta collections, seed
shipped entries, expose CRUD commands, enforce consistency. Nothing
useful for end users yet — but everything downstream (PROPOSAL-003,
PROPOSAL-005) blocks on it.

## DP-001 / DP-002 / DP-003 compliance check

- **DP-001 (mechanical code, no inference):** seeding shipped entries
  from source-code constants is Tier 2 (visible defaults). Consistency
  checks are Tier 1 (deterministic: "declared collection without a
  meta entry → warn"). The CRUD commands are pure pass-throughs — the
  agent decides what to write; the command writes it. ✅
- **DP-002 (concepts carry meaning):** this proposal **is** the
  implementation of DP-002. Every user-facing concept gets its meaning
  stored in `dd_collection_meta` or `dd_relation_meta`. ✅
- **DP-003 (toolbelt with escape hatch):** CRUD commands cover the
  common cases (`docdog collections list/describe/add/update/remove`).
  Direct DB writes remain allowed as the escape hatch; the loop from
  clause 3 will catch any missing operations as they surface. ✅

## Specification

### 1. New shipped collections

`docdog init` creates two new document collections (not edge
collections):

**`dd_collection_meta`** — one vertex per user-facing vertex
collection. Example seed entries below.

**`dd_relation_meta`** — one vertex per user-facing relationship
type. Absorbs PROPOSAL-003's type registry.

Neither collection has a meta entry for itself — they're `dd_*`
infrastructure, exempt per DP-002.

### 2. Schemas

**`dd_collection_meta` vertex:**

```yaml
_key: decisions                   # collection name as the key
name: decisions
scope: shipped                    # shipped | user
description: "Durable commitments about architecture, principles, or direction."
when_to_use: "When the user commits to a direction that shapes future work."
when_not_to_use: "Exploratory ideas go in discussions; bugs go in issues."
examples: [DD-001]                # array of record ids (may be empty)
guide_path: null                  # optional path to longer markdown guide
created_at: "2026-04-12T16:00:00Z"
created_by: "docdog-init"         # docdog-init | user | <script>
updated_at: "2026-04-12T16:00:00Z"
updated_by: "docdog-init"
```

**Indexes:**
- Unique on `_key` (automatic — collection name uniqueness is global
  per OQ-43 direction anyway)
- Secondary on `scope` for filtering

**`dd_relation_meta` vertex:**

```yaml
_key: supersedes
name: supersedes
scope: shipped

# Documentation fields
description: "A supersedes B when A replaces B as the active commitment."
when_to_use: "When a decision revises an older one."
when_not_to_use: "For minor amendments — use `revised_by` logic or discussions instead."
examples: [DD-020]
guide_path: null

# Runtime routing (from PROPOSAL-003's type registry)
collection: dd_edges_temporal    # which dd_edges_* the stored edge lands in
inverse_label: "revised by"
symmetric: false

created_at: "..."
created_by: "docdog-init"
updated_at: "..."
updated_by: "docdog-init"
```

**Indexes:**
- Unique on `_key`
- Secondary on `scope`
- Secondary on `collection` for "all types routed here" queries

### 3. Shipped seed data

`docdog init` seeds `dd_collection_meta` and `dd_relation_meta` with
entries for every shipped user-facing concept. Seed content is
defined in a new source module (`src/arango/meta-seed.ts` or similar)
as a compile-time constant array. Tier 2 per DP-001: visible in
source, overridable at runtime by editing the meta collection vertices
directly.

**Shipped `dd_collection_meta` seeds** (9 entries — one per
user-facing collection from the structured template plus docdog's
own additions):

| `_key` | one-sentence description |
|---|---|
| decisions | Durable commitments about architecture, principles, or direction. |
| notes | Miscellaneous context, session notes, and working material that doesn't fit elsewhere. |
| principles | Design principles (DP-NNN) — reviewable criteria for future features. |
| requirements | Functional requirements (FR-NNN) — what the system must do. |
| questions | Open questions (OQ-NN) — design questions awaiting resolution. |
| issues | Bugs, friction reports, and limitations (FRICTION-NNN) worth fixing. |
| proposals | Formal design proposals (PROPOSAL-NNN) — specs not yet committed. |
| discussions | Captured design conversations (DISC-NNN). |
| guidelines, terms, domain, constraints, integrations | (shipped by the structured template, seed entries TBD — to be filled in at implementation time) |

**Shipped `dd_relation_meta` seeds** (13 entries from DISC-008's
table, full documentation):

- `supersedes`, `references`, `uses_term`, `discussed_in`,
  `implements`, `depends_on`, `blocks`, `constrains`, `sourced_from`,
  `parent`, `part_of`, `companion`, `cross_cutting`

Each seed entry gets a real one-sentence description + when-to-use
hint. Writing pass takes maybe 30 minutes during implementation.

### 4. `edge_collections` stays in config

The list of edge storage collections (`dd_edges_structural`,
`dd_edges_semantic`, ..., plus user-declared like `project_edges`)
remains in `.docdog/config.yaml` as a flat list:

```yaml
edge_collections:
  - project_edges     # user-declared edge storage
```

Rationale: `edge_collections` is a **collection lifecycle concern**
(which Arango collections to create at init, which to seed with
indexes), not a **taxonomy concern** (what a collection means).
PROPOSAL-006 moves taxonomy metadata to DB; it does not move
collection lifecycle declarations. The distinction matters because
collection creation happens at init time, before the meta
collections themselves exist.

Shipped `dd_edges_*` collections are hardcoded in source as always-
create; user-declared edge collections come from the config list.
Once a collection exists, a `dd_relation_meta` vertex can point to
it via its `collection` field.

### 5. Commands — `docdog collections`

Top-level command tree (per DISC-010 decision choice (i)):

**`docdog collections list`** — enumerate entries.

```
$ docdog collections list
SHIPPED VERTEX COLLECTIONS (9):
  decisions        Durable commitments about architecture...
  notes            Miscellaneous context, session notes...
  principles       Design principles (DP-NNN) — reviewable criteria...
  requirements     Functional requirements (FR-NNN) — what the system must do.
  questions        Open questions (OQ-NN) — design questions...
  issues           Bugs, friction reports, and limitations...
  proposals        Formal design proposals (PROPOSAL-NNN)...
  discussions      Captured design conversations (DISC-NNN).
  ... (etc)

USER VERTEX COLLECTIONS (0):
  (none)
```

Flags: `--scope shipped|user|all` (default: all), `--json`, `--ids`.

**`docdog collections describe <name>`** — full entry for one
collection.

```
$ docdog collections describe decisions
decisions (shipped)
═══════════════════════════════════════════════════════════
Description: Durable commitments about architecture, principles, or direction.
When to use:  When the user commits to a direction that shapes future work.
When NOT to:  Exploratory ideas go in discussions; bugs go in issues.
Examples:     DD-001
Guide:        (none)
Created:      docdog-init @ 2026-04-12T16:00:00Z
Updated:      docdog-init @ 2026-04-12T16:00:00Z
```

Flags: `--json` for machine-readable output.

**`docdog collections add <name>`** — create a new collection entry.
Prompts for `description` (required), optionally accepts flags:

```
$ docdog collections add use_cases \
    --description "Concrete business scenarios docdog serves." \
    --when-to-use "Capture onboarding scenarios and common workflows."
```

On success: writes vertex to `dd_collection_meta`, creates the
underlying Arango collection if it doesn't exist yet, prints
confirmation.

**`docdog collections update <name>`** — mutate an existing entry.
Accepts the same flags as `add` but updates in place. Updates
`updated_at` / `updated_by`.

**`docdog collections remove <name>`** — soft-delete the meta entry.
Does **not** drop the underlying Arango collection (separate
destructive operation via `docdog gc hard-delete` on the meta entry
plus explicit confirmation). This is deliberate: removing the meta
entry is a fast reversible operation; dropping the collection with
its data is a slow irreversible one. They're decoupled.

**`docdog collections check`** — run the consistency check (see §7)
on demand without running a full index.

### 6. Commands — `docdog relations`

Parallel to `collections` but for relationship types.

- `docdog relations list [--scope ...] [--symmetric] [--collection NAME]`
- `docdog relations describe <type>`
- `docdog relations add <type> --description ... --collection ... --inverse-label ... [--symmetric]`
- `docdog relations update <type> [same flags]`
- `docdog relations remove <type>`
- `docdog relations check`

Plus:

- `docdog relations list --unknown` — enumerate types actually
  observed in `dd_edges_unspecified` but not in `dd_relation_meta`.
  The feedback loop for FR-001 clause 3: tells users which types are
  being used in their content but haven't been registered yet, so
  they can `docdog relations add <type>` to promote the usage into
  the vocabulary.

### 7. Consistency enforcement

On every `docdog index` run (and on `docdog collections check` /
`docdog relations check` directly):

**For each collection in Arango's vertex_collections list:**
- **No meta entry** → warn: *"`user_stories` exists as a collection
  but has no `dd_collection_meta` entry. Run `docdog collections add
  user_stories --description '...'`."*
- **Meta entry exists, but `scope: shipped` and source seed has
  changed** → warn about drift on next startup (suggests running a
  seed-refresh subcommand, not automatic).

**For each meta entry in `dd_collection_meta`:**
- **Underlying Arango collection doesn't exist** → create it on the
  next index (or warn and wait for user confirmation, TBD during
  implementation).

**For each type observed in `dd_edges_unspecified`:**
- **No `dd_relation_meta` entry** → count as "unknown type usage."
  Surfaces via `docdog relations list --unknown`. Doesn't warn on
  every index run to avoid spam; periodic nudge via `docdog status`
  (future command) or on explicit check.

**Shipped seeds** (scope=shipped) that are missing from the DB → reinsert
on next init / check. This keeps the self-hosted seed in sync with
source, with the caveat that user edits to shipped entries are
preserved (updated_at / updated_by newer than seed version → skip).

Warnings never block operations. Per user direction in DISC-010:
*"if they want stupid dog, do not stop them."*

### 8. MCP tools

For agent consumption:

- `docdog_collections_list()` — return all `dd_collection_meta`
  entries as JSON
- `docdog_collections_describe(name)` — return a single entry
- `docdog_relations_list()` / `docdog_relations_describe(name)` —
  same for relationships
- `docdog_concepts_search(query)` — search both meta collections by
  description / when-to-use text. Useful for "which collection
  should I put this in?" agent queries.

All read-only; writes happen via CLI or direct DB per DP-003.

### 9. Migration / backfill

For the current docdog self-hosting project (the first consumer of
PROPOSAL-006):

1. Implement the feature. `docdog init` now creates the meta
   collections and seeds shipped entries.
2. Run `docdog init` on the existing `.docdog/docdog_docdog`
   database. Idempotent per the existing init design; it creates the
   two new collections without touching anything else.
3. The seed pass populates shipped entries for the 9+ user-facing
   collections currently in use.
4. `docdog collections list` works immediately.
5. Dev-cycle verification: `docdog collections describe decisions`
   returns a real entry.

No data migration needed on existing vertices — the reshape only
adds new collections, doesn't move data.

### 10. Relationship to existing work

- **Unblocks PROPOSAL-003.** PROPOSAL-003's extractor / reconciler
  / query layer will read the type registry from `dd_relation_meta`.
  PROPOSAL-006 provides the data.
- **Unblocks PROPOSAL-005 step 1.** When `dd_code_refs` is created
  as part of step 1, the corresponding `dd_collection_meta` entry is
  written in the same step. Requires `dd_collection_meta` to already
  exist.
- **Related to FR-001 / PROPOSAL-005 (feature detection).** A future
  `docdog features scan` command can use `dd_collection_meta` and
  `dd_relation_meta` to answer "what concepts does this project
  use?" — feature signals include meta coverage.

## Estimated effort

Medium.

- **Collection setup** (~20 LOC): create `dd_collection_meta` +
  `dd_relation_meta` on init, secondary indexes
- **Seed data module** (~150 LOC): shipped entries for 9+
  collections and 13 relationship types as typed constants in source
- **Init seeding logic** (~50 LOC): idempotent upsert of seed entries
- **`docdog collections` command tree** (~180 LOC):
  list/describe/add/update/remove/check, flag parsing, table + json
  output formatting
- **`docdog relations` command tree** (~180 LOC): parallel command
  surface with the extra `--unknown` flag
- **Consistency check** (~80 LOC): compare vertex_collections +
  dd_collection_meta, warn on mismatches; parallel for relations
- **MCP tools** (~100 LOC): 5 tools (list/describe × 2 + concepts_search)
- **Unit tests** (~150 LOC): seed idempotence, CRUD validation,
  consistency check cases
- **Integration tests** (~250 LOC): init → seed → describe → add →
  update → remove roundtrip; consistency warnings for manually-
  declared collections; relations lookup under `dd_edges_unspecified`

**Total:** ~1100 LOC + ~400 LOC tests. Largest piece of work so far.
Contained and mostly straightforward though — most of the LOC is
command plumbing and well-defined CRUD.

## Dependencies

- **Blocking:** DP-002 accepted (done in DISC-010)
- **Blocking:** DP-003 accepted (done in DISC-010)
- **Blocks:** PROPOSAL-003 implementation, PROPOSAL-005 step 1
  implementation
- **Related (no hard dep):** OQ-43 (dd_ids registry) — if landed
  first, collection names as vertex `_key` align naturally with
  OQ-43's global id uniqueness; no conflict either way
- **Related (no hard dep):** FR-001 / PROPOSAL-005 feature detection
  — the meta collections will become a signal source for
  `docdog features scan` later

## Not in scope

- **Shipped `dd_*` infrastructure collection meta entries** (see
  DP-002 — these don't get described)
- **Guide file indexing integration** (`guide_path` is stored but
  the indexer's behavior around guide files is PROPOSAL-003
  territory once relationships extract from guide frontmatter)
- **Edge collection meta** (`dd_edge_collection_meta`) — not part of
  this proposal; edge collection category semantics stay in design
  docs and `dd_relation_meta`'s `collection` field
- **Hard-delete of meta entries** goes through `docdog gc
  hard-delete`, not a dedicated command; soft-delete is via
  `docdog collections remove`
- **Rename of a collection / type** (implies data migration) — not
  supported; requires remove + add + data migration workflow (future
  consideration)

## Implementation plan — three landing steps

Split for coherent commits:

### Step 1 — Core collections + seed + minimal CRUD (~500 LOC)

- Create `dd_collection_meta` and `dd_relation_meta` at init
- Seed data module with full shipped entries (30-min writing task)
- Idempotent init seeding
- `docdog collections list/describe` + `docdog relations
  list/describe` (read-only CRUD minimum)
- Basic unit tests for seeding idempotence
- Integration test: `docdog init` → `docdog collections list`
  returns shipped entries

This is the minimum to unblock PROPOSAL-003 and PROPOSAL-005 step 1.
Mutation CRUD (add/update/remove) and consistency checks come next.

### Step 2 — Mutation CRUD + consistency (~350 LOC)

- `docdog collections add/update/remove`
- `docdog relations add/update/remove`
- Consistency check + warnings on `docdog index` and dedicated
  `check` subcommands
- `docdog relations list --unknown`
- MCP tools for list/describe and concepts_search
- Integration tests for CRUD round-trips and consistency warnings

### Step 3 — Polish + dev-cycle validation (~250 LOC)

- Validation (scope=shipped + stale seed warning, symmetric+label
  consistency, name collisions)
- JSON output formatting and agent-friendly shapes
- Table rendering polish
- Full dev-cycle test: rebuild installed docdog, run against this
  project's DB, confirm round-trip

**Step 1 unblocks everything downstream.** Steps 2 and 3 can ship
after PROPOSAL-005 step 1 if needed, though the plan is to land all
three in sequence before starting PROPOSAL-005 implementation.

## Status

Proposed. Steps 1–3 are next in the implementation sequence, before
PROPOSAL-005 step 1. First feature-level implementation after the
recent design thread; serves as the concrete test of DP-002, DP-003,
and FR-001 together.
