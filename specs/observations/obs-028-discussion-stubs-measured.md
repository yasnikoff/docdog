---
id: OBS-028
title: "Discussion records held 30% of top-5 slots for an 11% corpus share — stubbing them improved retrieval, and the instrument cannot see what that costs"
collection: observations
status: current
date: 2026-08-31
description: "Measured the history stub before building it: four corpus variants through the frozen 40. Hybrid MRR 0.805 -> 0.836, DISC occupancy of top-5 slots 30.0% -> 1.0%, and keeping the full relationship graph costs exactly nothing because FTS never sees frontmatter."
relationships:
  - references: DD-073
    context: "the decision this was measured for — every number here decides one field of the stub's frontmatter"
  - references: DISC-041
    context: "the discussion that endorsed the stub *pending measurement*; this is that measurement, and it also changes the comparison — Round 3 justified the stub against deletion, this justifies it against publishing whole"
  - references: OBS-027
    context: "the rule this applies, four days later, to a different category and with the opposite answer — stale records were under-represented, discussion records are 2.7x over-represented"
  - references: OBS-024
    context: "the boundary that bounds this result: the frozen 40 are record-finding queries, and the content a stub removes is exactly what a detail query would need"
  - references: OBS-019
    context: "the discipline followed here — when an arm wins, measure its mechanism rather than its score; the occupancy inversion is that mechanism"
  - references: OBS-018
    context: "the frozen 40, the ranker, and the 0.013 noise floor every delta below is judged against"
  - references: DD-071
    context: "the clause this measurement supports amending — 'the corpus ships whole' rejected curation partly on a shipped-eval argument that turns out to be two queries in forty"
---

# OBS-028: stubbing the discussions

## Why measure

DISC-041 Round 3 endorsed the history stub "only pending measurement",
and the reason was a track record: four prior observations in this
corpus each overturned a retrieval intuition that looked safe
(OBS-016, OBS-017, OBS-019, OBS-020).

The comparison also moved. Round 3 justified the stub as *better than
deleting the record*, where retrieval is zero and any result wins.
This measures it against *publishing the record whole* — the harder
comparison, and the one DD-073 actually makes.

## Method

Four copies of the corpus at 362 records, differing only in what the
41 `DISC-` files contain, each indexed from a shared embed store and
run through the frozen 40 with the real `search()`.

| variant | the 41 DISC files hold |
|---|---|
| `base` | the full records, unchanged |
| `rich` | frontmatter + description + relationships, body replaced by a pointer |
| `graph` | frontmatter + relationships, **no description** |
| `bare` | frontmatter only — id, title, collection, status |

## Finding 1 — stubbing improves the aggregate

| variant | hybrid MRR | Hit@1 | Hit@5 | edges |
|---|---|---|---|---|
| `base` | 0.8049 | 28/40 | 37/40 | 1918 |
| `rich` | 0.8174 | 29/40 | 37/40 | 1918 |
| `graph` | **0.8361** | **30/40** | 38/40 | **1918** |
| `bare` | 0.8361 | 30/40 | 38/40 | 1541 |

The live split, executed and re-measured on this repo, lands at
**0.8319 / 30** — inside the noise floor of the `graph` arm it was
built from.

Both DISC-gold queries hold their exact ranks in every variant: `q18`
at 2, `q37` at 1. `q40`, a miss in `base`, becomes rank 4.

## Finding 2 — the mechanism is an occupancy inversion

An aggregate cannot say *why* an arm wins (OBS-020), so:

| | top-5 slots held by DISC records | rank-1 |
|---|---|---|
| `base` | **60 / 200 = 30.0%** | 15 / 40 |
| `rich` | 4 / 200 = 2.0% | 0 / 40 |
| `graph` | **2 / 200 = 1.0%** | 0 / 40 |

Discussion records are **11.3%** of the corpus (41 of 362) and were
taking **30.0%** of the visible slots — 2.7x over-represented, rank 1
on 15 of 40 queries. They are long (19.0% of body characters for
11.3% of records) and each ranges over many topics, so they are
partially plausible for almost any question.

This is OBS-027's rule run again and answered the other way. There,
stale records held 15.0% of slots against a 17.2% share, and a
penalty would have *introduced* a bias. Here the category really is
over-represented — which is what makes the rule worth having rather
than a way of always saying no.

## Finding 3 — keeping the whole relationship graph is free

`graph` and `bare` score **identically to four decimal places** on all
three legs. That is mechanically necessary rather than a coincidence:
`fts` is fts5 over **title / description / body** (`storage/indexer.ts`),
and the embed input is body-derived, so a `relationships:` block reaches
neither leg. Edges are invisible to search and always were.

So the 377 outbound edges cost nothing to keep, and `bare` loses them
for no gain. This decides DD-073's largest field on a fact rather than
a preference.

## Finding 4 — the description is the only text lever, and it is nearly free

`rich` minus `graph` is the description and nothing else: **-0.019
MRR**, one Hit@1, and 2 extra top-5 slots out of 200. That is barely
above the 0.013 noise floor and traces to one or two rank-1-to-2
displacements.

**So retrieval does not decide this field.** What decides it is volume:
the 41 descriptions total **25,752 characters**, median 485, max 1,717 —
summaries, not one-liners, and DISC-014's opens with its full
resolution. Publishing them publishes 8% of the discussion prose the
split exists to withhold, for a measurement at the edge of the
instrument.

Volumes, for the record:

| tier | DISC prose published | share of 323,622 ch |
|---|---|---|
| `rich` | 69,265 ch | 21.4% |
| `graph` | 43,513 ch (295 edge contexts) | 13.4% |
| edges without contexts | ~0 | 0% |

## What this measurement cannot see, and it is the important part

**The frozen 40 are record-finding queries.** OBS-024 established that
the fusion result flips on detail questions whose answer sits in a
body past the embed cap. A stub *has no body*. Every question whose
answer lived inside a discussion's reasoning is now unanswerable from
the public corpus, and no number above moves when that happens,
because the query set does not ask.

That is not a retrieval regression. It is the intended content
removal, and the eval is structurally blind to it. Recording the
0.836 without this sentence would be the misuse of this record.

**The improvement is partly circular.** Only 2 of 40 golds name a
discussion, so removing discussion records partly measures "deleting
non-golds improves gold-finding". The occupancy inversion is not
circular — it is a fact about the ranker, independent of what the
golds are.

**`q37` is the friendly case.** Its query names LangGraph and XState,
which appear in DISC-015's title, so a title-only stub ranking 1 shows
that titles retrieve, not that stubs do. One query is not evidence;
the occupancy number is.

## The rule to carry

**A record's identity survives the loss of its body; its content does
not, and only one of those is on the instrument.** The eval measured
the half that was never at risk. The half that was at risk — 323,622
characters of reasoning — is a decision to be argued, and DD-073
argues it.
