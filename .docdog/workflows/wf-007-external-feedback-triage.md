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
  - references: DISC-042
    context: "the first run of this workflow (issue #1); steps 2 and 4 and the trigger were amended from what it found"
  - references: FRICTION-055
    context: "the rule behind step 4's measure-before-posting: a claim about behaviour on someone else's machine is a claim about the outside world"
---

# WF-007: External feedback triage

## Trigger

An issue exists on `yasnikoff/docdog` that was filed from **someone
else's machine** — which includes the maintainer's own other projects.
Issue #1 came from the same account as this repo; what made it external
was a corpus this checkout has never seen, and that is the property the
steps below depend on.
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

### 1b. Take in the evidence, when the issue brings some

A measurement-shaped report comes with an **evidence repository**: a
private repo the reporter owns, shared by invitation, laid out by the
`docdog-feedback` skill's §3a — the snapshot is itself a docdog project
with a `measurements/` folder beside it. One repo per adopting project,
one tag per snapshot.

If the evidence arrived some other way (a zip, a folder), put it in that
shape first and push it as a private repo under the account that owns
the data — ComplexPoint's first snapshot came as a 96 MB zip, 85 MB of
which was cache.

1. **Clone it outside this repository**, as a sibling
   (`../evidence/<project>/`), and **never add it to `scan_paths`**. A
   foreign corpus in this index is DD-073's contested-id problem and a
   publication risk at once.
2. **Pin the sha.** Every record that leans on it carries
   `evidence: <owner>/<repo>@<short-sha>` — a snapshot is an observation
   with a date (FRICTION-055), and the sha is what keeps a later snapshot
   from silently changing what the record meant.
3. **Index it with the version under test**, not the one it was measured
   with: `npx tsx src/cli/index.ts index` run from the clone, or the
   installed build if that is what is being checked. Its cache is local
   to the clone and gitignored there.
4. **Re-run the headline numbers the classification rests on** before
   trusting them. They are the reporter's measurements on the reporter's
   machine and version. `tests/eval/run-external-eval.ts --root <clone>`
   reaches retrieval; anything else is a command away. Where a number
   does not reproduce, that is a finding for the reply.
5. **Copy nothing from it into a record** beyond what the public issue
   already says, plus counts. Records ship whole (DD-071); the evidence
   repo is private by the reporter's choice, and that choice covers its
   content, not only its bytes.

### 2. Classify — each ask, not the issue

An issue is not one reading. Split it into its asks — the reporter's own
numbering where they gave one — plus anything triage itself turns up, and
classify each against the table. The issue's outcome is the set of its
asks' outcomes, and it closes when the last one does.

Issue #1 was one row read whole (a feature request → a discussion) and
six read ask by ask: two asks already met (answered), one false premise
needing a design change (a proposal), one needing a separate design
question (an open question), and two defects it never mentioned — the
route that already worked was undocumented where a markdown user would
look (FRICTION-056, a docs friction), and overlapping scan entries would
have blocked any route (FRICTION-057). Classifying the whole issue
would have filed the answerable parts under a discussion and left them
waiting on the design parts.

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
friction records ship whole (DD-071), so do not add private inference
about the reporter's project either. A discussion ships as a stub
(DD-073) with its reasoning in the private repo; the relationships block
is public in both halves, so its contexts follow the same rule.

### 4. Acknowledge — the step that must not be skipped

Comment naming the record id and what happens next. The reporter learns
their report landed, and they get an id they can cite.

That id is not in the package they already have — a record admitted
today ships in the next release. Before posting, check that every id the
comment cites is readable on public `main` (re-measure, FRICTION-055), or
say in the comment where it will appear.

**Everything the comment asserts about docdog's behaviour is run before
it is posted, not read from the code.** Code offered to the reporter goes
through a throwaway project on the version they have installed, with a
fixture shaped like their corpus — CRLF included if their environment
says Windows. A behaviour claim gets the same treatment. Issue #1's first
draft was wrong four ways, all of them caught this way and none by
reading: the sketch filed every row under the wrong collection
(FRICTION-058), split inside fenced code, and a fix to it silently did
not apply (FRICTION-059); and the draft's account of overlapping scan
entries, derived from the code, was contradicted by the first run
(FRICTION-057). A reporter who runs our wrong code learns not to trust
the next answer.

Then read the draft once against the issue's own words: every "this
meets ask N" checked against what ask N actually says. The first draft
claimed an ask its own §3 said was unmet.

The comment is public and permanent. An agent drafts it; the maintainer
approves the post.

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

- **Exercised once** — issue #1, 2026-09-25, recorded in DISC-042.
  Written before any external issue existed, from PROPOSAL-043's design,
  with a note to expect amendment after the first real sweep. The table's
  rows survived; what did not was classifying the issue as a unit (step
  2), the assumption that a new id is already in the reporter's package,
  and the absence of any rule that the reply be tested (step 4). Expect a
  second sweep to find something else.
- **Second sweep** — issues #2–#4, 2026-09-27. They were the first to
  rest on a measurement too large for an issue body, and step 1b was
  added for them: the evidence had arrived as an ad-hoc zip with no
  agreed shape and no place to live.
- Triage cadence is the maintainer's; the only hard rule is that the
  sweep happens before a release, because a fix that ships without its
  issue being closed strands the person who found it.
