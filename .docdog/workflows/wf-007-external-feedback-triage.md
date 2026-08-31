---
id: WF-007
title: "External feedback triage — turn an issue from someone else's machine into a record, a fix, and a closed loop"
collection: workflows
status: current
date: 2026-08-25
description: "The maintainer half of the feedback channel PROPOSAL-043 opens on the reporter's side. An external GitHub issue is read, classified, and either answered and closed or admitted into this corpus as a FRICTION or proposal record carrying upstream_issue; the record then drains through WF-006, and the issue is closed naming the fix commit and the version it shipped in. The loop's non-negotiable step is the acknowledgement: a reporter who never learns what happened to their report stops writing them, which costs more than any single defect."
relationships:
  - references: PROPOSAL-043
    context: "the reporter-side channel this is the intake for; the skill's step 8 writes upstream_issue on their copy, this workflow writes it on ours"
  - references: WF-006
    context: "where an admitted report goes once it is a record — this workflow ends at the handoff and does not re-specify the drain"
  - references: WF-002
    context: "the capture side for anything the triage itself teaches, e.g. an issue that reveals a docs failure rather than a code defect"
  - references: WF-001
    context: "where a feature request goes: a discussion, not a friction record"
  - references: DD-036
    context: "the decision that makes this a first-class artifact rather than a paragraph in a contributor guide"
  - references: PROPOSAL-042
    context: "the reason a closing comment must name a version — 'fixed in 0.4.1' is actionable only alongside the upgrade path, and a search that lands on this closed issue is how the next reporter finds it"
  - references: DP-001
    context: "classification here is judgment, done by a person reading an issue; nothing in this workflow may become an auto-labeller"
  - follows_workflow: WF-006
    context: "composes with the friction drain — WF-007 step 5 hands off, WF-006 owns the fix"
---

# WF-007: External feedback triage

## Trigger

An issue exists on `yasnikoff/docdog` that this repo did not write.
Sweep at three moments: on notification, before cutting a release, and
whenever the friction backlog is being drained anyway (WF-006 step 1).

```
gh issue list --repo yasnikoff/docdog --state open
gh issue list --repo yasnikoff/docdog --state open --label friction
```

Unlabeled issues matter most — a first-time reporter will not have used
the template.

## Steps

### 1. Read it whole before classifying

Including the environment block (`docdog status --json`, per the issue
template). Version and install shape decide half the outcomes below
before the defect is even understood.

### 2. Classify

| Reading | Outcome |
|---|---|
| Already fixed in a later version | Answer with the version and the upgrade command. Close. |
| A defect, new | Admit as `FRICTION-NNN` (step 3). |
| A defect, already recorded | Comment linking the existing record's id; add anything new to that record. Leave the issue open until it resolves. |
| Not a defect — docdog behaved as designed | Answer plainly, and ask whether the *docs* failed. That answer is often the real finding (WF-002). |
| A feature request | Not a friction record. Open a discussion (WF-001); say so in the issue so the reporter knows it was not dismissed. |
| Cannot reproduce | Ask for the missing step, with a specific question. Do not close for silence in under a month. |

Classification is a person reading an issue. Nothing here becomes an
auto-labeller — DP-001, and the misclassification cost is a discouraged
reporter.

### 3. Admit it

Write `FRICTION-NNN` under `specs/notes/` with the usual frontmatter,
plus:

```yaml
upstream_issue: https://github.com/yasnikoff/docdog/issues/NNN
```

Two judgment calls belong to the maintainer, not the reporter:

- **Severity is re-judged.** Theirs describes their experience, which is
  real; yours describes the backlog's priority, which is a different
  question.
- **The body is rewritten, not pasted.** The record must say what
  docdog does wrong; the issue says what happened to a person. Quote the
  reproduction verbatim and nothing else.

The issue is public, so nothing in it is a leak risk when copied — but
the corpus ships whole (DD-071), so do not add private inference about
the reporter's project either.

### 4. Acknowledge — the step that must not be skipped

Comment naming the record id and what happens next. The reporter learns
their report landed, and they get an id they can cite in the corpus that
ships inside the package they already have.

An issue left silent for weeks is worse than one declined in a sentence.
Declining is information; silence teaches people to stop reporting.

### 5. Hand off to WF-006

The record is now an ordinary open friction and drains like any other.
This workflow does not re-specify the code loop.

### 6. Close with the fix, the commit, and the version

```
Fixed in 0.4.1 (commit abc1234). Upgrade: <the command for their install shape>.
```

The version is load-bearing twice: it tells this reporter what to do,
and it is what the *next* reporter finds when their search hits a closed
issue — the highest-value branch in PROPOSAL-043's procedure. A closing
comment that says only "fixed" wastes that.

If the fix was docs or a skill rather than code, say so — it changes
whether upgrading helps.

## Produces

- Zero or more `FRICTION-NNN` / discussion records carrying
  `upstream_issue`.
- A comment on every issue touched, at intake and at close.
- Occasionally a WF-002 observation, when the triage itself teaches
  something — a docs failure, a repeated misunderstanding, a report the
  channel made harder than it should have been.

## Terminal states

- **Fixed** — record resolved through WF-006, issue closed naming
  commit and version.
- **Answered** — not a defect; issue closed with the explanation, and a
  docs change if the explanation was needed at all.
- **Declined** — a real report the project will not act on. Say why, in
  a sentence, and close. Never leave it to rot open as a soft decline.
- **Promoted** — became a discussion or proposal; the issue links to it
  and stays open until that resolves.

## Notes

- **Unexercised.** Written before the first external issue existed, from
  PROPOSAL-043's design. Expect the table in step 2 to be wrong in at
  least one row and amend it after the first real sweep rather than
  defending it.
- Triage cadence is the maintainer's; the only hard rule is that the
  sweep happens before a release, because a fix that ships without its
  issue being closed strands the person who found it.
