---
id: DISC-032
title: "gc refuses on every git repo, and the thing it refuses to risk costs
  seconds: reachability, worktree counting, and why a created_at floor works
  where LRU cannot"
collection: discussions
status: resolved
date: 2026-07-20
retained_privately: docdog-discussions
relationships:
  - references: OBS-021
    context: the measurement this discussion started from — OBS-021 priced the
      growth and shipped the reporting half; this is the eviction half it
      deliberately deferred, reopened once the numbers made the risk legible
  - references: PROPOSAL-029
    context: "§5's refusal is the subject: correct in its reasoning about
      per-worktree liveness, wrong in its trigger, because resolveEmbedStorePath
      sets shared whenever gitCommonDir answers rather than whenever a sibling
      tree exists"
  - references: DD-070
    context: "§2's disposability is the load-bearing fact: it makes a wrong eviction
      a CPU bill rather than data loss, which is what demotes this from a safety
      question to a cost question"
  - references: DD-051
    context: the (content_hash, model) key is what makes the exposed set small —
      rows unused here but live elsewhere are exactly the content that differs
      between branches, not the whole orphan count
  - references: DP-001
    context: counting worktrees with git worktree list is tier 1 mechanics; printing
      the re-embed cost and letting a human decide is tier 2; deciding for them
      which branches deserve their vectors would be tier 3, which is why no
      design here evicts on inference
  - references: DISC-026
    context: the discussion that introduced the worktree seam and reasoned from a
      single-worktree repo; this one closes a gap that reasoning left — the
      refusal it motivated cannot tell the single-worktree case from the
      many-worktree case
---

# DISC-032: gc refuses on every git repo, and the thing it refuses to risk costs seconds: reachability, worktree counting, and why a created_at floor works where LRU cannot

**Retained privately.** The reasoning for this discussion is not part of
this repository — only its identity, its status, and its place in the
graph are. See DD-073 for why, and `docdog traverse DISC-032` for what it
connects to.
