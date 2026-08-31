---
id: OQ-37
title: "Graceful degradation trace for task workflow"
collection: questions
status: reframed
related: [EJ-030, DD-034, DISC-011]
relationships:
  - references: EJ-030
    context: the original per-skill framing followed its delete-every-skill test
  - references: DD-034
    context: the reframe source — per-skill audit becomes per-artifact self-description, checked once at template design
  - discussed_in: DISC-011
  - references: PROPOSAL-016
    context: resolution gated on P-016 landing with the DD-034 audit passing
description: "Reframed by DD-034. Original question asked a per-skill audit (does this skill work without docdog?). The new framing is per-artifact (do this template's on-disk artifacts carry enough information for a vanilla agent?). Reframe is smaller scope, done once at template-design time."
---

# OQ-37: Graceful degradation trace for task workflow

**Status: reframed** (2026-04-13, DD-034 via DISC-011).

## Original question

Walk through the current task workflow (start-task, architect,
api-designer, coder, code-reviewer, finalize-task) and identify
every docdog integration point. For each: does the skill still
work without docdog? Deliverable: a "this works without docdog"
checklist per skill.

## Why the original framing is wrong

The original framing follows from EJ-030's *"delete every skill,
docdog still works"* test. DD-034 replaces that test with a
different one: **the on-disk artifacts (frontmatter + bodies)
must carry enough information for a vanilla agent to reconstruct
document relationships, process descriptions, and project context
— without needing docdog at all.** Skills, under the new framing,
may freely assume docdog is present.

This collapses the per-skill audit into a single check applied at
template-design time: *does this template produce artifacts whose
frontmatter is self-describing?*

## New framing

For each collection the workflow template ships — `tasks`,
`features`, `workflows`, `reconciliations`, `conversations` —
verify:

1. The **frontmatter contract** includes all fields a vanilla
   agent needs: id, title, status, description, relationships
   block with full edge listings.
2. The **body convention** supplements what frontmatter can't
   carry: acceptance criteria, reasoning, context.
3. A **vanilla agent**, handed a file from the collection with
   zero docdog knowledge, could follow the references to related
   artifacts by filename lookup and act on the content without
   querying a database.

This is a design-time check, not a runtime audit. It runs once
per template schema and is re-run when the schema changes.

## Status

PROPOSAL-016 ships the workflow template's new frontmatter
contracts; the DD-034 audit against those contracts is a
prerequisite of PROPOSAL-016 landing. Once PROPOSAL-016 lands with
the audit passing, OQ-37 can be marked `resolved`.
