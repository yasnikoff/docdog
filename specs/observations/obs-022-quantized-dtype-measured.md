---
id: OBS-022
title: "Quantized embeddings (q8) measured: 4× smaller model at no hybrid cost but a real vector-leg regression — so q8 ships as an opt-in, fp32 stays the default"
collection: observations
status: current
date: 2026-07-20
description: "FRICTION-018 item 3 asked whether to move docdog's default embedding dtype to a quantized variant, and said to measure rather than assume. Measured on the 40 frozen queries over this 315-record corpus, fp32 vs q8: hybrid MRR 0.849 → 0.831 (Δ −0.017, below this instrument's ~0.03 noise floor) and vector-leg MRR 0.673 → 0.610 (Δ −0.062, above it). q8 is 132 MB vs fp32's 522 MB (4× smaller) and indexed ~2× faster (542s vs ~1058s). The result is the OBS-018 rule replayed: a leg change that measurably worsens the vector leg is absorbed by hybrid because FTS is dtype-independent and RRF pays for leg diversity. So the operational win (size, speed) is real and the quality win is not — q8 becomes a config-selectable opt-in (embed.dtype) for download/disk-constrained environments, and fp32 remains the shipped default."
relationships:
  - references: FRICTION-018
    context: "the friction this closes item 3 of — its blocking cause (item 1, the circular offline advice) shipped 2026-07-13, item 2 (durable model cache) shipped alongside this, and this is item 3's measured answer: the default does not move, but the lever the constrained filer needs now exists"
  - references: OBS-019
    context: "the fp32 baseline here validates against it — vector-leg MRR 0.673 vs its 0.674 on a corpus 13 records smaller — and it is the methodological parent: measure the mechanism (the vector leg), not just the headline, because the headline (hybrid) hides what changed"
  - references: OBS-018
    context: "supplies the rule this instance obeys — FTS alone 0.61, vector alone 0.68, fused 0.87, so complementarity is the product; a dtype that dents the vector leg 9% barely moves hybrid because RRF buys leg diversity, not leg strength. The standalone leg score is not a predictor of the fused number, in both directions"
  - references: OBS-017
    context: "the source of the ~0.03 noise floor this decision leans on ('0.013 is this instrument's noise floor; nothing under ~0.03 is a finding') — Δ hybrid −0.017 sits inside it, Δ vector −0.062 sits well outside it, which is the whole finding"
  - references: OBS-013
    context: "the scoped-out risk: every number here is this corpus and this ranker, and OBS-013's adopted 9.5 MB corpus retrieves at hybrid 0.694 — a weaker-hybrid regime where the vector leg carries more and q8's −0.062 has more room to surface. The default staying fp32 is partly a bet-hedge against that unmeasured regime"
  - references: FRICTION-033
    context: "what made this measurement clean and what q8-as-opt-in relies on: dtype is a third input to the embedding function, so it joins the recipe key exactly as the cap did. fp32 and q8 vectors coexist in one store without collision, and an unset dtype yields the byte-identical pre-dtype key so the common case re-embeds nothing"
  - references: DP-001
    context: "tier 2 throughout — dtype is a visible default with an override, and the discipline the tier demands ('measured before changed, not assumed') is exactly what happened. Keeping fp32 default rather than auto-selecting by environment is the tier-3 line held: docdog does not infer that a machine is constrained, it exposes the knob"
  - references: OBS-016
    context: "same shape of conclusion, different subject: a plausible retrieval change (there, chunking; here, quantization) built and measured, and refused as a default because it does not clearly win on quality. The refusal is the reusable output, not the arm"
---

> Measured, not assumed — FRICTION-018 item 3's explicit instruction. The
> harness is the frozen 40-query set over this repo's live corpus, run through
> the real `search()` (same RRF, same legs) against a real index built at each
> dtype; the query is embedded through the same dtype-configured embedder. The
> fp32 row reads the live cache read-only; only q8 was indexed fresh, into a
> temp cache and temp embed store so nothing real was touched.

## What was asked

FRICTION-018 filed three items. Item 1 (the circular offline advice) shipped
2026-07-13. Item 2 (a model cache surviving `node_modules` reinstalls) shipped
alongside this. Item 3 was a **measurement question**: the fp32 `model.onnx` is
large; a quantized dtype is 4–8× smaller "with minimal retrieval-quality loss"
— but *minimal* was a guess, and the friction said to measure it against the
frozen eval sets before moving the default.

## What was found

This model — `nomic-ai/nomic-embed-text-v1` — publishes exactly two ONNX
files: `model.onnx` (fp32) and `model_quantized.onnx` (q8). No q4, no fp16. So
the real question is fp32 vs q8, the 4× cut.

| dtype | model | hybrid MRR | vector MRR | hybrid Hit@1 | vector Hit@1 |
|---|---|---|---|---|---|
| fp32 (default) | 522 MB | 0.849 | 0.673 | 31/40 | 22/40 |
| q8 | 132 MB | 0.831 | 0.610 | 30/40 | 19/40 |

**Δ hybrid MRR = −0.017. Δ vector MRR = −0.062.** q8 also indexed ~2× faster
(542s vs the fp32 full-reindex's ~1058s on the same corpus).

Read against this instrument's own noise floor (OBS-017: ~0.03), the two
deltas fall on opposite sides of it. **Hybrid is unchanged** — −0.017 is
noise. **The vector leg is measurably worse** — −0.062 is a ~9% relative drop,
and vector Hit@1 falls 22 → 19.

That split is not a surprise; it is OBS-018's rule playing out. FTS is
dtype-independent, so quantization touches only the vector leg, and RRF fuses
for *diversity* rather than strength — so a real dent in one leg barely moves
the fused number when the other leg is unaffected. The standalone leg score is
not a predictor of the fused number: here a −0.062 vector change buys a −0.017
hybrid change. The mechanism is visible only because the vector leg was
measured directly (OBS-019's lesson), not inferred from the hybrid headline.

The fp32 baseline validates the harness: vector-leg MRR 0.673 sits on top of
OBS-019's 0.674, measured on a corpus 13 records smaller.

## The decision

**q8 is worth it operationally and not worth it on quality.** Its wins are
size (132 vs 522 MB — 4×) and speed (~2×); its cost is a measured vector-leg
regression that hybrid currently hides. On this corpus that cost is invisible
in the number an agent actually consumes. But every number here is scoped to
this corpus and this ranker, and OBS-013's adopted corpus retrieves at hybrid
0.694 — a weaker-hybrid regime where the vector leg carries more of the load
and q8's −0.062 has more room to reach the surface.

So the default does not move. Making q8 the default would impose a measured
regression on every user — most of whom are not download- or disk-constrained
— to serve the minority who are. The asymmetry is the argument for an opt-in,
not a default:

- **fp32 stays the shipped default.** No quality risk, and the conservative
  choice against the unmeasured weak-hybrid regime.
- **q8 is a documented, config-selectable option** (`embed.dtype: q8`) for the
  environment that filed the friction — a restricted-egress sandbox where 132
  MB clears an allowlist that 522 MB does not. Item 1 already documented the
  offline drop-in path; a 4×-smaller file makes that path 4× cheaper.

The mechanism is already built (FRICTION-033's recipe key carries dtype, so
fp32 and q8 coexist in one store), which is what makes the opt-in free to ship
and the measurement clean to run.

## Rejected alternatives

- **Flip the default to q8.** Rejected: it trades a measured corpus-wide
  vector regression for size/speed the majority did not ask for, and bets the
  regression stays hidden on corpora this eval never saw (OBS-013).
- **Auto-select dtype by environment** (detect offline / low disk → q8).
  Rejected as DP-001 tier 3: docdog does not infer that a machine is
  constrained. It exposes the knob and documents when to reach for it.
- **Measure the orchestrator corpus first** before deciding. Deferred, not
  done: it would sharpen the weak-hybrid risk estimate, but the decision does
  not depend on it — keeping fp32 default is already the choice that is correct
  whether or not q8 degrades further there. Recorded here as the obvious next
  measurement if q8-as-default is ever reconsidered.
