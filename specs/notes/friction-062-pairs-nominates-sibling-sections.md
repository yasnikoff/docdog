---
id: FRICTION-062
title: "`pairs` settlement does not follow `part_of` inside a file — sibling sections, and a section beside a row its own entry amends, are nominated as strangers"
collection: notes
status: resolved
fixed_date: 2026-09-28
resolution_approach: fix
date: 2026-09-27
description: "RESOLVED 2026-09-28: `pairs.within_file`, default settle. When a file yields several records (split parser, script parser), `docdog pairs` settles a pair only on a direct edge between its two records. Two sections of one file are never joined directly, and an edge the file states once, on its head record, does not reach the sections under it. Measured on the reporter's corpus with every stated edge derived (FRICTION-061): 289 sibling-section pairs plus 412 section ~ row pairs whose entry amends or adds that row, 701 of 2,746 remaining candidates (26%), all accounted for by the file itself."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/3
evidence: yasnikoff/complexpoint-docdog-evidence@06980bf
relationships:
  - references: PROPOSAL-049
    context: "the command, and its settle rule — a pair is settled by a direct edge of a settling type, so a relationship stated through a shared parent is invisible to it"
  - references: DD-072
    context: "part_of, the one edge sibling sections do share, and only transitively"
  - references: FRICTION-061
    context: "the same issue's other two asks, which the parser script could already answer; this one it cannot without minting N-squared edges"
---

# FRICTION-062: sibling sections are nominated as strangers

## What happened

Issue #3, one of its three asks. Of 2,762 `pairs` candidates (after the 153
empty-body pairs of FRICTION-060), 289 were `<slug>§2 ~ <slug>§5`: two
numbered sections of one log entry. The reporter's judged sample found none
of them actionable, which is what one would expect — they were written
together, by one author, in one sitting.

## What docdog does wrong

`pairs` settles a pair only on a direct edge between its two records
(storage/pairs.ts). Sections of one file share a `source_file` in the cache
and, when a parser emits it, a `part_of` edge to the same parent — but never
an edge to each other. Emitting sibling edges from the script to satisfy
`pairs` would be N² assertions nobody believes; that is feeding the tool, not
describing the corpus.

Checked on a scratch project: with `part_of` emitted and added to
`pairs.edges.settle`, section~head pairs drop and section~section pairs stay.

## Measured on the evidence snapshot — the gap is twice this size

Re-run 2026-09-28 on `yasnikoff/complexpoint-docdog-evidence@06980bf` with
docdog 0.5.0 source, after rewriting the adopter's own parser script to
emit every edge the corpus states (FRICTION-061): `amends`/`adds` on each
entry's head (622 edges), `part_of` from each section to its head (4,117),
and citation-derived `references` (117, zero dangling). With all of them in
`pairs.edges.settle`, the 2,916 candidates fall only to **2,746**:

| what is left | pairs |
|---|---|
| empty-body heads (FRICTION-060) | 153 |
| two sections of one entry | 289 |
| a section ~ a row its **entry** amends or adds | 412 |
| everything else | 1,891 |

The 412 are the same defect as the 289. The entry states that it amends
the row; *which* section does is not stated, so the honest place for the
edge is the head, and the section below it is joined to the row only
through `part_of`. Putting the edge on every section to make `pairs` see
it would assert something the author did not write. **Settlement does not
follow `part_of` inside a file**, and that one rule accounts for 701 of
2,746 (26%).

## Direction (for WF-006, not decided here)

Resolve each record to its file's record before checking settlement: two
records with the same `source_file` are settled (siblings, and a section ~
its own head), and an edge on the head counts for its sections. Both halves
are mechanical facts about the cache, DP-001 tier 1 to compute. Applying
them is a default, so tier 2: a `pairs` option, printed on every run like
the other edge steps, with the count it removed. The default is the real
question. The reporter's data says on. PROPOSAL-049's spirit (never hide a
pair unless something the corpus states accounts for it) also says on,
because a shared file is such a statement. Leaning on; decide with the fix.

## Resolution (2026-09-28)

`pairs.within_file: settle | offer`, default `settle` (the user's call:
on). Under `settle`, a pair is settled when both records come from one
source file, or when a settling edge joins the records either side is
`part_of` within its own file (transitively). It never lifts to a whole
file: an entry that amends one row of a 261-row file does not settle its
sections against the other 260, which the tests pin. Printed in the run's
settings line, counted separately from direct-edge settlement
(`settledWithinFile`, also in `--json`), and `offer` restores the old
behaviour. The ingest skill tells a script author to put an entry-level
edge on the head, not on every section.

Verified on the evidence snapshot:

| parser | candidates | settled by edge | settled within a file |
|---|---|---|---|
| reporter's original (no edges) | 2,282 | 0 | 481 |
| with derived amends/adds/part_of | 1,788 | 82 | 893 |

2,916 − 153 (FRICTION-060) − 82 − 893 = 1,788. The 412 section ~ row
pairs are exactly the difference between the two within-file counts.
Tests: `tests/unit/pairs-within-file.test.ts`.

Not the same thing, and not proposed: settling on a shared `part_of`
parent across files. A parent with many children is a topic, and two
records under one topic contradicting each other is exactly what `pairs`
exists to find.
