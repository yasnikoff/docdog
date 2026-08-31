---
id: DP-004
title: "A record is one retrievable idea — compose it so it fits the embed cap, because the cap is a property of the retrieval unit and not a bug to be engineered around"
collection: principles
status: proposed
date: 2026-07-28
relationships:
  - discussed_in: DISC-034
    context: "the thread that produced it; the user's half of the design was 'rely on discipline, tell users loudly', and this is that half written as a reviewable criterion instead of README prose"
  - references: DP-001
    context: "its sibling in shape — DP-001 keeps judgment out of code, and this keeps a judgment (where a document divides) with the author rather than letting a tool or a bigger cap absorb it"
  - references: FRICTION-031
    context: "the disclosure that made the cap visible and shipped the reporting this principle is reviewed against; that note accepted the hole, this states what authors do about it"
  - references: OBS-019
    context: "the measurement that keeps this principle honest — over-cap records retrieve WELL, so the justification here is the retrieval unit and the token cost, never 'otherwise search breaks'"
  - references: OBS-016
    context: "why the alternative was foreclosed: every index-time design that tried to make long records fit made retrieval worse, which is what leaves authoring as the remaining lever"
  - references: PROPOSAL-038
    context: "the remediation tool for records already past the line; principle and tool are the same rule at authoring time and at migration time, and neither substitutes for the other"
description: "A docdog record should be one retrievable idea, composed to fit under MAX_EMBED_CHARS. Not because over-cap records fail — OBS-019 measured that they retrieve well — but because the record is the unit search returns and an agent then reads, and a record holding several ideas returns all of them to answer a question about one. The cap is the visible proxy for a compositional property, and the three index-time attempts to engineer around it (chunking, late chunking, raising the cap) were each measured and each made retrieval worse. Stated as proposed, not accepted: 54 of this repo's own 322 records violate it today, including DD-070."
---

# DP-004: a record is one retrievable idea

## Statement

**A record should express one retrievable idea, and should be composed so that
it fits under `MAX_EMBED_CHARS`.**

Two clauses, and the order matters — the first is the principle and the second
is its operational proxy.

### Clause 1 — one idea per record

The record is docdog's unit of retrieval and of delivery: search ranks records,
`get` returns records, an agent reads a record. A record holding five ideas
answers a question about one of them by handing the reader all five. The cost
is paid on every hit, forever, by every consumer.

So the compositional target is not a length. It is: *could a reader who wanted
exactly this record's subject have been given less?*

### Clause 2 — the cap is the proxy

`MAX_EMBED_CHARS` (8,000) is not itself the principle, but it is the only
mechanical signal of clause 1 that docdog can report, and it is already
reported: `docdog index` warns with the corpus share and `docdog status` lists
the records (FRICTION-031). Treat crossing it as the prompt to ask clause 1's
question — not as an error.

## What this principle does NOT claim

This matters more than usual, because the obvious justification is false and
the corpus has measured it false.

**It does not claim over-cap records retrieve badly.** OBS-019 measured the
opposite, twice over: raising the cap so every record embeds whole made
retrieval *worse* (hybrid 0.874 → 0.846), and the gold record's cosine to its
own query fell on **12 of 12** pairs. These records open with framing and close
with detail, so truncation is accidentally summarizing and the truncated prefix
is the better vector. DD-070 ranks 2nd for *"which decisions did DD-070
supersede"* while the section that answers it has never been embedded, because
FTS indexes the full body and the two legs fail differently (OBS-018).

**So the argument is not "otherwise search breaks."** It is:

1. **The retrieval unit is the delivery unit.** A hit on a 24,000-char record
   costs the reader 24,000 chars to answer a question about 2,000 of them.
   MRR cannot see this and it is the largest practical cost.
2. **Each idea deserves its own description.** A description is authored, and
   fts5 indexes title/description/body — one record means one description
   covering five subjects, which serves each of them worse.
3. **The alternatives were tried and each lost.** Naive chunking (OBS-016,
   0.874 → 0.785), late chunking (OBS-020, → 0.838), raising the cap (OBS-019,
   → 0.846). Every index-time attempt to make long records fit made retrieval
   worse. Authoring is what is left, which is why this is a principle and not a
   feature.

## Reviewable form

Applied to a record being written or reviewed:

- Does its description describe **one** thing, or does it enumerate?
- Would a reader searching for its subject want the whole body, or a fifth of
  it?
- If it is over the cap: is the tail a *different idea* (split it), or the same
  idea in detail (leave it — OBS-019 says the prefix is doing fine)?

That third question is the one that keeps this principle from becoming a
length rule. **Long is not the defect. Plural is the defect.**

## Standing tension, stated rather than hidden

This principle is **violated by 54 of this repo's 322 records — 15.4% of the
corpus** as of 2026-07-28, and the violators are the hubs: PROPOSAL-018 at
24,311 chars, DISC-019 at 24,238, PROPOSAL-003 at 23,228, DD-070 itself.

Stating a principle the day its author's own corpus fails it 54 times is either
dishonest or it is the point. It is the point, on one condition: that the
number is treated as a live measurement rather than a debt to be paid off in a
sweep. Several of those records are *narratives* — a discussion, a measurement
writeup — where the plural-ness is the content and splitting would destroy the
argument's arc. Clause 1's third question exists for them.

Which is why this ships **proposed, not accepted**. Ratifying it means agreeing
on how it applies to the 54, and that argument has not been had.
