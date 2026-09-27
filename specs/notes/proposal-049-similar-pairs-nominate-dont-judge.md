---
id: PROPOSAL-049
title: "docdog pairs — nominate similar undeclared record pairs into a review file, validate the verdicts that come back, and never judge one"
collection: notes
status: shipped
date: 2026-09-27
description: "Makes OBS-029's scratch pair-mining a command. `docdog pairs` lists live record pairs whose embedding cosine clears a visible threshold and which no settling edge (supersedes, amends by default) or ledger row already accounts for, as a review file in PROPOSAL-028's shape. Something outside docdog — an agent, a model a router picked, a human — fills one structured verdict per row: a relation from the project's registered vocabulary, a defect (none, contradiction, duplicate, stale), and a verbatim quote from each side. `--accept-from` refuses any verdict whose quotes are not in the files or whose type is unregistered, writes accepted edges, records defects and rejections in a ledger keyed to BOTH bodies' hashes, and never picks a verdict itself. No contradicts/duplicates relation types, no in-process model call, no --accept-all. Amended by OBS-030: the paragraph-level nominator was measured and dropped, the review file carries the matched passages so a judge need not read whole files, and judging is documented as a cheap typed triage in front of a frontier verdict, run outside docdog."
severity: n/a
relationships:
  - sourced_from: DISC-043
    context: "the discussion that settled the split: docdog nominates and validates, something outside it judges, and jev routes that judge rather than living in docdog"
  - sourced_from: OBS-029
    context: "the scratch run this makes repeatable, whose labeled pairs become the gold set and whose finding — stale records, not contradictions — sets the defect vocabulary"
  - extends: PROPOSAL-028
    context: "the same review-file round trip, applied to a second candidate source: --format review out, --accept-from in, symmetric"
  - extends: PROPOSAL-046
    context: "the durable-rejection ledger, with the key widened from the source's hash to both bodies' hashes, since a pair's defect can begin when either side is edited"
  - references: PROPOSAL-024
    context: "the posture copied: report-only unless --accept-from is given, and no --accept-all"
  - references: DP-001
    context: "nominating is tier 1, the threshold and the settling-edge set are tier 2 visible defaults, every verdict is tier 3 and belongs to whatever fills the file"
  - references: DP-002
    context: "the verdict's relation must be a type registered in .docdog/concepts/, so an adopter's own vocabulary reaches the judge and the validator refuses anything else"
  - references: DP-004
    context: "records stay the unit; the paragraph nominator that would have looked inside them was measured and dropped"
  - references: OBS-014
    context: "the validator lesson moved from edges to verdicts: evidence a tool cannot find verbatim is refused before a human reads it"
  - references: OBS-018
    context: "the retrieval question stays closed; nothing here adds a vector store"
  - references: OBS-030
    context: "the experiment this proposal gated on: paragraph nomination lost to record nomination, a verbatim-quote check refused 71% of the cheapest agent's positive verdicts, and a typed triage model in front of a frontier judge matched the frontier judge alone at 70% of its cost"
  - references: PROPOSAL-042
    context: "the socket inventory this leaves at three: docdog makes no model call to judge anything"
  - references: FRICTION-046
    context: "why nothing may route the embedder per call: two recipes' vectors are not comparable, and a mixed store is the bug that was"
---

# PROPOSAL-049: `docdog pairs`

## The gap

OBS-029 mined the top 30 high-cosine live pairs with no declared edge and
found 13 that needed attention. Almost all of them had one shape: a newer
record changed part of an older one and declared nothing — no edge, no banner.
Contradictions between current records were the minority, and each of them was
that same shape seen from the stale side.

That run was a scratch script. Nothing repeats it, nothing remembers its
verdicts, and the next run would re-judge the same 30 pairs.

## The command

```
docdog pairs [--collection C]… [--status S]… [--exclude-status S]…
             [--threshold 0.80] [--limit N] [--id X]
             [--show-rejected] [--json] [--format review]
docdog pairs --accept-from pairs.yaml [--dry-run]
```

**Candidates (tier 1 and 2):** live records (default `--exclude-status
superseded,deprecated,resolved,archived`, printed and overridable) → pairwise
cosine over the stored record vectors → cosine ≥ `--threshold` (default
printed) → minus pairs joined by a **settling edge** in either direction → minus
pairs with a live ledger row → sorted by cosine.

- **Settling edges are a visible default, not a fact the code knows.** Default
  `supersedes` and `amends`, set by `pairs.edges.settle` in config. A
  `references` edge does *not* settle: DD-068 referenced the right records and
  still carried a stale claim.
- **Each step reads its own edge set** (`pairs.edges`, all three printed on
  the run they govern): `settle` removes a pair from nomination, `show` picks
  which remaining edges the review file lists as `declared` (default `all`),
  and `close` decides which edge closes a recorded defect (default: whatever
  `settle` resolves to). They default to agreeing and nothing requires them
  to — hiding an edge from the judge is not the same claim as it settling the
  pair. A type someone *wrote* in config that no concept record registers is
  refused by step (`UNKNOWN_RELATION`), since an unknown name matches nothing
  and fails quietly in a different direction per step. A *default* is narrowed
  to the registered set instead, and the narrowed set is what the run prints:
  `amends` is registered here and ships with no adopter's project, so refusing
  it would have failed `docdog pairs` on every fresh `init`.
- `--id X` restricts to pairs containing X. That is the write-time use (below).

## The review file

```yaml
# docdog pairs — 30 candidate(s), threshold 0.80
# Fill one verdict per row, or delete the row to defer it.
- a: DD-064
  b: PROPOSAL-045
  cosine: 0.871
  a_status: current        # routing data, never read back
  b_status: shipped
  a_past_cap: false
  b_past_cap: false
  passages:                # the most similar passage of each side, with context
    a: |
      …
    b: |
      …
  relation:                # a type registered in .docdog/concepts/, or none
  direction:               # a->b | b->a (required when relation is set)
  defect:                  # none | contradiction | duplicate | stale
  evidence:
    a: ""                  # verbatim from a's file
    b: ""                  # verbatim from b's file
  note: ""
```

The routing fields (cosine, status, past-cap) are there so whatever fills the
file can decide how much judgment each row deserves, for example which model reads
it. They are data. Docdog never acts on them after emitting them.

**`passages` is the biggest cost lever measured (OBS-030).** A frontier judge
spent most of its cost getting two whole files into context: for Opus, cache
writes were $0.97 of $1.98, more than its output. The passages are chosen
mechanically. Split each body at blank lines and embed the blocks for this run
only, never stored. Take the most similar block pair and add one block either
side. A judge that needs more reads the file, so the passages are a starting point
and never a limit. Choosing them is tier 1, and docdog asserts nothing about them.

## One question, structured answer

One question over a closed vocabulary, answered as a record rather than a label,
because OBS-029's typical pair was two findings at once: PROPOSAL-045 amends
DD-064 (an edge) and DD-064 is therefore stale (a defect).

**There is no `contradicts` or `duplicates` relation type, and this proposal
refuses to add one.** An edge records a relationship that lasts. A contradiction is a
defect waiting to be fixed, and a stored `contradicts` edge documents the
inconsistency and leaves it in place. Its real endings are an amendment banner plus a
settling edge, an open question when it is not clear which side is right, or a merge.
Defects go to the ledger, and edges go to `relationships:`.

**A known blind spot: two records that agree on something stale.** OBS-030 paired
PROPOSAL-028 with the `relate` skill. Both carried the same retired instruction, so
the judge rightly called them consistent. Pairwise judging cannot see this. It
takes the third record that changed the claim, which is a question about triples
and is out of scope here. A judge that notices it says so in `note`, and nothing
mechanical acts on that.

## `--accept-from` — validate, then apply

For every row that has a verdict:

1. **Evidence must be verbatim.** Both quotes are required whenever `relation`
   is set or `defect` is not `none`, and each must occur in its record's file
   (LF-normalized, whitespace-collapsed). A quote docdog cannot find refuses the
   row by name. This is OBS-014's lesson, moved from edges to verdicts, and it
   is what makes a model-filled file safe to apply.
2. **The relation must be registered** (DP-002). An unregistered type is
   refused, never fuzzily corrected.
3. **Both hashes must be current.** If either body changed since the file was
   emitted, the row is refused and re-offered on the next run.
4. **Then apply:** a relation writes one edge on the source side through the
   same path `docdog relate` uses, with the cross-visibility guard included
   (PROPOSAL-047). A defect or `relation: none` writes a ledger row.

**The ledger** is `.docdog/pair-verdicts.yaml`, tracked in git: `(a, b,
hash_a, hash_b, relation, defect, evidence, note)`. PROPOSAL-046 keys its rows
on the source body because only the source makes the claim. A pair's defect can
begin with an edit to either side, so a row here expires when **either** body
changes, and like PROPOSAL-046 the pair then comes back carrying its old
verdict pre-filled.

A defect row is **not** a rejection. It stays listed by `docdog pairs --defects`
until a settling edge between the pair appears, and appearing is exactly what fixing
it produces. So an open defect cannot be suppressed by being judged.

## Write-time use

`docdog pairs --id X` right after writing record X gives its author the
candidates while the author still has the context. That is the moment OBS-029
says the edge went missing. It is the same command with no new surface. A hook or
skill may call it. `docdog_create` does not call it on its own, because deciding
when to interrupt a write is not docdog's call.

## Paragraph-level nomination: measured and dropped (OBS-030)

This proposal first specified a paragraph-level nominator, to reach the text
past the embed cap and claim-level clashes that record vectors blur. It was built
as an experiment on the snapshot OBS-029 judged, and it lost:
- It found 5 of 17 known pairs in its top 30, against 11 for record level.
- It reached no stale record that record level missed.
- Its 17 novel pairs held one new defect.

Records stay the only nomination unit. This is the fourth measurement on this corpus
where finer vectors lose to the whole-record centroid.

## Judging, outside docdog

Measured in OBS-030 on 26 pairs. The pattern that held up:

1. **A typed triage model reads every row** and answers one question: does this pair
   need a closer look? Jev (System One, typed answers, no text) did this for about
   $0.006 per 26 pairs. Every error it made was an extra flag, not a miss.
2. **A frontier model judges the flagged rows** and supplies the relation, the
   defect and the verbatim evidence. That arrangement reproduced the frontier judge
   alone exactly, at about 70% of its cost. More pairs are unrelated deeper in the
   ranking, so the saving grows there.

Three things that do *not* work, each measured:
- Asking the triage model more than one question. Its separate answers contradict
  each other on a third of pairs.
- Routing on its confidence. Confidence did not separate its right answers from
  its wrong ones.
- Letting a cheap text model be the verdict. Haiku's quotes failed the verbatim
  check 71% of the time, and step 1 of `--accept-from` exists for exactly that.

Docdog runs none of this. It emits the file, including the routing fields and
passages that make triage cheap, and it validates what comes back.

## What is not built

- **No in-process model call, ever.** Judging is tier 3, and a fourth socket
  that sends corpus content would break PROPOSAL-042's inventory. It would also
  be a DD-073 problem, since private records would reach a cloud API. A router
  such as jev belongs in the loop that fills the file: it picks the model that
  reads each row, and docdog is not involved.
- **No per-call embedder routing.** Vectors from two recipes are not comparable
  (FRICTION-046).
- **No `--accept-all`, no confidence threshold that auto-applies, no inferred
  verdict.**
- **No `contradicts` / `duplicates` relation types.**

## Principle walk

- **DP-001:** Nominating is tier 1. The threshold, the status filter and the
  settling-edge set are tier-2 defaults, each printed and each overridable.
  Every verdict is tier 3 and arrives from outside. Validation checks only facts:
  a string occurs in a file, a type is registered, a hash is current.
- **DP-002:** The judge's vocabulary is read from the project's concept records,
  so a project's own relation types reach it without code changes.
- **DP-003:** This is a CLI command with `--json`. There is no MCP tool yet: a
  ninth kernel tool needs its own proposal, like `docdog list`.
- **DP-004:** Records stay the unit for both retrieval and nomination. The review
  file's passages are cut per run to save a judge reading, never stored and never
  returned as results.

## Acceptance

1. `docdog pairs` on this corpus reproduces OBS-029's candidate set (record
   level, same threshold and filters), minus the pairs now joined by `amends`.
2. `--accept-from` refuses a row with a quote absent from the file, an
   unregistered relation, or a stale hash, each by name. Refusal is per row and
   the batch continues.
3. An accepted relation lands as one edge. A defect lands in the ledger and is
   listed by `--defects` until a settling edge appears.
4. Editing either body re-offers a judged pair with its old verdict pre-filled.
5. Every row carries `passages` for both sides, and the review file is judgeable
   without opening either record.

## Shipped (2026-09-27)

`src/storage/pairs.ts` nominates and cuts passages; `pairs-accept.ts` emits,
parses, validates and applies; `pair-verdicts.ts` is the ledger;
`src/cli/commands/pairs.ts` is the surface. 20 tests in
`tests/unit/storage-pairs.test.ts`; the suite went 878 → 898.

**Acceptance, measured on this corpus** (377 records, 201 in the default live
pool, threshold 0.80):

1. Every OBS-029 pair still open is nominated: `relate` ~ `populate` 0.833,
   DD-064 ~ `ingest` 0.821, PROPOSAL-039 ~ `compose` 0.861, PROPOSAL-028 ~
   `populate` 0.828, DD-066 ~ `ejection-resilience` 0.836. The pairs fixed
   with `amends` since (PROPOSAL-029 ~ OBS-026, PROPOSAL-023, PROPOSAL-019) are
   among the 6 counted as settled. OQ-39 drops out because it is `resolved`.
2. A paraphrased quote is refused by name
   (`evidence not verbatim — not verbatim in b (…ingest.md)`), and a quote
   that crosses a line break passes.
3–5. Pinned by the tests.

**Where the proposal was silent, the build chose:**

- **The review row carries `a_hash` / `b_hash`,** and they are read back. The
  stale-hash check needs to know what the judge saw.
- **Hashes and evidence are read from DISK,** by the parser the indexer runs,
  not from the cache. A cache hash would pass a row whose file was edited
  after the last index, which is exactly the case the check exists for.
- **Every applied verdict writes a ledger row,** not only defects and
  `relation: none`. Otherwise a `references` verdict, which does not settle,
  would be nominated again on every run.
- **`note` becomes the edge's context.** An empty note is refused unless you
  pass `--allow-empty-context`, which is suggest-edges' posture.
- **The default exclusion is narrowed to statuses the corpus uses** (this
  repo has no `archived`). It is not refused, because nobody typed it. An
  exclusion you pass is validated in full (FRICTION-038). `--status` replaces
  the default rather than stacking on it.
- **A row whose own edge is settling closes its own defect** the moment it is
  recorded, as with `amends` + `stale`. That follows the letter of "open until
  a settling edge appears". It is printed, not silent, because the banner on
  the stale side is still the author's to write.
- **Non-settling edges between the pair are shown in the row** (`declared:`),
  as data for the judge.

**Two costs found end to end, both open:**

- **At 0.80, 113 of the 196 candidates already carry a non-settling edge,
  mostly `references` and `extends` between an observation and its successor.**
  That is the proposal's rule ("a `references` edge does not settle"), and it
  is why OBS-029's set sits among only 83 undeclared pairs. Whether `extends`
  belongs in the default `pairs.edges.settle`, or the text view should sort
  undeclared pairs first, needs judging. It is not a mechanical fix.
- **Passages are slow at fp32:** 196 rows cut 1,684 blocks from 135 records and
  took about 4.5 minutes to embed. Text mode computes none. `--format review`
  and `--json` compute them only for the rows emitted, so `--limit` is the
  control.
