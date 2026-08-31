---
id: OBS-020
title: "Late chunking: the best chunking ever measured here — and it wins by partially un-chunking, which is the opposite of its mechanism"
collection: observations
status: current
date: 2026-07-17
description: "Late chunking recovers two-thirds of the gap naive chunking opened (0.785 to 0.838 hybrid MRR) and still loses to doing nothing (0.874), at 1,881 vectors and an hour of forward passes against baseline's 308 and minutes. The result is not the finding. Its stated mechanism is that each chunk keeps its document context, so chunk vectors get better; measured, every chunk vector got WORSE — the gold span's cosine to its own query fell on 12 of 12 pairs, and the winning span became less query-responsive rather than more. What actually happens is a collapse: a document's spans converge on each other (0.663 to 0.843) and on the whole-document vector (0.774 to 0.921), on 240 of 240 records, which suppresses the max-cosine lottery OBS-016 blamed for chunking's failure. Late chunking helps by being less multi-vector. Its ceiling is the thing it approximates, which is why it lands between naive chunking and not chunking at all. Not NTK interpolation: short documents collapse more (+0.201) than long ones (+0.102)."
relationships:
  - references: OBS-016
    context: "the refusal this arm was built to overturn — it blamed chunking's failure on context loss in the fragments and on the max-cosine length tax; late chunking is the literature's direct answer to the first, and the measurement says the second was the real mechanism all along"
  - references: OBS-019
    context: "its method is the whole reason this run found anything — 'a rank drop has two causes and rank data cannot tell you which; reach for the cosine' applied one experiment later, and it caught an aggregate that would otherwise have been read as vindicating a mechanism it in fact refutes; its process-size-1 finding is also what made the forward passes buildable"
  - references: OBS-017
    context: "its leg-versus-fusion rule, now confirmed from the mirror direction — desc improved the vector leg standalone and lost the hybrid; late did not improve the leg (0.650 to 0.639) and gained 0.053 of hybrid, so the standalone score is not a weak predictor of fusion but no predictor at all"
  - references: OBS-018
    context: "its 980-config sweep re-run at 1,470 with this arm included — the argmax is still the shipped ranker, so no re-weighting rescues late chunking either; its rule that embeddings may be cached but arms must be re-measured is what caught a 4-record corpus drift here"
  - references: FRICTION-031
    context: "the 16% embed-cap hole this attacks from the fourth and last available side — chunk, but keep the context that made chunking fail; with this measured the hole is closed in every direction anyone has proposed, and the note's accepted-hole resolution stands"
  - references: NOTE-2026-07-17-retrieval-literature-review
    context: "the note that named this as the one gate OBS-019 opened, and whose §5 predicted the mechanism backwards — it said late chunking 'pools per chunk, so it dodges the dilution that killed raise-cap'; dilution enters through attention, not pooling, and pooling per chunk cannot undo it"
  - references: PROPOSAL-023
    context: "§2 designed the chunking whose ord/start_line/end_line columns stay unused, and §8 deferred the ranking question to an eval — this is the fourth eval to run through that door and the fourth to come back with the shipped ranker"
  - references: DP-001
    context: "tier 1 is why this was decidable by measurement at all — when to pool is a mechanical recipe with no judgment in it, so an eval settles it; a design that inferred chunk boundaries from meaning would have failed the principle before it reached the harness"
  - references: OBS-013
    context: "the 9.5MB adopted corpus this says nothing about — its documents are longer, and the literature's one quantitative claim about late chunking is that it helps more as documents grow, so the arm refused here is the arm most likely to behave differently there"
---

# OBS-020: late chunking, measured — it works, for the wrong reason, and still loses

## What ran

Late chunking (Günther et al. 2024), the design the literature review named as
the only candidate OBS-019's memory result unblocked.

Every other arm in this investigation decides **what text to embed**. This one
changes **when the pooling happens**, and nothing else. Naive chunking embeds
each span in isolation: the forward pass for `## 10. Supersession pass` has
never seen the word DD-070, so its vector cannot encode which document it
belongs to. Late chunking runs **one forward pass over the whole document**,
then mean-pools the token vectors **within each span's range**. Every token has
attended to the entire document before its span is pooled.

The layout is `adaptive`'s, unchanged and deliberately so — the same AST
heading boundaries, the same leaf fallbacks, the same 1,881 spans that OBS-016
measured at 0.785. That makes this a controlled A/B on exactly one variable:
0.785 was isolated pooling, this is contextualized pooling.

**The instrument was verified in two halves before it was trusted**, because
one end-to-end check conflates them. The hand-assembled input tensor is exact:
pooled the pipeline's way it reproduces the shipped embedding at **cosine
1.000000**, so the model sees precisely the sequence it otherwise would. Span
pooling then deliberately excludes `[CLS]`/`[SEP]`, which is the entire reason
a one-span document scores 0.996197 rather than 1.000000 against the pipeline.
That is the design, not drift — handing every span the document's `[CLS]` would
leak a document-level summary into each vector by a route that is *not* late
chunking's mechanism, confounding the arm in its own favour.

Span alignment is **by construction, not by search**: transformers.js exposes
no offset map, so each span is tokenized with `add_special_tokens: false` and
the ids are concatenated into the tensor by hand. Span *i* provably occupies
tokens `[1+offset_i, 1+offset_i+len_i)`. An assertion still checked the
assembled ids against tokenizing the join on every record — **0 warnings across
308 records**.

## The result

40 frozen queries, K=10, 308 records — every arm re-measured on one snapshot.

| design | chunks | vector Hit@1 | vector MRR | hybrid Hit@1 | hybrid MRR |
|---|---|---|---|---|---|
| **baseline** — today, the 16% hole | 308 | 55.0% | 0.674 | **82.5%** | **0.874** |
| adaptive — naive chunking (OBS-016) | 1,881 | 52.5% | 0.650 | 67.5% | 0.785 |
| multi-level (OBS-016) | 5,802 | 45.0% | 0.611 | 62.5% | 0.735 |
| desc (OBS-017) | 308 | **65.0%** | **0.733** | 77.5% | 0.840 |
| desc-trunc-only (OBS-017) | 308 | 47.5% | 0.619 | 77.5% | 0.850 |
| raise-cap (OBS-019) | 308 | 52.5% | 0.625 | 77.5% | 0.846 |
| **late** | 1,881 | 55.0% | 0.639 | 75.0% | **0.838** |

**Late chunking is the best chunking design ever measured on this corpus.**
It recovers two-thirds of the gap OBS-016 opened — 0.785 → 0.838 — which is
+0.053, about four times this instrument's noise floor (below). The literature
is not wrong: contextualized chunks beat isolated chunks, decisively and
reproducibly.

**And it still loses to doing nothing.** 0.838 against baseline's 0.874, for
1,881 vectors instead of 308 and an hour of forward passes instead of minutes
(258 small records in 546 s in one process; 50 documents needing a process each,
peaking at **6.0 GB RSS** on PROPOSAL-018's 6,691 tokens). On the five queries
whose gold is a truncated record — the ones FRICTION-031 is about — it is
**0 better, 2 worse, 3 unchanged**.

The fusion door was swept again with the new layout: **1,470 configs** of leg
weight × RRF-K × length normalization. The argmax is the shipped ranker at
0.874; late's ceiling anywhere in that surface is 0.842. Length-normalizing its
vector leg is actively catastrophic (α=0.05 → 0.692), which the mechanism below
explains.

## The result is not the finding

Stop at the table and the write-up is *"late chunking works — contextualization
recovers most of chunking's loss."* That reading is **false**, and only an
absolute measurement says so. This is OBS-019's lesson arriving one experiment
later and one level up: there it was *rank cannot tell you which mechanism
moved*; here it is **an aggregate cannot tell you that a design is succeeding
for the opposite of its stated reason.**

Late chunking's claim is that each chunk *keeps its context*, so chunk vectors
get **better**. Three measurements, none of which needed a ranking:

**1. Every chunk vector got worse.** The gold record's best span, scored
against its own query, versus the same span embedded in isolation:

| | late − adaptive |
|---|---|
| q01 DD-070 | −0.1672 |
| q15 DD-070 | −0.1145 |
| q20 FRICTION-010 | −0.1989 |
| q12 DD-035 | −0.0879 |
| … | … |

**Cosine fell on 12 of 12 gold pairs. Unanimous.** Against `baseline` it fell
on 9 of 12.

**2. The winning span got *less* query-responsive.** Across DD-070's six
queries, `adaptive` picks spans 0, 1, 5, 0, 5, 6 — it moves with the question.
`late` picks 7, 7, 5, 7, 5, 6, converging on *"§7 Cutover prerequisites"*, which
answers none of them. If spans were inheriting their subject, the winner for
*"which decisions did DD-070 supersede"* would be §10, the supersession pass.
It is not, under either design.

**3. The spans collapsed into each other.** Query-independent, so nothing here
is a ranking artifact:

| | adaptive | late | |
|---|---|---|---|
| mean pairwise similarity among a document's own spans | 0.6634 | **0.8435** | +0.1801 on **240/240 records** |
| mean cosine from a span to its whole-document vector | 0.7743 | **0.9212** | +0.1469 on **240/240 records** |
| lottery premium (max − mean span cosine), 9,600 pairs | 0.0544 | **0.0330** | **−39%** |

## What it actually does

Contextualization does not inform a span. **It smears it toward the document.**

A late-pooled span is a **92% copy of its own document's vector**. The biggest
movers are exactly the giants — DISC-019, PROPOSAL-003, PROPOSAL-018 all go
from ~0.53 to ~0.93.

That explains the win, and it has nothing to do with context. `vectorLeg` takes
**max-cosine per record**, so N spans are N lottery tickets and a long non-gold
record wins on its luckiest fragment — OBS-016's length tax. Smeared spans are
**correlated**, and a max over correlated draws carries far less upside noise
than a max over independent ones. The lottery quiets down by 39%. Late chunking
does not beat the tax; it **stops playing**.

Which makes the whole result table a straight line:

| | | |
|---|---|---|
| adaptive | 0.785 | independent spans — the full tax |
| **late** | **0.838** | spans 92% of the way to the centroid — part of the tax |
| baseline | 0.874 | the centroid itself — no tax |

**Late chunking lands between because it *is* between.** In the limit of total
smearing every span *is* the document vector, max-cosine over identical vectors
is the document's cosine, and the design becomes `baseline` exactly. This route
cannot pass the thing it is approximating — it can only approach it from below,
at six times the vectors and an hour of compute. And it does not get to keep
its remaining span-specific signal for free: every measured point sits below
the pure centroid, so what distinctiveness survives is not paying for the
lottery it still permits.

> **Late chunking is an expensive, partial way of not chunking.**

It also explains the α=0.05 collapse: length-normalizing subtracts `α·ln(N)`
to punish records for holding many tickets. Late chunking already stopped
playing the lottery, so the penalty is pure loss levied on the records that
were behaving.

## Not the NTK boundary — and it fails backwards

OBS-019 found nomic's positions are NTK-interpolated past its **2,048-token
trained length**, and that mean-pooling over ~6k tokens blurs a centroid. These
forward passes run to 6,691 tokens, so the collapse could have been that effect
wearing a hat — in which case the finding would be scoped to the giants.

| bucket | records | adaptive intra | late intra | delta | collapsed |
|---|---|---|---|---|---|
| short (<8k chars — wholly inside the trained length) | 190 | 0.6621 | 0.8627 | **+0.2006** | 190/190 |
| long (>8k chars — interpolated positions) | 50 | 0.6684 | 0.7707 | +0.1023 | 50/50 |

**Short documents collapse nearly twice as hard as long ones** — the opposite
of what the interpolation account predicts, and it holds on every record in
both buckets. Smearing is what full-document attention *does*, and it is
strongest where the model is most comfortable. OBS-019's dilution is a separate
effect that happens to point the same way.

## The rule this earns: the standalone leg score is not a predictor

CLAUDE.md carries OBS-018's rule as *"an input change that improves one leg's
standalone score can still lose, and the standalone score will not tell you."*
This arm supplies the mirror image, which is the half that was missing:

| | vector leg | hybrid | |
|---|---|---|---|
| **desc** (OBS-017) | 0.676 → **0.733** best ever | 0.874 → 0.840 | improved the leg, **lost** |
| **late** | 0.650 → **0.639** slightly worse | 0.785 → **0.838** | did not improve the leg, **gained 0.053** |

A change can make a leg *worse standalone* and make the fusion substantially
*better*. So the leg score is not a weak predictor of the fused number — it is
**not a predictor**. RRF pays for **complementarity**, and complementarity is a
property of the pair, invisible in either member. Only the fused number decides,
in both directions.

## Honest bounds

- **The noise floor is now measured, and it is bigger than assumed.** `desc`
  has scored **0.840 (304 records) → 0.827 (307) → 0.840 (308)** — a 0.013
  swing across corpora differing by four records. Nothing under ~0.03 is a
  finding here. Late's gaps survive it (0.036 vs baseline, 0.053 vs adaptive);
  OBS-017's 0.874→0.840 does not, which is precisely what its own honest-bounds
  section said at the time, and it was right.
- **Three of those four records were EDITS, not additions.** Last session
  amended FRICTION-031, OBS-017 and the literature review, so their bodies
  changed and their vectors with them. "Did the corpus grow?" is the wrong
  question — OBS-018's rule (cache the embeddings, re-measure the arms) is what
  caught it, and it would have gone unnoticed a second time otherwise.
- **This refuses late chunking *in docdog*, not in general.** The benefit
  measured here is an artifact of scoring **records** by max-cosine over their
  spans. A system that returns **passages** has no max-per-document step and no
  lottery to suppress, and the literature's benchmarks are passage benchmarks.
  The published gains are not in dispute; what they mean for a record-returning
  system is what this measures.
- **Unevidenced and interesting**: if late chunking's reported gains are partly
  a document-prior effect — chunks pulled toward a document that is relevant by
  the benchmark's construction — the same mechanism found here would be doing
  work there too. Nothing in this run tests that. Flagged, not claimed.
- **One layout.** `adaptive`'s heading boundaries, chosen to hold the A/B
  fixed, not the paper's fixed-size or sentence spans. A different layout would
  smear differently in degree. It is hard to see it flipping a direction that
  held on 240 of 240 records in both length buckets.
- **The "document" is the span-join.** Spans are trimmed and MIN_CHUNK-filtered,
  so their concatenation is the body minus whitespace and stray <40-char blocks.
  That join is what each span was contextualized by.
- **OBS-013's 9.5MB adopted corpus remains the live unknown**, and this is the
  arm with the most reason to behave differently there: its documents are
  longer, and the one quantitative claim the literature makes about late
  chunking is that it helps more as documents grow.

## What is now closed

FRICTION-031 framed the hole as split-or-chunk. Four ways have been proposed to
close it and all four are measured and refused:

| direction | arm | hybrid |
|---|---|---|
| chunk it | adaptive / multi-level | 0.785 / 0.735 (OBS-016) |
| summarize into the input | desc | 0.840 (OBS-017) |
| raise the cap | raise-cap | 0.846 (OBS-019) |
| chunk it, but keep the context | **late** | **0.838** |
| **do nothing** | **baseline** | **0.874** |

Every arm that has ever been proposed loses to leaving it alone, and the ranker
that beats them all is the one already shipped, across 1,470 swept configs.

The reason is now singular and mechanical rather than four coincidences.
**Docdog's search returns records, and a record is scored by the max over its
vectors.** Any multi-vector layout buys fragment recall it cannot spend and
pays a lottery tax it cannot avoid; the only way to reduce the tax is to make
the vectors resemble each other, and the limit of that is one vector per record,
which is what ships. The whole-record centroid is not a compromise forced by the
cap. **It is the shape of the problem.**
