---
name: example-workflow-seed
description: Seed workflow document — copy this into specs/workflows/ and adapt for your project
---

# Example workflow seed

This file is a **reference**, not a skill the agent calls. It
shows the shape of a workflow document so you can write your
own. Copy it to `specs/workflows/wf-001-<slug>.md` in your
project's repo and adapt.

Workflows under PROPOSAL-016 live in the `workflows` collection.
They describe processes: how tasks get picked, how features get
shipped, how reconciliations get backported. Agents read them and
execute; docdog stores and serves.

## Shape

```markdown
---
id: WF-001
title: "Feature loop — pick, plan, code, review, finalize"
collection: workflows
status: current               # draft | current | deprecated
date: 2026-04-13
description: "The default loop for this project's feature work."
relationships:
  - references: DD-034
  - references: WF-000-example-workflow-seed
---

# WF-001: Feature loop

## Trigger

A task with `status: planned` exists in the `tasks` collection.

## Steps

1. **Pick the task.** Read its frontmatter via `docdog_get
   TASK-NNN`. Confirm `implements`, `derived_from`, and
   `follows_workflow` are set.
2. **Brainstorm** (optional). Write `tasks/TASK-NNN/design.md`
   with alternatives considered. Skip for small tasks.
3. **Plan.** Write `tasks/TASK-NNN/plan.md` with concrete steps,
   file paths touched, acceptance criteria. The plan is the
   contract between the user and the agent.
4. **Code.** Implement. Keep commits scoped; each commit message
   ends with `Refs: TASK-NNN` so the git history links back.
5. **Review.** Do a review pass against the project's guidelines
   and decisions. Capture findings in `tasks/TASK-NNN/review.md`.
6. **Test.** Run the project's test suite. Fix until green.
7. **Finalize.** Flip task status to `done`, stamp `commit_hash`
   in the task frontmatter, re-index.
8. **Backport / reconcile.** If implementation revealed the
   upstream spec needs update, create a `reconciliations` record
   with a `reconciles` edge to the offending upstream artifact.

## Produces

- A git commit with `Refs: TASK-NNN`
- A task record with `status: done` and `commit_hash` set
- Possibly: one or more observations, one or more reconciliation
  records

## Terminal states

- **Success:** task `done`, feature progressed or shipped.
- **Abandoned:** task `abandoned` with a reason in the body; the
  agent has decided not to continue.
- **Blocked:** task `blocked` with a blocker pointer in the body;
  execution pauses until the blocker is resolved.

## Notes

- This workflow is **data, not code**. If it needs to change, edit
  this file. There's nothing to rebuild, no skill overlay to
  apply.
- Agents may treat the step list loosely — skipping brainstorm
  for small tasks, looping through review multiple times, etc.
  The workflow describes the happy path, not a rigid state
  machine.
- Per DD-034, the frontmatter carries everything a vanilla agent
  would need: trigger, status, relationships. The body describes
  the steps in prose because prose is what agents read anyway.
```

## How to adapt

1. Copy this file to `specs/workflows/wf-001-<your-slug>.md`.
2. Edit the frontmatter: give it a real `id`, `title`, and
   `description`. Remove the reference to this seed from
   `relationships:`.
3. Rewrite the trigger, steps, and terminal states for your
   project's actual process.
4. Save. Run `docdog index`. The workflow is now retrievable via
   `docdog_search "feature loop"` and linkable from tasks via
   `follows_workflow: WF-001`.
5. When the process changes, edit the file. That's the whole
   experimentation loop — no skill rewrite, no template patch,
   no overlay.

## Why workflows are documents, not code

Skills that bake process into prose (accelerator-mini's
`release`, `coder`, `writing-plans` skills) create rigidity: when
the process needs to change, you edit the skill, which triggers
the overlay/patching mechanics that the user ended up inventing.

Workflows as documents sidestep this entirely. The process is in
the user's repo, the user edits it when they want, docdog just
indexes it for search and traversal. DP-001 stays clean: docdog
stores and serves; the agent interprets and executes.
