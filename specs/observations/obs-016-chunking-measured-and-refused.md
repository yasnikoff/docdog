---
id: OBS-016
title: "Chunking measured against the frozen eval: doing nothing wins, monotonically — and FTS was covering the hole all along"
collection: observations
status: current
date: 2026-07-16
description: "Three chunking designs A/B'd on the 40 frozen queries with the real search(): baseline 0.874 hybrid MRR, heading-adaptive 0.785, multi-level 0.729. More chunks, worse retrieval, on all four metrics, every time. Max-cosine makes ranking relative, so more chunks per record is more lottery tickets, and the centroid that chunking destroys is what record-finding queries actually match. FRICTION-031's 16% hole is real and nearly free — the keyword leg has been covering it. Chunking is refused; PROPOSAL-023 §8's deferral was right."
relationships:
  - references: FRICTION-031
    context: "the record this corrects — it closed asserting 'reporting is not the fix, the reachable fix is chunking', and the measurement falsified that clause; the reporting half stands, the owed-fix half does not"
  - references: PROPOSAL-023
    context: "§2 designed the chunks table and §8 deferred section-granularity ranking as eval-driven follow-up — the eval ran and vindicated the deferral; §8's instinct that this needed measurement before shipping was right, and the only door left open is the ranking tuning it named"
  - references: OBS-010
    context: "the eval this reuses and the baseline it reproduces — 0.874 hybrid MRR and 82.5% Hit@1 here against 0.871 and 80% recorded there, which is what makes the harness credible; its 40 frozen queries are the instrument"
  - references: OBS-013
    context: "the 9.5MB adopted corpus where this result may not transfer — different genre, longer records, and its 0.694 MRR is still unexplained; the refusal here is scoped to this corpus and this ranker, not to chunking as an idea"
  - references: DP-001
    context: "the reason this was decidable at all — ranking mechanics are tier 1 (statistical, not judgmental), so a chunking scheme is something code may choose and an eval may therefore settle"
  - references: OQ-47
    context: "the thread this fell out of — a question about a retrieval subagent's citation unit became 'does docdog chunk?', which became reading embedInput, which became this"
---

# OBS-016: chunking, measured and refused

## What ran

Three designs, A/B'd over OBS-010's 40 frozen queries, using the **real
`search()`** against a temp copy of the live cache whose `chunks` table
was rebuilt under each. Vector-alone was mirrored from `vectorLeg` and
reported separately, because that is where truncation lives.

| design | what it does | chunks | chars embedded | tickets/record |
|---|---|---|---|---|
| **baseline** | today: one chunk per record, cut at 8,000 | 303 | 1.00M (0.19M lost) | 1 |
| **adaptive** | split at every heading the doc has; AST blocks where a span is still over-cap or there are no headings | 1,834 | 1.19M — nothing lost | median 5, **1–24** |
| **multi-level** | capped doc + every nested heading section + every AST block | 5,600 | 3.55M (3.5× duplication) | median 14, **2–101** |

Both designs eliminate truncation completely. Neither helps.

## The result

| design | vector Hit@1 | vector MRR | hybrid Hit@1 | hybrid MRR |
|---|---|---|---|---|
| **baseline** | **55.0%** | **0.676** | **82.5%** | **0.874** |
| adaptive | 52.5% | 0.650 | 67.5% | 0.785 |
| multi-level | 45.0% | 0.616 | 62.5% | 0.729 |

**Doing nothing wins on all four metrics, monotonically.** More chunks,
worse retrieval, every time. Baseline → adaptive on hybrid rank: 1 query
better, 9 worse, 30 unchanged.

The harness reproduces OBS-010 (0.874 vs 0.871 recorded; 82.5% vs 80%
Hit@1), so it is measuring docdog rather than a reimplementation. Two
independent runs agreed on every design.

## Why: ranking is relative, and the centroid is the product

**Max-cosine makes chunk count a ranking signal.** A record scores as its
best chunk, so adding chunks can only raise its score — but records with
more chunks rise *more*, and rank is relative. A 101-ticket record floats
past a 2-ticket record that is more relevant. The ticket spread predicts
the ordering exactly: `1` → `1–24` → `2–101` maps onto
`0.874` → `0.785` → `0.729`.

This kills the tempting argument that multi-level is safe *by
construction* because it contains baseline's vectors. It contains them,
and still loses, because everything else moved too.

**The centroid encodes aboutness, and that is what these queries match.**
`q15` is the proof, and it is the query chunking exists for: *"which
decisions did DD-070 supersede"* — DD-070's `## 10. Supersession pass` is
in the unembedded tail. Baseline finds it at **vector rank 2 without ever
having embedded §10**, because the whole-record vector says *this record
is about v3 architecture and its supersessions*. Chunking replaces that
composite with fragments, and §10 alone is a bare list of ids — thin,
matching nothing. Vector rank **2 → not-found**.

So **chunking optimizes passage retrieval, and docdog's search returns
records.** That misalignment is the finding.

> **Both mechanisms tested 2026-07-17 — OBS-020, and they scored differently.**
> Late chunking gives every fragment the whole document's context (one forward
> pass, pooled per span), which is the direct experiment on the two claims
> above.
>
> **The ticket mechanism is confirmed and now quantified.** The lottery premium
> — how far a record's *best* span sits above its *average* span — is **0.0544**
> under this note's `adaptive`. Late chunking's entire benefit (0.785 → 0.838)
> comes from cutting it **39%**, and it cuts it by smearing spans into 92%
> copies of the document vector. This section had it exactly right.
>
> **The thinness claim did not survive.** *"§10 alone is a bare list of ids —
> thin, matching nothing"* reads as *fragments fail for want of context*. Give
> §10 the context and it matches its own query **less**, not more: the gold
> span's cosine fell on **12 of 12** pairs, and §10 is still not the winning
> span for `q15` under either design. Context was not what the fragment was
> missing.
>
> Put together they close the door this note left open two paragraphs down.
> The tax can only be reduced by making chunks resemble each other, and chunks
> that resemble each other are not fragments any more — **the recall and the
> tax are the same property, and no design buys one without selling the other.**
> The limit of avoiding the tax is one vector per record, which is what ships.

## The punchline: FTS was covering the hole

`q33` — *"where must the meaning of a collection or relation type be
recorded"*, gold DP-002, a truncated record:

| | vector | hybrid |
|---|---|---|
| baseline | **not-found** | **1** |
| multi-level | 2 | 1 |

The keyword leg put DP-002 at rank 1 with **zero contribution from the
vector leg**. That is FRICTION-031's 16% hole, live — and hybrid does not
care, because FTS indexes the full body and has been quietly covering for
the vector leg all along.

The hole is real. It is also nearly free. Those are compatible, and only
measurement separates them.

## The 5 queries whose every gold is truncated

| query | gold | baseline (v/h) | adaptive | multi-level |
|---|---|---|---|---|
| q12 | DD-035 | 2 / 1 | 2 / 1 | 2 / 1 |
| q15 | DD-070 | 2 / 8 | — / — | 6 / — |
| q20 | FRICTION-010, DD-035 | 2 / 2 | **1 / 1** | 2 / 1 |
| q29 | WF-006 | 1 / 1 | 1 / 1 | 1 / 1 |
| q33 | DP-002 | — / 1 | 6 / 2 | **2 / 1** |

One better, one broken, three unmoved. **Chunking does not help even the
queries it was designed for.**

## What this settles, and what it does not

**Settled: do not chunk this corpus under this ranker.** PROPOSAL-023 §8
deferred section-granularity as eval-driven follow-up. The eval ran; the
deferral was right, for a better reason than it knew — this was never
merely unevidenced, it is a regression.

**Not settled — the door §8 named.** Fragment recall is real: q33's vector
leg went not-found → 2, q20 improved. Fragments find what centroids miss.
The defect is not the chunks, it is that `max-cosine` cannot use them
without paying the length tax. A length-normalized or per-level fusion
might capture the recall without the bias. That is exactly §8's "ranking
tuning", it is now the only live path, and **nothing here is evidence that
it works.**

> **Closed 2026-07-17 — OBS-018.** It was swept: `max_cos − α·ln(N)` across
> every layout here, plus a full leg-weight × RRF-K grid, 980 configs, with
> the test set deliberately readable so a win would surface if one existed.
> The lever is real and insufficient — adaptive gains **+0.014** at α=0.01
> against the **0.075** it needs, then reverses. **The argmax of the sweep is
> the shipped ranker.** This section's instinct was right (the defect is not
> the chunks) and its hope was wrong (the fusion cannot spend them either).
> Per-level weighting remains untested, and would have to find 0.107 that no
> other lever came near.

## Honest bounds

- **n=40.** One query is 2.5% of Hit@1. The baseline→adaptive gap is ~6
  queries and is real; finer distinctions are not.
- **The instrument is better at detecting harm than gain.** Only 5 of 40
  golds are truncated records, so the set could barely see chunking's
  upside. This was stated before the run, not after it.
- **Record-finding, not passage-finding.** Every query asks "which record
  answers this". A product that returned passages would likely invert this
  result.
- **One corpus, one genre.** Tightly topical argumentative essays, where a
  record's centroid genuinely is a good summary of it. OBS-013's 9.5MB
  adopted corpus is neither, and its unexplained 0.694 is not evidence
  either way.

## Two method notes worth keeping

- **The cost model is not O(seq²) at this scale.** Measured: 400ch →
  1072ms/chunk, 2000ch → 2688, 8000ch → 7579. Twenty times the text costs
  seven times the time — roughly **linear in characters plus ~700ms fixed
  per chunk**. So chunking is *more* expensive, not less, and the
  intuition that splitting saves quadratic attention work is wrong here.
- **Use the AST at every level, not just the top.** The first harness used
  the remark AST for headings but split paragraphs on blank lines — and
  fenced code blocks contain blank lines, which tore 9 fences in
  PROPOSAL-018 alone. Both designs now take the AST's top-level block
  nodes, so a fence, table or list is one whole unit. A regex boundary is
  wrong one level down for the same reason it is wrong at the top.
