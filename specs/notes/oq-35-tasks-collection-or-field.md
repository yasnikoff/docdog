---
id: OQ-35
title: "Tasks — separate `tasks` collection or frontmatter field on existing collections?"
collection: questions
status: resolved
related: [EJ-030, DD-034, PROPOSAL-016, DISC-011]
relationships:
  - references: EJ-030
    context: the three-layer model the resolution had to stay consistent with — core knows nothing about task semantics
  - references: DD-034
    context: task frontmatter carries all load-bearing context — the artifact-resilience commitment applied to tasks
  - references: PROPOSAL-016
  - discussed_in: DISC-011
  - references: EJ-033
    context: users own the tasks collection post-init per its shipped-collection reading
description: "Resolved in favor of Option A (separate tasks collection) — but shipped in the workflow template, not in docdog core. Core knows nothing about task semantics; users own the collection post-init per EJ-033."
---

# OQ-35: Tasks — separate `tasks` collection or frontmatter field on existing collections?

**Status: resolved** (2026-04-13, DISC-011).

Task artifacts are multi-role contributions (architect, api-designer,
coder, code-reviewer) to one task. Two models were considered:

- **Option A:** `tasks` collection with task vertex + edges to contribution vertices
  in other collections (e.g. `decisions`, `design_notes`).
- **Option B:** `task_id` frontmatter field on any vertex. No `tasks` collection.
  "A task" = query by `task_id`. Lighter, no new collection needed.

Option B initially looked like the better fit for EJ-030. But the
resolution went the other way:

**Option A wins, with the critical qualifier that "tasks" is shipped
in the `workflow` template, not in docdog core.** Core knows nothing
about task semantics — no `docdog tasks` command tree, no runtime,
no state machine. Users own the collection post-init per EJ-033.
This reading of "shipped" is fully consistent with EJ-030's
three-layer model and with DD-034's artifact-resilience commitment
(task frontmatter carries all load-bearing context — `implements`,
`derived_from`, `follows_workflow`, `commit_hash`, etc.).

The implementation details — status vocabulary, frontmatter
contract, sequential numbering, next-task-id script — are in
PROPOSAL-016. The discussion trail is in DISC-011.
