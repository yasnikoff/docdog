---
id: OBS-019
title: "Raising the embed cap: the hole was load-bearing — the truncated prefix is a better vector than the whole document"
collection: observations
status: current
date: 2026-07-17
description: "The design FRICTION-031 never considered — embed the whole body, no chunks, no summaries — measured and refused. Every record fits nomic's context (max 6,694 tokens of 8,192), so the cap is pure resource guard and the arm is buildable. It loses: vector MRR 0.674 to 0.625, hybrid 0.874 to 0.846, and 0 for 4 on the exact queries whose gold is a truncated record. The mechanism is proven absolutely rather than inferred from rank: the gold record's cosine to its own query fell on 12 of 12 pairs, DD-070 by -0.13 on the very question its unembedded tail answers. Truncation was accidentally acting as a summarizer, so the 16% FRICTION-031 reported as lost is what keeps the centroid sharp. Also corrects OBS-017's mechanism, which was asserted and never measured, and the literature review's claim that batch-size-1 sidesteps the allocator."
relationships:
  - references: FRICTION-031
    context: "the note this arm answers and reverses: its 16% is not a hole to be plugged but the prefix doing summarization work — embedding the missing tail makes the record match its own query less on 12 of 12 measured pairs, so the accepted-hole resolution is not a compromise, it is correct"
  - references: OBS-016
    context: "the harness, the frozen 40, and the fourth arm through them — where OBS-016 refused chunking on the length tax, this refuses the design that has no length tax at all, which is why it had to be run separately before the cap question could close"
  - references: OBS-017
    context: "corrected here: its distractor-float mechanism was asserted from rank data it already had and never checked against a cosine; measured now it is mixed (7 of 12 down), and desc-trunc-only's own targets sank on 5 of 5 rank moves — the finding stands, the stated mechanism does not"
  - references: OBS-018
    context: "extended rather than reopened: its 980-config sweep covered the layouts existing then, so the new layout was swept too — 1,225 configs, argmax still the shipped ranker, and raise-cap's ceiling across every setting is 0.846"
  - references: NOTE-2026-07-17-retrieval-literature-review
    context: "the review that named this experiment as its §5 open question and predicted mean-pooling dilution as the way it could lose; the prediction held, and its batch-size-1 claim is corrected here"
  - references: DP-001
    context: "tier 1 again: a cap is a length compared to a constant, so an eval may settle it — and it did, against the intervention, which is the direction that needs no principle to justify"
  - references: OBS-013
    context: "the 9.5MB adopted corpus where this refusal is not established: its records are longer and its descriptions unknown, and dilution is a property of input length against a trained context, so the boundary may fall elsewhere there"
---

# OBS-019: raising the embed cap, measured and refused

## Why this arm existed at all

FRICTION-031 framed the 16% hole as split (impossible — a truncated record
here is one argument with no record boundary inside it) or chunk (OBS-016
refused it). **It never asked why the cap is 8,000.**

Nothing about retrieval chose that number. `MAX_EMBED_CHARS` is a resource
guard: nomic-embed materializes an O(seq²) attention matrix, a ~6.6k-token
record demanded ~1.8 GB, and ONNX's allocator fell over. The literature
review made the omission explicit and this arm closes it.

It also had the best structural case of any design yet, surviving all three
standing refusals by construction:

| refusal | why raise-cap escapes it |
|---|---|
| OBS-016's length tax | one chunk per record — max-cosine has nothing to gamble on |
| OBS-017's redundancy | adds no field FTS already has; it adds the body **tail**, the one thing only the vector leg lacked |
| OBS-017's non-uniformity | the *recipe* is uniform — "embed the body", no branch on length |

## The corpus fits — measured, not assumed

| | |
|---|---|
| records | 307 |
| over the 8,000-char cap | 47 |
| longest record | PROPOSAL-018 — 24,311 chars, **6,694 tokens** |
| records over nomic's 8,192-token context | **0** |

So every record can be embedded whole, today, with no chunking and no
summarization. `RAISED_CAP = 25000` truncates nothing.

## The allocator: batch-size-1 was not enough

The literature review said the cap is "a resource limit, not a quality one,
and batch-size-1 sidesteps it." **The last clause is false**, and the arm
found out by dying on it.

At batch 32 the run failed on the **21st** long input asking for
**2,150,862,592 bytes** — which is `12 heads × 6693² × 4 bytes`, i.e.
PROPOSAL-018 exactly. But it had already embedded *larger* records earlier in
the same process. A cold process then embedded PROPOSAL-018 alone in 36 s at
5.8 GB RSS. The ceiling is **ONNX's BFC arena growing and never releasing**,
not an impossible request: the 21st allocation competes with twenty
predecessors that never gave their memory back.

**Process-size-1 works.** All 47 embedded that way, worst case 54.5 s and
5.8 GB RSS for one record against ~1 s for a capped one. Filling the
content-addressed embed cache out-of-band is invisible to the measurement —
the key is `sha256(text)` and the text is byte-identical to what the design
emits.

That cost would have mattered if the arm had won. It did not.

## The result

Every arm re-measured on one 307-record snapshot (OBS-018's rule — the cached
arms were 304, and the corpus had moved).

| design | vector Hit@1 | vector MRR | hybrid Hit@1 | hybrid MRR |
|---|---|---|---|---|
| **baseline** | 55.0% | **0.674** | **82.5%** | **0.874** |
| adaptive | 52.5% | 0.650 | 67.5% | 0.785 |
| multi-level | 45.0% | 0.612 | 62.5% | 0.733 |
| desc | **65.0%** | **0.733** | 75.0% | 0.827 |
| desc-trunc-only | 47.5% | 0.618 | 77.5% | 0.846 |
| **raise-cap** | 52.5% | **0.625** | 77.5% | **0.846** |

**Doing nothing still wins, now against five designs.** Embedding the whole
body is *worse than truncating it* — on the leg the change targets, by 0.049
MRR.

And the ranker cannot rescue it. OBS-018's sweep covered the layouts that
existed then; the new layout was swept on the same terms — **1,225 configs**
of leg weight × RRF-K × length normalization. Best of sweep: **0.874, the
shipped ranker**. raise-cap's ceiling across every setting: **0.846**. Length
normalization is correctly a no-op for it (one chunk, `ln(1) = 0`).

## Where it fails is the finding: on its own targets

Five queries have gold that is a truncated record — the exact queries the fix
exists to serve. Vector-leg moves against baseline:

| query | gold | baseline → raise-cap |
|---|---|---|
| q01 | DD-070, PROPOSAL-023 | 1 → **3** |
| q12 | DD-035 | 2 → **6** |
| q15 | DD-070 | 2 → **not found** |
| q20 | FRICTION-010, DD-035 | 2 → **not found** |

**0 better, 4 worse.** The one bystander query that moved got *better*. The
fix harms only the records it fixes, and never once helps one.

`q15` is the epigram. OBS-016's showpiece was that DD-070 ranks 2nd for
*"which decisions did DD-070 supersede"* **without §10 ever being embedded**.
Embed §10 — the section that literally answers the query — and DD-070 falls
out of the top 10 entirely.

## The mechanism, proven absolutely rather than inferred

Rank is relative, so a rank drop cannot distinguish *this record got worse*
from *everyone else got better*. **Cosine is absolute.** For every
(query, over-cap gold) pair, the gold record's cosine to its own query:

| query | gold | baseline | raise-cap | delta |
|---|---|---|---|---|
| q01 | DD-070 | 0.5615 | 0.4196 | **−0.1418** |
| q15 | DD-070 | 0.6029 | 0.4725 | **−0.1305** |
| q16 | DD-070 | 0.4544 | 0.3811 | −0.0733 |
| q02 | DD-070 | 0.5255 | 0.4683 | −0.0572 |
| q20 | FRICTION-010 | 0.5801 | 0.5323 | −0.0477 |
| q17 | DD-070 | 0.4369 | 0.3909 | −0.0460 |
| … | (6 more) | | | all negative |

**Cosine fell on 12 of 12 pairs. Unanimous.** This is not a ranking artifact
and not a relativity story — the whole-body vector is *absolutely* worse at
matching questions about its own record.

That is **dilution**, and it is the mechanism the literature review predicted
as this arm's most likely way to lose: nomic trains at 2,048 tokens and reaches
8,192 by NTK interpolation, `pooling: "mean"` averages every token, and
averaging 6,694 tokens of detailed argument blurs the centroid that
record-finding queries match.

### The inversion

> **The truncated prefix is a better vector than the whole document.**
> Truncation was accidentally doing summarization — these records open with
> framing and aboutness, so the first 8,000 chars are close to the *best*
> available summary, not the worst available fragment.

FRICTION-031 read the cap as damage. It is closer to a feature that nobody
designed. Its 16% is not lost content — it is **what keeps the centroid
sharp**, and paying it back costs 0.049 MRR on the leg it was supposed to
help. The note's accepted-hole resolution was not a compromise forced by
missing options. It was right.

This also inverts embed-health.ts's framing, which calls the cap's remedy
"multi-chunk embedding — the real fix". There is no fix, because there is no
defect. What the warning discloses is a *cost*, and the cost is worth paying.

## Correction to OBS-017

OBS-017 explained `desc-trunc-only`'s regression as relativity: improved
records "float up as distractors on queries where they are not gold and
displace correct answers", generalized to *"any non-uniform improvement to an
embed recipe is a ranking distortion"*, and banked as the third instantiation
of "ranking is relative".

**That mechanism was asserted from rank data it already had, and never
checked.** Checked now, with the same instruments:

- Its targets **sank**: 0 better, **5 worse** on rank moves. Distractor float
  predicts the opposite — that they rise.
- Its cosines are **mixed**: 7 of 12 down, 5 up. Not the unanimous fall
  raise-cap shows, but not "improved strictly for the better" either.
- Its own §"What ran" already said why: prepending the abstract **displaces
  ~577 chars of body prefix**. That is a *trade*, not an improvement — and
  four paragraphs later the analysis called the same change "strictly for the
  better" and reasoned from there.

**The finding stands** — desc-trunc-only is worse than baseline, and a
length-branching recipe is still a bad shape. **The stated mechanism does
not**, and the rule resting on it is weaker than written: two bystander
queries did degrade (q28, q40), which is consistent with float, but the
dominant effect on this arm is the same displacement raise-cap shows in pure
form. OBS-017's honest-bounds section already conceded the regression was 3
queries; the mechanism claim needed the same caution and did not get it.

The generalizable error is the one this corpus keeps re-teaching: **a rank
drop has two causes and rank data cannot tell you which.** Both prior
"relativity" claims were read off ranks. Chunking's lottery-ticket mechanism
was independently argued and survives; this one did not need to be invented,
because a cosine was one query away.

## Honest bounds

- **The hybrid delta is at the instrument's edge**, as always here: 0.874 →
  0.846 is ~2 queries net on n=40. The vector delta (−0.049 MRR) and the
  cosine result (12/12, two of them −0.13) are what carry the conclusion, and
  they are not marginal.
- **The cosine test is the strongest evidence in this whole arc** and it was
  cheap. It should have been run in OBS-017, and it is the first thing to
  reach for next time a rank moves.
- **One corpus, one model, one query style.** Dilution is a property of input
  length against a *trained* context; a model trained at 8k, or a corpus of
  shorter records, or queries that ask for details rather than aboutness would
  each move the boundary. OBS-013's 9.5MB corpus is the live unknown, and its
  records are longer.
- **The 40 are aboutness queries.** They ask which record answers a question.
  A corpus queried for buried specifics would value the tail more — and would
  still have FTS covering it, which is the point OBS-016 and OBS-017 both land
  on.

## What is now closed

The cap question is **closed in all three directions**: don't chunk
(OBS-016), don't summarize into the input (OBS-017), **don't raise it**
(here). The three exhaust FRICTION-031's design space, and all three fail for
mechanisms that are now measured rather than argued.

What remains open is unchanged and stays that way: OBS-013's 0.694 on the
adopted corpus. Nothing here is evidence about it.
