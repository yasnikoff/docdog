---
id: OBS-014
title: "Second full suggest-edges drain: 135 edges through the new applier, a sixth skip category, and a cross-batch conflict only a central reviewer could settle"
collection: observations
status: current
date: 2026-07-14
description: "PROPOSAL-028's first use in anger, and the first drain that wasn't a hand-script: 389 candidates → 138 pruned by standing rules → 251 live → 135 accepted, 116 skipped. Nine batch applies across 39 files, one write and one reindex per file; the idempotent re-run skipped all 135. Judgment ran as seven parallel per-collection agents, which reproduced OBS-011's taxonomy independently — and disagreed on exactly one shape, the FEATURE-002 sweep byline, which is the finding: a reciprocal edge is not a second relationship, and only a central reviewer sees the conflict. Adds a sixth skip category (third-party edge mentions) and confirms the scanner's blind spots recur."
relationships:
  - references: OBS-011
    context: "the first triage, and the baseline this one diffs against — its skip taxonomy held on unseen candidates, which is the strongest evidence it is real and not a post-hoc rationalization"
  - references: PROPOSAL-028
    context: "first use in anger: nine batch applies, 39 files, zero skips on apply, and an idempotent re-run that wrote nothing — the design's claims held at 135-edge scale"
  - references: FRICTION-025
    context: "the limitation this drain surfaced: rejection is not durable, so 116 skips must be re-judged from prose on every future sweep — and that number only grows"
  - references: FRICTION-012
    context: "the forward-only convention is what settled the cross-batch conflict: a record → sweep back-edge is the reciprocal of an edge the sweep already declares, and traverse reads inbound for free"
  - references: DP-001
    context: "the division held again, and visibly: the tool swept and applied mechanically, while every accept, skip and the one cross-batch reconciliation was an agent judgment written down before the tool ran"
  - references: WF-003
    context: "executed as nine per-collection batches, one commit each — the batch discipline, now with the review file as the reviewable artifact rather than a throwaway script"
  - references: FEATURE-002
    context: "the sweep whose editorial byline produced the one shape the parallel batches judged differently; its roster edges are the forward direction that made the back-edges redundant"
---

# OBS-014: Second full suggest-edges drain

## What ran

The first drain that was not a hand-written script. `docdog
suggest-edges --format review` emitted the candidates, seven parallel
per-collection agents judged them against OBS-011's taxonomy and wrote
contexts, and `--accept-from` applied the survivors in nine batches —
one commit each (WF-003).

## Numbers

| | |
|---|---|
| candidates at scan | **389** across 121 sources |
| pruned by standing rules | **138** (117 superseded-source, 21 skill/template/CONTRIBUTING) |
| live, triaged | **251** across 59 sources |
| **accepted** | **135** (134 `references`, 1 `companion`) |
| skipped individually | **116** |
| residue after drain | **254** = 138 + 116, exactly |
| files written | 39 — one write, one reindex each |
| edges in cache | 1,187 → **1,322** |
| edge context coverage | 57% → **65%** |

Re-scan after the drain: **135 candidates gone, zero new** — the diff
is precisely the accepted set. Re-running the same accept file applied
nothing and skipped all 135 as already declared, writing no file.
Idempotency is now a property of the tool, not of a careful script.

Acceptance rate on live candidates: **54%** (OBS-011: 61%). The tool
over-reports by design; the skip rate is the judgment layer working.

## The finding: a reciprocal edge is not a second relationship

Seven agents judged in isolation and agreed on everything except one
shape, which is exactly the value of running them in parallel — the
disagreement is the signal.

~24 records carry a `**Status note (2026-07-11, FEATURE-002):**`
byline from the staleness sweep. The discussions batch read it as
closure provenance and accepted it. The proposals and questions
batches read it as an editorial byline and skipped it. Two of three
skipped, and they were right — but the decisive argument was in
neither batch, because neither could see the other's work:

**FEATURE-002 already declares the forward edge.** Its roster names
every record the sweep acted on (accepted here as a complete
enumeration, 28 edges). A record → FEATURE-002 back-edge is that same
relationship stored a second time, in the opposite direction, and
`traverse` reads edges inbound for free — so the reciprocal answers no
question the forward edge doesn't already answer. It only doubles a
hub's fan-out, which OBS-011 identified as the real overfetch control.
Four such rows were dropped centrally (DISC-014, DISC-015, DISC-024,
STATUS-ORCH-MIGRATION).

This is FRICTION-012's forward-only convention, arrived at from a new
direction: it is usually stated as "never store `superseded_by`", but
the deeper rule is **one relationship, one edge, in the direction the
source asserts it**. A same-typed reciprocal is the same mistake
wearing a legal type name.

> **Scope, added 2026-07-17.** That last sentence is too broad, and it
> misled a reader into nearly deleting 224 edges — 15% of the corpus —
> on the strength of it. **A reciprocal is not per se the mistake.** The
> mistake is an **echo**: a back-edge re-stating a relationship the other
> record *already asserts*. The operative test is the one this section
> already gives — *does the reciprocal answer a question the forward edge
> doesn't already answer?* FEATURE-002 fails it because the roster is one
> fact with one asserter, and the 24 records merely bear its byline.
>
> Two records that each **substantively engage** the other are a different
> shape: `references` is not inherently directional — it asserts "my text
> engages this record" — so each side is an independent fact with its own
> context, and rule 1 (outbound only, from the record you are working with)
> *produces* the pair by design. This corpus holds **112** such pairs, 64
> with distinct contexts on both sides, including six on FRICTION-012
> itself — the record that states the convention. They are healthy.
>
> The rule now lives where it is applied: **relate skill rule 5**, stated
> as the test rather than as a ban. It was absent there until today, which
> is why the reader who misread it had also *created* a reciprocal pair two
> days after this record was written — the rule was in an observation, and
> the work happens in the skill.

The generalizable lesson for parallel triage: **per-batch agents cannot
see corpus-wide shapes, so a central reconciliation pass is not
optional.** Anything appearing on ~24 records across five collections
is a policy, and a policy decided five times independently will be
decided five ways.

## Sixth skip category: third-party edge mentions

OBS-011's five categories held on candidates they were never derived
from — good evidence they are real. The drain adds one:

6. **Third-party edge mentions.** The source describes a relationship
   *between two other records* ("PROPOSAL-003 → DISC-005/007/008" cited
   as type-upgrade examples in OBS-003). The source is not relating
   itself to anything; it is narrating someone else's edge. Filed under
   category 3 at first glance because such mentions are usually
   slash-lists, but the reason is stronger and distinct.

## The scanner's blind spots, now with recurrence counts

None of these are new; all recurred, which is the point.

- **Slash-lists are still invisible** (`PROPOSAL-025/026` yields only
  P-025; `OQ-18/19/21` only OQ-18). OBS-011 called it "a parser nicety
  if it recurs." It recurred, in two collections, and the arbitrary
  subset it produces is *visible in the candidate list itself* — DISC-024
  offered an edge to OQ-18 and not its two siblings. That is the
  taxonomy-3 failure mode being manufactured by the scanner rather than
  found by it. **This is now the strongest standing case for a parser fix.**
  **Fixed 2026-07-14 (FRICTION-026):** the grammar now expands slash-runs
  against the head's stem — +26 candidates on this corpus, across 14
  sources in 8 collections, with no false positives. The other two blind
  spots below stand.
- **Enumerations written as file paths are invisible.** The EJ→DD batch
  tasks name their targets as `specs/decisions/ej-001.md`, so only the
  uppercase range endpoints surface — 10 of 15 task candidates are
  residue for this reason, permanently.
- **Shorthand ids are invisible** (`STATUS-ORCH` for
  STATUS-ORCH-MIGRATION-2026-04-13).

## What it teaches about PROPOSAL-028

- **The review file is the reviewable artifact the scripts never were.**
  It survived validation, a central reconciliation, a split back into
  per-collection batches, and a dry run — all before a byte was written.
  A script cannot be diffed, reconciled, or dry-run.
- **Validating rows against the candidate set is the check that matters**
  when agents author the file: every accepted `(from, to)` must be a pair
  the scanner actually found. Zero invented rows here, but the guard is
  what makes delegating the judgment safe, and it is *outside* the tool —
  the drain used a scratch validator. Whether it belongs inside is an
  open question, not obviously a yes (DP-001: the tool applies the file
  it is given, and refusing rows it didn't suggest would make it the
  judge of its own suggestions).
- **Empty-context refusal earned its keep immediately**: it is what made
  "delete the rows you reject" and "write a context" the same operation.
  No bare edge entered the corpus, so no backfill pass is owed — OBS-011
  paid that debt once and this drain did not re-incur it.
