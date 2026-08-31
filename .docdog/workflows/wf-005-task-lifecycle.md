---
id: WF-005
title: "Task lifecycle — walk a task from planned through done, independent of what kind of work it wraps"
collection: workflows
status: current
date: 2026-04-13
pauses:
  - id: promote_confirm
    question: "All AC verified. Promote task to done?"
    answers: [accept, defer]
    default: accept
description: "The outer workflow every task goes through, regardless of whether the inside is a code change, docs rewrite, maintenance pass, or spike. Seeds the task record, starts it, delegates execution to the task's inside workflow via `follows_workflow`, verifies acceptance criteria against the work that happened, promotes status, and records the outcome. Captured pre-engine: all enforcement is agent discipline today, but the steps are written as if a future engine will gate them, so the primitives needed for DISC-013's workflow engine become concrete by reading this file."
relationships:
  - references: DISC-013
    context: "this workflow is the first concrete artifact DISC-013 asked for — the outer task-lifecycle workflow that WF-003 / WF-004 / future inside workflows run inside of"
  - references: FRICTION-012
    context: "the AC-wording collision that surfaced the gap"
  - references: DD-036
    context: "every repeatable agent-facing process is a first-class workflow artifact — including the lifecycle of running a task"
  - references: DD-034
    context: "the AC-verification step is DD-034 in action — the task file's body is the authoritative record of whether the task is done"
  - references: WF-003
    context: "one kind of inside workflow WF-005 wraps — docs batch rewrite"
  - references: WF-004
    context: "the other kind of inside workflow WF-005 wraps — code change task loop"
  - references: OBS-008
    context: "the observation that code-loop skills collapsed lifecycle and work-shape into one cluster — WF-005 is the layer that separates them"
  - references: TASK-001
    context: the done-with-unticked-AC case this lifecycle exists to prevent
  - references: TASK-002
    context: the done-with-unticked-AC case this lifecycle exists to prevent
  - references: WF-002
    context: step 9 delegates surprising-finding capture to the dogfooding workflow
  - references: PROPOSAL-019
    context: this file's three inline gate/delegate/pause markers are P-019's concrete load-bearing examples
---

# WF-005: Task lifecycle

**Dormancy note (2026-08-27).** Still `current` — the lifecycle
below is skill-independent and correct for any task that gets
opened. But nothing has been filed under `tasks/` since
2026-07-14: all seven TASK records are `done`, and every change
since (PROPOSAL-041..045, OBS-021..026) ran through WF-002 +
WF-006 and a commit without a task folder. One of the two inside
workflows this file delegates to, **WF-004, was deprecated on the
same date** — the skill cluster it captured was deleted at v3
step 6 — so the roster in step 4 is effectively WF-003 alone.
Read this as the apparatus's definition, not as a reason to open
a task.

## Trigger

An agent is about to start, continue, or finish any record in the
`tasks` collection. WF-005 applies to every task regardless of what
kind of work the task wraps.

## When not to use

- **Ad-hoc edits that aren't tasks.** A one-off spec fix, a typo,
  a reply to a comment. If there's no `TASK-NNN` record, there's
  no lifecycle to run. Don't invent a task just to have a
  lifecycle — let the work be small.
- **The inside workflow itself.** WF-005 is the outer wrapper. The
  actual work (rewriting 8 decisions, implementing a saga
  compensation, etc.) belongs in the inside workflow that
  `follows_workflow:` names on the task. Don't copy that workflow's
  steps into WF-005 — delegate.

## Pre-engine qualifier

Docdog has no workflow engine today. The steps below are written
as if every gate were machine-enforced, but in practice each gate
is agent discipline until DISC-013 graduates into a PROPOSAL and
lands an engine. Three step markers are deliberately called out
in the step body — `[gate]`, `[delegate]`, `[pause]` — to make the
primitives DISC-013 needs visible in prose, so that the engine
design has concrete examples of each when it's drafted.

Until the engine lands, the agent running a task reads WF-005
top-to-bottom, honors the gates manually, and — on the `[delegate]`
step — reads `follows_workflow:` from the task frontmatter, opens
that workflow's file, runs it, and returns here.

## Steps

1. **Seed the task record.** Write the task file per the
   `task-frontmatter` contract:
   - `collection: tasks`
   - `status: planned`
   - `follows_workflow: WF-NNN` pointing at the inside workflow
     that describes *what kind of work* this task is (not WF-005;
     the outer lifecycle is implicit).
   - `implements:` or `derived_from:` edges naming the parent
     feature / proposal / decision.
   - Acceptance criteria in the body as a `- [ ]` checklist.

   **AC wording rule.** Every AC bullet must be satisfiable
   against the *current* corpus state using *only* vocabulary
   that is registered today. FRICTION-012 shipped because an AC
   used a status value that was not in the `decisions`
   `status_vocabulary`. If an AC needs a new vocab value, that is
   a separate prerequisite task — land the vocab change first,
   then write the AC that depends on it.

   `[gate]` Every AC bullet names a verifiable condition — not a
   command ("run `docdog index`") and not a wish ("cleaner
   code"). Conditions are the only thing step 5 can check.

2. **Start the task.** [gate:status_equals:planned]
   Flip `status: planned` → `in_progress`, reindex. This write is
   the point at which WF-005 commits to running the task in this
   session; any further work should be done under the task record.

   The gate enforces the rule that the previous status was
   `planned`. Starting a task in any other state (`done`,
   `blocked`, `abandoned`) is a mistake unless the agent is
   deliberately reopening it, which is a separate transition
   (see §Notes on reopening).

3. **Discover context.** Read what the inside workflow tells
   you to read. For WF-003 that's the feature record, the plan,
   and the target set. For WF-004 that's the relevant code +
   decision records. WF-005 has nothing to say about *what*
   context to load — that is the inside workflow's
   responsibility. This step exists only to mark that context
   discovery happens *before* delegation, and that it's part of
   the lifecycle, not a free-form preamble.

4. **Execute the inside workflow.** [delegate:frontmatter:follows_workflow]
   Read
   `follows_workflow:` from the task frontmatter. Open that
   workflow file. Run its steps end-to-end against the task's
   scope. Return to WF-005 step 5 when the inside workflow
   reaches its own terminal state.

   **The delegation is data-driven, not agent judgment.** WF-005
   does not say "pick the right workflow"; it says "run the one
   the task already named." If `follows_workflow:` is unset on
   the task record, that is a seed-step error — go back to step 1
   and fix the task frontmatter before executing.

   **If the inside workflow itself surfaces a blocker** (an OQ it
   can't answer, a friction that requires a decision), it escapes
   upward by setting task `status: blocked` and recording the
   reason — see terminal states below. WF-005 does not resume
   until the blocker is resolved.

5. **Verify acceptance criteria.** [gate:ac_all_checked]
   Walk the AC checklist item by
   item. For each bullet:
   - Confirm the condition is *literally* true against the
     current corpus / code state, using concrete evidence: a
     search result, a file, a command output.
   - Tick the `- [ ]` → `- [x]` in the task body. **This is a
     disk write.** The checkbox state lives on the task artifact,
     not in the agent's head.
   - If an AC bullet is *not* satisfied, stop. Either:
     (a) the inside workflow is not actually done — return to
     step 4 and finish it, or
     (b) the AC was wrong — go back to step 1, fix the AC
     wording, re-run the affected bullets. Do not silently weaken
     the criterion.

   **Every AC box must be ticked before step 6** (enforced on
   step 5's title by `[gate:ac_all_checked]`). This is the gate
   FRICTION-012 and DISC-013 cost exists to enforce. An unchecked
   box blocks promotion unconditionally. The friction that
   triggered DISC-013 was TASK-001 and TASK-002 shipping with
   `status: done` but unticked AC — that state is the thing this
   gate forbids.

6. **Optional HITL review.** [pause:promote_confirm]
   If the task is non-trivial
   or the inside workflow flagged something for confirmation,
   stop and ask the user before promoting. The default shape of
   the question lives in the inside workflow; WF-005 just marks
   that *a pause can happen here*, between AC-verification and
   status promotion.

   This step is a deliberate placeholder for DISC-013's
   `[pause]` primitive. When the engine lands, this is where the
   `auto-accept` default lives: either the workflow file
   specifies an inline default answer (and auto-accept mode
   records it and continues), or there is no default (and
   auto-accept mode errors out rather than inferring one).

   Pre-engine, the pause is agent discipline: if the task
   touches a commitment the user should see, ask.

7. **Promote.** [gate:ac_all_checked]
   Flip `status: in_progress` → `done`. Stamp
   `commit_hash:` with the commit that landed the work, if there
   is one. Stamp any outcome fields the inside workflow writes
   (e.g. WF-003 writes `shipped_at` on the parent feature; that
   stays on the feature, not the task).

   `[gate]` Promotion requires that step 5 completed with every
   AC box ticked and step 6's pause was either skipped or
   accepted.

8. **Reindex and record outcome.** Run `docdog index` so the new
   task state is searchable. If the inside workflow produced an
   artifact worth linking from the task (a commit, a decision,
   an observation), write the `references:` / `produced:` edge
   on the task frontmatter, not just in prose. The task file
   after promotion is the load-bearing record under DD-034 — a
   vanilla agent opening it should see: `status: done`, every AC
   ticked, links to what was produced.

9. **Capture an observation** (per WF-002) if anything
   surprising came up in the lifecycle: an AC that had to be
   rewritten mid-task, a pause that flagged something the inside
   workflow missed, a delegation point that felt awkward. These
   feed DISC-013's eventual engine design.

## Produces

- One `TASK-NNN` record that transitions `planned → in_progress
  → done` with every AC ticked on disk.
- Zero or more observation records per step 9.
- Whatever the inside workflow produces — WF-005 does not
  enumerate those.

## Terminal states

- **Done.** Step 5 passed, step 7 flipped status. The task body
  is the authoritative record under DD-034 and is readable by a
  vanilla agent.
- **Blocked.** The inside workflow (step 4) hit a condition it
  can't resolve on its own — a missing decision, an OQ, a
  FRICTION that requires a fix elsewhere. Flip `status:
  in_progress` → `blocked` and record the blocker's id on the
  task body. The task stays blocked until the upstream resolves,
  at which point step 4 resumes.
- **Abandoned.** The task's premise is no longer valid — the
  inside workflow revealed the task shouldn't exist, or a later
  decision made it moot. Flip to `abandoned`, write why in the
  body, and (if partial work shipped) link to the commits so a
  future reader can tell the work wasn't lost. Abandonment does
  not require AC to be ticked; it requires an explanation.

## Why this workflow matters

Task lifecycle has been implicit since tasks existed. Implicit
lifecycle is how FRICTION-012 happened: TASK-001 and TASK-002
shipped as `done` with unticked AC because the step "verify AC
against actual state" lived only in the agent's head. Nothing on
disk forced it to happen.

Writing WF-005 as prose is the minimum viable fix. It doesn't
enforce anything a machine wouldn't — that requires the engine
DISC-013 sketches — but it does three things the
agent-disciplined pre-engine corpus needs:

1. It names the steps so they can be skipped *on purpose*
   instead of *by omission*. Skipping AC verification with no
   note is a bug; skipping it with a note that says "abandoned,
   see body" is fine.
2. It separates lifecycle from work-shape so WF-003 and WF-004
   don't have to re-derive the lifecycle every time they're
   written. Both can focus on what makes them different.
3. It gives the engine a concrete template. When DISC-013
   becomes PROPOSAL-019, the three `[gate]` / `[delegate]` /
   `[pause]` markers in this file are the exact primitives the
   engine must support. Nothing more.

## Notes on reopening

A task in a terminal state (`done`, `abandoned`, `blocked`) can
be legitimately reopened, but it's a new transition, not a
restart of WF-005:

- **`done` → `in_progress`** when a post-landing defect is
  traced back to the task. Add a new AC bullet for the fix, then
  re-run step 5 only for the new bullet.
- **`blocked` → `in_progress`** when the blocker resolves. Step
  4 resumes; steps 5-8 run normally.
- **`abandoned`** is terminal. Create a new task that
  `supersedes:` the abandoned one rather than reviving it.

The reopening transitions are not common. They exist so the
lifecycle can describe real maintenance, not so every session
can cheaply "reopen" something to dodge the AC gate.

## Relationship to DISC-013

WF-005 intentionally uses the three marker keywords DISC-013
named (`[gate]`, `[delegate]`, `[pause]`) even though none are
machine-interpretable today. This is the bridge:

- **`[gate]`** — a condition that must hold before the next
  step starts. In prose: the agent checks it. In an engine: a
  predicate over task state or corpus state.
- **`[delegate]`** — run another workflow, return here. In prose:
  the agent opens a second file. In an engine: a workflow call
  with explicit return point.
- **`[pause]`** — stop and ask the user (or auto-accept the
  inline default). In prose: the agent decides whether to ask.
  In an engine: a HITL breakpoint with a typed default.

Reading WF-005 before drafting PROPOSAL-019 gives the proposal
three concrete places where each primitive is load-bearing,
rather than abstract syntax.
