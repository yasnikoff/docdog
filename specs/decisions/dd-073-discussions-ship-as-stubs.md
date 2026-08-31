---
id: DD-073
title: "Discussions ship as stubs: a record's identity and its place in the graph are public, its reasoning is not"
collection: decisions
status: current
date: 2026-08-31
description: "Amends DD-071 clause 2. The 41 DISC records ship as stubs carrying id, title, status, date and the full relationship graph with contexts; the bodies and descriptions move to a private sibling repository. Because a stub and its record share an id, the two halves are two docdog projects and must never be one corpus."
relationships:
  - references: FRICTION-055
    context: "the trap this walked into — the corpus answered a question about the outside world, confidently and seven weeks out of date, and the check that would have caught it was one command"
  - references: DD-071
    context: "the boundary this amends — clause 2 said the corpus ships whole and rejected curation; that was right for every collection except the one that is a conversation rather than a document"
  - references: OBS-028
    context: "the measurement that gated this and decided two of its fields: relationships are free to keep, and the description is nearly free to drop"
  - references: DISC-041
    context: "the discussion that produced the stub idea and endorsed it pending measurement; its Round 3 struck full-copy projection and left this as what survived"
  - references: PROPOSAL-047
    context: "the guard that prices the alternative — 117 edges from tracked records to out-of-clone ones, reported on every index run, which is what rules out keeping the full records in an external scan path"
  - references: PROPOSAL-031
    context: "the constraint that forces two projects rather than one — a stub and its full record share an id, so indexing both mints 41 contested ids and the loser is invisible to search, get and traverse"
  - references: FRICTION-053
    context: "why the stub carries `status` — every read surface discloses it now, so a stub that omitted it would be the one record shape that cannot say whether it is live"
  - references: DP-001
    context: "tier 1 throughout: deriving a stub is dropping fields from frontmatter. Which records get stubbed, and what the pointer says, is the judgment, and a person made it once"
  - references: DP-003
    context: "clause 3 held to, not invoked — this is the first hand-rolling of a stub, so no command was built"
  - references: FRICTION-045
    context: the --has predicate that makes `retained_privately` a queryable field rather than a decoration — which is why the stub carries a value naming where, not a boolean
  - references: PROPOSAL-027
    context: the --where filter that reaches `retained_privately` as a scalar; together with --has it is what keeps the marker useful after the split
  - references: OBS-019
    context: one of the three measurement disciplines this decision applied rigorously inside the corpus and never once outside it — the amendment is what that cost
  - references: OBS-027
    context: "the second of those three, and the one that also supplies this record's refusal of a verify-by field: a hand-maintained axis added to police another"
  - references: FRICTION-044
    context: the third, four days earlier and the closest analogue — a claim about the world inferred rather than measured, when measuring was two commands
---

# DD-073: Discussions ship as stubs

## Context

DD-071 clause 2 decided that the specs corpus **ships whole**, and
rejected curation on two grounds: the corpus is the dogfood evidence
and the live demo, and the frozen eval names corpus records by id, so
curation would break the shipped eval's re-runnability.

That was right for every collection except one. The `discussions`
collection is the only part of the corpus that is a **conversation**
rather than a document written for a reader, and publishing it was not
wanted.

Deleting it was worse than publishing it. Measured on the corpus at
362 records:

- **117 edges** from **86 published records** point at a `DISC-` id
- **253 prose mentions** across **85 records**
- discussions are **19.0%** of the corpus's body characters

Every one of those edges would dangle in every clone, and PROPOSAL-047
would report them on every index run.

The eval argument turns out to be small: **2 of 40** golds name a
discussion (`q18`, `q37`), and both still resolve against a stub.

## Decision

### 1. The 41 DISC records ship as stubs

A stub keeps the record's **identity and its position in the graph**
and drops its **reasoning**:

| kept | dropped |
|---|---|
| `id`, `title`, `collection`, `status` | `description` |
| `date` | `participants` |
| `retained_privately: docdog-discussions` | `related` (legacy) |
| `relationships:` in full, contexts included | the body |

The body is replaced by a fixed pointer naming this decision and
`docdog traverse <id>`.

`status` is kept because FRICTION-053 made every read surface disclose
it; a stub that omitted it would be the one record shape that cannot
say whether it is live. `retained_privately` is a value rather than a
flag so it names *where*, and it is reachable with `--has`
(FRICTION-045) and `--where` (PROPOSAL-027).

**Relationships are kept because keeping them is free.** OBS-028
finding 3: `fts` is fts5 over title/description/body and the embed
input is body-derived, so a `relationships:` block reaches neither
leg. A stub-with-graph and a stub-without score *identically to four
decimals*, and the graph-bearing one keeps 377 edges. The public
corpus holds **1918 edges before and after**.

**The description is dropped on volume, not on retrieval.** It costs
0.019 MRR to keep — one or two rank-1-to-2 displacements, barely above
the 0.013 noise floor. What decides it is that the 41 descriptions are
**25,752 characters**, median 485, max 1,717: summaries of the
reasoning, not labels. The line is that a description summarizes the
discussion (content), while an edge context describes how it relates
to a record that is itself public (metadata about the public graph).

### 2. The full records live in a separate private repository

`docdog-discussions`, a sibling of this repo, holding the 41 records
whole. No remote.

### 3. The two halves are two docdog projects and must never be one corpus

A stub and its record **share an id**. Index both and the result is 41
contested ids, where the loser is a record on disk that `search`,
`get` and `traverse` cannot see (PROPOSAL-031).

So the private project's `scan_paths` enumerate this repo's spec
directories **one at a time** and omit `specs/discussions/`. Indexing
it yields exactly the corpus this repo held before the split — 362
records, 1918 edges — while this project's own index sees the stubs.

That enumeration is the arrangement's one moving part: **a directory
added to this repo does not reach it**, and nothing can notice.
`findMissingScanPaths` catches a path that has gone away, never one
that was never named. It is written into the private repo's README and
its config, and it is the thing to check when a record seems missing
there.

The 41 files moved from `specs/notes/` to `specs/discussions/` for
this reason: the exclusion is by **path**, so the stubs need a path of
their own. Collections come from frontmatter, so the move changed no
record's collection.

It did surface a problem it had no part in causing. 15 of the 41
(DISC-016..021, DISC-032..040 — two contiguous bands, so drift rather
than intent) declared `collection: notes`, which was unremarkable in
`specs/notes/` and absurd in a directory named for the collection they
denied. Corrected in both halves on the same day: `discussions` 26 ->
41. **A stub and its record must never disagree about what they are**,
which makes this the first instance of the split's standing cost — a
frontmatter convention now has two files to reach.

### 4. This depends entirely on DD-071 clause 1

The full bodies remain in this repo's **local** history. The stub
publishes nothing only because the public history starts at
publication with a fresh cut. **If v3 history is ever pushed, the
stubs are decoration** — the bodies go with it.

That is a coupling between two decisions rather than a property of
either, which is why it is stated here as well as there.

## Rejected

- **Delete the records.** 117 dangling edges and 253 unresolvable
  prose mentions, in every clone.
- **Keep the full records in an external scan path of this project.**
  Mechanically fine — an external `scan_paths` entry indexes and
  retrieves normally, verified — but every one of the 117 edges then
  runs from a tracked record to an out-of-clone one, and PROPOSAL-047
  reports all 117 on every run. 117 standing warnings is a warning
  that gets turned off, which is the failure that guard exists to
  prevent, arriving through the front door.
- **Keep the descriptions.** 25,752 characters of summarized
  reasoning, to buy 2 top-5 slots out of 200.
- **Build `docdog stub`.** DP-003 clause 3 sets three hand-rollings as
  the trigger. This is the first. Deriving a stub is dropping
  frontmatter fields — tier 1 mechanics whenever it is wanted again —
  but wanting it again is what has not happened yet.

## What this does not decide

- **Whether other collections ever get the same treatment.** Nothing
  here generalizes: discussions were chosen because they are
  transcripts, not because they are long.
- **Where the private repo is hosted**, if anywhere. It has no remote,
  and adding one is a separate decision that must land on a private
  host.
- **Whether the pre-split history of these files is ever carried into
  the private repo.** It is a fresh commit today, cut from
  `docdog@a3df21b`; this repo's local history remains the archive, per
  DD-071 clause 1.

## Amendment (2026-08-31, same day): it kept four private, not forty-one

**37 of the 41 records this decision protects were already public**,
and had been since 2026-08-14, on three cuts pushed to
`github.com/yasnikoff/docdog` under DD-071 clause 2's ships-whole rule.
Only **DISC-038, 039, 040 and 041** had never been published.

This was not discovered until the publish step, hours after the split
shipped. The Context section above prices the alternatives against
each other and never asks the prior question — *are they public
already?* — because DD-071 said they were not, in a sentence written
seven weeks earlier and read as current. The measurement discipline
this corpus keeps re-learning (OBS-019, OBS-027, FRICTION-044) was
applied to everything inside the corpus and to nothing outside it.

### What changed as a result

The public repository was **deleted and recreated** with a single
orphan commit carrying the stubs. That removes the 37 from
`github.com`; it does not remove them from any clone taken in the
17-day window. Deletion is best-effort and the decision should not be
read as claiming more.

So the honest statement of what this decision achieves:

- **DISC-038..041** — kept private, never published
- **every future discussion** — kept private by construction
- **DISC-001..037** — private going forward, public for 17 days, and
  irrecoverable from anyone who cloned in that window

The design is unchanged and the reasoning for it stands — the stub
shape, the free relationship graph, the two-project constraint, and
the 117-edge argument were all measured on their own terms (OBS-028)
and none of them depended on the records being unpublished. What
changes is the claim about what it was worth, and a decision record
that overstates its own effect is the failure this corpus names in
other people's designs.

### Correction to clause 2

`docdog-discussions` **has a remote**: `github.com/yasnikoff/docdog-discussions`,
**private**. The original text said "No remote", which was true for
about four hours.

See FRICTION-055 for the general shape, and DD-071's 2026-08-31
amendment for the audit line that produced it.
