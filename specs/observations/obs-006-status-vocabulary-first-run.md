---
id: OBS-006
title: "status_vocabulary check caught real drift on first run — zero synthetic test fixtures needed"
collection: observations
status: current
date: 2026-04-13
commit_hash: 7b0f6e3168c36af10eb0996db7006c95c79ffde1
description: "The moment PROPOSAL-016's status_vocabulary consistency check first ran against the live docdog repo, it surfaced 8 vertices with status values not in any shipped vocabulary: 1 issue with `fixed`, and 7 questions using `analyzed`, `narrowed`, `ongoing`, or `planned`. The feature delivered immediate value against real state; the fixups required exactly one vocabulary extension plus two two-character file edits."
relationships:
  - references: PROPOSAL-016
  - references: DD-034
    context: the agent-decides fix taxonomy — DD-034-shaped thinking applied to a real case
  - references: DISC-011
  - references: DP-001
    context: grounds the extend-the-vocabulary-not-migrate-the-files fix
---

# OBS-006: First-run value from status_vocabulary check

## Trigger

Ran `docdog collections check` on the live docdog repo immediately
after `docdog init` applied PROPOSAL-016's new shipped vocabularies.
Output surfaced 10 warnings — 5 were expected
(`meta_without_collection` for the new workflow-template-only
collections), 5 were the interesting ones:

```
[status_not_in_vocabulary] 1 vertex(es) in "issues" have status "fixed"
[status_not_in_vocabulary] 2 vertex(es) in "questions" have status "analyzed"
[status_not_in_vocabulary] 2 vertex(es) in "questions" have status "narrowed"
[status_not_in_vocabulary] 1 vertex(es) in "questions" have status "ongoing"
[status_not_in_vocabulary] 2 vertex(es) in "questions" have status "planned"
```

Nine vertices across seven files, all carrying state that had
accumulated over the project's life without anyone noticing.

## Why this is the feature working as designed

PROPOSAL-016 was sold as cheap infrastructure that would "give
agents a retrievable answer to what states can this collection be
in." Nobody claimed the vocabulary would uncover hidden drift.
But the check surfaced drift on the first run against real data,
without a single synthetic fixture, and the findings mapped to
three categories with three different correct answers:

### 1. Real rename (migrate the file)

`issues:fixed` was a friction file
(`friction-007-run-command-args.md`) that used `fixed` where the
seed vocabulary for `issues` specified `resolved`. Same meaning,
different word. Correct fix: migrate the file to `resolved`. Took
one line edit.

Also migrated `friction-009` (which technically lived in `notes`
and wouldn't have tripped the check, but shared the same `fixed`
convention — opportunistic consistency fix).

### 2. Legitimate project convention (extend the vocabulary)

The four question statuses — `analyzed`, `narrowed`, `ongoing`,
`planned` — were **not drift in the "someone typed wrong" sense**.
They were a real, long-lived project convention with meaningful
semantic distinctions:

- **`open`** — unresolved, not yet investigated
- **`ongoing`** — still open but actively being worked on
- **`analyzed`** — studied; full analysis exists; no lean committed
- **`narrowed`** — option space reduced; a direction is forming
- **`leaning`** — preferred direction identified but not committed
- **`planned`** — a direction is committed; implementation queued
- **`resolved`** — answered by a linked decision or proposal
- **`reframed`** — superseded by a different formulation

The seeded vocabulary had 4 values; the project had been using 8.
Correct fix: **extend the vocabulary**, not migrate the files.
DP-001 says docdog code is mechanical; vocabularies are supposed
to reflect the project's lived conventions, not impose a narrower
set. The user's DISC-011 phrasing — *"primitives for experimentation
on the go"* — points at exactly this move. The fix was one edit
to `src/arango/meta-seed.ts` adding four entries to the questions
vocabulary.

### 3. (Not triggered this pass, but worth flagging)

If the project had converged on a *truly wrong* status value —
something that made no semantic sense in context — the third
correct answer would be "fix the file *and* write a short
convention note for why." This pass didn't have any such case,
but the pattern is there.

## What the fixups cost

- **Vocabulary extension** (questions): four new `StatusVocabEntry`
  entries in meta-seed.ts, ~6 lines. Refreshed via `docdog init`
  picking up the un-edited shipped entry for refresh.
- **File migration** (friction-007, friction-009): two one-line
  edits, `status: fixed` → `status: resolved`.
- **Validation**: `docdog collections check` went from 5
  `status_not_in_vocabulary` warnings to zero. The remaining 5
  warnings are `meta_without_collection` for workflow-template
  collections that this repo doesn't declare — expected and
  non-actionable.

Total fixup time: under 3 minutes.

## Why I'm writing this observation

Two reasons:

1. **To short-circuit a future "was it worth it" question.** If
   someone (including future-me) wonders whether the
   status_vocabulary infrastructure earned its ~800 LOC of
   shipping, this observation is the answer: it paid for itself
   before it shipped to a second project. That's as good a
   first-run ROI as a feature can have.
2. **To document the right default response to
   `status_not_in_vocabulary` warnings.** The pattern is:
   - If the off-vocab value is a **typo or old alias**, migrate
     the file.
   - If it's a **real convention the project has been using**,
     extend the vocabulary.
   - If it's **neither** (rare, this pass had none), fix the file
     and write a note about what the valid convention is.

   The check does not know which of the three applies. The agent
   decides. Docdog serves the data; the human/agent loop picks
   the response. DD-034-shaped thinking applied to a real case.

## What this does not prove

One observation isn't data. The first-run drift might be
unusually rich because this repo is four months of self-hosted
docdog development with heavy vocabulary churn. A newborn repo
with no history might surface zero warnings on day one — and
that's also fine; the check is there to catch drift *when it
happens*, not to produce warnings at all times.

What this observation proves is that the feature works as
designed and that the first time it ran in anger, it caught
something real. That's enough to justify it without further
instrumentation.
