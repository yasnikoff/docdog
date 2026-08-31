---
id: FRICTION-055
title: "A record can hold a claim about the world outside the corpus, and nothing — not status, not the index, not the reader — notices when the world moves"
collection: notes
status: open
description: "DD-073 was designed and built to keep 41 discussion records private. 37 of them had been public for 17 days. The corpus said otherwise, in a sentence that was true when written and was read seven weeks later as a statement of the present."
severity: inconvenient
relationships:
  - references: DD-071
    context: "the record that carried the stale claim — its 2026-07-11 audit line said origin/main was an empty initial commit, which stopped being true on 2026-08-14"
  - references: DD-073
    context: "the decision built on that claim, which kept four records private while its Context section reasoned about forty-one"
  - references: FRICTION-044
    context: "the same error class four days earlier and one domain over — a mechanism inferred from an artefact instead of measured — plus its finding that a severity is a claim about the world rather than about the cost of acting"
  - references: FRICTION-053
    context: "the fix that does NOT reach this: it made every read surface disclose a record's status, and DD-071's status was correct throughout"
  - references: OBS-027
    context: "the precedent that refuses the obvious remedy — a second hand-maintained axis across the corpus, to police the first"
  - references: DP-001
    context: "tier 3, and unboundedly so: verifying a claim about the world requires knowing which world, which is not in the record"
  - references: OBS-019
    context: "the discipline this failed to apply outward — measure the thing rather than inferring it, which was being followed rigorously inside the corpus the whole time"
---

# FRICTION-055: the corpus cannot know the world moved

## What I was trying to do

Decide whether docdog's 41 discussion records should be published, and
if not, how to withhold them without dangling the 117 edges that point
at them (DD-073).

## What went wrong

The prior question — *are they public already?* — was never asked,
because the corpus had already answered it. DD-071, `status: current`,
retrieved at rank 1 for exactly this topic, says:

> `origin/main` today is a single empty "Initial commit", so nothing
> sensitive is public yet.

True on 2026-07-11. False from **2026-08-14**, when three cuts were
pushed to a public repository carrying **37 of the 41 records in
full**.

So a measurement, a decision record, an observation record, a friction
record, a repo split and two commits were produced to protect
something that had been public for 17 days. The check that would have
caught it was `gh repo view yasnikoff/docdog` — one command, run for
the first time hours later, at the publish step.

## Why nothing caught it

**`status` is the wrong instrument and was working correctly.**
DD-071 is `current`, and it should be: its four clauses are live
policy. What went stale was one dated observation *inside* a record
whose decisions did not. Status is per-record; this claim is per
-sentence, and no per-record field can be right about both.

**FRICTION-053 does not reach it either.** That closed the gap where
`search` and `traverse` would not say whether a record was live. Here
every surface said `current`, accurately.

**The prose was dated and it did not help.** The sentence says
"today". It was still read as the present, because a retrieval surface
returns a passage stripped of its distance from now — and the standing
habit in this project is that corpus questions go through docdog
rather than around it, which is right for what the corpus is for and
was wrong here.

## The distinction that was missing

A record holds two kinds of claim and treats them identically:

| | example | ages |
|---|---|---|
| **what was decided** | "the public history starts at publication" | no — it is the decision |
| **what was observed** | "origin/main is a single empty commit" | yes, silently, immediately |

The first is what a corpus is for and is durable by construction. The
second is a **measurement with a timestamp**, and the corpus stores it
in the same paragraph, at the same status, retrieved by the same
query, with the same authority.

## What should change in docdog

**Nothing in code, and the refusal is not close.** Verifying a claim
about the world requires knowing which world — a remote, a registry, a
filesystem, a person's intention — and that is not in the record.
DP-001 tier 3, unboundedly.

**And not a field, either.** A `verify_by:` or `expires_at:` on
records that make external claims is a second hand-maintained axis
added to police the first, which is precisely what OBS-027 refused for
`outdated` and for the same reason: the convention that must be
remembered is the one that will not be.

What should change is **guidance, in the two places guidance lives**
(this project's CLAUDE.md and the injectable `specs` skill):

> The corpus records what was decided, and what was true when it was
> written. It is not a monitor. Before acting on a corpus claim about
> mutable state outside the repository — what is published, what is
> installed, what a registry holds, what another repo contains —
> re-measure it. It costs one command.

That is a rule for the reader, which is the honest place for it: the
failure was not that docdog served a stale sentence, it is that
docdog cannot know the sentence was about anything but itself.

## On the severity

`inconvenient`, and the label is poor. Nothing was blocked; the
workaround was one command; and the cost was a public repository
deleted and recreated, 17 days of exposure that deletion cannot undo,
and a day of work done against a false premise.

The taxonomy has no slot for *cheap to work around, expensive to have
been wrong about*. FRICTION-044 found the mirror of this four days
ago — a severity inflated because the fix was cheap — so the rule
that falls out of the pair is that **a severity should describe the
consequence, not the remedy**, and this vocabulary can only describe
the remedy.
