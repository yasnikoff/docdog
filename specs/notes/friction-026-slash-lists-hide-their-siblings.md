---
id: FRICTION-026
title: "suggest-edges reads only the head of a slash-list, so the scanner manufactures the arbitrary subset its own taxonomy says to reject"
collection: notes
status: resolved
resolution: patch
description: "`docdog suggest-edges` matched ids with `[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\\d+`, which stops at the first number: `OQ-18/19/21` yielded OQ-18 alone and `PROPOSAL-025/026` yielded PROPOSAL-025 alone. The siblings were not merely missed — the report offered an edge to one member of a set and silently hid the rest, which is exactly the arbitrary-subset shape OBS-011's skip taxonomy tells reviewers to reject. Fixed by extending the grammar with a slash continuation (`(?:/\\d+)*`) whose bare numbers repeat the head's stem."
severity: inconvenient
source: self-host (OBS-011 first sighting, OBS-014 recurrence)
relationships:
  - references: PROPOSAL-024
    context: "the spec home of the mention grammar — its 'multi-segment ids matched whole' bullet is what this amends; the v2 tail bug and this head bug are the same class, caught at opposite ends of the id"
  - references: OBS-011
    context: "first sighting: the triage hand-added DD-070's FRICTION-009/011/015 because the tool could not see past FRICTION-006, and called a parser fix 'a nicety if it recurs'"
  - references: OBS-014
    context: "the recurrence that made the case — two collections, and the failure named precisely: the scanner manufacturing the arbitrary subset rather than finding it. This note is its 'strongest standing case for a parser fix' being cashed"
  - references: DP-001
    context: "tier-1 mechanics: the expansion is lexical (repeat the stem behind a slash-run), and it judges nothing — the known-id intersection that already drops UTF-8 and SHA-256 drops DD-070/2 the same way, and every surfaced sibling still faces agent review"
  - references: FRICTION-025
    context: "the other half of the same drain's tail: this fix grows the candidate set (+26 here), and every sibling it surfaces that a reviewer rejects becomes residue FRICTION-025 has nowhere durable to record"
  - references: WF-002
    context: dogfooding surfaced it twice on docdog's own corpus before it was worth fixing — the second sighting is what turned a nicety into a defect
---

# FRICTION-026: slash-lists hid their siblings

## What happened

Authors write sibling ids as a slash-list — `OQ-18/19/21`,
`PROPOSAL-025/026`, `FRICTION-006/009/011/015`, `WF-001/002/003`. The
scanner's mention grammar ended at the first `-\d+`, so it saw the head
and nothing else. The bare numbers after the slashes matched no rule and
were dropped as prose.

The missed edges were the small half of the cost. The real damage: the
report **offered an edge to OQ-18 and not to OQ-19 or OQ-21** — one
member of a set, chosen by nothing but writing order. OBS-011's skip
taxonomy (category 3, range/roster endpoints) tells reviewers to reject
exactly that shape, on the grounds that edges to *whichever members
happen to be named* are an arbitrary subset. The scanner was generating
that shape itself, so the taxonomy fired on the tool's own artifact and
the reviewer's correct move was to skip a candidate that was in fact a
real sibling reference. A blind spot that only loses edges is a nicety;
one that produces judgment-corrupting candidates is a defect.

## Why it took two sightings

OBS-011 saw it and priced it as "a parser nicety if it recurs" — its
triage simply hand-added the three edges the tool could not see
(DD-070 → FRICTION-009/011/015, invisible inside the slash-list
`FRICTION-006/009/011/015`). That was the right call at the time: one
manual fix-up is cheaper than a parser change. OBS-014 hit it again in
two more collections, with the arbitrary subset now *visible in the
candidate list itself*, and named it the strongest standing case for a
parser fix. Two drains, one shape, escalating cost — that is the
threshold.

## The fix

`src/storage/suggest.ts`. The grammar gains a slash continuation, and
one lexical rule expands it:

```
/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+(?:\/\d+)*\b/g
```

A `/<digits>` group riding immediately behind an id repeats that id's
stem — everything up to and including its final dash. `OQ-18/19/21` →
OQ-18, OQ-19, OQ-21. `DD-ARCH-01/02` → DD-ARCH-01, DD-ARCH-02. The
digits are used as written, never renumbered.

Adjacency is the whole guard. A separator that is not `/`, a lowercase
tail, or a space breaks the run: `DD-070/PROPOSAL-024` is two ids,
`specs/decisions/dd-001.md` is none, and `DD-070 §3, 2 of 3 done` is one.
Everything else is caught downstream — `DD-070/2` expands to `DD-2` and
dies on the known-id intersection, the same net that has always dropped
UTF-8 and SHA-256. Nothing was added to that net; the expansion is
lexical and the arbiter of what is real stays where it was.

## What it surfaced

Re-scanning this corpus (280 files, 1,322 edges) with the fixed grammar:

| | |
|---|---|
| candidates before | 264 |
| candidates after | **290** (+26) |
| sources gaining candidates | 14, across 8 collections |
| false positives among the 26 | **0** |

Every one of the 26 is a genuine sibling of a genuine slash-list —
DISC-024 → OQ-19/OQ-21, TASK-004 → TASK-002/003, WF-004 → WF-002,
OBS-003 → DISC-007/008. Not one expansion survived the known-id
intersection by accident, which is the evidence that adjacency-plus-digits
is a tight rule and not a loose one.

The 26 are candidates, not edges: they faced the same review as
everything else the scanner reports.

## The drain

Once this note and the two amendments were themselves indexed, the crop
rose to **34** — a note about slash-lists is necessarily thick with
slash-lists. All 34 were judged, and the head of each list turned out to
be the whole reconciliation:

- **Where the head was already an edge, the sibling completes it.** The
  source asserted one reference and the scanner had recorded half of it.
  Ten such rows were accepted (EJ-030 → OQ-28, FEATURE-002 →
  PROPOSAL-026, TASK-004 → TASK-002 and TASK-003, TASK-006 → OQ-19 and
  OQ-21, WF-004 → WF-002, and three more), applied via `--accept-from`
  in one write per file. Edges 1,339 → **1,349**; context coverage 66%.
  Source status did not gate these: completing a set the frozen text
  already declares repairs the tool's own damage, it does not add a new
  relationship to an era-frozen record.
- **Where the head was deliberately skipped, the sibling inherits the
  skip.** Twenty-four rows, and *this is the fix working*, not failing.
  A skipped head means the reviewer judged the whole mention not-an-edge;
  the siblings were always part of that same judgment and were merely
  invisible. The scanner now shows the reviewer the entire set, which is
  the point: **the yield of this fix is one verdict per set, not more
  edges.**
- **The taxonomy handled this note's own body.** FRICTION-026 generated
  six candidates of its own — every slash-list quoted above as an example
  of the bug. All six are skips under existing categories: illustrations
  (category 2) and third-party edge mentions (category 6, e.g. narrating
  `DD-070 → FRICTION-009/011/015`). The documentation of a bug is not a
  reference to the records it names.

## What the drain found in the last drain

The head verdicts exposed a **cross-batch inconsistency in OBS-014's
own drain**: `PROPOSAL-025/026` appears in FRICTION-010, FRICTION-012
and FEATURE-002 in the same sense, and the parallel per-collection
agents accepted it from two of them and skipped it from the third. No
agent was wrong on its own evidence; none could see the other two. That
is OBS-014's "central reconciliation is not optional" showing up as a
measurable defect rather than a warning, and it is a second argument for
FRICTION-025 — a skip that lived somewhere durable would have been
diffable across batches instead of re-derived from prose three times.

This drain left it alone. Re-judging settled residue is out of scope for
a parser fix, and the inconsistency is now recorded rather than silently
inherited.

## Verification

`mentionedIds()` is exported and directly tested, so the grammar is
provable without building a corpus: slash-lists, stem repetition,
digits-as-written, the three adjacency breaks, dates and versions
(`2026-07-14`, `HTTP/2`), and dedupe in reading order. One end-to-end
fixture (DD-004) proves the expansions survive the known-id filter and
the unknown ones (`DD-404/405`, `DD-002/9`) do not. 270 tests pass, up
from 264.
