---
id: OBS-030
title: "Paragraph-level pair nomination does not beat record level, and the cheapest judge that holds up is a typed triage model in front of a frontier one — 70% of the frontier cost, no measured loss"
collection: observations
status: current
date: 2026-09-27
description: "PROPOSAL-049's gate, run on the pre-OBS-029 snapshot (9fedc55). Paragraph vectors (1,920, covering 99.6% of live text vs 82.9% for record vectors) reached no known stale record that record level missed and found 5 of 17 known pairs in their top 30 against 11; their 17 novel pairs held one new defect. Then the same 26 pairs (17 novel + 9 controls) went to four judges. Opus 5.5: 8/9 controls, every quote verbatim, $1.98. Sonnet 5: 5/9, $1.82. Haiku 4.5: 7/9 and 16/17 agreement with Opus, but 20 of 28 evidence quotes fail a verbatim check, $0.52. Jev (typed answers, no text): 7/9 and 16/17 for $0.006, erring only by over-flagging. Jev first with Opus on its 18 flags reproduces Opus alone exactly for about $1.38. Found on the way: pairwise judging cannot see two records that agree on something stale."
relationships:
  - references: PROPOSAL-049
    context: "the gate this runs — its paragraph level shipped only if the experiment said so, and it did not"
  - sourced_from: OBS-029
    context: "the labeled pairs frozen as the gold set, the snapshot commit chosen so every one of its stale records is still stale, and the rubric reused unchanged"
  - references: DISC-043
    context: "answers its open questions: the paragraph index is refused on measurement, and the judge-routing position (a router picks the model, outside docdog) is measured rather than argued"
  - references: OBS-016
    context: "a third arm pointing the same way: finer vectors lose to whole-record ones, this time for nominating pairs rather than finding records"
  - references: OBS-020
    context: "naive chunks were used deliberately, since late chunking's convergence is wrong for claim-level matching; the naive arm still lost"
  - references: OBS-014
    context: "the validator lesson measured on judges: a verbatim-quote check refuses 71% of the cheapest model's positive verdicts and none of the frontier model's"
  - references: DP-001
    context: "why the triage model may only choose which pairs a frontier judge reads — its answers carry no evidence, so under PROPOSAL-049 it cannot be the verdict"
  - references: DD-073
    context: "the experiment sent spec files to a third-party API; the snapshot carries only discussion stubs, so no private body left the machine"
---

# OBS-030: pair nomination and what judging it costs

## Question

PROPOSAL-049 gated a paragraph-level nominator on an experiment, and DISC-043
left open which judge setup is worth paying for. Two questions:

1. Do paragraph vectors nominate stale or contradictory pairs that record
   vectors miss?
2. Among the models available, which judging setup gives frontier-quality
   verdicts for the least money?

## Method

**Snapshot.** A detached worktree at `9fedc55`, the last commit before OBS-029
fixed anything. Indexing it reproduced OBS-029's corpus exactly: 373 records,
2,028 edges, 181 live. Every stale record OBS-029 found is still stale there, and
none of the fix edges exist.

**Gold set, frozen before any paragraph vector existed.** 17 pairs and 12 stale
records: OBS-029's contradictions and tensions, plus the follow-up's
`amends` pairs (each a stale record and the record that changed it). One pair
(DD-064 ~ FRICTION-005) is unreachable by either arm because FRICTION-005 is
`resolved`. Two more were filtered by both arms because a declared edge already
joins them.

**Arms.** Both used OBS-029's filters: live pairs only, minus any pair with a
declared edge or a shared `part_of` parent.
- *Record:* the stored record vectors, one per record, as OBS-029 used them.
- *Paragraph:* naive paragraphs using the same embedder (nomic-embed-text-v1, fp32,
  no prefix, which is exactly `embedInput`'s ONNX path). Blocks split at blank
  lines, fenced code kept whole, headings and blocks under 200 characters merged
  forward, capped at 4,000 characters. The run produced 1,920 paragraphs and
  embedded them in about three minutes. A pair of records scores the maximum
  cosine over their paragraph pairs.

**Judges.** One shuffled set of 26 pairs went to every judge: the 17 pairs in
the paragraph top 30 that were absent from the record top 60, plus 9 controls
with known answers (6 actionable, 3 unrelated). The rubric was OBS-029's labels
plus PROPOSAL-049's structured verdict, with verbatim evidence required. The
agent judges read the files themselves in two batches of 13. The Jev pass sent
each pair's two full files and matched passages as one request. Costs come from
per-call token usage priced at the list rates published 2026-09-27, per million
tokens (input / 5-minute cache write / cache read / output):
- Haiku 4.5: $1 / $1.25 / $0.10 / $5
- Sonnet 5: $2 / $2.50 / $0.20 / $10
- Opus 5.5: $4 / $5 / $0.20 / $20

Jev reported its own cost per response.

## Result: nomination

**Cosine is compressed**, as OBS-029 said, so only ranks are compared.

| | Record | Paragraph |
|---|---|---|
| Live text reaching a vector | 82.9% | 99.6% |
| Gold pairs in top 30 / top 60 | 11 / 11 | 5 / 7 |
| Stale records in any top-30 pair | 12 of 12 | 8 of 12 |
| Stale records only this arm reaches (top 60) | PROPOSAL-023, PROPOSAL-019 | none |

The gold set came from the record arm's own top 30, so the first two rows favour
it by construction. The fair test is what the paragraph arm finds that the record
arm does not rank at all. Opus judged 9 of those 17 novel pairs actionable, but
only **one** was a defect: DD-047 against the 2026-04-11 edge-schema note, which
still proposes the edge fields DD-047 rules out. The rest were missing edges, and
five of those involve skill files, which have no `relationships:` block and
cannot declare an edge.

The one gold pair where paragraphs clearly win is a third-record case:
CONCEPT-RELATION-PARENT ~ DD-072 ranks 78th by paragraph and 1,320th by
record. That is the shape OBS-029 finding 5 names. But one pair is not a method.

**Verdict: paragraph level does not earn its place,** under the rule written
before the run. It reached no stale record the record arm missed. This is the
fourth measurement on this corpus where finer-grained vectors lose to the
whole-record centroid (OBS-016, OBS-019, OBS-020), this time for nomination
rather than retrieval.

## Result: judges

| Setup | Controls right on actionable-or-not | Agrees with Opus on novel pairs (actionable-or-not) | Evidence quotes failing a verbatim check | Cost | vs Opus |
|---|---|---|---|---|---|
| Opus 5.5 | 8/9 | reference | 0 of 32 | $1.98 | 100% |
| Sonnet 5 | 5/9 | 13/17 | 0 of 22 | $1.82 | 92% |
| Haiku 4.5 | 7/9 | 16/17 | **20 of 28** | $0.52 | 26% |
| Jev (typed answers) | 7/9 | 16/17 | none given | **$0.006** | 0.3% |
| Haiku, then Opus on its 14 flags | 7/9 | 16/17 | 0 of 28 | ~$1.59 | 80% |
| **Jev, then Opus on its 18 flags** | **8/9** | **17/17** | 0 of 32 | **~$1.38** | **70%** |

The two first-pass rows reuse the Opus verdicts already recorded for the flagged
pairs, with Opus's cost pro-rated, rather than running Opus again.

1. **Frontier verdicts hold up, and the cheapest agent's do not.** Haiku made
   the same actionable-or-not call as Opus on 16 of 17 novel pairs. But it
   paraphrased or stitched together 71% of its quotes, for example joining two
   separate lines with a semicolon, so PROPOSAL-049's verbatim check would
   refuse most of its positive verdicts. The check is load-bearing: it is what
   turns "a cheap model agreed" into something that can be applied.
2. **Sonnet was the worst setup measured.** It was the least accurate, called
   two known contradictions unrelated, and cost 92% of Opus. It spent more calls
   and wrote about twice the output. This is one run, so treat it as a signal
   and not a ranking.
3. **Jev is a triage model, not a judge.** It returns typed choices and writes
   no text, so it can supply no evidence and can never be the verdict under
   PROPOSAL-049. As a filter it is the best measured:
   - It matched Haiku's accuracy for about 1% of Haiku's cost, at roughly 0.4s
     per pair.
   - **Every error leaned the safe way.** Each pair it cleared, Opus also
     cleared. Its errors were extra flags, which the frontier pass then dropped.
     Haiku's two triage misses went the other way: it cleared the PARENT ~
     PART_OF tension and a PROPOSAL-028 ~ PROPOSAL-041 pair that Opus judged a
     missing edge.
4. **Two limits on Jev, both measured.** Its confidence is uninformative: a mean
   of 0.61 where it agreed with Opus and 0.55 where it did not, so no threshold
   routes fewer pairs. Its answers to separate questions contradict each other
   on 9 of 26 pairs (for example `UNRELATED-SIMILAR` next to a `companion`
   relation). Ask it the one triage question and nothing else.
5. **The saving is capped by the flag rate.** Jev flagged 18 of 26 (69%),
   because this set was chosen for similarity. A sweep deeper in the ranking,
   where most pairs are unrelated, would save more.
6. **Reading the files is most of what a frontier judge costs.** For Opus, cache
   writes, which are the files entering context, cost $0.97. Repeated context
   reads cost $0.58 and output cost $0.43. That makes the matched passages in
   the review file a larger saving than any model choice, and it is a mechanical
   change on docdog's side.

## Found on the way: agreeing on something stale

PROPOSAL-028 and the `relate` skill were both stale in the snapshot, carrying
the same retired "delete the rows you reject" instruction. The paragraph arm
paired them (record rank 723). Opus noticed that both predate the reject verdict,
then called the pair consistent, which is correct for the question it was asked.
**Two records that agree cannot be caught by judging them against each other.**
It takes a third record, and no rubric here has a label for that case.

## Scope and caveats

- One corpus, one snapshot, 26 judged pairs, one run per judge, so there is no
  variance estimate.
- The control answers are themselves agent labels from OBS-029. All four judges
  called one "unrelated" control (conversations ~ discussions) a missing edge,
  so that answer is probably wrong. Contradiction vs tension is a blurry
  boundary, and "prefer false negatives" pushes toward tension.
- Agreement with Opus is agreement, not correctness. On the novel pairs, Opus is
  the reference because it did best on the controls.
- The paragraph splitter was one fixed rule, chosen before the run. A different
  split could score differently. Its predecessors lost the same way under three
  other designs.
- Prices are the published list rates on the day of the run and will move.

## What changes

PROPOSAL-049 is amended in the same commit:
- The paragraph level is dropped.
- The review file carries the matched passages with surrounding context, so a
  judge need not read whole files.
- The defect vocabulary names agreeing-stale as a known blind spot.
- Judging is documented as triage followed by a frontier verdict, run outside
  docdog.
