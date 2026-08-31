---
id: DD-050
title: "Git-optional with a three-tier feature ladder"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-014 under DD-034's artifact-resilience lens. Core indexing is git-free; git awareness is additive; patches-convention is an optional tier on top for concurrent-branch workflows."
relationships:
  - supersedes: EJ-014
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-049
  - references: DD-051
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — tier 1 makes the artifact layer git-independent
  - references: RECON-001
    context: the reconciliation behind this decision's 2026-07-11 amendment — the dormant tier-3 pre-wiring (`git.patches` toggle, `.docdog/patches/` dir, `dd_patches` reserved entry) was removed from code
  - references: OQ-26
    context: "closed obsolete by the tier-3 amendment: dropping the `dd_patches` reserved collection entry removed the scope question OQ-26 was asking about"
  - references: DISC-026
    context: "the discussion that corrected this decision's tier-status claim and observed tier 3's trigger condition firing — git worktrees in agentic development are concurrent-branch authoring, and a relocatable content-addressed embed store is the candidate first real tier-2 feature"
---

# DD-050: Git-optional, three tiers

## Tier 1 — no git (always works)

The indexer reads the filesystem and compares content hashes against
what's already in Arango. Works on any branch, any worktree, and
outside git entirely. No git dependency in the core.

## Tier 2 — git awareness (optional, additive)

When `.git` exists and `git.enabled: true`, docdog can:

- Use `git diff` as a fast-path filter before hashing.
- Record which branch a vertex was indexed from.
- Know the canonical branch for authoritative artifacts.

## Tier 3 — patches convention (optional, on top of tier 2)

Task-branch agents can author patch proposals in `.docdog/patches/`
instead of rewriting specs directly. Patches are indexed as their
own collection with edges to the sections they would modify; search
can overlay them on canonical results while the task branch is
active. Merging applies them to specs and the indexer picks the
changes up on its next run.

## DD-034 check

Tier 1 is the posture that makes DD-034 possible at all: the
artifact layer doesn't depend on git to be readable. Tiers 2 and
3 are additive performance and ergonomics — they never compromise
the property that a vanilla agent can read `specs/` on disk without
docdog or git mediating.

## Current status

**Tier 1 only.** Tier 3 (patches) is a design sketch only — the
commitment stands for when concurrent-branch authoring becomes
load-bearing, but nothing pre-ships for it.

**Amendment (2026-07-14, DISC-026):** the previous claim here —
"tiers 1 and 2 are live" — was **stale**. It described the v2/Arango
era. Verified in v3: there is **not one git invocation anywhere in
`src/`**. No `git diff` fast path, no branch recorded on a vertex, no
canonical-branch awareness. Tier 2 is unbuilt, not merely unused.

The upside of that finding is that Tier 1 is true *by construction*
rather than by discipline: because the core cannot call git, it
cannot depend on it. A fresh `git worktree` indexes correctly with no
configuration, because `.docdog/config.yaml` is tracked and so every
worktree is its own project root.

**Tier 3's trigger condition has now been observed.** Agentic
development uses worktrees heavily, which *is* concurrent-branch
authoring. DISC-026 measured what it costs today (a cold index in a
fresh worktree: 604s vs 3.1s warm, entirely re-embedding byte-identical
content) and found the failure mode the tiers do not cover: concurrent
**id minting** across worktrees, which every existing guard misses
because each guard is scoped to a single cache.

The candidate **first real tier-2 feature** is a relocatable,
content-addressed embed store keyed off `git rev-parse
--git-common-dir` — git-*aware* without being git-*dependent*, with the
current `.docdog/cache/` path as the no-git fallback, so tier 1 keeps
working outside git entirely. See DISC-026.

**Tier 2 now exists (2026-07-14, PROPOSAL-029 shipped).** The "not one
git invocation anywhere in `src/`" finding above is superseded by
exactly one: `gitCommonDir()` in `src/storage/git.ts`, which resolves
the embed store's home. It is the whole of tier 2, and it is built the
way tier 2 has to be built — the call is wrapped so that no git binary,
no repository, or an exotic setup all return null and fall through to
the per-project path. Tier 1 therefore still holds *by construction*:
the core can call git, but it can never need to. Measured on this repo:
a fresh worktree's cold index went from 604s to **2.9s**, re-embedding
nothing.

**Amendment (2026-07-11, RECON-001):** the dormant tier-3 pre-wiring
was removed from code — the `git.patches` config toggle (typed,
defaulted, never read), `docdog init`'s `.docdog/patches/` directory,
and the `dd_patches` reserved collection entry (OQ-26 closed
obsolete). Old configs carrying `git.patches:` still load; the key
is tolerated and ignored like the other v2-era keys. Reviving the
convention is a new proposal that reintroduces its wiring
deliberately.
