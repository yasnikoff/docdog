---
id: OBS-025
title: "q8 measured on an adopted corpus: OBS-022's bet-hedge was right about the mechanism and right to ship anyway — but its 'costs nothing' is scoped to record-finding, and detail retrieval is where quantization is felt"
collection: observations
status: current
date: 2026-08-25
description: "OBS-022 shipped q8 as an opt-in and named its own scoped-out risk: an adopted corpus retrieving at ~0.69 is a weaker-hybrid regime where the vector leg carries more and q8's −0.062 leg regression has more room to surface. Measured there. The mechanism is confirmed and larger — the vector leg falls 0.553 → 0.456 (Δ −0.097, 1.6× the own-corpus damage) — and the conclusion still holds, because hybrid absorbs it exactly as predicted: 0.623 → 0.600 on record-finding questions, Δ −0.023, inside the noise floor. What OBS-022 could not see, having no detail query set, is that the absorption is not uniform. On questions whose answer is a fact in the middle of a document and IS embedded, hybrid falls 0.667 → 0.560 (Δ −0.107, the largest single drop measured here); on questions whose answer is past the embed cap it falls 0.022, because the vector leg is already absent and quantization cannot subtract from nothing. So fp32 stays the default and q8 stays a legitimate opt-in — but the README's 'costs nothing in hybrid search quality' is a record-finding claim and should say so. Caveat carried loudly: the decisive arm is 7 queries and three rank changes."
relationships:
  - references: OBS-022
    context: "the measurement this extends to the regime it explicitly deferred — its own relationships block names the adopted corpus as the scoped-out risk and calls the fp32 default 'partly a bet-hedge against that unmeasured regime'; the hedge turns out to have been correct in mechanism (leg damage 1.6× larger) and unnecessary in outcome (hybrid still inside noise on the axis it measured)"
  - references: OBS-024
    context: "the detail/record-finding split this borrows, and the reason the new finding was visible at all — measuring q8 only on record-finding questions is exactly what OBS-022 did, and it is why a −0.107 sat unseen; the truncated arm's null here is also OBS-024's mechanism restated, since a leg that is already blind cannot be further degraded"
  - references: OBS-023
    context: "the instrument, and its validation: the FTS and both grep rows are byte-identical across all four runs, and the fp32 arm reproduced to three decimals after a full rebuild and a dtype excursion — so every delta below is dtype and nothing else"
  - references: OBS-018
    context: "the leg-versus-fusion rule holding a fourth time and then bending: a leg regression of −0.097 costs hybrid −0.023 where FTS is strong, which is RRF paying for diversity as advertised — but where the vector leg is the leg that knows the answer, the absorption stops working, which is the boundary the rule never stated"
  - references: FRICTION-046
    context: "found while setting this arm up, and the reason the first attempt was invalid — `docdog index` re-embedded 29 of 1,134 records after the dtype switch, because the full-rebuild guard compares the bare model rather than the recipe; every number here required `index --full`"
  - references: DP-001
    context: "tier 2 working as intended — dtype is a visible default with an override, the override was measured rather than argued about, and the measurement is what keeps the default where the majority case wants it"
---

# OBS-025: q8, measured where OBS-022 said it should be

## Why this ran

OBS-022 measured `embed.dtype: q8` on this repo's corpus, found hybrid
MRR 0.849 → 0.831 (Δ −0.017, inside noise) against a vector-leg
regression of 0.673 → 0.610 (Δ −0.062, outside it), and shipped q8 as
an opt-in with fp32 as the default. It then wrote down what it had not
measured:

> the scoped-out risk: every number here is this corpus and this
> ranker, and OBS-013's adopted 9.5 MB corpus retrieves at hybrid
> 0.694 — a weaker-hybrid regime where the vector leg carries more and
> q8's −0.062 has more room to surface. The default staying fp32 is
> partly a bet-hedge against that unmeasured regime.

A prediction with a stated mechanism, which is the cheapest kind of
claim to check. This is the check.

## What ran

Both frozen query sets of an adopted 1,134-record corpus, through
`run-external-eval.ts`, fp32 then q8, `docdog index --full` between
arms. Four runs, all five systems.

**Instrument validation first**, because the whole measurement is a
difference: the FTS and both grep rows are **byte-identical across
every arm** — they are dtype-independent by construction, so anything
else would have meant drift. And after the excursion, restoring fp32
reproduced the original arm to three decimals (0.623 / 0.430 / 0.553 /
0.238 / 0.000). Every delta below is dtype and nothing else.

## Record-finding questions: OBS-022 confirmed

| system | fp32 | q8 | Δ |
|---|---|---|---|
| hybrid | 0.623 | 0.600 | **−0.023** |
| vector (leg) | 0.553 | 0.456 | **−0.097** |
| fts (leg) | 0.430 | 0.430 | 0.000 |

Hit@1: hybrid 45% → 45%; vector 45% → 32%.

**The predicted mechanism is real and bigger than predicted.** The
vector leg loses 0.097 here against 0.062 on this repo's corpus — 1.6×
the damage, in the weaker-hybrid regime OBS-022 named, for the reason
OBS-022 gave.

**And the conclusion survives anyway.** Hybrid pays 0.023 of it, which
sits inside the noise floor. This is [[OBS-018]]'s rule holding a
fourth time: RRF buys leg *diversity*, and FTS is dtype-independent,
so a dented vector leg is largely absorbed. The bet-hedge was correct
about the physics and did not need to change the shipped default.

## Detail questions: the part OBS-022 could not see

OBS-022 measured on record-finding questions, because in July that was
the only query set anyone had. [[OBS-024]] built the other axis. On it:

| arm | fp32 | q8 | Δ |
|---|---|---|---|
| all detail (16) | 0.407 | 0.347 | −0.059 |
| **detail-embedded** (7) | **0.667** | **0.560** | **−0.107** |
| detail-truncated (9) | 0.205 | 0.183 | −0.022 |

**The absorption is not uniform.** Where a question's answer is a
specific fact that *is* inside the embedding, hybrid loses 0.107 —
the largest single drop measured in this arm — because that is the
case where the vector leg is the leg that knows the answer, and FTS
cannot cover for it the way it covers a record-finding query.

**Where the answer is past the embed cap, nothing happens** (−0.022,
inside noise; the vector leg even reads +0.015, which is noise around
zero). That null is [[OBS-024]]'s mechanism restated from a new
direction: the leg is already blind there at 0.022 MRR, and
quantization cannot subtract from nothing.

So the shape of q8's cost is: **invisible when you are finding
records, absent when the answer was never embedded, and real when the
vector leg is doing the work.**

## Confidence

Stated plainly because the headline number is fragile: **the decisive
arm is seven queries**, and its −0.107 is three rank changes (one gold
1 → 3, one 6 → miss, one 4 → 3 the other way). On seven queries the
noise floor is wider than the ~0.03 measured on the 40-query
instrument, not narrower, and this delta is not comfortably outside a
floor that has never been measured at this n.

What earns it a record anyway is that it is **the same mechanism the
record-finding arm confirms**, pointed at the case where that
mechanism should bite hardest, and it bites there and nowhere else.
A −0.107 on the embedded arm, −0.022 on the truncated arm and 0.000 on
every dtype-independent system is a pattern, not a coin flip. It is a
signal to state, not a result to act on.

## Costs

The q8 full re-embed of 1,106 records took **30m29s**. The fp32 cold
time is not measured here — the fp32 arm ran from a warm embed store —
so OBS-022's ~2× indexing-speed claim is neither confirmed nor
challenged by this run. The restore was 14.5s and re-embedded nothing:
1,164 vectors came straight back from the store, which is
FRICTION-033's recipe key doing exactly what it was built for.

## What should change

Nothing in the code, and one sentence in the README. `dtype: q8`
stays an opt-in and fp32 stays the default — that decision was correct
and is now correct on two corpora. But the README says q8 "costs
nothing in hybrid search quality (Δ MRR −0.017, within noise)", and
that is a **record-finding** claim quoted from a **single self-hosted
corpus**. On a foreign corpus it is −0.023 for record-finding and
−0.107 for detail questions whose answer is embedded. Someone choosing
q8 to save 390 MB of download deserves to know which of those two
things they mostly do.
