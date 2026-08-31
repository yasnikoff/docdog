---
id: PROPOSAL-031
title: "docdog renumber + contested ids in status — the promotion primitive and the residue report"
collection: proposals
status: shipped
date: 2026-07-14
description: "Two mechanics that let a host project run any provisional-id scheme without docdog knowing what a branch is. `docdog renumber <old> <new>` rewrites a record's id, its filename, and every inbound edge — exactly, from the cache's edges.to_id index rather than by guessing — and reports prose mentions it will not silently rewrite. Contested ids stop scrolling past as an index-time warning and become queryable state in the existing `docdog_status` tool, which finally answers OQ-43's open half without a registry and without a new tool."
relationships:
  - references: DISC-027
    context: "the discussion that authorized exactly these two mechanics and no more — the namespace convention and the promotion policy stay with the host project, so docdog ships only the rename and the report"
  - references: OQ-43
    context: "answers its open half: duplicates become queryable state through the existing status tool, and the registry it was leaning toward is rejected for good — detection is mechanics, resolution is judgment"
  - references: DP-001
    context: "tier walk: rewriting an exact id token and reporting duplicate claims is tier-1 mechanics, while deciding WHICH of two contested records keeps the id is judgment the report hands back to the agent"
  - references: PROPOSAL-024
    context: "the read-only report shape being reused — report the residue, never resolve it; and its mention scanner is what finds prose references renumber must surface"
  - references: PROPOSAL-028
    context: "the write discipline this reuses — all patches computed in memory before any file is opened, one write plus one reindex per file, so a broken file mid-batch cannot half-rename the corpus"
  - references: DD-070
    context: "the MCP kernel 8 is untouched — contested ids ride the existing docdog_status tool rather than adding a ninth; only the CLI grows, by one command"
  - references: OQ-46
    context: "the limit on the prose half — a slash-list mention like OQ-18/19/21 cannot be rewritten by token substitution when only one sibling is renamed, so renumber reports it for manual repair"
  - references: FRICTION-012
    context: "why inbound-edge rewriting is exact rather than heuristic — the forward-edge-only rule means every reference to an id is a real row in edges.to_id, with no stored inverses to chase"
---

# PROPOSAL-031: `renumber` + contested ids in `status`

## Motivation

DISC-027 settled that a host project can run a collision-proof
provisional-id scheme (partition the space by the branch/task identity it
already allocated under coordination) **without docdog knowing what a
branch is**. Two mechanics are all docdog owes that scheme:

1. **Promotion** — turn `DD-T168-01` into `DD-072` and fix everything that
   pointed at it. Today this is a hand-rolled find-and-replace, and it is
   the one step where a provisional-id scheme can silently lose edges.
2. **Detection** — when a duplicate id *does* land (a hand-authored file,
   a merge nobody checked, two integration writers racing), nothing
   queryable records it. The indexer warns, the warning scrolls past, and
   an agent reading the cache sees only the last-indexed winner with no
   signal the loser exists. That is OQ-43's open half, still open.

Neither requires docdog to learn about git, branches, or tasks.

## Design

### 1. `docdog renumber <old-id> <new-id>`

```
docdog renumber DD-T168-01 DD-072 [--dry-run] [--prose] [--rename-file]
```

**What it rewrites, exactly:**

| target | how | certainty |
|---|---|---|
| the record's own `id:` | frontmatter surgery (`setFrontmatterField`) | exact |
| **inbound edges** in other records' `relationships:` | from the cache's `edges` table, indexed on `to_id` | **exact** — these are indexed rows, not a text search |
| the file name (`dd-t168-01-*.md` → `dd-072-*.md`) | opt-in, `--rename-file` | exact |
| prose mentions in bodies | the `suggest-edges` mention scanner | **reported, not rewritten** unless `--prose` |

The inbound-edge half is the part docdog is uniquely able to get right.
`edges.to_id` is an indexed column, and FRICTION-012's forward-edge-only
rule guarantees every reference to an id is a real row there with no stored
inverses to chase. So renumbering cannot miss an edge — a hand-rolled
`sed` absolutely can.

**Guards:**

- Refuse if `<new-id>` already exists — the same `ID_CONFLICT` guard
  `docdog_create` uses.
- Refuse if `<old-id>` is unknown to the cache.
- Refuse on a record docdog cannot patch (split/table/script-parsed
  sources — the existing writes restriction).
- `--dry-run` prints the full plan: every file, every edge, every prose
  hit.

**Write discipline** follows PROPOSAL-028: every patch is computed in
memory *before any file is opened for writing*, then applied one write plus
one reindex per file. A malformed file discovered mid-run cannot leave the
corpus half-renamed.

**Why prose is opt-in.** An id is an exact token, so substituting it is
unambiguous *in the ordinary case* — but not in all cases. A slash-list
mention (`OQ-18/19/21`) names three ids in one token, and renaming only
`OQ-19` cannot be expressed by substitution without restructuring the
sentence. So `renumber` **reports every prose mention with its location**,
rewrites the unambiguous ones under `--prose`, and always leaves
slash-list mentions for a human. See OQ-46.

### 2. Contested ids become queryable state

The indexer already detects cross-file duplicate ids and warns with both
paths (last indexed wins). That detection is correct and stays. What
changes is that it **persists**.

- The indexer records each contested id — the id, the competing file
  paths, which one won — into the cache.
- **`docdog_status` reports them.** No ninth MCP tool: status is already
  the kernel's health surface, and "two files claim DD-072" is exactly
  health.
- `docdog index` keeps printing the warning; it simply stops being the
  *only* place the fact exists.

**Resolution is not automated.** The report names the contenders; an agent
decides which record keeps the id and runs `renumber` on the other. Picking
a winner is judgment (DP-001 Tier 3) and must never be inferred — which is
precisely why `renumber` and the report are designed as two halves of one
loop rather than one clever command.

## Principles walk

- **DP-001.** Rewriting an exact token and reporting duplicate claims are
  Tier-1 mechanics. The single judgment in the whole loop — *which* of two
  contested records deserves the id — is handed back to the agent, never
  guessed. The prose half refuses precisely where substitution stops being
  mechanical.
- **OQ-43.** Answered, and the registry rejected for good: detection is
  cheap and belongs in code; prevention belongs in the id *scheme*
  (DISC-027's partitioning); resolution belongs to the agent.
- **DD-070 §4.** MCP kernel 8 untouched — contested ids ride `docdog_status`.
  The CLI grows by one command, argued rather than assumed.
- **DD-050.** Nothing here calls git. `renumber` works on a plain
  directory, outside a repo, exactly like the rest of Tier 1.
- **DISC-027.** Docdog learns no policy. It does not know what `T168`
  means, cannot tell a provisional id from a canonical one, and does not
  care — it renames what it is told to rename.

## Deliberately not in scope

- **Allocating the new id.** `renumber` is told the target. *Which* id is
  next free is the host project's counter to bump (and on trunk, where
  that is safe).
- **Knowing that an id is provisional.** No `provisional: true` flag, no
  namespace config. Docdog would gain nothing mechanical from the
  knowledge, and DISC-027 keeps that policy outside.
- **Auto-resolving contested ids.** Tier 3. Forever.
- **Bulk renumbering.** One id at a time until someone needs otherwise
  (DP-003).

## Touched surface

| file | change |
|---|---|
| `src/cli/commands/renumber.ts` | **new** — the command: plan, guard, apply, report |
| `src/storage/renumber.ts` | **new** — pure planner: given a cache + old/new id, produce the exact set of file patches and the prose-mention report |
| `src/storage/writes.ts` | reuse `relateManyFileFirst`'s grouped write path for the per-file edge patches |
| `src/storage/schema.ts` | a small `contested_ids` table (or a `meta` JSON blob) populated by the indexer; `SCHEMA_VERSION` bump — free once PROPOSAL-029 lands, since embeddings no longer live in the file that gets dropped |
| `src/storage/indexer.ts` | persist the duplicate-id detection it already performs |
| MCP `status` handler | report contested ids |
| tests | inbound-edge rewrite exactness; ID_CONFLICT and unknown-id guards; dry-run plan; prose mention reporting incl. the slash-list refusal; contested-id persistence + status surfacing |

## Note on ordering

The `SCHEMA_VERSION` bump this needs is a good argument for landing
PROPOSAL-029 first: today a bump wipes `embed_cache` and bills every user a
full re-embed (604s on this corpus). Once the embed store is its own file,
schema bumps are free — and this proposal stops carrying that cost.

## As shipped (2026-07-14)

Implemented as designed: `src/storage/renumber.ts` (planner + apply +
`readContestedIds`), `src/cli/commands/renumber.ts`, `contested_ids` at
`SCHEMA_VERSION` 4, persisted by the indexer, rendered by both `status`
surfaces. 328 tests (+15). The MCP kernel is untouched; the CLI grew by one
command.

**The ordering bet paid, measurably.** This was the first schema bump since
PROPOSAL-029 relocated the embed store. It cost a full reindex of 290 files
in **2.0 seconds, 0 embedded, 290 reused** — against the 604s re-embed the
same bump would have billed before. The claim "bumps are free now" is no
longer a prediction.

Four things the design did not know:

1. **Prose is whatever survives the exact half.** Rather than scanning for
   mentions and then subtracting the structural hits, the planner computes
   the id rewrite and the edge retargets *first*, in memory, and scans the
   patched text for what still names the old id. Double-counting becomes
   impossible by construction — and it fell out for free that an id sitting
   in an edge's `context:` string is *prose* (the target moved; the sentence
   about it did not). That is the correct answer, and no rule had to be
   written to get it.

2. **`--file` is load-bearing, not a convenience.** The contested *loser*
   has no cache row — that is what losing means — so it cannot be addressed
   by id at all, and the loop DISC-027 designed would not have closed
   without a way to name the file. In that mode inbound edges are
   deliberately **not** rewritten: they resolve to the record that kept the
   id, and deciding which citer meant which record is exactly the judgment
   this proposal refuses to make (DP-001 Tier 3). They are reported instead.

3. **A file name is renamed only when it *derives* from the id.**
   `dd-t168-01-cache.md` → `dd-072-cache.md` is mechanical; a name that does
   not begin with the old id's slug is a convention docdog does not own, so
   `--rename-file` reports and leaves it. The guard cost one line and keeps
   Tier 3 out of the file system.

4. **`contested_ids` is recomputed from the whole parse, not from the
   diff.** `parsedFiles` holds every discovered file's sections whether or
   not it was reindexed, so the table rebuilds cleanly on any corpus-wide
   run and heals itself the moment a duplicate is resolved. A path-scoped
   run (`--path`, or the single-file reindex every write performs) leaves it
   alone rather than reporting a truth it only half-knows — the same
   discipline FRICTION-022 taught the ghost sweep.
