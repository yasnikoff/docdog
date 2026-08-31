---
id: PROPOSAL-003
title: "`relationships:` frontmatter block — design spec"
collection: proposals
status: shipped
date: 2026-04-12
related:
  - DISC-004
  - OQ-42
  - OQ-14
  - OQ-18
  - EJ-011
  - EJ-030
relationships:
  - discussed_in: DISC-004
    context: the origin design conversation — frontmatter shape, rejected alternatives, the unspecified bucket
  - depends_on: PROPOSAL-006
    context: PROPOSAL-003 reads the type registry from dd_relation_meta, seeded by PROPOSAL-006
  - depends_on: OQ-42
    context: formal user-extensibility commitment
  - references: OQ-14
    context: the edge-attribute question this spec answers — context, anchor_text and role became the reserved metadata keys
  - references: OQ-18
    context: the MCP tool surface that consumes the extracted edges
  - references: EJ-011
    context: edge records are shaped to match its schema — intrinsic properties, not relevance scores
  - references: EJ-030
    context: the two-tier content model applied to edges — the reconciler only touches source=frontmatter
  - sourced_from: FRICTION-006
    context: amendment source for §7 target-resolution behavior
  - sourced_from: FRICTION-008
    context: surfaced the DP-001 TTL violation that reshaped §7 cleanup
  - references: EJ-017
    context: one-record-per-file gives every record a frontmatter home for the block
  - references: OQ-32
    context: the DB-first write path authors edges with source=mcp, outside the frontmatter reconciler's scope
  - references: DP-002
    context: its reshape moved the type registry from config into dd_relation_meta records
  - references: DP-003
    context: the escape hatch — direct DB writes stay a legitimate way to register custom types
  - references: OQ-27
    context: part of the two-tier content model the source=frontmatter invariant protects
  - references: OQ-40
    context: the disk-db sync story behind the source=frontmatter reconcile scope
  - discussed_in: DISC-005
    context: target-resolution amendment
  - references: OQ-43
    context: global id uniqueness — its dd_ids registry would replace pass 1's scan-built id map
  - discussed_in: DISC-007
    context: cascade-soft-delete amendment
  - references: PROPOSAL-004
    context: its gc surface subsumed the separate relationships-pending command
  - discussed_in: DISC-008
    context: directionality + inverse-label amendment
  - references: DP-001
    context: tier-checked throughout — label resolution is Tier 1, and the hardcoded routing map is the principle's named follow-up refactor
  - references: EJ-004
    context: skill-produced navigation aids — agentic edge extraction left out of scope
  - references: EJ-007
    context: prose extraction stays agentic — this spec covers only the declared-frontmatter half
  - references: API-IMPROVEMENT-001
    context: explicitly informs the collection-move semantics work — edges must be rewritten on move
  - references: DD-070
    context: v3 carried this design through the pivot — edge extraction now targets the embedded SQLite cache instead of the Arango `dd_edges_*` collections specified below
  - references: PROPOSAL-025
    context: the type registry left `dd_relation_meta` for concepts records — PROPOSAL-025 restored the shipped vocabulary this spec's routing and inverse-label tables depend on
  - references: DISC-020
    context: its one-tier collapse made frontmatter the sole birthplace of edges, retiring the two-tier `source=frontmatter` reconcile scope of §6
description: "SHIPPED — the live mechanism: relationships authored in frontmatter, extracted to edges at index time; v3 kept the design with the registry moved to concepts records (PROPOSAL-025) and edges born in files (DISC-020). Original v2 spec: type-as-key YAML, hybrid shipped+user vocabulary, six shipped edge collections, source=frontmatter reconcile scope."
---

# PROPOSAL-003: `relationships:` frontmatter block

**Status note (2026-07-11, FEATURE-002):** shipped — this block is
the mechanism the corpus runs on (1,000+ edges authored this way).
v3 carried the design through the pivot: extraction now targets the
embedded SQLite cache (DD-070), the type registry lives in concepts
records (PROPOSAL-025 restored the shipped vocabulary), and
DISC-020's one-tier collapse made frontmatter the sole birthplace of
edges. Arango-specific storage details below (dd_edges_* collections,
dd_relation_meta) are the v2 implementation.

**Context:** see DISC-004 for the design conversation. Depends on OQ-42
(user-extensibility commitment). Directionality and target-resolution
semantics are deferred to separate discussions.

## Motivation

Vertices in docdog have been getting relationship information via a
loose `related: [ID-1, ID-2]` convention on frontmatter — a string list
with no types, not extracted to edges, not queryable via graph
traversal. The `dd_edges_*` collections exist from `docdog init` but
nothing populates them. We have a schema waiting for a writer.

This proposal specifies the writer: a typed `relationships:` frontmatter
block, extracted by the indexer into typed edges across the shipped and
user edge collections.

## Specification

### 1. Frontmatter shape

Type-as-key YAML. Each entry is a single-key map where the key is the
relationship type and the value is the target `id`. Optional per-edge
metadata can be added as sibling keys:

```yaml
relationships:
  - references: FRICTION-006
  - references: OQ-14
    context: "motivating example for edge schema"
  - constrains: EJ-017
  - implements: OQ-32
    anchor_text: "DB-first write path"
```

**Parsing rules:**

- `relationships:` is a list of maps.
- The first key in each map is the type. All other keys are metadata.
- Reserved metadata keys: `context`, `anchor_text`, `role`. Additional
  keys are allowed but ignored (forward-compat).
- Target values must be strings matching an existing vertex `id`
  (global uniqueness is required; see §4).
- Types are strings. Shipped types are known to docdog; user types
  require a `type_map` entry per OQ-42.

**Rejected alternatives** (see DISC-004 §1):

- Flat array of `{to, type}` objects — too verbose.
- Typed arrays at frontmatter root (`references: [X]`, `constrains: [Y]`) — scatters concerns, conflicts with existing fields.
- Flat `related: [X, Y]` shortcut coexisting with structured form — two ways to do the same thing.

### 2. Shipped vocabulary and routing

Docdog core ships a fixed vocabulary with hardcoded routing:

| Type | Category | Collection |
|---|---|---|
| `references` | semantic | `dd_edges_semantic` |
| `uses_term` | semantic | `dd_edges_semantic` |
| `discussed_in` | semantic | `dd_edges_semantic` |
| `implements` | dependency | `dd_edges_dependency` |
| `depends_on` | dependency | `dd_edges_dependency` |
| `blocks` | dependency | `dd_edges_dependency` |
| `constrains` | dependency | `dd_edges_dependency` |
| `supersedes` | temporal | `dd_edges_temporal` |
| `revised_by` | temporal | `dd_edges_temporal` |
| `sourced_from` | temporal | `dd_edges_temporal` |
| `companion` | temporal | `dd_edges_temporal` |
| `parent` | structural | `dd_edges_structural` |
| `child` | structural | `dd_edges_structural` |
| `part_of` | structural | `dd_edges_structural` |
| `cross_cutting` | crosscutting | `dd_edges_crosscutting` |

### 3. Six shipped edge collections (new: `dd_edges_unspecified`)

`docdog init` creates **six** edge collections:

1. `dd_edges_structural`
2. `dd_edges_semantic`
3. `dd_edges_temporal`
4. `dd_edges_dependency`
5. `dd_edges_crosscutting` — for genuinely cross-cutting relationships, not a fallback
6. **`dd_edges_unspecified`** (new) — fallback target for unknown or unrouted types

The `unspecified` collection is a new addition from DISC-004 §4. Its
purpose is honest naming: when the indexer encounters a type it can't
route, the edge still goes into the graph (no data loss) but lands in a
clearly-labeled unknown bucket with a warning. Users can query
`dd_edges_unspecified` to audit their type vocabulary.

### 4. User-extensible vocabulary (depends on OQ-42 accepted)

*(Revised by DP-002 / PROPOSAL-006: the relationship type registry
lives in the `dd_relation_meta` collection, not in `.docdog/config.yaml`.
Projects declare custom types by adding vertices to `dd_relation_meta`
via `docdog relations add`, `docdog_relate`, or direct DB write per
DP-003's escape hatch.)*

A `dd_relation_meta` vertex defines everything about a relationship
type — its documentation and its runtime routing:

```yaml
_key: owns
name: owns
scope: user
description: "A owns B when A is authoritative for B's lifecycle."
when_to_use: "Ownership handoff, accountability chains."
examples: [TASK-042]

# Runtime routing (was previously config.relationships.type_map)
collection: project_edges       # user-declared edge collection
inverse_label: "owned by"
symmetric: false

created_at: "..."
created_by: "user"
```

User-declared edge collections are registered in `.docdog/config.yaml`
under `edge_collections: [project_edges]` (this field is kept in
config because it's a collection lifecycle concern — see §4 of
PROPOSAL-006 for rationale).

Routing algorithm at extraction time:

1. **Query `dd_relation_meta`** for the entry keyed by the type name.
2. If found, use its `collection` field to route the edge.
3. If not found (user typo, or a user-coined type not yet registered),
   route to `dd_edges_unspecified` and log a warning. The unknown type
   surfaces via `docdog relations list --unknown` (enumerated from
   actual edges in `dd_edges_unspecified`) so users can register it
   retroactively.

### 5. Edge records

Each extracted edge carries a record shaped to match EJ-011's schema:

```json
{
  "_from": "decisions/abc123",
  "_to": "questions/def456",
  "type": "references",
  "role": null,
  "context": "motivating example for edge schema",
  "source": "frontmatter",
  "date": "2026-04-12T16:30:00Z",
  "discovered_via": "indexer",
  "anchor_text": null,
  "status": "current",
  "deleted_at": null
}
```

**Defaults for frontmatter-extracted edges:**

- `source: "frontmatter"` (critical — see §6)
- `date: <indexer run time>`
- `discovered_via: "indexer"`
- `status: "current"`
- `deleted_at: null`

**User-overridable per edge:** `type`, `context`, `anchor_text`, `role`
(sibling keys on the frontmatter map entry).

### 6. Reconcile semantics (source=frontmatter scope)

When the indexer processes a file whose `relationships:` block changed:

1. **Load** outbound edges from the vertex matching
   `source = "frontmatter"`. MCP-authored and agent-authored edges are
   invisible to this reconciler.
2. **Parse** the new `relationships:` block into `(type, target_id,
   context, anchor_text, role)` tuples.
3. **Resolve** each target by global-unique `id` lookup across all
   vertex collections.
4. **Match** existing frontmatter edges to new tuples by composite key
   `(type, target_vertex_id)`.
5. **Reconcile:**
   - New tuple, no match → create edge in the routed collection.
   - Existing match with different metadata → update edge fields.
   - Existing match, no new tuple → soft-delete edge (`deleted_at = now`).

**Critical invariant:** the reconciler's load query is scoped to
`source = "frontmatter"`. It must never touch `source = "mcp"` or
`source = "agent"` edges. This is the two-tier content model (EJ-030 /
OQ-27 / OQ-32 / OQ-40) applied to edges.

### 7. Target resolution — two-pass indexing + orphan queue

*(Amended by DISC-005, 2026-04-12. Original stance was "skip + warn MVP,
deferred design"; replaced with the full spec below.)*

The indexer becomes two-pass per run:

- **Pass 1 — vertex reconcile.** Walk all scanned files. Create, update,
  and soft-delete vertices as today. Build an in-memory global map
  `id → vertex _id` spanning all `vertex_collections`. (Once OQ-43
  lands, this map is sourced from the `dd_ids` registry with a single
  lookup; until then, it's built by scanning `id` fields in each
  vertex collection.)
- **Orphan replay (between pass 1 and pass 2).** Scan
  `dd_edges_orphan`, try to resolve each entry against the fresh
  global map. For each newly-resolvable entry: create the real edge in
  its `intended_collection`, delete the orphan record. This is where
  forward references from prior index runs get promoted to real edges
  as soon as their targets appear.
- **Pass 2 — edge reconcile.** Walk files that were reconciled in pass
  1. For each, parse the `relationships:` block, resolve targets
  against the global map, and reconcile edges following the
  state-machine table in §7.1. Unresolvable entries are written to
  `dd_edges_orphan` instead of dropped.

This eliminates the out-of-order-within-a-run failure mode (a referring
file processed before its target) and handles forward-reference across
runs via the orphan queue. Users never have to run a manual rebuild
command.

### 7.1. `dd_edges_orphan` collection

*(Renamed from `dd_edges_pending` per DISC-007. "Orphan" is more
honest — these records have lost or never had their target.)*

A new shipped collection created by `docdog init`. Regular document
collection (not an edge collection — orphan records don't have a valid
`_to`).

**Record shape:**

```yaml
source_vertex_id: decisions/abc123     # who authored the edge
source_file: specs/decisions/ej-001.md # for cleanup on file removal
target_id: FRICTION-999                # unresolved string id
type: references
intended_collection: dd_edges_semantic # routed target collection
reason: never-existed                  # never-existed | target-deleted
context: "..."
anchor_text: null
role: null
source: frontmatter
created_at: <timestamp>
```

**`reason` enum** (from DISC-007 §4):

- `never-existed` — written as orphan at write time because
  `target_id` didn't resolve
- `target-deleted` — converted from a real edge when the target
  vertex was soft-deleted (see §7.6)

**Indexes:** unique on `(source_vertex_id, type, target_id)`; secondary
on `source_vertex_id` for source-file-removal cleanup; secondary on
`target_id` for orphan replay lookups; secondary on `reason` for
filtering during `docdog gc list`.

### 7.2. Pass-2 reconcile state machine

For a file being reconciled, the reconciler loads both existing real
edges (from `dd_edges_*` where `source = "frontmatter"` and `_from =
<vertex>`) AND existing orphan records (from `dd_edges_orphan` where
`source_vertex_id = <vertex>`). Both are matched against the new
`relationships:` block by composite key `(type, target_id)`:

| Before | New block says | Action |
|---|---|---|
| real edge | tuple present, target still resolvable | update metadata if changed |
| real edge | tuple present, target now missing | soft-delete real edge, create orphan with `reason: never-existed` |
| orphan | tuple present, target now resolvable | delete orphan, create real edge |
| orphan | tuple present, target still missing | update orphan metadata if changed |
| real edge | tuple absent from new block | soft-delete real edge |
| orphan | tuple absent from new block | delete orphan |
| no prior state | tuple present, target resolvable | create real edge |
| no prior state | tuple present, target missing | create orphan with `reason: never-existed` |

All deterministic; complexity per reconciled vertex is O(real + orphan
+ new) with constant-factor overhead from the two-source lookup.

### 7.3. Orphan visibility and cleanup

*(Revised by DISC-007. The original "explicit TTL sweep via `gc
--pending --older-than`" was dropped because the threshold is a
semantic judgment the user can't correctly make at config time —
see FRICTION-008.)*

Orphan records never auto-expire. Visibility happens through two
mechanisms:

- **Indexer warning.** Each `docdog index` run ends with aggregated
  counts: `"Relationships: 47 real edges, 2 orphans (newest 0d, oldest
  14d)"`. The warning surfaces the queue without being silent.
- **Enumeration via `docdog gc list --orphans`.** Agent+user reviews
  the list and issues explicit `docdog gc hard-delete <ids...>` for
  records they've decided are dead. Full command surface in PROPOSAL-004.

This subsumes the originally-proposed `docdog relationships pending`
command — one gc surface covers both soft-deleted vertices and
orphan records.

### 7.4. Cleanup on source file removal

When the vertex reconciler soft-deletes a vertex because its source
file disappeared from disk, it also sweeps
`dd_edges_orphan WHERE source_vertex_id = <vertex _id>` in the same
pass. Prevents accumulation of orphan records authored by vertices
that no longer exist.

### 7.5. (removed — `docdog relationships pending` subsumed by `docdog gc list --orphans`)

### 7.6. Cascade soft-delete of inbound edges

*(Added by DISC-007.)*

When a vertex X is soft-deleted, the reconciler also handles inbound
and outbound edges:

**Inbound real edges** (`_to == X._id`): for each inbound edge, create
a new `dd_edges_orphan` record with:

- `target_id = X.id` (the string id, not the `_id`)
- `reason = target-deleted`
- `source_vertex_id`, `type`, `intended_collection`, `context`,
  `anchor_text`, `role`, `source` copied from the original edge

Then soft-delete the original real edge.

**Rationale:** the pending queue's existing replay mechanism handles
the re-resolution if X is ever restored (file comes back, same `id`,
new `_id`). Undo is first-class — no time-window coupling, no lost
history. See DISC-007 §1.

**Outbound real edges** (`_from == X._id`): soft-delete in the same
pass. An orphaned `_from` pointer has no recovery story, so converting
to an orphan record would be meaningless. The deleted vertex's `_id`
is gone; re-authoring edges requires re-creating the vertex, which
recreates the edges via the normal reconcile path.

**Outbound orphan records** (`source_vertex_id == X._id`): already
swept by §7.4.

**Implementation cost:** adds ~30 LOC to the vertex reconcile path —
one AQL lookup for inbound edges, one AQL batch insert for orphan
records, one AQL batch update for soft-delete.

### 8. Directionality and inverse labels

*(Resolved by DISC-008. The original "deferred, MVP stores one-sided,
inverse traversal TBD" stance is replaced with a full design below.)*

**Storage: always one-sided.** One stored edge per relationship,
direction following the authoring side. File A writes `supersedes: B`
→ stored `A → B` with `type: supersedes`. No inverse edge is ever
created; no dual-write. ArangoDB's native `INBOUND` / `OUTBOUND` /
`ANY` traversal primitives handle reverse queries without extra
storage.

**Inverse labels are display strings, not authoring forms.** Each
relationship appears in the registry exactly once, declared from its
canonical authoring side. The `inverse_label` field is a human-readable
string used by the query layer when surfacing an edge from the target
side — it is **not** a second valid authoring type. Users who try to
author with the inverse form (`revised_by: A`) get an "unknown type"
warning.

Registry entry shape (stored as a vertex in `dd_relation_meta` per
DP-002 / PROPOSAL-006):

```yaml
_key: supersedes
name: supersedes
scope: shipped
description: "A supersedes B when A replaces B as the active commitment."
collection: dd_edges_temporal
inverse_label: "revised by"
symmetric: false
```

The `symmetric: true` flag marks types whose semantic reads the same
from both sides. For symmetric types, the inverse label equals the
type's natural phrasing (e.g. `companion` → "companion of"). The
query layer skips the side-flip for symmetric types.

### 8.1. Server-side label resolution

Query layer (MCP server handlers, CLI commands) consults the registry
when building edge responses. For each returned edge, it uses the
traversal direction relative to the querying vertex to produce an
`effective_type` field:

```json
// Queried from abc (OUTBOUND)
{
  "_from": "decisions/abc",
  "_to": "decisions/xyz",
  "type": "supersedes",
  "effective_type": "supersedes",
  "direction": "OUTBOUND",
  "context": "..."
}

// Same stored edge, queried from xyz (INBOUND)
{
  "_from": "decisions/abc",
  "_to": "decisions/xyz",
  "type": "supersedes",
  "effective_type": "revised by",
  "direction": "INBOUND",
  "context": "..."
}
```

Agents consume `effective_type` for natural prose without needing to
carry the registry. Raw `type` stays available for normalization or
comparison.

Resolution algorithm:

```
effective_type(edge, querying_vertex):
  if edge._from == querying_vertex._id:
    direction = OUTBOUND
    return edge.type
  else:
    direction = INBOUND
    entry = registry[edge.type]
    if entry.symmetric:
      return edge.type
    else:
      return entry.inverse_label
```

Pure mechanical lookup, Tier 1 under DP-001. No agent judgment
required; no client-side registry.

### 8.2. Shipped inverse labels

| Type | Inverse label | Symmetric |
|---|---|---|
| `supersedes` | "revised by" | false |
| `references` | "referenced by" | false |
| `uses_term` | "term used by" | false |
| `discussed_in` | "discusses" | false |
| `implements` | "implemented by" | false |
| `depends_on` | "depended on by" | false |
| `blocks` | "blocked by" | false |
| `constrains` | "constrained by" | false |
| `sourced_from` | "source of" | false |
| `parent` | "child of" | false |
| `part_of` | "contains" | false |
| `companion` | "companion of" | **true** |
| `cross_cutting` | "cross-cut by" | false |

`companion` is the only symmetric type in the shipped vocabulary.
The `symmetric` flag remains available for user extensions (OQ-42).

### 8.3. Registry validation

*(Revised by DP-002 / PROPOSAL-006: validation runs against
`dd_relation_meta` vertex inserts, not against a config file.)*

The registry can contradict itself in exactly one way under this
shape: a type with `symmetric: true` but `inverse_label` differing
from the type name (or absent). `docdog relations add` and direct
DB writes to `dd_relation_meta` validate on insert and emit a warning
(per DP-002's "warn, don't block" stance). All other contradiction
classes from the original design were eliminated by dropping the
separate inverse-side entries.

## Estimated effort

*(Revised by DISC-005 + DISC-007 amendments — orphan queue and
cascade soft-delete roughly double the edge-reconcile component.)*

Medium. Breakdown:

- **Frontmatter parsing** (~40 LOC): read `relationships:`, validate
  shape, produce typed tuples. Lives in the existing section parser.
- **Type registry lookup** (~30 LOC): query `dd_relation_meta` by
  type name, cache results for a single indexer run, fall back to
  `dd_edges_unspecified` on miss. Shipped type seeding handled by
  PROPOSAL-006's init path — not this proposal's responsibility.
- **Vertex resolution + global id map** (~50 LOC): global `id → _id`
  map built in pass 1. Until OQ-43 lands, built by scanning
  vertex_collections; after OQ-43, sourced from `dd_ids` registry.
- **Two-pass indexer restructuring** (~50 LOC): top-level `runIndexer`
  flow — split vertex pass from edge pass, add orphan replay in
  between.
- **Edge reconcile + orphan state machine** (~200 LOC): handles all 8
  transitions from the state table; scoped to `source=frontmatter`.
  Roughly double the "orphan-less" version.
- **Cascade soft-delete on vertex removal** (~30 LOC): find inbound
  real edges, convert to orphan records with `reason: target-deleted`,
  soft-delete outbound real edges in the same pass. See §7.6.
- **`dd_edges_unspecified` + `dd_edges_orphan` init** (~10 LOC): add
  to `arango/setup.ts`.
- **Type registry access layer** (~30 LOC): `dd_relation_meta`
  lookup wrapper used by the extractor, reconciler, and query layer.
  Replaces the earlier "`relationships.type_map` config schema"
  after DP-002 / PROPOSAL-006.
- **Orphan visibility subsumed by `docdog gc list --orphans`** — no
  separate `docdog relationships pending` command; see PROPOSAL-004.
- **Directionality fields on `dd_relation_meta`** (~20 LOC):
  `inverse_label` and `symmetric` fields on each registry vertex,
  with validation on insert for the one remaining contradiction
  class (symmetric + non-reflexive label). Shipped defaults for the
  13 canonical types are seeded by PROPOSAL-006's init path.
- **Server-side label resolution** (~30 LOC): `effective_type`
  computation applied in query response builders (CLI search output,
  MCP traverse handler). Pure `(type, direction) → label` lookup.
- **Directionality tests** (~50 LOC): OUTBOUND and INBOUND queries
  return expected `effective_type`; symmetric types produce the same
  label both ways; unknown types fall through to the `type` value;
  registry contradictions caught at load time.
- **Tests** (~300 LOC integration, ~80 LOC unit): create with shipped
  types, user types, unspecified fallback, reconcile add/remove,
  missing target (→ orphan), orphan replay on next run, orphan cleanup
  on source removal, cascade soft-delete on vertex removal, cascade
  restore round-trip, source=frontmatter isolation vs MCP edges,
  two-pass correctness under out-of-order file order.

**Total:** ~700 LOC + ~380 LOC tests. Medium complexity, contained.

## Dependencies

- **Blocking:** OQ-42 resolution (user-extensibility commitment).
- **Blocking:** PROPOSAL-006 (meta-reshape). This proposal reads the
  type registry from `dd_relation_meta`, which PROPOSAL-006 creates
  and seeds. PROPOSAL-006 must land first.
- **Informs / informed by:** OQ-43 (global `id` uniqueness via
  `dd_ids` registry). If OQ-43 lands first, the global `id → _id` map
  is a single registry lookup instead of a scan across
  vertex_collections. Either can ship before the other; this proposal
  assumes the fallback scan until OQ-43 is resolved.
- **Informs:** API-IMPROVEMENT-001 (indexer collection-move semantics) —
  edges need to be rewritten on move, which this proposal's reconcile
  path can contribute primitives to.
- **Informs:** OQ-32 (DB-first write path) — `docdog_create` will also
  need to write edges, but with `source=mcp` to stay out of the disk
  reconciler's scope.

## Not in scope

- Bidirectional / inverse edges (deferred discussion)
- Target resolution for missing vertices beyond skip+warn (deferred)
- MCP write path for agent-authored edges (OQ-32, separate proposal)
- Agentic extraction of edges from prose (EJ-004 / EJ-007, much later)
- Migration of the existing `related: [...]` shortcut usage — there's
  no existing data; this is greenfield

## Open questions embedded

1. Should the `role` metadata field be required when it's present? EJ-011
   lists it but doesn't define its semantics. MVP: optional, no validation.
2. Should the indexer error or warn when two vertices have the same `id`?
   The proposal assumes global uniqueness but doesn't specify the failure
   mode. Probably: error on duplicate detected during index, point at
   both files.
3. Should `dd_edges_unspecified` warnings be aggregated or per-edge? Per-
   edge gets noisy quickly on large projects. MVP: aggregate by type at
   end of index run ("3 edges routed to unspecified: `owns` (2), `seen-with` (1)").

## Status

Proposed. Implementation gated on OQ-42. Ready for review and
decision.
