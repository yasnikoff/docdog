---
id: OBS-017
title: "Embedding the description: the best vector-leg input measured, and hybrid still says no — because FTS had it all along"
collection: observations
status: current
date: 2026-07-17
description: "Prepending each record's authored description to its embed input is the only change that has ever improved docdog's vector leg — 55.0% to 65.0% Hit@1, reversing every chunking result. Hybrid declines anyway (0.874 to 0.840), because fts5 already indexes title/description/body: the description was never missing from retrieval, only from one leg, and RRF pays for leg diversity rather than leg strength. The sharper finding is desc-trunc-only, which improved only the 45 truncated records and made the vector leg worse than baseline — you cannot fix retrieval only where it is broken, because any non-uniform improvement is a ranking distortion. Both this and OBS-016 now point at the fusion rather than the input."
relationships:
  - references: OBS-016
    context: "the sibling measurement and the same instrument — this extends its run with two non-chunking designs and reproduces its central mechanism a third time; where OBS-016 refused chunking, this refuses the other half of the same conversation, and both land on the fusion as the only unexplored lever"
  - references: FRICTION-031
    context: "the 16% embed-cap hole both designs attack from the summary side rather than the chunking side — the abstract is complete aboutness within budget where the truncated prefix is partial; it works on the vector leg and does not survive fusion, so the note's accepted-hole resolution stands unchanged"
  - references: PROPOSAL-023
    context: "§3 specified RRF over an FTS5 leg and a cosine leg, and §1.1 put title/description/body in the fts5 table — that decision is why this experiment cannot win, three years of retrieval work later; §8's ranking-tuning door is now the only live path from two independent directions"
  - references: OBS-010
    context: "the frozen 40 and the baseline this reuses — 0.874 hybrid MRR reproduced again, which is what lets a 0.034 delta be read as a delta rather than as harness drift"
  - references: DD-059
    context: "the decision that makes description an authored field rather than a generated one — it is why this experiment costs zero new authoring and stays DP-001-clean, and why 302 of 304 records already had the input this design needed"
  - references: DP-001
    context: "tier 1 is what made this decidable — the embed recipe is mechanics an eval may settle, while writing the description itself is tier 3 and stays with the agent; a design that generated summaries at index time would have failed the principle before it failed the eval"
  - references: OBS-013
    context: "the 9.5MB adopted corpus where the FTS-covers-it argument may not hold — its descriptions are unknown in quality and its 0.694 is still unexplained; as with OBS-016, this refusal is scoped to this corpus and this ranker"
---

# OBS-017: embedding the description, measured and refused

## What ran

Two more designs through OBS-016's harness — the real `search()` against a
temp copy of the live cache, same 40 frozen queries, same embed cache.
Neither is chunking. Both keep **one vector per record**, so neither pays
the length tax that killed chunking.

| design | embed input | new embeddings |
|---|---|---|
| **desc** | `description + "\n\n" + body`, truncated at 8,000 as one input | 302 |
| **desc-trunc-only** | the same, but only where the body is over the cap | 43 |

The cap still binds the total: it is a resource guard, so "prepend and
truncate later" is not available. On an over-cap record the abstract
displaces ~577 chars of body prefix — 7.2% of the budget. That trade *is*
the design.

Inputs were sound: 302 of 304 records carry a description (median 255
chars; median 494 on the over-cap set). Only PROPOSAL-021 and
CONTRIBUTING.md lack one.

## The result

| design | vector Hit@1 | vector MRR | hybrid Hit@1 | hybrid MRR |
|---|---|---|---|---|
| baseline | 55.0% | 0.676 | **82.5%** | **0.874** |
| adaptive (OBS-016) | 52.5% | 0.650 | 67.5% | 0.785 |
| multi-level (OBS-016) | 45.0% | 0.616 | 62.5% | 0.729 |
| **desc** | **65.0%** | **0.733** | 77.5% | 0.840 |
| desc-trunc-only | 47.5% | 0.620 | 77.5% | 0.850 |

**`desc` is the only change ever measured that improves the vector leg.**
Every chunking design moved it down; this moves it up 10 percentage points.
The hypothesis was right: a whole-record abstract is better *aboutness* than
a truncated body prefix, and aboutness is what these queries match.

Hybrid — which is what docdog ships — declines anyway.

## Why: fts5 already indexes the description

`storage/schema.ts:140`:

```sql
CREATE VIRTUAL TABLE fts USING fts5(vertex_id UNINDEXED, title, description, body)
```

**The description has been retrievable since v3 step 3.** It was never
missing from retrieval — only from *one leg*, and the other leg had it all
along. `desc` therefore spends 577 chars of body prefix to teach the vector
leg something the keyword leg already knew.

RRF (`RRF_K = 60`, `storage/search.ts:89`) fuses by rank position. It pays
for **leg diversity, not leg strength**: a stronger leg that converges onto
the other leg's picks is worth less to the ensemble than a weaker leg that
disagrees. Making the vector leg better at FTS's job is not a gain, and the
body prefix it sold to get there was the part only the vector leg could see.

This is OBS-016's punchline on a different hole. Twice now the thing that
looked missing was missing from the vector side only. **Before treating any
gap as a hole, check which leg already covers it.**

`q15` shows it at record scale: DD-070's description literally opens
*"Supersedes eight decisions"* — the query is *"which decisions did DD-070
supersede"* — and its vector rank went **2 → 7**, hybrid 8 → not-found.
Every *other* description got embedded too, and in this corpus descriptions
are lineage summaries. Everything rose. DD-070 rose less.

## The finding with teeth: you cannot fix retrieval only where it is broken

**`desc-trunc-only` made the vector leg worse than baseline — 55.0% →
47.5%.**

It changes only the 45 records that have the problem, strictly for the
better, leaves 259 records untouched, and the leg gets *worse*. Those
records now carry more complete vectors than their neighbours, so they float
up as distractors on queries where they are not gold and displace correct
answers.

That is **"ranking is relative" for the third time** — after chunk-count
tickets and after multi-level's contains-baseline-and-still-loses — and this
instantiation generalizes furthest. It is not about chunks at all:

> Any non-uniform improvement to an embed recipe is a ranking distortion.
> Improving a subset is not a small version of improving everything; it is a
> different and worse intervention.

> **Mechanism corrected 2026-07-17 — OBS-019.** The paragraph above is wrong
> about *why*, and the error is instructive. "Improved records float up as
> distractors" was **asserted from rank data this note already had, and never
> checked against a cosine** — which was one query away. Measured: these
> records' cosines to their own queries are **mixed** (7 of 12 down, 5 up),
> and their ranks **sank** on 5 of 5 moves. Distractor float predicts they
> *rise*. Two bystander queries did degrade (q28, q40), so float is present —
> but it is not the dominant effect.
>
> The premise was false in this note's own words. §"What ran" says the
> abstract **displaces ~577 chars of body prefix** and calls that trade "the
> design"; four paragraphs later the analysis calls the same change "strictly
> for the better" and reasons from there. It is a trade, and for these records
> it was a bad one.
>
> **The finding stands** — desc-trunc-only is worse than baseline, and a
> recipe that branches on length is still a bad shape. The rule above is
> **weaker than stated**: it is not established that non-uniformity is what
> hurt. OBS-019 measures the same displacement in pure form, unanimously
> (12 of 12 cosines down), from a recipe that is perfectly uniform.
>
> The transferable lesson: **a rank drop has two causes and rank data cannot
> tell you which.** Reach for the cosine.

Which kills the whole shape of "apply the fix only where the problem is" —
the most natural way anyone would try to spend FRICTION-031's report. This
variant was written off in advance as an instrument rather than a shippable
rule, on the grounds that a recipe changing with length is a strange seam.
The measurement says the aesthetic objection was load-bearing.

## What this settles, and what it does not

**Settled: do not embed the description on this corpus under this ranker.**
Not because the idea is wrong — it is the best vector input measured — but
because it is redundant with a leg that already has it, and redundancy is
what RRF punishes.

**Not settled: the fusion.** Two independent investigations now converge on
it. OBS-016 found real fragment recall that max-cosine could not spend.
This found a real vector-leg gain that RRF cannot spend. Neither failure is
in the *input*. A fusion that weighted legs by their independent
contribution, or a length-normalized vector leg, might spend either. That is
PROPOSAL-023 §8's ranking tuning, it is now the only live path from both
directions, and **nothing here is evidence that it works.**

> **Closed 2026-07-17 — OBS-018.** Swept: 980 configs of leg weight × RRF-K ×
> length normalization, over every layout. **The argmax is the shipped
> ranker.** Re-weighting cannot help, and the reason is this note's own
> hypothesis, now measured: FTS alone **0.608**, vector alone **0.676**, fused
> **0.874**. The fusion adds ~0.2 over either leg — complementarity *is* the
> product, `desc` sold it for strength, and no price on the legs buys back
> what the input gave away.

## Honest bounds

- **The hybrid delta is at the edge of the instrument.** 0.874 → 0.840 is
  ~3 queries net (2 better, 5 worse) on n=40. OBS-016's own rule was that a
  ~6-query gap is real and finer distinctions are not, so the honest read is
  **neutral-to-slightly-worse, not clearly worse**. It is not the win
  shipping would require, which is the decidable part.
- **The vector gain is the more solid half** — +4 queries on Hit@1, +0.057
  MRR, in the leg the change actually targets, and it moves opposite to
  every chunking result rather than with it.
- **`desc-trunc-only`'s regression is a mechanism claim, not a rank claim.**
  55.0% → 47.5% is 3 queries. The direction matches the prediction from
  relativity, and the same mechanism has now been seen three ways, which is
  why it is stated as a rule; a single 3-query run would not earn that.
- **One corpus, one description style.** These descriptions are unusually
  good — authored per DD-059, and lineage-dense, which is precisely why they
  collide on `q15`. A corpus with thin or absent descriptions would show
  something else entirely.

## Method note — which was wrong. Corrected 2026-07-17 (OBS-018)

This section originally read: *"the three prior designs re-served from
`result-*.json` untouched — so the baseline in the table above is the same
run's baseline, not a remembered number. When a comparison spans sessions,
re-serving the old arm beats quoting it."*

**Exactly backwards.** A JSON written by a previous session's run *is* a
remembered number. Worse, it had been computed against a **303-record**
corpus while `desc` ran against **304** — FRICTION-031 and OBS-016 were
committed in between, so the chunk counts in the table above (baseline 303,
desc 304) say so in plain sight. The table put two corpora side by side and
attributed the difference to design.

OBS-018 re-measured every arm on one 304-record snapshot: baseline
0.874 → 0.874, adaptive 0.785 → 0.785, desc 0.840 → 0.840, multi-level
0.729 → **0.733**. **The numbers here survive; the method that produced them
does not.** It was harmless by ≤0.004, and harmless by luck rather than by
design.

The rule is the inverse of what was written: **per-arm result caching makes a
run cheap and makes it silently span corpora.** Cache the *embeddings* —
content-addressed, cannot drift. Re-measure the *arms* — they can.
