---
id: OBS-005
title: "EJ→DD naming switch existed only in conversation; docdog couldn't retrieve it"
collection: observations
status: current
date: 2026-04-13
commit_hash: 9dd9b0611e4e4343839dd0cc72ba550bbf54ec58
description: "During the workflow-primitives discussion I proposed naming the new decision `DD-001` instead of the sequential EJ number. The user pointed out the EJ→DD switch had already been agreed on in a prior session. I searched docdog for the commitment and found nothing — every existing decision file is still `ej-NNN.md` and no spec captures the rename. The commitment lived only in conversation history and user memory."
relationships:
  - references: DD-034
    context: "this observation motivated the folder/numbering clauses in DD-034"
  - references: OBS-003
    context: "same failure mode as OBS-003 — context that should be in docdog but isn't, and the agent stumbles at the predictable moment"
  - references: EJ-030
    context: the memory-layer promise the miss indicts — the commitment lived in conversation, not the graph
  - references: EJ-024
    context: search hit in the recorded retrieval miss — dd_ namespace, but not the switch itself
  - references: OQ-25
    context: search hit in the recorded retrieval miss — prefix sorting, but not the switch itself
  - references: OQ-26
    context: search hit in the recorded retrieval miss — dd_patches scope, but not the switch itself
  - references: OQ-12
    context: search hit in the recorded retrieval miss — pre-v2 DD-* authority, but not the switch itself
  - references: PROPOSAL-017
    context: the planned EJ→DD stress-test that would make the uncaptured switch retrievable going forward
---

# OBS-005: The EJ→DD switch existed only in conversation

## Trigger

Mid-discussion on workflow primitives, the user asked me to write a
new decision capturing a reframe. I proposed numbering it `DD-001`
as a "clean slate." The user pushed back:

> *"have you forgotten, we've abandoned EJ? i would argue that with
> formalised workflows (that you'd create for yourself and follow,
> that would be captured). worth new observation? do you remember
> that we keep observations collection? that's the whole point of
> docdog — keep you on track with the context"*

I hadn't forgotten so much as never learned — the session-memory
file `project_orchestrator_migration.md` mentions DD-level thinking
in passing but doesn't state the EJ→DD commitment as a rule.

## What I looked for

Before responding, I ran:

```
docdog search "EJ abandoned DD naming decisions"
```

Top hits: `EJ-024` (dd_ namespace), `OQ-25` (prefix sorting),
`OQ-26` (dd_patches scope), `OQ-12` (DD-* decisions are
authoritative, in a pre-v2 context). **None of these captured the
EJ→DD switch as a decision.** No `DD-NNN.md` file exists. No
`ej-NNN.md` file mentions "we're renaming." No principle, no
discussion record, no proposal.

```
ls specs/decisions/
```

Returns `ej-001.md` through `ej-033.md`. Zero DD files. The
commitment to rename is real — the user confirmed — but it lives
only in conversation history and in the user's head.

## The failure mode

This is the same shape as OBS-003 (agent working on docdog fails to
use docdog for retrieval). There the failure was using the wrong
tool; here the failure is that the *right tool had nothing to
retrieve*, because the commitment was never written to a place
docdog could index.

The agent-side symptom is identical in both cases: I fell back to
my best guess, and my guess was wrong in a visible way. But the
root causes are different:

- **OBS-003:** I didn't use docdog when I should have. Agent-side
  failure.
- **OBS-005:** I used docdog; docdog had nothing. Capture-side
  failure. The commitment was never turned into an artifact.

The fix for OBS-003 is habit. The fix for OBS-005 is that more
commitments need to become artifacts — faster, as they're made,
with less ceremony. Discussion capture (as practiced in this
session) is one mechanism. Lightweight decisions are another. The
gap this observation reveals is that *we don't have a convention
for capturing micro-commitments* — renames, prefix changes, tiny
rule tweaks that are too small for a proper decision record but
too important to leave unwritten.

## What got captured this session as a result

- **DD-034 — Ejection resilience lives in artifacts, not in
  skills** — the actual reframe under discussion. Includes a
  "Naming note: EJ → DD" clause that makes the switch
  retrievable going forward.
- **PROPOSAL-017 — EJ→DD refactor as planned stress-test** —
  plans to create DD mirrors for each EJ-NNN, reframe through
  DD-034, retire EJ when references are gone. The user framed
  this as a stress-test for docdog itself: supersession at scale,
  soft-delete flow, reference-tracking, new `retired` status.
- **This observation.**

## Signal for future sessions

If you are reading this and you think "we agreed on X in the
prior session" but `docdog search "<X>"` returns nothing, trust
the search, not the memory. It means X was never captured. The
next move is: (1) confirm with the user, (2) write X as an
artifact immediately, (3) move on. Don't argue with the user about
whether X was agreed — they know; docdog can't know until you
write.

Commit hash above pins the repo state at the moment this was
written. Anyone retracing the session can `git show 9dd9b06` to
see exactly which specs did and didn't exist.
