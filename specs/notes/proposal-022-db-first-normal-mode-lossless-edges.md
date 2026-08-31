---
id: PROPOSAL-022
title: "DB-first normal mode + one-tier lossless edge materialization"
collection: proposals
status: superseded
date: 2026-07-02
related:
  - DISC-019
  - DISC-020
  - DP-001
  - DP-002
  - DP-003
  - DD-034
  - DD-043
  - OQ-40
  - OQ-32
  - PROPOSAL-021
  - FRICTION-011
  - FRICTION-015
  - DISC-018
relationships:
  - sourced_from: DISC-019
    context: "The DB-first normal-mode flip: ArangoDB authoritative, disk = committed snapshots, DB-first-then-export write path, byte-deterministic serializer, `docdog index` demoted to bootstrap + reconcile. DISC-019's 'Next step' cleared it for promotion and recommended folding DISC-020 into the same proposal."
  - sourced_from: DISC-020
    context: "The one-tier lossless edge model: every semantic edge (including `docdog_relate`/MCP edges) materializes into the source vertex's `relationships:` block at full fidelity with a defaults-elide serializer. This is the write path that FORCES DISC-019's OQ-3a, so the two fold into one mechanism."
  - references: PROPOSAL-021
    context: "PROPOSAL-021 shipped `docdog export` + `src/engine/export.ts` — the DB→disk half. This proposal extends that serializer (edge reconstruction + defaults-elide + determinism) and makes export a step in the normal write path, not just the ejection bridge."
  - references: DD-043
    context: "Affirms DD-043 (relationships come from frontmatter, not agentic inference) as THE canonical edge model — under one-tier, every edge has a frontmatter home."
  - references: OQ-40
    context: "OQ-40 (disk⇔DB asymmetry) is already `resolved` in design by DISC-020; this proposal makes the CODE match — closing the `source != frontmatter` round-trip gap in `src/engine/relationships/reconcile.ts` and `renderVertexFile`."
  - references: FRICTION-011
    context: "FRICTION-011 (resolved) shipped `createVertexWithEdges` (`src/engine/create-vertex.ts`) — the frontmatter→edges materialization pipeline for a single vertex. That is HALF of one-tier (disk→DB direction). This proposal builds the reverse half: edge→frontmatter for `docdog_relate`. FRICTION-011's finding #4 (script-inserted edges don't materialize) is the same asymmetry seen from the ingest side."
  - references: OQ-32
    context: "OQ-32 (open) asks the DB-first write-path question for `docdog_create`/`docdog_update`; §2 answers its direction (DB-first-then-export) and §3 answers its 'does relate materialize to frontmatter' sub-question (yes, under one-tier). OQ-32's 'auto-extract edges? no — agent's job via docdog_relate' stance is preserved: relate is still explicit; one-tier only changes where the resulting edge is *stored*."
  - references: FRICTION-015
    context: "Under DB-first, denormalized-column sync stops being a rebuildable-projection convenience and becomes a write-path correctness invariant. This proposal absorbs FRICTION-015's fix into §7."
  - references: DD-034
    context: "Artifact-resilience is the whole point: losslessness guarantees a vanilla agent (or a docdog-free future) reconstructs the full graph from disk, edges included."
  - references: DP-001
    context: "DB-first-then-export and clobber-guard-refuse are Tier 1; the defaults-elide serializer is Tier 2; the only Tier-3 hazard (merge conflict on divergent `relationships:` blocks) is left to git + human, never auto-picked."
description: "Promote DISC-019 (DB-first normal mode) and DISC-020 (one-tier lossless edge export) into a single implementation proposal, per DISC-019's fold recommendation. Flip canonicality: ArangoDB is the source of truth, on-disk markdown files are committed, byte-deterministic snapshots. The write path becomes DB-first-then-export — forced to that shape because `docdog_relate` is graph-native and has no disk-first form. The load-bearing change is the one-tier edge collapse: today only `source=\"frontmatter\"` edges round-trip to disk (reconcile.ts is explicitly scoped to them; `renderVertexFile` emits the stored frontmatter blob verbatim), so MCP/agent edges are DB-only and losable under DB-first. Every edge-writing path must materialize the edge into the source vertex's `relationships:` block at full EdgeBase fidelity, with an omit-when-default serializer keeping diffs readable. Adds a `last_export_sha` clobber-guard that refuses to overwrite out-of-band disk edits, demotes `docdog index` to bootstrap + reconcile, and absorbs FRICTION-015's denormalized-column fix as a now-mandatory write-path invariant. Ejected mode (`docdog eject`), chunking, and shared remote Arango are explicitly out of scope."
---

# PROPOSAL-022: DB-first normal mode + one-tier lossless edge materialization

**Superseded 2026-07-06 by PROPOSAL-023** — the DB-first framing is rejected by DD-070; the defaults-elide serializer, one-tier edge materialization, and FRICTION-015 analysis carry into PROPOSAL-023 §1.

## Motivation

Docdog's two modes are fuzzy (DISC-019): "normal" means disk is
canonical and the DB is a rebuilt index; "ejected" means "stop using
docdog," which isn't a mode at all. That fuzziness leaks into every
design decision — DISC-018's flat-vs-nested question, the constant
edit-disk → reindex → query-DB → edit-disk round-trip, and a graph
that lives in the DB while disk stays authoritative.

DISC-019 resolved the flip: **ArangoDB becomes the source of truth,
on-disk markdown becomes committed snapshots.** DISC-020 resolved the
substrate underneath it: **git-first, on a lossless, round-trippable
markdown artifact**, which forced the load-bearing sub-decision — the
**one-tier edge model**, where every edge (including the ones
`docdog_relate` writes) materializes into the source vertex's
`relationships:` frontmatter block.

Both discussions closed their open questions (DISC-019 OQ 1/3/6/7/8,
DISC-020 forks 1–4) and each ended with an explicit "promote to
PROPOSAL-022" step. DISC-019 recommended **folding** the two rather
than sequencing 022→023, because "the edge write path and the vertex
write path are the same mechanism." This proposal is that fold.

The concrete gap this closes, grounded in code:

- `src/engine/relationships/reconcile.ts` is scoped **strictly to
  `source == "frontmatter"` edges** (its docstring and every AQL
  filter say so). MCP/skill/agent edges exist only as edge documents.
- `src/engine/export.ts:renderVertexFile` emits the vertex's **stored
  `frontmatter` blob verbatim**. So an edge that was never written
  into that blob (i.e. any `docdog_relate` edge) is **invisible to
  export**.

Under today's disk-canonical model that asymmetry is tolerable — the
DB is rebuildable from disk, so a DB-only edge is a convenience, not a
liability. **Flip to DB-first and it becomes a losable edge**: the DB
is now the thing you'd throw away on ejection, and the edge has no
disk home. That is OQ-40's asymmetry, and DISC-020's one-tier collapse
is its fix.

## What this folds — and what it deliberately doesn't

**In scope (the normal-mode flip + edge fidelity):**

1. Normal-mode contract: DB authoritative, disk = committed snapshots.
2. DB-first-then-export write path.
3. One-tier edge materialization (`docdog_relate`/MCP → frontmatter).
4. Full-fidelity `relationships:` block + omit-when-default serializer.
5. Byte-deterministic export + `last_export_sha` clobber-guard.
6. `docdog index` demoted to bootstrap + reconcile.
7. Denormalized-column write-path invariant (absorbs FRICTION-015).

**Out of scope (deferred, with pointers):**

- **Ejected mode / `docdog eject`** (DISC-019 OQ 4). Ejection is a
  terminal state, not a daily mode; DISC-019 Decision-needed #4 is
  deferred and can follow the flip. Losslessness (this proposal) is
  the *precondition* for a clean eject; the eject command itself is a
  later proposal.
- **Chunking granularity** (DISC-019 Bet A). Orthogonal to source of
  truth; measure retrieval quality first.
- **Shared remote Arango** (DISC-020 fork 1 opt-in). Git-first is the
  default and a complete substrate; `remote` is an additive knob for a
  future proposal, never a fork we regret.
- **Targeted-delta reconcile engine.** `docdog index` stays a full,
  idempotent disk→DB rebuild — that *is* the reconcile for MVP.

## Specification

### 1. Normal-mode contract

- **ArangoDB is the source of truth** — records, relationships,
  embeddings, lifecycle state.
- **Disk files are committed snapshots** — materialized views written
  by docdog commands as a side effect of DB writes, so the user sees
  the file change in `git status` after a command completes.
- **Read path** (`search` / `get` / `traverse`) is unchanged — it
  already hits the DB.
- **Bootstrap** (fresh clone, no DB): disk rebuilds the DB on first
  `docdog index`. So "DB-first" is precisely "DB-first *after
  bootstrap*"; on cold start disk is canonical because it's all there
  is (DISC-019 OQ 2). The DB is an always-rebuildable projection of
  committed disk snapshots.

### 2. Write path — DB-first-then-export

Every mutating command (`docdog create`, `docdog_relate`,
`docdog_update`, future lifecycle commands, and the reworked
`add`/`split` import helpers) follows one shape:

1. Open a DB transaction and apply the write.
2. On commit, **deterministically export** the affected vertices'
   files to disk (§5 serializer).
3. Surface the file change to the user.

This is **forced, not merely preferred** (DISC-019 OQ-3a). A
disk-first-then-reindex shape can't express `docdog_relate`: a
graph-native edge write has no markdown the user typed. Keeping
disk-first for `add`/`split` while needing DB-first for `relate` would
ship two write models — exactly the quirk the reframe removes. One
consistent write model requires DB-first-then-export.

### 3. One-tier edge materialization — the load-bearing change

**Collapse the two edge tiers into one.** Every edge-writing path —
including `docdog_relate`, MCP tools, and any agentic pass —
materializes the edge into the **source vertex's `relationships:`
block** and re-exports the file. The DB holds nothing canonical that
disk lacks.

Concretely — and this is smaller than it looks, because half the
mechanism already exists:

- **The frontmatter→edges direction is already built.** FRICTION-011's
  fix shipped `createVertexWithEdges` (`src/engine/create-vertex.ts`),
  which runs `extractRelationships(frontmatter) → reconcileEdgesForVertex`
  for a single vertex — so a vertex authored with a `relationships:`
  block (via CLI `docdog create`, MCP `docdog_create`, or
  `ctx.createVertex`) already materializes its edges. What that path
  does *not* do is the reverse.
- **The missing reverse: `docdog_relate` / MCP edge write** (today:
  writes an edge document only) must also patch the source vertex's
  stored `frontmatter.relationships` and re-export the file. This is
  the write half of the collapse and the genuinely new code — an
  edge→frontmatter materialization, the mirror of
  `createVertexWithEdges`'s frontmatter→edge.
- **`reconcile.ts`** stops being `source == "frontmatter"`-only. The
  reconciler already owns the "materialized frontmatter block ⇄ edge
  documents" state machine (PROPOSAL-003 §7.2); once every edge lives
  in frontmatter, that single state machine governs all of them. The
  `FILTER e.source == "frontmatter"` guards are removed (or the
  materialization pass rewrites those edges' `source` — see §Pinned
  decisions on the `source` vocabulary).
- **`renderVertexFile`** (today: emits the stored blob verbatim) is
  fed a frontmatter blob whose `relationships:` is guaranteed complete
  because the write path put every edge there. Export reconstructs
  nothing it wasn't given; correctness comes from the write path, not
  from export re-deriving edges from the graph. (This also resolves
  the latent divergence between PROPOSAL-021 §3's prose — "relationships
  block rebuilt from outgoing edges" — and its verbatim-blob
  implementation: under one-tier, the blob *is* the complete set.)

This overturns OQ-40's "graph edges are always DB-only" conclusion and
affirms **DD-043** (relationships-from-frontmatter) as THE canonical
edge model. OQ-40 is already flipped to `resolved` in design
(DISC-020); this proposal makes the code match.

### 4. Full edge fidelity + defaults-elide serializer

The `relationships:` block grows to carry **all** semantic edge
attributes from `EdgeBase` (`src/types/graph.ts:151`), not just
`role`+`target`+`context`:

| Field | Round-trips? | Notes |
|---|---|---|
| `role` (block key) | ✅ | e.g. `references:` |
| target (block value) → `_to` | ✅ | resolves to the target vertex |
| `context` | ✅ | one-line summary |
| `status` (`current`/`superseded`/`deprecated`) | ✅ | edge lifecycle — a superseded edge ≠ a live one |
| `source` | ✅ | provenance (see vocab note in Pinned decisions) |
| `date` | ⚠️ | see `date` default in Pinned decisions |
| `discovered_via` (`explicit`/`inferred`) | ✅ | **carried so inferred edges stay visibly inferred** — not laundered into apparent authored fact (DP-001) |
| `anchor_text` | ✅ | the md span that triggered the edge |
| `_from`/`_to`/`_key`/`_id`/`_rev` | ❌ regenerated | endpoints reconstructed from source vertex + resolved target; storage identity regenerates on reindex and must **not** round-trip |

**Serialization discipline — omit-when-default.** Full fidelity would
bloat every entry and defeat the readable-diff argument that motivated
markdown. A field sitting at its deterministic default is omitted from
serialization and re-defaulted on ingest. A plain authored explicit
edge collapses back to the terse two-liner:

```yaml
relationships:
  - references: DD-034
    context: "…"
```

Only non-default fields are ever written:

```yaml
  - references: DD-099
    context: "…"
    discovered_via: inferred      # agent-suggested, not human-asserted
    status: superseded
```

Losslessness holds because the defaults are deterministic; legibility
holds because the common edge stays one line + context. This is a
Tier-2 visible default (DP-001 clean). The exact default-set — in
particular `source` and `date` — is pinned below.

### 5. Byte-deterministic export + the clobber-guard

DB-first-then-export (§2) carries two obligations from DISC-019 OQ-3a:

**5a. Byte-deterministic export.** Pin YAML key order, whitespace, and
trailing newline; reuse the omit-when-default serializer (§4) as the
single emitter. This is **already de-risked** by PROPOSAL-021's
round-trip contract — "`docdog index` accepts its own emitted files
unmodified" *is* the determinism test. One serializer, written by
export, verified by the contract. Today's `renderVertexFile` uses a
plain `stringifyYaml(clean)` over the stored blob; it must be replaced
by the deterministic, defaults-eliding emitter so repeated exports of
unchanged state produce zero diff.

**5b. Clobber-guard — refuse.** Store `last_export_sha` per vertex
(new field on the vertex document; infrastructure, not user-facing
frontmatter), set on every export. Before the next export, re-hash the
target file. On mismatch — disk changed out of band — **refuse** with
a direction-explicit message:

> `<file>` changed outside docdog since its last write; run
> `docdog index` to pull it in, then retry.

Fail-closed, one manual step, no implicit work. Detection is a
mechanical hash compare (Tier 1); **refuse** is Tier 1 (no judgment).
It is cheap to relax later to auto-index-then-write (a Tier-2
fixed-rule default) if the extra step proves annoying; walking back
silent behavior is not cheap, so start closed.

### 6. `docdog index` demoted to bootstrap + reconcile

`docdog index` stops being *the* write path and becomes:

- **(a) bootstrap** on fresh clone (disk → DB, the sole direction
  until the DB exists),
- **(b) reconcile** after a human hand-edits disk, a git merge/pull,
  or a branch switch — all three are "disk moved ahead of DB," all
  resolving the **same** direction: disk → DB.
- **(c) re-vectorize** on embedding-model change.

There is no bidirectional merge engine. "Reconcile" is the two
directions that already exist (`index` for disk→DB, deterministic
export for DB→disk), each invoked explicitly. A git merge conflict on
divergent `relationships:` blocks lands *in the file*, a human
resolves it, and `docdog index` ingests the resolution. **docdog never
auto-picks a winner** (DP-001 Tier-3 line, structurally excluded in
normal mode because DB-first guarantees the DB never holds un-exported
state).

### 7. Denormalized-column write-path invariant (absorbs FRICTION-015)

FRICTION-015 documented that the incremental indexer's
`unchangedForEdges` path refreshes the stored `frontmatter` blob but
not the denormalized top-level columns (`status`, `description`,
`scope`) on body-unchanged edits. Under the disk-canonical model that
was `inconvenient` — a rebuildable projection drifting until the next
`--full`.

**Under DB-first it is a correctness bug, not a convenience gap.** Once
the DB is authoritative and disk is an export, the denormalized columns
the read surface consults must never lag the frontmatter the write path
just committed. Therefore:

- Every write path (§2) and every reconcile path (`unchangedForEdges`
  included) writes the denormalized projection — `status`,
  `description`, `scope` — derived from `section.frontmatter` with the
  documented defaults, alongside the `frontmatter` blob.
- This is the mechanical (Tier-1) fix FRICTION-015 already specified;
  this proposal makes it mandatory rather than optional and closes
  FRICTION-015 when it lands.

### 8. Downstream consequences (noted, not re-litigated)

- **DISC-018 migration scope flips to (c) nested-always.** If every
  disk file is a docdog-owned snapshot, nesting all docdog keys under
  `docdog:` is consistent with the file's provenance in both modes.
  DISC-018 should carry the one-line note; the migration itself is its
  own change, not bundled here.
- **OQ-40 is already `resolved`** (DISC-020). This proposal is the code
  that makes the resolution true; no status change to OQ-40 is needed.

## Principle walk (DP-001 / DP-002 / DP-003)

**DP-001 — agent-first mechanics.**

| Operation | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| DB-first transaction → deterministic serialize → write | ✅ | — | — |
| One-tier materialization (write DB edge, export to frontmatter) | ✅ | — | — |
| Carrying `discovered_via: inferred` | ✅ preserves provenance | — | correct posture: surface, don't launder |
| omit-when-default serializer | — | ✅ visible default | — |
| Clobber-guard detect (hash compare) + refuse | ✅ | — | — |
| Reconcile direction (always disk→DB) | ✅ single direction | — | — |
| Merge conflict on divergent `relationships:` | — | — | ⚠️ left to git + human; docdog never auto-picks |

The write path is mechanical end-to-end: no embedding-based decisions,
no "did you mean" fuzziness. The one Tier-3 hazard (which edge wins on
a divergent merge) is handled by git surfacing the conflict in the
file — the DP-001-correct move. The opt-in shared-Arango path
(deferred) would reintroduce this without git's conflict model; flagged
there for whenever `remote` is built.

**DP-002 — concepts carry meaning.** This proposal adds **no new
user-facing vertex collection or relationship type** — it changes the
write path and serializer for *existing* edges. The DP-002 "new concept
needs a meta entry" test is therefore N/A. `last_export_sha` is an
internal vertex field (infrastructure plumbing, like `deleted_at` /
`file_hash`), not an extensible concept, so it correctly gets no
`dd_collection_meta` / `dd_relation_meta` entry (DP-002 "does NOT apply
to" clause).

**DP-003 — comprehensive toolbelt with escape hatch.** The DB-first
write path is expressed entirely through existing first-class surface
(`docdog_relate`, `docdog_update`, `docdog create`, `docdog index`,
`docdog export`) — it *reduces* reliance on manual re-export. The
clobber-guard's recovery instruction points at `docdog index`, a
first-class command, not raw AQL. No new escape-hatch dependency is
introduced.

## Pinned decisions

Both discussions left three items to pin at promotion:

1. **`date` default (DISC-020 open).** `date` has no constant default,
   so it can't omit-when-default cleanly. **Decision: omit `date` from
   serialization; on ingest default it to the vertex's index
   timestamp, and treat `git blame` on the frontmatter line as the
   authorship record.** This is consistent with the whole git-first /
   readable-history thesis (the blame *is* the date signal) and keeps
   the common edge one line. Tier-2 visible default (index time),
   overridable by writing an explicit `date:`.

2. **Inferred-edge promotion (DISC-020 open).** **Decision:
   auto-materialize inferred edges, marked `discovered_via: inferred`.**
   Carrying the marker is the DP-001-correct move — the inferred edge
   is surfaced in `git diff`, visibly flagged as agent-suggested rather
   than laundered into authored fact, and the user promotes it (delete
   the marker) or rejects it (delete the line). Dropping inferred edges
   silently would be data loss; hiding their provenance would be
   laundering. Marked auto-materialize avoids both.

3. **`source` / `discovered_via` vocabulary drift (surfaced during
   grounding).** The declared unions (`EdgeSource = indexer | skill |
   human | agentic-pass`; `EdgeDiscovery = explicit | inferred`) do not
   match the values the reconciler actually writes (`source:
   "frontmatter"`, `discovered_via: "indexer"` — `reconcile.ts:261,434`).
   The one-tier collapse touches exactly this code, so the serializer's
   default-set can't be defined against the *declared* types alone.
   **Decision: reconcile the vocabulary as commit 1's first task** —
   pick one canonical set (recommend: `source ∈ {frontmatter, skill,
   human, agentic-pass}`, `discovered_via ∈ {explicit, inferred}`),
   update the type union and the reconcile writers together, and define
   the omit-when-default defaults against the reconciled set
   (`source=frontmatter`, `discovered_via=explicit`, `status=current`,
   `anchor_text=null` elide). Small, mechanical, but must precede the
   serializer or the defaults are guesswork.

## Estimated effort

**Serializer + edge fidelity (`src/engine/`):**
- Deterministic omit-when-default emitter replacing the plain
  `stringifyYaml` in `renderVertexFile` — ~90 LOC + a shared
  edge→YAML entry serializer reused by export and the write path.
- `reconcile.ts` de-scoping from `source == "frontmatter"` to
  all-edges + vocabulary reconciliation — ~60 LOC changed.
- Denormalized-column write in `unchangedForEdges` + write paths
  (FRICTION-015 fix) — ~30 LOC.

**One-tier write path:**
- `docdog_relate` / MCP edge write learns the edge→frontmatter
  materialization + re-export — ~100 LOC. Mirrors the existing
  `createVertexWithEdges` (FRICTION-011) rather than greenfielding;
  the shared "materialize-then-export vertex" helper factors out the
  export tail both directions share.
- DB-first-then-export wiring for `docdog create` / `docdog_update`
  (and `add`/`split` import helpers) reusing that helper — ~90 LOC
  (the create path's edge half already exists via
  `createVertexWithEdges`; this is the export-tail wiring).

**Clobber-guard:**
- `last_export_sha` field, set on export, checked before export;
  refuse-with-message path — ~60 LOC.

**Tests:**
- Round-trip determinism: export → re-export → zero diff; and
  `docdog index` accepts its own output unmodified — ~120 LOC.
- One-tier: create an edge via the relate path, assert it lands in the
  source frontmatter block AND survives a DB wipe + reindex — ~140 LOC.
- omit-when-default: terse edge stays terse; non-default fields
  written and re-defaulted losslessly — ~90 LOC.
- Clobber-guard: out-of-band edit → refuse; `index` then retry
  succeeds — ~80 LOC.
- FRICTION-015 regression: body-unchanged `status:` flip updates the
  denormalized column on incremental index — ~50 LOC.

**Total:** ~460 LOC core + ~480 LOC tests. Medium. Larger than
PROPOSAL-021 because it reworks the write path, smaller than
PROPOSAL-018 because it introduces no new subsystem.

## Implementation order

Three independently reviewable commits:

1. **Serializer + vocabulary + FRICTION-015.** Land the deterministic
   omit-when-default emitter, reconcile the `source`/`discovered_via`
   vocabulary, de-scope `reconcile.ts` to all edges, and fix the
   denormalized-column write. Verified by the round-trip determinism
   test and the FRICTION-015 regression. No behavior change to the
   write path yet — export just gets deterministic and edge-complete.
2. **One-tier write path.** Land the `docdog_relate` / MCP →
   frontmatter materialization + re-export, and the DB-first-then-export
   wiring for the vertex-writing commands, on the shared
   materialize-then-export helper. Verified by the one-tier
   survive-a-DB-wipe test.
3. **Clobber-guard.** Land `last_export_sha` + the refuse-on-mismatch
   check. Last because it guards a write path that only exists after
   commit 2.

Commit 1 is safe to land alone (pure serializer/reconcile hardening +
a friction fix); commits 2–3 are the actual flip. Can collapse 2 and 3
if diffs stay tight.

## Not in scope

- **`docdog eject` / ejected-mode kit** (DISC-019 OQ 4) — terminal
  state, follows the flip in a later proposal. Losslessness here is its
  precondition.
- **Chunking / paragraph-size embeddings** (DISC-019 Bet A) — orthogonal;
  measure retrieval quality first.
- **Shared remote Arango / `docdog remote`** (DISC-020 fork 1) —
  additive opt-in, future proposal; git-first is a complete substrate.
- **Targeted-delta reconcile engine** — `docdog index` full rebuild is
  the reconcile for MVP.
- **Auto-index-then-write clobber recovery** — deliberately starts as
  refuse (§5b); relaxing is a cheap Tier-2 follow-up if the manual step
  proves annoying.
- **DISC-018 nested-always migration** — a consequence noted in §8, not
  bundled into this proposal's commits.

## Status

Proposed. Folds DISC-019 + DISC-020 per DISC-019's explicit
fold-into-one recommendation. All design questions from both
discussions are resolved or pinned above — ready for implementation
once the user signs off on scope. Sequence note: PROPOSAL-021's export
command must be present (it is — `src/engine/export.ts`), since this
proposal extends that serializer rather than greenfielding it.
