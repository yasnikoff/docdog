---
id: OBS-018
title: "PROPOSAL-023 §8's ranking-tuning door: 980 configs swept, nothing beats the shipped ranker — and it was allowed to read the test set"
collection: observations
status: current
date: 2026-07-17
description: "The last live path from OBS-016 and OBS-017 swept and closed. Both levers §8 named — a length-normalized vector leg and a re-weighted fusion — measured across every chunk layout, 980 configs. The argmax IS the shipped ranker (baseline, RRF K=60, equal legs): MRR 0.874. The sweep was deliberately allowed to fit the frozen 40, because the asymmetry is the design — a win would prove nothing (overfitting a test set), while a null cannot be overfit into existence. Also quantifies why: FTS alone 0.608, vector alone 0.676, fused 0.874, so the fusion adds ~0.2 over either leg and complementarity is the whole product. And it caught a corpus-drift error in OBS-017's method note."
relationships:
  - references: OBS-016
    context: "closes the door it left open — it found fragment recall max-cosine could not spend and named length-normalized ranking as the only remaining lever; the lever works (adaptive 0.785 to 0.799 at alpha=0.01) and buys 0.014 against a 0.075 gap, which is the measurement that ends the argument rather than deferring it again"
  - references: OBS-017
    context: "closes the same door from the other side, and corrects its method note — its claim that re-serving arms from result-*.json made the baseline a same-run number was wrong twice, and the drift check here is what caught it; the numbers in its table survive unchanged"
  - references: PROPOSAL-023
    context: "§8 deferred ranking tuning as eval-driven follow-up and §3 specified the RRF-over-two-legs design being tested — the deferral is now discharged rather than inherited, and §3's constants turn out to sit at the argmax of a 980-config sweep"
  - references: OBS-010
    context: "the frozen 40 this sweeps against, and the reason the sweep is reported as a surface rather than an argmax — a test set spent as a dev set stops being an instrument, so the null is the only part of this that carries"
  - references: FRICTION-031
    context: "the embed-cap hole that started the whole thread — three investigations later its accepted-hole resolution is untouched, and this is the last one that could have reopened it"
  - references: DP-001
    context: "tier 1 throughout — RRF constants and leg weights are statistical mechanics an eval may settle, which is why 980 configs is a legitimate way to answer the question and why the answer is binding"
---

# OBS-018: the fusion door, swept and closed

## Why this ran

OBS-016 and OBS-017 converged on the same suspect. Chunking produced real
fragment recall that `max-cosine` could not spend; descriptions produced a
real vector-leg gain that RRF could not spend. Neither failure was in the
*input*. Both pointed at PROPOSAL-023 §8's deferred "ranking tuning", which
had by then been named the only live path twice and tested zero times.

Free to answer: every vector was already in the embed cache. No embedding
runs, ~2 minutes.

## The methodology, stated before the numbers

The 40 queries are a **test set**, frozen by OBS-010 so that numbers mean
something. Sweeping hyperparameters against them and reporting the argmax is
fitting noise and calling it a result.

So the asymmetry is the entire design:

- **A win proves nothing.** It is an upper bound collected by cheating, and
  would need held-out queries before anyone should believe it.
- **A null is conclusive.** You cannot overfit your way to a null. If tuning
  cannot beat the shipped ranker *while reading the test set*, it will not
  beat it on queries it has never seen.

The sweep was therefore allowed to cheat on purpose, hunting for a win it
would not have been permitted to keep. It did not find one.

## Faithfulness gate

The legs are re-implemented here, because `search()` fuses internally and the
point is to vary the fusion — a re-implementation is exactly how a harness
starts measuring itself instead of the product. So it is gated against the
real `search()` **on the same snapshot**:

```
desc + rrf(K=60, wVec=1)  =>  Hit@1 77.5%, MRR 0.840
real search(), same 304 records  =>  Hit@1 77.5%, MRR 0.840
```

Exact. Gated on `desc` rather than `baseline` deliberately: `cache-desc.db`
holds the desc chunk layout, so the real `search()` over it *is* that design.
Gating on baseline would have confounded "are the mirrors faithful" with "did
the corpus drift" and answered neither.

## Lever 1 — re-weighted fusion

Leg weight `wVec` against `w_fts = 1`, across RRF K. Shipped is
`wVec=1, K=60`.

| design | K | wVec=0 | 0.5 | 0.75 | **1.0 (shipped)** | 1.5 | 2.0 |
|---|---|---|---|---|---|---|---|
| **baseline** | 10 | 0.608 | 0.838 | 0.850 | 0.861 | 0.860 | 0.827 |
| **baseline** | **60** | 0.608 | 0.850 | 0.863 | **0.874** | 0.870 | 0.842 |
| **baseline** | 120 | 0.608 | 0.850 | 0.863 | 0.869 | 0.870 | 0.842 |
| adaptive | 60 | 0.608 | 0.762 | 0.788 | 0.785 | 0.772 | 0.768 |
| multi-level | 60 | 0.608 | 0.760 | 0.767 | 0.733 | 0.743 | 0.745 |
| desc | 60 | 0.608 | 0.815 | 0.827 | 0.840 | 0.832 | 0.842 |

Equal legs at K=60 is the peak. The surface is smooth and unremarkable around
it — there is no ridge anyone left unclimbed.

## Lever 2 — length-normalized vector leg

`score = max_cos − α·ln(N)`, N = the record's chunk count. The standard
correction for the upward bias of a max over N draws, which is precisely
OBS-016's lottery-ticket mechanism.

| design | α=0 (shipped) | 0.01 | 0.02 | 0.05 | 0.1 | 0.2 |
|---|---|---|---|---|---|---|
| baseline | **0.874** | 0.874 | 0.874 | 0.874 | 0.874 | 0.874 |
| adaptive | 0.785 | **0.799** | 0.792 | 0.773 | 0.577 | 0.350 |
| multi-level | 0.733 | 0.726 | 0.721 | 0.727 | 0.588 | 0.342 |
| desc | **0.840** | 0.840 | 0.840 | 0.840 | 0.840 | 0.840 |

**The lever works, and it is not enough.** Adaptive gains +0.014 at α=0.01 —
real, in the predicted direction, and the diagnosis was correct. The gap it
must close is **0.075**. It buys under a fifth of it, then reverses.

Baseline and desc are exact no-ops at every α, because ln(1) = 0 — a
one-chunk record has no length to normalize. That is the correctness check on
this lever: a length correction that moved a single-chunk design would be a
bug.

## The result

**980 configs. The argmax is the shipped ranker.**

```
shipped ranker : MRR 0.874   (baseline, K=60, wVec=1, α=0)
best of sweep  : MRR 0.874   (a tie at K=20; nothing exceeds it)
```

Nothing beats it. Not with a different chunk layout, not with a re-weighted
fusion, not with a length-normalized vector leg, not with all three at once,
not while reading the answers.

## Why: complementarity is the product

The sweep hands over the number that turns OBS-017's hypothesis into a
measurement. `wVec=0` is the keyword leg alone, and it is **identical across
all four designs at 0.608** — no design touches `vertices`, so fts5 over
title/description/body is design-independent. Which means *every* difference
in this entire investigation was the vector leg.

| | MRR |
|---|---|
| FTS alone | 0.608 |
| vector alone | 0.676 |
| **fused** | **0.874** |

**The fusion adds ~0.2 over either leg.** Two mediocre retrievers that fail
*differently* beat either one, by a margin far larger than the gap between
them. That is the whole product, and it explains all three refusals at once:

- **chunking** traded centroid quality for fragments → the vector leg got
  worse → less to fuse.
- **desc** made the vector leg *better* (0.676 → 0.733) and hybrid *worse*
  (0.874 → 0.840), because it made the vector leg better **at FTS's job**.
  It bought strength with complementarity, and the fusion only pays for the
  latter.
- **re-weighting** cannot manufacture complementarity that the legs do not
  have. It can only re-price what is there, and equal is the right price.

The lesson generalizes past docdog: **in a two-leg hybrid, an input change
that improves a leg's standalone score can still lose, and the standalone
score will not tell you.** Only the fused number decides. OBS-017 measured
both and could see it; a project measuring only the leg it changed would have
shipped `desc` and called it a win.

## What was NOT swept

- **Score-based fusion** — z-normalizing BM25 and cosine and summing, rather
  than fusing by rank. A different family; §8 did not name it and nothing here
  is evidence for or against it.
- **Per-level weighting** for multi-level (doc vs section vs paragraph
  vectors priced differently). OBS-016 floated it. Untested. Multi-level's
  best score under *any* config here is 0.767 against baseline's 0.874, so it
  would have to find 0.107 that no other lever came near.
- **Query-dependent weighting** — pricing the legs per query. That is
  inference about a query's kind, i.e. DP-001 tier 3, and should not be built
  in code regardless of what it scores.

## Honest bounds

- **A null on 40 queries is still a null on 40 queries.** It rules out a
  large effect from these levers. A +0.01 effect would be invisible here, and
  is also not worth shipping a ranker change for.
- **One corpus, one ranker, one genre.** As with OBS-016 and OBS-017,
  OBS-013's 9.5MB adopted corpus is untested and its 0.694 unexplained. The
  0.608/0.676/0.874 complementarity structure is this corpus's, and a corpus
  whose legs fail the *same* way would behave differently everywhere.
- **The sweep is a grid.** Coarse in α between 0.02 and 0.05, and w × K is
  not exhaustive. Given the surface is smooth and the best cell ties the
  shipped one, a hidden spike between grid points is not a live worry.

## Corpus drift — and an error it caught in OBS-017

Re-measuring every arm on one 304-record snapshot, rather than trusting the
cached `result-*.json`:

| design | as recorded (303 records) | re-measured (304) | delta |
|---|---|---|---|
| baseline | 0.874 | 0.874 | 0.000 |
| adaptive | 0.785 | 0.785 | 0.000 |
| desc | 0.840 | 0.840 | 0.000 |
| multi-level | 0.729 | 0.733 | +0.004 |

**The numbers survive. The reasoning that produced them did not.** OBS-017's
method note claimed that re-serving prior arms from `result-*.json` made its
baseline "the same run's baseline, not a remembered number". That is exactly
backwards: a JSON written by a previous session's run *is* a remembered
number, and it had been computed against a **303-record** corpus while `desc`
ran against **304** — the OBS-016 records had themselves been committed in
between. That table put two corpora side by side and called the difference a
design effect.

It happened to be harmless, by ≤0.004. It was harmless by luck, not by
method.

The real rule is the inverse of what OBS-017 wrote: **per-arm result caching
makes a run cheap and makes it silently span corpora.** Cache the
*embeddings*, which are content-addressed and cannot drift; re-measure the
*arms*, which can. This harness now backfills any chunk the older runs never
embedded and re-scores every design on one snapshot, which costs seconds and
removes the failure mode.
