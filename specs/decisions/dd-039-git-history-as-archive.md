---
id: DD-039
title: "Git-history-as-archive for extended context"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-003 under DD-034's artifact-resilience lens. Extended context (conversations, agent-generated docs) lives in git history — committed then deleted from the worktree."
relationships:
  - supersedes: EJ-003
    context: "mirror under DD-034's artifact-resilience lens"
  - references: EJ-014
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check (compatible — worktree stays the source of truth)
---

# DD-039: Git-history-as-archive for extended context

The Orchestrator worktree stays clean with summarizing documents.
Extended context (full conversations, agent-generated docs,
requirement evolution) lives in git history — committed then
deleted from the worktree, same pattern already used for task
folders. Optional external source for supplementary context, but
the Orchestrator must be self-sufficient without it.

## Rationale

Pattern already proven in the Orchestrator's task workflow. Avoids
repo bloat in the worktree while preserving history for deep
dives. External context is a bonus, not a dependency.

## DD-034 check

Orthogonal — with a caveat. DD-034 says the on-disk worktree is
the source of truth. Git-history-as-archive is compatible because
the *current* worktree is still the authoritative read surface
for a vanilla agent; history is a recovery path, not a required
lookup step. Do not let archived material become load-bearing for
current work — if it matters, promote it back into `specs/`.
