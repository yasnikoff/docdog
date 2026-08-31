---
id: OBS-015
title: "PROPOSAL-029 measured on an adopter's corpus: a schema bump nobody chose to install migrated 792 vectors intact, and a fresh worktree cold-indexed in 11s with zero embeds"
collection: observations
status: current
date: 2026-07-14
commit_hash: fdb68c5
description: "The relocatable embed store, first exercised outside docdog's own repo. The orchestrator (9.5 MB corpus, 38 MB cache, 4 live worktrees) crossed the v2→v3 schema bump involuntarily — npm link plus a post-merge reindex hook — and the adoption carried all 792 vectors out of index.db before the drop, re-embedding nothing. A worktree that had never seen docdog then cold-indexed 344 files / 734 vertices in 11.1s with 0 embedded / 734 reused, and left the shared store at exactly 792 rows: on a full hit, the grow-only union write is a pure read. The adoption was free only because the repo already pinned eol=lf; the counterfactual is a full re-embed."
relationships:
  - references: PROPOSAL-029
    context: "this is its measurement, and the first one taken outside docdog's own repo — the proposal predicted the worktree win and the adoption path; both held on a corpus 2.5× larger and a cache 38 MB deep"
  - references: DISC-026
    context: "the discussion that surfaced the worktree problem reasoned from docdog's own single-worktree repo; the orchestrator turns out to run four at once, so the motivating scenario was real and under-stated rather than hypothetical"
  - references: DD-050
    context: "tier 2 (git-aware, optional, additive) taken out of the lab: git answered in an adopter's repo, including through a .worktrees/ layout nested inside the main working tree, and the tier-1 fallback was never needed"
  - references: DD-051
    context: "the (content_hash, model) key survived a checkout policy for the first time — the orchestrator's .gitattributes already pinned eol=lf, so LF-normalized hashing changed nothing and every adopted row still hit"
  - references: DD-070
    context: "§2's no-migrations rule tested where it actually bites: someone else's 38 MB cache was dropped and rebuilt without warning or consent, and it was survivable only because the expensive state had already moved out of the file that gets dropped"
  - references: OBS-013
    context: "same corpus, same adopter, one day later — OBS-013 measured what retrieval costs there, this measures what indexing costs there"
  - references: WF-002
    context: "dual-track dogfooding on the external track: the finding needed an adopter's repo to exist at all, because docdog's own repo has one worktree and a small cache"
---

# OBS-015: The worktree win, measured on someone else's repo

## What ran

PROPOSAL-029 shipped in docdog at `fdb68c5` on 2026-07-14. Later the
same day the orchestrator — the external dogfood repo, **9.5 MB corpus /
746 records / 2,154 edges / 38 MB `index.db`**, with **four live git
worktrees** — was found already migrated to it, and the payoff was
measured there.

Nobody ran an upgrade. The orchestrator's `.mcp.json` invokes bare
`docdog`, global `docdog` is an npm link into `E:\projects\docdog`, and
its `.husky/post-merge` hook runs `docdog index`. So rebuilding `dist/`
in docdog's repo *was* the upgrade, and the next merge in the
orchestrator *was* the migration.

## Numbers

**The adoption (main tree, involuntary):**

| | |
|---|---|
| `index.db` after | `schema_version: 3`, no `embed_cache` table, 746 vertices / 2,154 edges intact |
| `.git/docdog/embeddings.db` | created, **792 vectors, 3.6 MB** |
| Re-embedded | **0** |

792 > 746 because the adoption copies the old `embed_cache` wholesale,
including rows for content that has since changed. Grow-only, as
designed, and `gc` now refuses to sweep them (the store is shared).

**A fresh worktree (`TASK-162`, branch cut from develop after adoption,
never indexed):**

```
Embeddings: ...\.git\docdog\embeddings.db (shared across worktrees)
Cache: 344 file(s), 344 reindexed — 734 vertices upserted, 0 removed,
       2154 edges, 0 embedded (734 reused)
real 0m11.1s
```

The embedder never loaded. The 11 seconds is parsing, FTS build, and
writing its own 31.8 MB branch-scoped `index.db`. Hybrid search then
answered from that worktree with a live vector leg (`vector=0.689` on
the requirement its branch implements), so the reused vectors resolve —
reuse of unusable rows would prove nothing.

Docdog's own repo, for scale: **604s → 2.9s**, 281 embedded → 0.

## Three things worth keeping

**1. On a full hit, the union write is a pure read.** The store held
792 rows before the worktree index and 792 after. `INSERT OR IGNORE`
against an already-present key writes nothing — which is what makes two
worktrees indexing at once safe, and it is now observed rather than
argued.

**2. The adoption was free only because the repo already pinned
`eol=lf`.** The orchestrator's `.gitattributes` has `* text=auto
eol=lf` and its markdown is LF on disk, so the new LF-normalized hashing
(`engine/discovery.ts`) left every hash unchanged and all 792 adopted
rows still hit. Docdog's own repo did **not** have that file and had to
add it — under `core.autocrlf=true` its worktree checkouts held CRLF
where the trunk held LF, and the hashes silently diverged. Two repos,
two outcomes, one file between them. An adopter upgrading without
`eol=lf` pinned pays a one-time re-embed of every CRLF file and will
have no idea why.

**3. The "nuke the cache" reflex now has an ordering constraint.**
Adoption reads `embed_cache` out of the *old* `index.db` before the
schema bump drops it. Delete `.docdog/cache/` before the first
new-version index and the vectors are gone for good. `index.db` stays
cheap to delete — *after* that first run. `embeddings.db` is now the
expensive file, and it is the one that doesn't live under `.docdog/`.

## The gap the win exposes

Three of the orchestrator's four live worktrees **cannot be indexed at
all**: their branches were cut before `.docdog/config.yaml` landed on
develop (`5b850c83`, 2026-07-13), so they have no docdog config in the
tree. Worktree reuse only pays for branches cut after adoption.

This is disk-canonical config working as intended (DD-070) rather than a
defect — the config *should* be in the tree — but it is the shape of
thing an adopter hits and blames on the tool: they merge develop, get
the feature, open their existing worktrees, and it doesn't work there.
Worth saying out loud in adoption docs rather than discovering per
branch. Not filed as friction: there is no code change that would fix
it without making the config non-canonical.
