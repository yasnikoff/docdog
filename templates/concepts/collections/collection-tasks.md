---
id: CONCEPT-COLLECTION-TASKS
title: "Collection: tasks"
collection: concepts
status: current
concept_kind: collection
name: tasks
scope: shipped
description: Planned or in-progress units of work. Each task carries its lineage
  (implements/derived_from/follows_workflow) in frontmatter.
when_to_use: When starting on a new unit of work worth tracking through to a commit.
status_vocabulary:
  planned:
    description: Committed to but not yet started. Appears in pick queue.
  in_progress:
    description: Active. Has a branch and may have partial commits.
  blocked:
    description: Cannot proceed; requires a note pointing at the blocker.
  done:
    description: Landed. Requires commit_hash in frontmatter.
  abandoned:
    description: Dropped. Requires a reason in the body.
---

# Collection: tasks

Planned or in-progress units of work. Each task carries its lineage (implements/derived_from/follows_workflow) in frontmatter.

**When to use:** When starting on a new unit of work worth tracking through to a commit.

## Status vocabulary

- `planned` — Committed to but not yet started. Appears in pick queue.
- `in_progress` — Active. Has a branch and may have partial commits.
- `blocked` — Cannot proceed; requires a note pointing at the blocker.
- `done` — Landed. Requires commit_hash in frontmatter.
- `abandoned` — Dropped. Requires a reason in the body.
