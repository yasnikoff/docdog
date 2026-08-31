---
id: OBS-024
title: "Past the embed cap, fusion loses to its own keyword leg — the first measured case where RRF's equal weights are wrong, and the cap's real cost is the ranker, not the corpus"
collection: observations
status: current
date: 2026-08-25
description: "On a query set aimed at facts sitting past the 8,000-char embed cap, on an adopted corpus where 44.5% of characters reach no vector, hybrid scores 0.205 MRR against its own FTS leg's 0.493 — fusion at less than half its best leg, beaten even by generous grep. The control arm settles the mechanism: where the answer is inside the embedding, fusion behaves as every prior measurement says (0.667 over 0.643 over 0.429). Where it is past the cap the vector leg is not weak but blind by construction (0.022, eight misses of nine), and RRF at equal weights still hands it half the ranking budget. This reframes the cap. OBS-019 was right that truncation does not hurt record-FINDING and today's companion run confirms it; the damage is to detail-finding, and it does not arrive through the corpus — the tail is findable, FTS finds it at 0.493, and hybrid dilutes it away. Raising the cap is not the escape either: the same corpus's cap16k arm bought +0.009 on exactly these queries while costing −0.208 on record-finding. Qualifies OBS-018's closure, which was scoped to this repo's corpus, record-finding queries, and 15% of characters over the cap."
relationships:
  - references: OBS-018
    context: "the closure this qualifies rather than overturns — its 1,470-config sweep found equal leg weights argmax on THIS repo's corpus (15% of characters past the cap) with a record-finding query set; both conditions differ here (44.5%, tail-aimed queries), and a different argmax on a different corpus argues for a configurable weight rather than a new default"
  - references: OBS-019
    context: "its refusal stands and its scope is now drawn: raising the cap hurts record-finding, confirmed independently here at −0.208 on a foreign corpus. What it could not see is that its own finding — the truncated prefix is a better vector — says nothing about queries whose answer is in the discarded tail, because those queries were not in its set"
  - references: FRICTION-031
    context: "the note that first asked what truncation costs and was answered with split-or-chunk; the answer turns out to be neither — the tail is already findable by keyword, and what loses it is the fusion step, which no proposal in that thread examined"
  - references: OBS-016
    context: "chunking refused because max-cosine per record makes more chunks more lottery tickets — that argument is about the vector leg's behaviour when it CAN see the content; this measures the case where it cannot see it at all, which the chunking debate never separated out"
  - references: OBS-013
    context: "the adopted corpus it named as the live unknown for every retrieval refusal — this is the run that reached it, and it came back with a finding rather than a confirmation"
  - references: OBS-023
    context: "the companion run on the record-finding query set, same corpus, same afternoon, same instrument — its numbers are the control this one is read against, and its long-record category is what shows the cap is harmless for finding documents"
  - references: DP-001
    context: "the line any fix has to respect: query-dependent leg weights are tier 3 and stay forbidden, because deciding that a question is a detail question is judgment. A static configurable leg weight is tier 2 — a visible default with an override — which is the only shape this evidence licenses"
  - references: PROPOSAL-023
    context: "§8 deferred the ranking question to an eval; four evals came back with the shipped ranker and this is the fifth, which comes back with a bounded exception rather than a replacement"
  - references: DD-070
    context: "§8's measured retrieval win, now carrying its first measured failure mode — worth recording as such, since a claim with a known boundary is more defensible than one without"
---

# OBS-024: past the cap, fusion loses to its own keyword leg

## What ran

The adopted corpus's second frozen query set — 20 questions of the
form "what does the corpus say about X", where X is a specific fact in
the middle of a document, split into two arms by whether the answer
sits past docdog's 8,000-char embed cap. Run through
`tests/eval/run-external-eval.ts` (see [[OBS-023]] for the harness),
all five systems, top-10.

Sixteen scored. Four were excluded by the unresolvable-gold guard —
their golds point at files deleted in the same content migration
[[OBS-023]] describes, so nothing indexed can answer them. The
project's own July run scored those four as misses, which is why its
0.379 and this run's 0.407 are not comparable.

On this corpus **44.5% of characters reach no vector** (258 of 1,134
records past the cap), against 15.0% in this repo.

## Numbers

| system | all scored (16) | detail-**truncated** (9) | detail-**embedded** control (7) |
|---|---|---|---|
| **hybrid** | 0.407 | **0.205** | **0.667** |
| fts (leg) | **0.558** | **0.493** | 0.643 |
| vector (leg) | 0.200 | **0.022** | 0.429 |
| rg-rank | 0.270 | 0.369 | 0.143 |
| rg-walk | 0.021 | 0.019 | 0.024 |

## The control is the finding

Taken alone, "hybrid 0.407, FTS 0.558" is an aggregate, and
[[OBS-019]] and [[OBS-020]] are both on record that an aggregate
cannot tell you *why* — that lesson is the reason this set has a
control arm at all.

The arms separate cleanly:

**Where the answer is inside the embedding**, fusion behaves exactly
as every prior measurement in this project says it does: 0.667 over
FTS's 0.643 over vector's 0.429, with zero hybrid misses. Nothing is
wrong with RRF.

**Where the answer is past the cap**, the vector leg is not weak. It
is blind by construction — 0.022 MRR, eight misses in nine queries,
because no vector in the corpus ever saw the text that answers the
question. And RRF at equal weights still gives it half the ranking
budget. Fusion lands at **0.205 against its own keyword leg's 0.493**,
and generous grep (0.369) beats it too.

That is the first case measured here where **fusing is worse than not
fusing**. The rule it bounds — [[OBS-018]]'s "two mediocre retrievers
that fail differently beat either one" — assumes both retrievers are
*retrieving*. A leg that cannot see the answer is not a diverse
opinion; it is noise with a vote.

## This reframes what the cap costs

[[FRICTION-031]] asked what the 8,000-char truncation costs and was
answered with split-or-chunk. [[OBS-019]] then measured that raising
the cap makes things worse and concluded truncation is not a defect —
"the truncated prefix is a better vector", because these records open
with framing and close with detail.

Both stand. The companion run confirms it independently: on
record-finding questions the adopted corpus's long-record category is
healthy, and its cap16k arm cost **−0.208** MRR.

What none of them measured is the query whose answer is *in the
discarded tail*, because no query set contained one. This set does,
and the answer is:

- **The tail is findable.** FTS indexes the whole body and retrieves
  it at 0.493 — better than hybrid does.
- **Hybrid loses it.** Not the indexer, not the cap, not the corpus.
  The ranker.
- **A bigger cap does not fix it.** The same corpus's cap16k arm moved
  the detail set by **+0.009**, inside the noise floor, while wrecking
  record-finding. The truncated sub-arm actually got *worse*
  (0.215 → 0.199).

So the cap question closes differently than it looked: raising it is
refused twice over, splitting is not indicated, and the one real cost
sits in a place four evals never looked.

## What this licenses, and what it does not

**It does not reopen [[OBS-018]].** That sweep's argmax is correct for
the conditions it swept: this repo's corpus, record-finding queries,
15% of characters over the cap. Two of those three differ here. A
different argmax on a different corpus is an argument for a knob, not
for a new default — and the shipped default should stay what the
measured majority case wants.

**Query-dependent leg weights remain forbidden.** Deciding that an
incoming question is a detail question rather than a record-finding
question is inference about intent: [[DP-001]] tier 3, and no
measurement licenses building it. The evidence here is compatible with
exactly one shape — a **static, configurable leg weight**, tier 2, a
visible default with an override, chosen per corpus by whoever can run
the harness against it. Whether docdog should have that knob is a
discussion, not a patch, and it should be opened as one.

## Confidence

The decisive arm is **nine queries**, which is small, and the query
set's own header states a confound: the control golds are short,
narrow records, so a detail question about one sits closer to a
record-finding question than its truncated counterpart does. The
control arm is flattered.

The confidence does not come from the sample size or the gap. It comes
from the vector leg reading **0.022 in one arm and 0.429 in the
other** — that is not a ranking artifact but a leg being absent, and it
is the mechanism the design predicts. [[OBS-019]]'s rule applied: when
an arm moves, measure the mechanism, not just the score.
