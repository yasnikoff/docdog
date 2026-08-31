---
id: DISC-026
title: Git worktrees and docdog — the cache splits along a branch/content seam,
  and the expensive half is conflict-free
collection: discussions
status: open
date: 2026-07-14
retained_privately: docdog-discussions
relationships:
  - references: DD-050
    context: the ladder this discussion instantiates — Tier 1's 'works on any
      worktree' claim verified true (zero git invocations in src/), Tier 2's
      'live' claim found stale, and Tier 3's stated trigger condition ('when
      concurrent-branch authoring becomes load-bearing') observed firing
  - references: DD-051
    context: content-hash embed keying is the property that makes the expensive half
      of the cache mergeable — the workaround for 'caches do not merge' was
      already designed in, just stored in the wrong file
  - references: DD-070
    context: §2's cache contract (gitignored, disposable, per-project-root) is
      exactly what makes a worktree start cold; the fix must not weaken it — the
      embed store stays disposable and untracked, it just moves out of the
      branch-shaped file
  - references: OQ-43
    context: worktrees add a failure mode its v3 reframe cannot cover — every guard
      it names (vertices.id PK, indexer LWW warning, docdog_create's
      ID_CONFLICT) is scoped to a single cache, so two worktrees minting the
      same id both succeed and collide only at merge
  - references: DP-001
    context: the tier walk on the proposed fix — a relocatable content-addressed
      store is Tier 2 (visible default with override); no inference, no judgment
      pushed into code
  - references: FRICTION-012
    context: the inverse-edge rule keeps the concurrent-authoring merge surface
      small — one relationship, one edge, in the direction the source asserts
      it, so a new edge touches one file rather than two hub files
  - references: OBS-013
    context: the adoption-scale reading of the same measurement — at 2.1s/record,
      that 9.5MB corpus faces a first index measured in hours, making the
      shared/importable embed store an onboarding and CI story, not only a
      worktree one
  - references: RECON-001
    context: removed DD-050's dormant tier-3 pre-wiring three days before this
      discussion; reviving the convention is a new proposal, exactly as DD-050
      prescribed
  - references: WF-002
    context: this discussion is a dogfooding instance — the numbers below came from
      actually creating a throwaway worktree and indexing it, not from reasoning
      about the code
  - references: DD-034
    context: the constraint that rules out the obvious edge-merge fix — edges cannot
      move to sidecar files to dodge YAML conflicts, because the relationships
      block lives in the record precisely so a vanilla agent reading specs/ on
      disk sees it; the merge driver unions the block in place instead
  - references: PROPOSAL-029
    context: the first concrete output of this discussion — the relocatable
      content-addressed embed store, which is the measured half of the worktree
      cost
---

# DISC-026: Git worktrees and docdog — the cache splits along a branch/content seam, and the expensive half is conflict-free

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-026` for what it
connects to.
