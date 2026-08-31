---
id: WF-004
title: "Code-change task loop — survey → architect → implement → review → finalize"
collection: workflows
status: deprecated
date: 2026-04-13
description: "DEPRECATED (2026-08-27): the five skills this workflow was the capture of — `start-task`, `architect`, `coder`, `reviewer`, `finalize-task` — were deleted at v3 step 6, and no `TASK-NNN` has been opened since 2026-07-14; code changes run through WF-002 + WF-006 and a commit. Kept for history, not to be followed. Original capture: the repeatable process behind the shipped `.docdog/skills/` code-loop cluster (`start-task`, `architect`, `coder`, `reviewer`, `finalize-task`). Retroactively captured as a first-class workflow artifact per DD-036, so each skill has a concrete `follows_workflow:` edge to point at. Behavior-preserving: the skills already implemented this process, it just wasn't written down. OBS-008 / DISC-012 surfaced the gap."
relationships:
  - references: DD-036
    context: "DD-036 makes repeatable processes workflow artifacts; this is the one that was shipped without the treatment"
  - references: OBS-008
    context: "observation that surfaced the uncaptured-workflow gap"
  - references: DISC-012
    context: "discussion that resolved to capture this as WF-004 instead of patching individual skills"
  - references: DD-034
    context: "every code change must preserve DD-034 for any docdog-managed artifact it touches"
  - references: DD-066
    context: "memory-layer-not-workflow-engine posture — this workflow is prose, not a runtime"
  - references: WF-003
    context: scope boundary — docs batch rewrites route there, not through this loop
  - references: WF-001
    context: scope boundary — discussion capture routes there
  - references: PROPOSAL-019
    context: the follow-up that would make task→workflow→skill-cluster dispatch data-driven
  - references: DISC-013
    context: the open discussion tracking the dispatch-engine question
  - references: TASK-001
    context: the pre-seeded example — step 1 was a no-op for TASK-001..004
  - references: PROPOSAL-017
    context: the origin gap — its batch 1 exposed that no captured workflow covered code changes
  - references: WF-002
    context: one of the three workflows that already existed when the code-change loop had no artifact — WF-001/002/003 covered discussion capture, dogfooding, and docs batch rewrite, and none of them covered code changes; that gap is why WF-004 exists
---

# WF-004: Code-change task loop

**Status note (2026-08-27): deprecated — do not follow this.**
This workflow was the capture of a skill cluster that no longer
exists. `start-task`, `architect`, `coder`, `reviewer` and
`finalize-task` were deleted at v3 step 6; `.docdog/skills/`
today holds `compose`, `index`, `ingest`, `populate`, `relate`,
`search`, `task-frontmatter`, `ejection-resilience` and
`example-workflow-seed`. The `tasks/` apparatus this workflow
runs inside of is dormant with it: all seven TASK records are
`done` and nothing has been filed there since 2026-07-14 —
PROPOSAL-041..045 and OBS-021..026 each ran through WF-002 +
WF-006 and a commit, with no task folder. Its DD-034 claim
below held: the process survived the skills' deletion intact.
What did not survive is the reason to run it. If a code-change
loop is wanted again, write it against the surfaces that exist
rather than reviving these five steps by reference.

The rest of this file is the original 2026-04-13 capture,
preserved unedited as history.

The canonical process for a task that changes code in this
repo (or in any project that uses the workflow template). It
is **the** workflow that the shipped `.docdog/skills/` cluster
implements — `start-task`, `architect`, `coder`, `reviewer`,
`finalize-task` are the skill-layer representation of the
steps below.

This artifact exists so those skills have somewhere to point
via `follows_workflow:`. DD-036 requires every repeatable
process to be a first-class workflow record. OBS-008 noted
that the code-loop was the one shipped process that had been
missed. DISC-012 resolved to capture it as WF-004 rather than
patch the skill prose.

## When to use this workflow

Pick WF-004 when the task requires touching source files under
`src/`, `tests/`, `templates/`, or any other code-producing
path. Not for docs batch rewrites (use WF-003), not for
discussion capture (WF-001), not for observation-only review
passes (no dedicated workflow yet — capture as notes).

A task declares which workflow it follows via
`follows_workflow: WF-NNN` in its frontmatter. The lookup from
task → workflow → skill cluster is currently manual; it
becomes machine-readable once PROPOSAL-019's engine primitives
land (DISC-013).

## The five steps

### 1. Start — `start-task` skill

Create the `tasks/TASK-NNN/` folder with rich frontmatter
(DD-034: readable by a vanilla agent). Register a task vertex
in the `tasks` collection. Surface related features, decisions,
and requirements via a `docdog search` pass on the task's
declared goal.

**Inputs:** task goal (from user or the parent feature).
**Outputs:** task artifact on disk + task vertex in DB + a
context-surface ranked list.
**Skips:** if the task was pre-seeded (as TASK-001..004 were
in PROPOSAL-017 Phase 2), this step is a no-op — the ID and
context are already known.

### 2. Architect — `architect` skill

Design-first. No code yet. Produce a short `architecture.md`
in the task folder describing the intended shape of the change:
which files move, which types change, which decisions or
principles the design must respect, which existing patterns
it extends. The output is rationale and the minimal set of
concrete choices the implementer will need.

**Inputs:** task artifact, surfaced context.
**Outputs:** `tasks/TASK-NNN/architecture.md`.
**Skips:** if the task is a trivial edit (e.g. a typo fix,
a single-function addition with an obvious shape), the
architecture step is cosmetic. Note the skip in the finalize
step.

### 3. Implement — `coder` skill

Execute the design. Edit source files. Run the build. Keep
running notes (`implementation.md`) for non-obvious choices,
patterns discovered mid-stream, or anything a reviewer will
need to know that isn't visible in the diff.

**Inputs:** architecture.md, surfaced context, source tree.
**Outputs:** code changes on the task branch, optionally
`tasks/TASK-NNN/implementation.md`.
**Constraint:** every docdog-managed artifact the change
touches must still pass DD-034 after the edit. If a code
change invalidates a decision or principle, that's a
superseding edit on the artifact layer too — not just a
code diff.

### 4. Review — `reviewer` skill

Systematic pass against the review rubric: does the code
match the architecture? Does it respect relevant decisions
(DD-*), principles (DP-*), and constraints? Are tests in
place for new behavior? Does any doc-comment reference a
now-superseded record?

The reviewer produces `tasks/TASK-NNN/review.md` with a
per-criterion pass/fail. Failures loop back to step 3.

**Inputs:** code diff, architecture.md, relevant decisions and
principles.
**Outputs:** `tasks/TASK-NNN/review.md`.
**Skips:** for trivial edits, review can be a one-line "diff
is obvious, no review artifact." Record the skip explicitly.

### 5. Finalize — `finalize-task` skill

Walk the task's `implements` / `part_of` edges and judge each
neighbor's state: is the parent feature now done? Did the task
touch any spec that needs a status flip? Refresh the feature
matrix (render-matrix script). Prompt for the commit message
and record the commit hash on the task artifact.

**Inputs:** task artifact, code changes, related feature /
decision vertices.
**Outputs:** updated task status (`in_progress` → `done`),
stamped `commit_hash`, refreshed feature matrix.

## What this workflow does NOT do

- **Docs batch rewrites.** WF-003 is the right workflow for
  multi-record transform passes on the artifact layer. See
  OBS-008 for why running WF-003 work through the code-loop
  skills produces ceremony that doesn't fit.
- **Discussion capture.** WF-001 handles turning a discussion
  thread into a DISC-NNN record. The code-loop skills don't
  have a step for that.
- **Workflow dispatch.** A task declares `follows_workflow:`
  in its frontmatter, but the lookup from task → workflow →
  skill cluster is currently a convention, not an engine.
  PROPOSAL-019 (DISC-013) is the follow-up that would make
  this dispatch data-driven.

## How this got captured

The code-loop skills shipped with the workflow template at
`ee89ada`. They had no `follows_workflow:` edge because no
workflow artifact existed to point at. WF-001/002/003 were
authored at `3a372e0` but specifically covered discussion
capture, dual-track dogfooding, and docs batch rewrite — not
code changes. The gap sat undetected until Phase 3 of the
workflow dogfooding exercise (PROPOSAL-017 batch 1) tried to
apply the code-loop skills to a spec-refactor task and
produced OBS-008.

DISC-012 resolved to capture the code-loop as its own
workflow. WF-004 is that capture. Each shipped code-loop
skill gets a `follows_workflow: WF-004` frontmatter field in
this same pass.

## DD-034 check

Prose-only. This workflow is itself a DD-034 artifact: a
vanilla agent reading this file can reconstruct the process
without docdog running. The skills are thin implementation
wrappers over these five steps; deleting them (DD-066's
ejection test) leaves the workflow intact because the
workflow is the authoritative description.
