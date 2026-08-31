---
id: OBS-027
title: "Stale records are not over-represented in retrieval — they are under-represented, and the corpus hand-wrote 71 status banners because no ranked surface would say so"
collection: observations
status: current
date: 2026-08-30
description: "Measured the staleness axis before designing for it: 15.0% of top-5 slots against a 17.2% corpus share, 6 of 40 queries where a stale record outranks the gold, 3 of 62 for the supersession-orphan proxy, and 71 of 360 records carrying a hand-written status banner."
relationships:
  - references: DISC-041
    context: "the discussion this measures — Axis 2 named three gaps and this settles which of them is real"
  - references: DISC-012
    context: "the decision this argues against completing: `outdated` was decided as a second axis, and the measurement says the surface, not the vocabulary, was the missing thing"
  - references: DP-001
    context: "the line the refused designs cross — deciding a record is stale, and deciding how much a stale record should be penalized, are both judgment"
  - references: DP-003
    context: "clause 3 at 71 instantiations rather than 3 — the hand-written status banner is an escape hatch for a surface that would not show the field"
  - references: OBS-019
    context: "the discipline applied here — measure the harm and its mechanism before building the fix, because an aggregate cannot tell you a design is succeeding for the opposite of its stated reason"
  - references: OBS-018
    context: "the frozen 40 and the ranker this reuses; the argmax it settled is what makes leave-the-ranker-alone the default answer here"
  - references: FRICTION-053
    context: "the defect this measurement located, and the one change that shipped from it"
  - references: DD-058
    context: the single anecdote this record was written to replace — DISC-041 offered `DD-058:superseded` at rank 5 as the whole evidence for retrieval being staleness-blind
  - references: OBS-011
    context: one of the two edge-triage drains that explain finding 3 — 95% of stale records are still referenced by live ones because those drains connected them
  - references: OBS-014
    context: the second drain behind finding 3, and the source of the skip taxonomy these measurements' own edge candidates were judged against
  - references: OBS-024
    context: the precedent for the refused ranking change — it concluded a static configurable leg weight is the only shape DP-001 licenses, and the same reasoning kills a status weight here
---

# OBS-027: staleness is a disclosure problem, not a ranking problem

## Why measure

DISC-041's Axis 2 asserted three gaps: the decided `outdated` primitive
was never built, there is no temporal signal, and **retrieval is
staleness-blind** — the last offered with a single anecdote
(`DD-058:superseded` at rank 5). Three prior observations in this
corpus each overturned a retrieval intuition that looked at least as
safe, so an anecdote is not something to design against.

Instrument: the frozen 40 (`tests/eval/queries.yaml`) through the real
`search()`, plus direct cache queries. Corpus at measurement: **360
records, 1,898 edges, 62 with a stale status** (`superseded` 54,
`obsolete` 7, `deprecated` 1) = **17.2%**.

## Finding 1 — there is no ranking bias to correct

| | |
|---|---|
| stale records in top-5 | **30 / 200 slots = 15.0%** |
| their share of the corpus | **17.2%** |
| queries with at least one stale record in the top 5 | 20 / 40 |
| queries whose rank-1 is stale | 7 / 40 |
| queries where a stale record outranks the gold | **6 / 40** |

Stale material appears in results at **slightly below** its share of
the corpus. The ranker neither promotes nor penalizes it; it is
proportional, which is what "staleness-blind" actually means.

**This inverts the remedy.** A status penalty, or a default
`--exclude-status` on search, would not be removing a bias — it would
be introducing one. And the six outranking cases show why that is not
obviously desirable:

```
q02  "why was the workflow engine removed from docdog"
     EJ-030 (superseded) at 1, gold at 2
q18  "changing a record collection in frontmatter did not take effect"
     PROPOSAL-002 (superseded) at 1, gold at 2
q20  "a shipped collection name clashed with the host project"
     DD-061 (superseded) at 1, gold at 2
q05  "what did we replace ArangoDB with"
     OQ-25 (superseded) at 1, gold MISS
```

Four of the six put the gold at rank 2 — displaced by one slot. And on
`q02` the superseded record is arguably the better answer: the question
is historical. DISC-012 said exactly this in the decision that proposed
the second axis — *a superseded decision with `outdated: false` is
still the best historical entry point for its topic.* Penalizing it
costs that.

## Finding 2 — the corpus already routed around the real defect, 71 times

`docdog list` and `docdog get` print a record's status. **`docdog
search` and `docdog traverse` did not**, on either the CLI or the MCP
half.

So the corpus wrote it into the body by hand:

| | |
|---|---|
| stale records opening with a written-out status banner | **61 of 62** |
| non-stale records carrying one anyway (`shipped`, `resolved`, `rejected`) | **10** |
| **total** | **71 of 360 = 19.7%** |

```
EJ-030   **Superseded 2026-04-13** — see DD-066 for the current framing…
WF-004   **Status note (2026-08-27): deprecated — do not follow this.**
OQ-18    **Status note (2026-07-11, FEATURE-002):** resolved by DD-070…
```

The convention is broader than staleness: it is *tell the reader what
state this record is in*, applied wherever someone expected a reader to
arrive without having run `get`. DP-003 clause 3 makes three
hand-rollings the trigger for a toolbelt gap. This is **71**.

**The cost is not the bytes.** The banners total 5,578 characters
across 61 records — nothing against a 1.7 MB corpus — and no case was
found where a banner contradicts its frontmatter. The cost is
structural, and it is the argument DISC-041 Round 3 used against
projection, one level in: **a second copy of a field, maintained by
memory, free to disagree with the field it copies.** One omission
exists already — `DD-052` is superseded and carries no banner — and
nothing can detect it, because nothing knows a banner was supposed to
be there.

## Finding 3 — the supersession-orphan proxy is nearly empty

DISC-041 proposed "superseded records that no current record points at"
as the mechanical candidate set. Measured over all 62:

| | |
|---|---|
| pointed at by at least one live record | **59** |
| inbound edges only from other stale records | **3** |
| no inbound edges at all | **0** |
| **candidate set** | **3** — `EJ-020`, `EJ-025`, `EJ-026` |

All three are v1-era Arango/Foxx decisions, and all three are genuine
retirement candidates. So the proxy is **precise and tiny**: 95% of
stale records are still referenced by live ones, which is what two
edge-triage drains (OBS-011, OBS-014) were for.

That makes it a good filter and a poor command. Three results do not
justify a surface, and the query needs a join `list` cannot express, so
it stays a hand-rolled script — and this record is the baseline the
second hand-rolling should be measured against.

## What shipped, and what was refused

**Shipped:** FRICTION-053 — `search` and `traverse` disclose `status`
on both the CLI and MCP halves, plus `traverse --json`, whose
projection dropped the field entirely.

**Refused, on this evidence:**

- **A status penalty in the ranker.** Finding 1: there is no bias to
  correct, and the displacement is one slot on 4 of 40 queries. DP-001
  tier 2 would license a *static, configurable* weight, exactly as
  OBS-024 concluded for leg weights — but a knob whose default must be
  off, for a harm this size, is a knob nobody sets.
- **A default `--exclude-status` on search.** Same reason, worse: it
  would hide `q02`'s best answer.
- **`outdated` as a second axis (DISC-012).** Finding 2 says the field
  was not the missing thing — the corpus was already writing the status
  it *had* into body text, because no ranked surface would show it.
  Adding a second hand-maintained axis across 360 records to fix the
  visibility of the first hand-maintained axis repeats the mistake one
  layer up.
- **Auto-deriving it** — DISC-012's own deferred follow-up, *supersedes
  inbound plus zero current inbound refs, auto-flip*. Finding 3 says
  that predicate fires on 3 of 62, and it is an inference either way
  (DP-001 tier 3).

## The rule to carry

**Before weighting a ranker against a category, check whether the
category is over-represented.** It cost one query per record and it
reversed the design: the number that mattered was not *how often stale
records appear* but *how that compares to how often they exist*. 15.0
against 17.2 says the ranker was never the problem — the reader simply
could not see which was which.
