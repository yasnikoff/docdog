---
id: PROPOSAL-029
title: "A relocatable, content-addressed embed store — take the expensive half of the cache out of the branch-shaped file"
collection: proposals
status: shipped
date: 2026-07-14
description: "Split `embed_cache` out of `index.db` into its own SQLite file whose location resolves to the git common dir when git is present, so every worktree of a clone shares one embedding store. Measured payoff: a fresh worktree's cold index drops from 604s to ~3s, because 100% of that time is re-embedding byte-identical content. Writes become `INSERT OR IGNORE` (union), making the store a grow-only set — shareable, importable, and immune to `SCHEMA_VERSION` bumps. Search is untouched: vectors live in `chunks.embedding`; embed_cache is only a reuse cache. DD-050's first real Tier-2 feature: git-aware, never git-dependent."
relationships:
  - references: DISC-026
    context: "the discussion that produced this — its general theory (grow-only sets union; the sequential id counter does not) makes the embed store the first and cheapest corollary to cash in"
  - references: DD-051
    context: "content-hash keying was already the right design; this proposal finally stores it where its own semantics point — a table keyed by content has no business living inside a file scoped to a branch"
  - references: DD-050
    context: "the first real tier-2 feature: the single `git rev-parse --git-common-dir` call is optional and falls back, so tier 1 (works on any worktree, outside git entirely) survives by construction"
  - references: DD-070
    context: "§2's cache contract is preserved, not weakened — the embed store stays derived, disposable and untracked; and the kernel 8 is untouched (no new MCP tool, no new CLI subcommand)"
  - references: DP-001
    context: "tier walk: path resolution is pure mechanics and the resolved default is printed, so the one judgment (should embeddings be shared?) stays with the user as config rather than being inferred in code"
  - references: DP-003
    context: "clause 3 is why gc's age-based eviction and an embedding-pack export/import are deliberately NOT built here — neither has reached the instantiation count that authorizes a tool"
  - references: OBS-013
    context: "the adoption-scale reading of the same measurement — at ~2.1s/record a 9.5MB corpus faces a first index measured in hours, so this is the onboarding and CI fix as much as the worktree fix"
  - references: DD-034
    context: "untouched — nothing changes about what a vanilla agent reads on disk in specs/; this is entirely a cache-locality change"
  - amends: PROPOSAL-023
    context: "§2's one-file layout: the embed cache left index.db for a clone-shared embeddings.db"
---

# PROPOSAL-029: A relocatable, content-addressed embed store

## Motivation

Measured on this repo, 2026-07-14 (264 corpus files / 1.2 MB), by
creating a throwaway detached worktree and indexing it:

| | time | embeddings |
|---|---|---|
| main tree, warm reindex | **3.1s** | 281 reused, 0 embedded |
| fresh worktree, cold index | **604.3s** | 0 reused, **281 embedded** |

The entire ~200x delta is embedding, and **all of it is waste**. A
worktree cut from the same HEAD has byte-identical content, therefore
byte-identical content hashes, therefore the vectors already exist —
in a SQLite file three directories away. They are unreachable for
exactly one reason: `embed_cache` is a *content*-addressed table
living inside `index.db`, a *branch*-addressed file that is gitignored
and per-project-root.

Two more costs fall out of the same misplacement:

- **A `SCHEMA_VERSION` bump wipes every embedding.** The cache drops
  all tables on version mismatch (DD-070 §2: no migrations, ever) —
  and `embed_cache` is one of them. So any future schema change bills
  every user 10 CPU-minutes, for a table whose contents are entirely
  independent of the schema that changed.
- **First-index cost at adoption scale.** ~2.1s/record is intrinsic to
  onnx-on-CPU (the embed call is already batched; there is no easy
  constant-factor win). Against the 9.5 MB corpus in OBS-013, a first
  `docdog index` plausibly runs over an hour.

## Design

### 1. The split

`embed_cache` leaves `index.db` and becomes its own SQLite file,
`embeddings.db`, with its own schema and its own version constant.
`index.db` drops the table; `CACHE_TABLES` loses `embed_cache`;
`SCHEMA_VERSION` bumps to 3 — which is now *cheap*, because the
expensive state no longer lives in the file that gets dropped.

**Search is untouched.** Vectors are read from `chunks.embedding`;
`embed_cache` is purely a reuse cache consulted by the indexer. No
change to search, get, traverse, or any MCP tool's behavior.

### 2. Location resolution — a visible default with an override

First match wins:

1. `embed.cache_path` in `config.yaml` (absolute, or relative to the
   project root) — explicit override.
2. `<git-common-dir>/docdog/embeddings.db`, when `git rev-parse
   --git-common-dir` succeeds.
3. `<projectRoot>/.docdog/cache/embeddings.db` — today's home, and the
   no-git fallback.

The resolved path is **printed** by `docdog index` and reported by
`docdog_status`. A default that relocates state must be visible, or it
is not a default — it is an inference (DP-001).

Why the git common dir is the correct home, verified from inside the
probe worktree:

```
git rev-parse --git-common-dir  ->  E:/projects/docdog/.git                     (shared)
git rev-parse --git-dir         ->  E:/projects/docdog/.git/worktrees/wt-probe  (private)
```

Git hands us the shared location for free and distinguishes it from
the per-worktree one. A store there is:

- **shared by every worktree of the clone, by construction** — no copy
  step, no sync, and work done in one worktree speeds up its siblings
  *and* the trunk;
- **outside every working tree** — it can never be tracked, never
  appears in a diff, and needs no `.gitignore` entry;
- **repo-lifetime** — it dies when the clone dies.

This is the **only git invocation in the codebase**. It is wrapped so
that any failure — no git binary, not a repository, a detached or
exotic setup — falls through to (3). DD-050 Tier 1 therefore survives
by construction: the core still cannot depend on git, because it can
still run without it.

### 3. Write semantics: union

`INSERT OR IGNORE` replaces `INSERT OR REPLACE`.

For any `(content_hash, model)` key, every writer that computes it
computes the same value — and where hardware or runtime differences
perturb the low float bits, *any* of those values is equally correct,
because the value is a similarity vector, not an identity. First
writer wins is therefore safe, and it makes the store a **grow-only
set**: conflict-free, mergeable by union, importable.

Concurrency needs no new work. `cache.ts` already sets WAL and
`busy_timeout` at every open, with the header comment calling this
"the multi-session reality" — a shared store is precisely that case.
Two worktrees indexing simultaneously contend benignly, and idempotent
writes make a lost race a no-op rather than a corruption.

### 4. One-time adoption of existing rows

On the first open of a fresh `embeddings.db`, if the project's
`index.db` still carries an `embed_cache` table with rows, `ATTACH`
and copy them across with `INSERT OR IGNORE`. One-time, mechanical, no
user action.

This is not a migration in the sense DD-070 §2 forbids — nothing is
being *preserved* that could not be recomputed. It exists solely so
that shipping this does not gratuitously bill every existing user ten
CPU-minutes.

### 5. `docdog gc` — a semantic that must change

> **Reversed by DISC-032, shipped with OBS-026 (2026-08-27).** The refusal
> below fired on every git project, including single-worktree ones, so `gc`
> was unreachable rather than careful. `gc` now sweeps the shared store
> against the *union* of every worktree's liveness (`git worktree list` →
> each tree's `index.db`). It VACUUMs after any deletion and never evicts
> rows younger than `embed.retain_days` (default 7). That floor is not the
> age-based *eviction* this section rules out: it only ever declines to call
> a young row dead. `docdog index` also runs the sweep itself
> (`embed.auto_gc`). The "gc refuses" line under Implementation is historical
> for the same reason.

`gc` today evicts `embed_cache` rows whose content hash matches no
live vertex. **On a shared store that test is wrong**: a row unused in
*this* worktree may be in active use by a sibling worktree or by the
trunk. Liveness is per-tree; the store is not.

Proposed for v1: when the resolved store is shared (case 2, or an
explicit path outside the project root), `gc` **refuses the liveness
sweep and says why**. On the fallback per-project store (case 3) it
behaves exactly as today.

Age-based eviction (`--older-than`, requiring a `last_used_at` column
touched on hit) is the semantically correct sweep for a shared store —
but it is deliberately **not built here**. The store is ~8 MB at this
corpus size; size pressure is hypothetical, and DP-003 clause 3 says
the tool comes after the instantiations, not before them.

## Principles walk

- **DP-001 — agent-first mechanics.** Tier 2 (visible default with
  override). Path resolution is arithmetic on paths; nothing infers
  intent, nothing auto-categorizes. The single judgment — *should this
  project share embeddings across worktrees?* — is surfaced as config
  with a printed resolved default, not silently decided in code.
- **DD-050 — git-optional ladder.** The first real Tier-2 feature.
  Git-*aware*, never git-*dependent*: one optional call, always with a
  fallback. Also the amendment's point — Tier 2 was unbuilt, not
  merely unused; this builds it.
- **DD-070 §2 — the cache contract.** Preserved. The embed store is
  still derived, still disposable, still untracked; deleting it is
  still always safe (it just costs 10 minutes). Living under `.git/`
  makes it *more* untrackable, not less.
- **DD-070 §4 — the kernel 8.** Untouched. No new MCP tool, no new CLI
  subcommand. `docdog_status` gains a reported path; that is all.
- **DD-051 — content-hash embed keying.** This proposal changes none
  of its semantics; it moves the table to the file its semantics
  always implied.
- **DD-034 — artifact resilience.** Untouched. Nothing changes about
  what a vanilla agent reads on disk.

## Deliberately not in scope

- **Committing vectors to git.** Binary churn would bloat history
  permanently and break DD-070 §2's disposability. Union semantics
  make an *out-of-band* pack (CI cache, release asset) the right shape
  when cross-machine transfer is actually needed — a later proposal,
  with real evidence behind it.
- **An embedding pack export/import command.** Zero instantiations so
  far (DP-003).
- **Age-based gc eviction.** See §5.
- **The union merge driver for `relationships:`** (DISC-026 corollary
  2) — a separate Tier-2 feature, and a separate proposal.
- **The id allocator** (DISC-026 corollary 1) — needs its own
  discussion first.
- **Making the read surface self-rebuild on a missing cache.** The
  hard `SEARCH_ERROR` is correct behavior; this proposal simply makes
  obeying it ~200x cheaper.

## Touched surface

| file | change |
|---|---|
| `src/storage/schema.ts` | drop `embed_cache` from `SCHEMA_DDL` + `CACHE_TABLES`; bump `SCHEMA_VERSION` to 3 |
| `src/storage/embed-store.ts` | **new** — resolve path, open (WAL + busy_timeout), get/put with `INSERT OR IGNORE`, one-time adopt from `index.db` |
| `src/storage/git.ts` | **new**, tiny — `gitCommonDir(projectRoot): string \| null`. The only git call in the codebase; never throws |
| `src/storage/indexer.ts` | `resolveEmbeddings` reads/writes the embed store handle instead of the index db |
| `src/cli/commands/gc.ts` | refuse the liveness sweep on a shared store, with an explanatory message |
| `src/cli/commands/index-cmd.ts` | print the resolved store path |
| `src/types/config.ts` | `EmbedConfig` gains `cache_path?: string \| null` |
| MCP `status` handler | report the resolved store path and whether it is shared |
| tests | path resolution (git / no-git / explicit override); union write; one-time adoption copy; two project roots sharing one store |

## Expected effect

| | before | after |
|---|---|---|
| fresh worktree, cold index | 604s | **~3s** (all 281 lookups hit) |
| `SCHEMA_VERSION` bump | full re-embed for every user | **free** |
| fresh clone / CI | cold | unchanged — the pack export is the future answer |

## Implementation (2026-07-14 — shipped)

Shipped as designed: `embed_cache` left `index.db` (`SCHEMA_VERSION` 3),
`src/storage/embed-store.ts` owns the file and its own version constant,
`src/storage/git.ts` holds the one git call, writes are `INSERT OR
IGNORE`, the one-time adoption copies the legacy table across, `gc`
refuses the liveness sweep on a shared store, and the resolved path is
printed by `docdog index` and reported by `docdog_status`. 281 tests
(+17). The kernel 8 is untouched.

**Measured on this repo, after shipping** — the fresh-worktree number the
proposal was written for:

| | before | after |
|---|---|---|
| fresh worktree, cold index (287 files) | 604.3s / 281 embedded | **2.9s / 0 embedded, 287 reused** |
| main tree, first index after the split | — | 6.6s, **305 legacy vectors adopted**, 0 embedded |

### One thing the design got wrong: the key was not EOL-agnostic

The design's premise — "a worktree cut from the same HEAD has
byte-identical content, therefore byte-identical content hashes" — is
**false under `core.autocrlf=true`**, which is set globally on this
machine and in this repo. Git converts on checkout, so a fresh worktree
holds CRLF where the trunk (whose files were written by editors and
agents, not by a checkout) holds LF. Verified directly: `CONTRIBUTING.md`
in a probe worktree and in the trunk have different md5s.

The store would therefore have been built, shared, correctly located —
and would have missed on every single lookup, re-embedding the whole
corpus exactly as before, with nothing to indicate why. The feature would
have looked shipped and done nothing.

The fix is one line in `src/engine/discovery.ts`: normalize line endings
to LF on read, before anything is hashed, parsed, embedded or stored.
Every derived artifact (content hash, file hash, `body_text`, FTS, embed
input) becomes EOL-agnostic; disk is never touched. It is pure mechanics
(DP-001 tier 1) and it amends DD-051's key definition, which is recorded
there. Cost on this corpus: 7 records re-embedded once (the 8 files that
happened to be CRLF on disk).

The general lesson is worth more than the fix: **a content-addressed
cache is only as good as its definition of "same content"**, and a
version-control system that rewrites bytes on checkout is exactly the
thing that breaks that definition — in the one scenario (worktrees) the
cache was built to serve. The regression test now runs its git repo with
`core.autocrlf=true` on purpose.

### Other notes from the build

- **The store opens before the cache.** The §4 adoption reads
  `embed_cache` out of `index.db`, and opening the cache at
  `SCHEMA_VERSION` 3 is what drops it — so the order is load-bearing, not
  incidental.
- **`gc`'s liveness test now spans two files** and is resolved in memory
  (live hash set from `vertices`, rows from the store) rather than by a
  join. It keeps the store free of any dependency on the cache's schema,
  which is the whole point of the split.
- **`docdog_status` never creates the store.** An absent store is a state
  to report ("not created yet"), not a file for a read surface to write.

## Open sub-questions

1. **gc on a shared store** — refuse-and-explain (proposed) versus
   shipping age-based eviction now. Leaning refuse: no one has a size
   problem yet.
2. **A per-machine store** (`~/.cache/docdog/embeddings.db`) is already
   reachable through `embed.cache_path`. Should it also get a named
   mode (`embed.share: project | repo | machine`)? Leaning no — ship
   the path, add the vocabulary only if someone asks twice.
3. **Model in the filename** (`embeddings-<model>.db`) versus staying a
   column in the primary key. Leaning column: the PK already covers it,
   a model switch already misses cleanly, and one file is simpler to
   share.
