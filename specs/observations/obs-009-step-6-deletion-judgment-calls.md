---
id: OBS-009
title: "Step-6 deletions ran clean; the session's three judgment calls and why each went the way it did"
collection: observations
status: current
date: 2026-07-11
description: "P-023 §7 step 6 (the v3 deletion pass — src/arango, src/workflow, Docker suite, CLI/MCP prune) executed as six green commits with no rework. Three calls the handoff left open got decided: meta tools deleted rather than retargeted (search over concepts records covers the need), the WF-004 role-skill suite deleted rather than rewritten (workflow-engine residue per DD-066), and docdog skill kept by retargeting its discovery to the cache (non-core FR-001 feature serving the docs-delivery mission)."
relationships:
  - references: DD-070
    context: "the umbrella decision whose §3 kill list this session executed"
  - references: PROPOSAL-023
    context: "step 6 of its §7 implementation order; flipped to implemented at session end"
  - references: DD-066
    context: "the memory-layer-not-workflow-engine principle that decided the role-skill suite's fate"
  - references: FR-001
    context: "its core list was amended per DD-070 §4, and its non-core pattern kept docdog skill alive"
  - references: OBS-008
    context: "prior observation that already flagged the role skills as an uncaptured workflow living in skill prose"
  - references: DP-002
    context: DD-070 §9's searchability-preservation argument verified live against re-seeded concept records
  - references: WF-001
    context: workflow documents WF-001..006 named as the surviving process home after the skill deletions
  - references: DD-051
    context: gc eviction contract verified compatible with DD-051's cache-reuse contract — no TTL machinery
  - references: OQ-26
    context: flags OQ-26 (dd_patches fate) as still open after the deletion pass
---

# OBS-009: Step-6 deletion judgment calls

## Context

V3 session 6 executed P-023 §7 step 6 — delete everything DD-070 §3
killed. Six commits, each leaving lint + tests green: config-helper
relocation, MCP prune, CLI prune, the dead-tree deletion
(−11,687 lines), the skill prune (−3,051 lines), and the docs pass.
`npm test` went from Docker-required to 204 Docker-free tests; arangojs
left the dependency tree; `docdog init` produces an Arango-free,
version-free config while v2-era configs still load.

## The three judgment calls

The handoff left three either/or decisions open. What got decided,
and why:

1. **Meta tools: deleted, not retargeted.** `docdog_collections_*`,
   `docdog_relations_*`, and `docdog_concepts_search` could have been
   re-pointed at the cache's concepts rows. Deleted instead: DD-070 §3
   kills meta tools beyond the kernel by name, and DD-070 §9's own
   DP-002 walk argues searchability is preserved because the re-seeded
   concept records are ordinary indexed markdown. Verified live —
   `docdog search "supersedes relation"` returns
   CONCEPT-RELATION-SUPERSEDES with its when-to-use text, which is
   exactly what `docdog_relations_describe` used to answer.
   `docdog_relate`'s unknown-type warning now points at searching the
   concepts collection.

2. **Role-skill suite: deleted, not rewritten.** start-task, coder,
   architect, reviewer, finalize-task (and feature-matrix) died from
   both `templates/skills/workflows/` and this repo's live
   `.docdog/skills/`. Their mechanics were unsalvageably v2
   (`_id: "features/<key>"` handles, `edge_collections` args, DB-first
   status flips, render-matrix refreshes), and — the deeper reason —
   they encoded a task-execution process into shipped scaffolding,
   which is workflow-engine residue DD-066 rejects and OBS-008 had
   already flagged as an uncaptured workflow. Process substance stays
   in workflow documents (WF-001..006, example-workflow-seed). The
   document-shaped skills (ejection-resilience, task-frontmatter,
   example-workflow-seed, the _common five) survived with their
   mechanics rewritten to v3 (record ids, `type:`, path-carrying
   `docdog_create`, file-then-index deletion).

3. **`docdog skill`: kept, retargeted.** Not on DD-070 §4's CLI list,
   but also not on §3's kill list. Kept because it is a non-core
   FR-001 feature (opt-in by invocation, own namespace) whose output —
   injectable navigation skills + a flat corpus index — is the
   docs-delivery mission itself. Its Arango discovery query became a
   single SELECT over the cache's vertices table, with v2 parity on
   the declared-id filter.

## What ran clean (worth keeping as a pattern)

- **Outside-in slicing worked exactly as the handoff ordered it**:
  every commit built and tested green because surfaces died before
  their dependencies (MCP handlers → CLI commands → shared engines →
  trees). The one shim used — a re-export block in the old
  `arango/collections.ts` — let five dying importers survive two
  commits without edits, then died with the tree.
- **The registry decision propagated cleanly**: dropping the
  `dd_edges_*` routing field from RelationsRegistry touched only the
  loader, two tests, and 17 concept records (which lost their inert
  `edge_collection:` keys). Nothing else consumed it — the v2 concept
  had already stopped carrying meaning in v3 code.
- **gc found real garbage on its first run**: the concept-record edits
  left exactly 19 stale embed-cache rows; `docdog gc --dry-run`
  reported them before eviction. The eviction contract (rows whose
  content hash has no live vertex) matches the DD-051 reuse contract
  (rows survive reindexes) with no TTL machinery.

## Residue

- `dd_patches` stays in SYSTEM_VERTEX_COLLECTIONS (DD-066 kept it "for
  now"; OQ-26 is still the open question about its fate).
- `specs/notes/` and older records still narrate v2 mechanics in
  prose; they are historical documents and were left alone. The living
  surfaces (skills, CLAUDE.md, CONTRIBUTING, concept records) now
  match v3.
- README.md is still a bare title — untouched, separate concern.
