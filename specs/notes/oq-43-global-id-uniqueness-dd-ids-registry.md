---
id: OQ-43
title: "Global `id` uniqueness — v3 warns and picks one winner; is that enough, and should duplicates be queryable state?"
collection: questions
status: resolved
related:
  - DISC-005
  - PROPOSAL-003
  - EJ-013
relationships:
  - discussed_in: DISC-005
  - references: PROPOSAL-003
    context: its target resolution assumes global id uniqueness — duplicates would break the single-lookup contract
  - references: EJ-013
  - references: FRICTION-006
  - references: DD-070
    context: "the pivot that mooted the dd_ids answer — the cache PK now structurally holds one row per id, and detection moved into indexer warnings"
  - references: DP-001
    context: the tier test that placed the invariant — detection is Tier-1 mechanics (cache PK plus indexer warnings), resolution is agent judgment
  - references: PROPOSAL-024
    context: the precedent shape a future answer would take — a read-only report of contested ids, the way suggest-edges reports undeclared mentions, not a registry
  - references: DISC-027
    context: "the discussion that answered the open half — partition the id space by an identity already agreed under coordination, so the collision becomes unrepresentable rather than merely detected"
  - references: PROPOSAL-031
    context: "the mechanics that close this question: contested ids persist into docdog_status as queryable state, and renumber is the promotion primitive that resolves them"
  - references: DISC-026
    context: "the discussion that found the failure mode this question never covered — worktrees make duplicate ids a structural race, because every guard named below is scoped to a single cache and none of them can see a sibling worktree"
description: "REFRAMED for v3 (2026-07-11): the Arango-era dd_ids registry answer is dead. In v3 the cache's vertices.id PRIMARY KEY holds one row per id by construction, the indexer warns on within-file duplicates (later section skipped) and cross-file duplicates (both paths named, last indexed wins), docdog_create refuses ID_CONFLICT, and id-less sections get path-derived keys. Still open: disk — the source of truth — can carry duplicates; the warning is surfaced only at index time, not persisted as queryable state; and last-writer-wins means index order silently decides ownership at adoption scale (the orchestrator mirror's 39/213 dup-id surface). Historical finding below: dd_ids registry with a unique index (Option C) over Foxx/stream transactions."
---

# OQ-43: Global `id` uniqueness — v3 reframe

**RESOLVED (2026-07-14, PROPOSAL-031).** Both halves are answered, and the
registry is rejected for good.

- *Should duplicates be queryable state?* **Yes, and they are.** The
  indexer persists every cross-file duplicate into a `contested_ids` table
  (SCHEMA_VERSION 4) — the id, the competing files, which one the cache
  indexed — and `docdog_status` / `docdog status` report them. The
  index-time warning still prints; it has simply stopped being the only
  place the fact exists. Last-writer-wins still decides *ownership*, but it
  no longer decides it **silently**, which was the actual complaint.
- *Is warn-and-pick-one enough?* **No — and prevention belongs in the id
  scheme, not in docdog.** DISC-027 settles it: partition the id space by an
  identity already agreed under coordination (a task/branch name), and the
  collision becomes unrepresentable rather than merely detected. Docdog
  supplies the two mechanics that scheme needs and no policy: `docdog
  renumber` (promotion) and this report (residue).
- *A `dd_ids` registry?* **Never.** It died with Arango, and it could not
  have worked across clones anyway — which is the only place the hard
  version of the problem lives. Detection is cheap and belongs in code;
  resolution — *which* of two records deserves the id — is judgment and
  belongs to the agent (DP-001 Tier 3).

Everything below is the v3 reframe and, beneath that, the historical
Arango-era investigation. Both are kept as the trace of how the answer was
reached.

**Reframe note (2026-07-11):** the question survives the v3 pivot;
the recorded answer does not. Everything from *Investigation* down is
the historical Arango-era analysis — `dd_ids`, Foxx, and stream
transactions all died with Arango (DD-070 §3).

**What v3 actually does** (verified in code, 2026-07-11):

- `vertices.id` is the cache's **PRIMARY KEY** (`src/storage/schema.ts`)
  — one row per id by construction. The v2 failure mode ("both get
  created and queries return duplicates") cannot exist in the cache;
  cross-collection ambiguity is structurally gone because collections
  are a column, not tables.
- **Within-file duplicates:** the indexer warns and skips the later
  section (`src/storage/indexer.ts`).
- **Cross-file duplicates:** the indexer warns with both paths and
  reassigns — *last indexed wins*. The ghost sweep runs first so
  renames never false-trip the warning.
- **Agent writes are guarded:** `docdog_create` refuses `ID_CONFLICT`
  up front, so new duplicates can only enter via hand-authored files.
- **Id-less records:** parser-generated section keys embed the file
  path, so fallback-key vertices are unique cache-wide by design.

In DP-001 terms the invariant moved where it belongs: detection is
Tier-1 mechanics (PK + warnings), resolution is agent judgment.
`dd_ids` is moot.

**What remains open — the v3 question:**

1. Disk is the source of truth, and disk can still carry duplicates.
   After the index-time warning scrolls by (CLI stderr or the
   index-tool response), nothing queryable records that an id is
   contested — an agent reading the cache sees only the winner, with
   no signal the loser exists. Should contested ids be surfaced as
   state (e.g. in `docdog_status`, or a read-only report the way
   `suggest-edges` reports undeclared mentions)?
2. Last-writer-wins means scan order silently decides ownership. At
   self-host scale duplicates are rare accidents; at adoption scale
   they are structural — the orchestrator mirror carries a 39/213
   dup-id surface, which PLAN-DOCDOG-001's D1 sidesteps by making
   the mirror the sole authority for upstream ids. That is a
   per-adoption workaround, not a docdog answer.

A future proposal would be the read-only-report shape (PROPOSAL-024
precedent), not a registry.

## The answer (2026-07-14, DISC-027 + PROPOSAL-031)

Both open sub-questions above are answered, and the shape of the answer is
not the one this record was reaching for.

**First, the question got harder before it got easier.** DISC-026 found a
failure mode none of the v3 guards can cover: git worktrees. Every
mechanism named above — the `vertices.id` PRIMARY KEY, the indexer's
last-writer-wins warning, `docdog_create`'s `ID_CONFLICT` refusal — is
scoped to **a single cache**. Two agents in two worktrees both minting
`DD-072` each have a perfectly consistent cache; no guard fires; the
collision exists only at merge, where nothing is looking. Agentic
development uses worktrees heavily, so this is structural, not rare.

**Then it dissolved.** Detection was never going to be enough, and a
registry could never have worked across clones anyway. The answer is to
make the collision **unrepresentable at the source**:

> **Partition the id space by an identity that was already agreed under
> coordination.**

The adopting orchestrator already does exactly this (DISC-027): records
authored on a task branch take a task-scoped id (`BACKPORT-T074-01`), which
cannot collide across branches because the task number was allocated
centrally, on the integration branch, *before the worktree existed*.
Consensus on the branch id removes the need for consensus on the record id
— the standard partition-by-node-identity result. The canonical counter is
simply never read off-trunk.

Docdog's part is mechanics only, and deliberately small (PROPOSAL-031):

1. **Contested ids become queryable state** — persisted by the indexer and
   surfaced through the existing `docdog_status` tool. That is sub-question
   1, answered: yes, they should be state, and no new tool is needed for
   it. The warning stops being the only place the fact exists.
2. **`docdog renumber <old> <new>`** — the promotion primitive, rewriting
   the id, the filename, and every inbound edge *exactly* (from
   `edges.to_id`, an indexed column — not a text search). That is
   sub-question 2's real answer: last-writer-wins no longer silently
   decides ownership, because there is a mechanical way to take it back.

**`dd_ids` stays dead, and the registry idea is now rejected rather than
merely mooted.** Prevention belongs in the id *scheme*, detection belongs
in code, and resolution belongs to the agent. A registry conflated all
three, and could not have reached the case that actually matters.

Docdog learns no policy: it does not know what `T168` means and cannot tell
a provisional id from a canonical one. The namespace convention and the
promotion step live in the host project's skills, which keeps DD-050 Tier 1
intact — the core still cannot call git, and therefore still cannot depend
on it.

This question stays `open` only until PROPOSAL-031 ships.

## Context

PROPOSAL-003 (`relationships:` frontmatter block) and DISC-005 (target
resolution) both assume the vertex `id` field is globally unique across
all vertex collections. Target resolution becomes a single indexed
lookup. Duplicate ids would make the composite key `(type, target_id)`
ambiguous and break the single-lookup contract.

The current indexer does not enforce this. Nothing stops two files from
both declaring `id: FRICTION-006` in different vertex collections. The
failure would be silent and non-deterministic (whichever file is
processed later wins for traversals, or both get created and queries
return duplicates).

## Investigation

**ArangoDB native unique constraints** are scoped to a single
collection. Adding a unique index on `id` within each vertex collection
guarantees in-collection uniqueness but **does nothing cross-collection**.
Two files claiming the same `id` in different collections (`decisions`
vs `questions`) would both succeed.

Three approaches investigated for cross-collection uniqueness:

### Option A: Foxx microservice

A custom Foxx service running inside Arango validates every vertex
write by querying all vertex collections for the `id` before allowing
the insert.

- **Pros:** fully DB-enforced; application code can't forget.
- **Cons:** adds a deployment dimension (Foxx service lifecycle,
  versioning, install step), maintenance burden, debugging complexity.
  Out of proportion for a single invariant.

### Option B: Stream transactions

Arango supports atomic multi-collection transactions. The indexer wraps
every vertex create/update in a transaction that scans all
vertex_collections for the `id` first, then performs the write if the
scan returned zero results.

- **Pros:** no new infrastructure; uses Arango's built-in mechanism.
- **Cons:** transaction scope grows linearly with vertex_collections
  count (currently 10+). Stream transactions have overhead and can
  contend under concurrent writes. Every single write pays the full
  cross-collection scan cost.

### Option C: `dd_ids` registry collection (LEANING)

A single document collection `dd_ids` with a **unique index on the
`id` field**. Every vertex create/update also writes a registry entry:

```yaml
_key: <auto>
id: FRICTION-006                 # unique-indexed
target: decisions/abc123         # _id of the vertex that owns this id
source_file: specs/decisions/ej-001.md  # debugging aid
created_at: <timestamp>
```

Workflow:

1. **On vertex create:** write to `dd_ids` first. If it fails with a
   unique-constraint violation, abort the vertex create and report the
   existing owner (from the registry's `target` + `source_file` fields).
2. **On vertex update:** no registry change unless the `id` itself
   changed.
3. **On vertex soft-delete:** also soft-delete or remove the `dd_ids`
   entry to free the id for reuse.
4. **On vertex hard-delete (via `docdog gc`):** remove the `dd_ids`
   entry.

**Pros:**

- Leverages native Arango unique-index enforcement. DB-level guarantee.
- Single extra write per mutation — constant cost, not O(collections).
- No new infrastructure (no Foxx).
- Clear error surface: the unique-constraint violation comes with the
  conflicting entry, which the indexer can format into a helpful message
  pointing at both source files.
- Natural bootstrap: `docdog init` creates the collection with its
  index alongside the other system collections.

**Cons:**

- Registry has to stay in sync with the vertex collections. A bug that
  writes a vertex without registering could create a silent duplicate.
  Mitigation: wrap both writes in a single transaction, OR write
  registry first (if it succeeds, the vertex write must also be
  attempted; rollback on vertex failure).
- On vertex delete, cleanup step can fail halfway, leaving a stale
  registry entry blocking future reuse of that id. Mitigation:
  `docdog gc` sweeps orphan registry entries (rows whose `target` `_id`
  no longer exists).

## Recommendation

**Accept Option C.** Simplest solution that gives DB-level enforcement.
Follow-up proposal would specify:

- Exact registry schema and indexes
- The transaction semantics (atomic vertex + registry writes)
- Error message format when duplicate detected
- `docdog gc` behavior for orphan registry entries
- Migration path: how to retrofit onto the existing corpus (scan all
  vertex collections, populate the registry, error on any
  duplicates found — the first time the corpus passes, the registry is
  in sync)

## Rejected alternatives

- Soft uniqueness via lint — e.g. `docdog validate` checks for
  duplicates before indexing. Relies on user running it; no
  runtime guarantee.
- Qualified ids (collection:id) everywhere — breaks the "just write the
  id" ergonomics and clutters frontmatter.

## Open sub-questions

1. Should the registry be a regular collection or a system-prefixed
   (`dd_`) collection? Probably `dd_ids` — it's docdog-managed, users
   don't touch it.
2. Should the registry track soft-deleted ids too (with `deleted_at`),
   or free them immediately? Tracking gives an undo window; freeing
   lets users immediately reuse an id after deletion. Probably track
   for consistency with vertex soft-delete semantics, let `docdog gc`
   clean both together.
3. Does the registry replace the existing "lookup by id across
   vertex collections" logic in PROPOSAL-003's target resolver? Yes —
   resolver queries `dd_ids` for the target string and follows the
   `target` pointer to the actual vertex. One lookup, not N.

## Status

Open. Waiting for acceptance to spawn a formal proposal.

Surfaced: 2026-04-12 during DISC-005.
