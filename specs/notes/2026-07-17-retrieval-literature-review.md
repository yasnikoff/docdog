---
id: NOTE-2026-07-17-retrieval-literature-review
title: "2026-07-17 — Retrieval literature vs. our three refusals: we measured a different task, and the embed cap sits on nomic's trained context boundary"
collection: notes
date: 2026-07-17
description: "External research checked against OBS-016/017/018. Central reconciliation: the chunking literature retrieves PASSAGES (Anthropic's contextual retrieval scores recall@20 chunks over an already-chunked baseline; Chroma's eval has no whole-document arm at all), while docdog retrieves RECORDS — so their results and ours are not in conflict, and OBS-016 named this bound before the run. Jina's late-chunking paper is the one study that includes the arm and reports that not chunking sometimes wins outright. New finding: nomic-embed trains at 2048 tokens and reaches 8192 only by NTK interpolation; measured, MAX_EMBED_CHARS=8000 is 2197 median tokens = 107% of the trained length, and all 46 over-cap records sit in interpolated territory but under 8192. Combined with documented early/short position bias in dense retrievers, that is a model-level mechanism for why FRICTION-031's hole is nearly free. RRF k=60 and dense/sparse complementarity independently reproduce published results. Doc2Query++ reports 'noise from concatenation harms dense retrieval' — OBS-017's desc failure, published. Names the one untested design: raise the cap."
relationships:
  - references: OBS-016
    context: "the refusal this review most directly contextualizes — its stated bound 'record-finding, not passage-finding; a product that returned passages would likely invert this result' turns out to be the exact axis the whole chunking literature sits on, so the bound was not a hedge but the finding"
  - references: OBS-017
    context: "the desc refusal, which Doc2Query++ names independently as 'noise from concatenation harming dense retrieval' — and whose proposed fix, dual-index fusion, is the per-level weighting OBS-018 left untested"
  - references: OBS-018
    context: "the fusion sweep whose two headline numbers reproduce published results without having consulted them — RRF k=60 as Cormack's TREC optimum, and the dense/sparse complementarity gain BEIR measures across 18 datasets"
  - references: FRICTION-031
    context: "the accepted hole this review supplies a model-level mechanism for — the cap sits at 107% of nomic's trained sequence length, so the unembedded tail is exactly the content that would have been encoded at NTK-interpolated positions, and dense retrievers underweight late positions anyway; it also names the design the note never considered, which is raising the cap"
  - references: PROPOSAL-023
    context: "§2's chunking design and §3's RRF-over-two-legs specification, both of which the literature independently validates as conventional — and §8's deferred ranking tuning, which the k∈[40,80] result says was never likely to pay"
  - references: OBS-013
    context: "the unexplained 0.694 on the 9.5MB adopted corpus — the late-chunking finding that longer documents benefit more, and that no-chunking wins on short ones, makes corpus length a live hypothesis for that gap rather than a mystery"
  - references: OBS-010
    context: "the frozen 40 that every refusal was measured against — this review's value is bounding what that instrument can and cannot speak to, since it asks record-finding questions exclusively"
---

# Retrieval literature vs. our three refusals

Three designs were refused in two days — chunking (OBS-016), embedding the
description (OBS-017), tuning the fusion (OBS-018). This checks them against
published work. The question was whether we had reinvented a wheel or measured
something real.

**Both, in specific places.** Two of our results reproduce the literature
without having consulted it. The one that appears to contradict it does not,
because the literature is measuring a different task. And the review surfaced
a fact about our embedding model that none of the three investigations knew.

## 1. The reconciliation: they retrieve passages, we retrieve records

Every chunking result that looks like it contradicts OBS-016 optimizes a
different retrieval unit.

| study | unit | metric | whole-document arm? |
|---|---|---|---|
| Anthropic, *Contextual Retrieval* | chunks | 1 − recall@20 **chunks** | **never tested** |
| Chroma, *Evaluating Chunking* | chunks | token-level recall / precision / IoU | **absent by design** |
| Jina, *Late Chunking* | chunks | nDCG@10 (BEIR) | **yes** — see below |

Anthropic's headline numbers — contextual embeddings cut top-20 retrieval
failure 5.7% → 3.7%, and with contextual BM25 → 2.9% — are
chunk-vs-contextualized-chunk. **The baseline is already chunked.** Chroma's
91.9% recall for LLM-based semantic chunking (the best in their table, and
exactly the "semantic chunking" idea this thread started from) is token-level
recall across five chunkers over 328k tokens, with no whole-document arm at
all.

Neither asks our question. They cannot: they are building context for a
generator, so the passage *is* the product. Docdog returns records to an agent
that then reads the record.

OBS-016 stated this bound **before** its run:

> *"Record-finding, not passage-finding. Every query asks 'which record
> answers this'. A product that returned passages would likely invert this
> result."*

That was written as a limitation. The literature says it was the finding. The
entire chunking corpus sits on the far side of that line.

**Jina's late-chunking paper is the one that includes the arm**, and it
reports our result:

> *"In some instances, it also outperformed encoding the entire document into
> a single embedding, while in other datasets, **not chunking at all yielded
> the best results**."*

with two conditions that place us: *"the longer the document, the more
effective late chunking becomes"*, and Quora — very short documents — shows no
gain at all. Our median record is 2,220 chars. We are the short end.

## 2. New finding: the cap sits on nomic's trained context boundary

From the Nomic Embed paper, verbatim:

> *"We train all stages with a max sequence length of **2048** and employ
> Dynamic NTK interpolation at inference to scale to 8192 sequence length."*

**8192 is an extrapolation, not a trained capability.** So the corpus was
tokenized with the real tokenizer rather than a 4-chars-per-token guess:

```
corpus chars/token: median 3.78
8000 chars -> median 2197 tokens        (nomic trained max: 2048)
=> MAX_EMBED_CHARS sits at 107% of the trained sequence length

over-cap records at FULL length:  median 2903 tokens, max 6694
  past 2048 (NTK-interpolated):   46 of 46
  past 8192 (hard context limit):  0 of 46
```

`MAX_EMBED_CHARS = 8000` was chosen as a memory guard. It landed on
nomic-embed's native trained context, within 7%.

This matters for FRICTION-031. The unembedded tail is **exactly** the content
that would have been encoded at NTK-interpolated positions the model never
trained on. Stack that with Fayyaz et al., *Collapse of Dense Retrievers*,
which reports that dense retrievers exhibit **early bias** (preferring
evidence at document beginnings) and **short bias** (preferring shorter
documents) — tested on Dragon+ and Contriever — and the hole has a
*model-level* mechanism, not merely a ranking-level one:

**the tail would have been underweighted twice — once for sitting at
interpolated positions, once for being late.**

OBS-016 explained the hole's cheapness through ranking (FTS covers it, the
centroid is what matches). This explains it one layer down. The two agree.

## 3. What we reproduced without knowing it

**RRF k=60.** Cormack et al. (2009) found 60 empirically on TREC; k ∈ [40, 80]
is reported as performing comparably, which is why vendors default to 60.
OBS-018's sweep: K=20 and K=60 tie at the argmax, K=120 slightly worse, K=10
worse. We re-derived a 2009 constant from scratch on 40 queries — and the
flatness across [20, 120] is why §8's ranking-tuning door was never likely to
pay.

**Dense/sparse complementarity.** BEIR reports hybrid lifting nDCG@10 from
43.42 (BM25) to 52.59, described as the two failure modes being "nearly
complementary". OBS-018 measured FTS 0.608, vector 0.676, fused **0.874** —
a gain of +0.198 over the better leg, proportionally larger than BEIR's. Our
legs are unusually complementary, which is precisely why `desc` collapsing
them cost so much.

## 4. What names our failure

**Doc2Query++** reports that document expansion helps BM25 substantially
(the original Doc2Query line: >15% MAP/MRR@10 on TREC-CAR and MS MARCO) but
that **"noise from concatenation harms dense retrieval."**

That is OBS-017, published. We concatenated the description onto the body,
the dense leg took the noise, and hybrid dropped 0.874 → 0.840. The
literature had the result; we found it the expensive way.

Their fix is **dual-index fusion** — keep the expansion in a *separate* index
rather than concatenating it into one representation. Which is, structurally,
the **per-level weighting OBS-018 listed as untested**. Two independent
directions now point at the same unexplored design. Neither is evidence it
works here, and it reintroduces the multi-vector length tax OBS-016 measured.

## 5. The design we never tested

FRICTION-031 framed the options as split (impossible for a single-argument
record) or chunk (refused). **It never asked why we don't simply raise the
cap.** The measurement above says we can:

- Every over-cap record fits under 8192 tokens. **Max 6,694.**
- One vector per record → **no length tax**, the mechanism that killed
  chunking.
- No truncation → complete aboutness.
- Blocked only by the ONNX allocator (~1.8 GB at 6.6k tokens) — a *resource*
  limit, not a quality one, and batch-size-1 sidesteps it.

Two real risks, both testable and both suggested by this review: positions
past 2048 are NTK-interpolated, and **mean pooling over 3× more text dilutes
the centroid** — the very thing OBS-016 found was the product. It could
easily lose. It is the only remaining design that survives all three refusals
structurally.

> **Run 2026-07-17 — OBS-019. It lost, and this section called the reason.**
> Vector MRR 0.674 → **0.625**, hybrid 0.874 → **0.846**, and **0 for 4** on
> the queries whose gold is a truncated record. The mechanism is the dilution
> risk named directly above, now measured absolutely rather than inferred:
> the gold record's cosine to its own query fell on **12 of 12** pairs, DD-070
> by −0.13 on the very question its unembedded tail answers. **The truncated
> prefix is a better vector than the whole document** — truncation was
> accidentally summarizing.
>
> Two claims here were wrong and are corrected in OBS-019:
>
> - *"No truncation → complete aboutness."* **Backwards.** Truncation was
>   *producing* the aboutness; the whole body dilutes it.
> - *"batch-size-1 sidesteps it."* **False.** At batch 32 the run died on the
>   21st long input requesting 2.15 GB — after embedding *larger* records in
>   the same process. The ceiling is ONNX's BFC arena growing and never
>   releasing, so it takes **process-size-1**: a cold process does
>   PROPOSAL-018 in 36 s at 5.8 GB RSS. §6's own warning applies to §5.
>
> The §2 finding it rests on holds and gained force: the cap sits at 107% of
> nomic's trained length, and crossing that boundary is exactly where the
> vectors got worse.

**Late chunking** is the other candidate. We already run `pooling: "mean"`
(`engine/embedder.ts:72`), which it requires, and our records fit the context
window. But it needs the same whole-document forward pass the cap exists to
prevent, so it is gated behind the identical memory question — answer that,
and both designs unlock together.

> **Gate opened, cost known — 2026-07-17 (OBS-019).** The memory question is
> answered: process-size-1 makes the whole-document forward pass buildable at
> ~55 s and 5.8 GB for the worst record. So late chunking is no longer blocked;
> it is merely **expensive**, and it now faces a headwind neither design had
> when this was written. It pools *per chunk*, so it dodges the dilution that
> killed raise-cap — but it is multi-vector, which walks straight back into
> OBS-016's length tax, the mechanism that killed chunking. It must beat 0.874
> while paying a cost that is now measured. Nothing here says it will.

> **Ran 2026-07-17 — OBS-020. It did not beat 0.874, and the paragraph above
> got both mechanisms backwards.** Result: **0.838**, the best chunking ever
> measured here, losing to doing nothing at 1,881 vectors and an hour of
> forward passes.
>
> - *"It pools per chunk, so it dodges the dilution that killed raise-cap"* —
>   **false, and it is the reverse.** Dilution enters through **attention**, not
>   pooling. Every token attended to the whole document *before* any span was
>   pooled, so pooling per chunk cannot undo it: the gold span's cosine to its
>   own query fell on **12 of 12** pairs, and a document's spans collapsed onto
>   each other (0.663 → 0.843) and onto its whole-document vector (0.774 →
>   **0.921**) on **240 of 240** records. Late chunking does not dodge dilution.
>   Dilution is what it *is*.
> - *"walks straight back into OBS-016's length tax"* — **backwards too, and
>   this is why it wins.** Smeared spans are correlated, so max-cosine has less
>   upside noise to gamble on: the lottery premium fell **39%**. It pays *less*
>   tax than naive chunking. That is the entire 0.785 → 0.838, and none of it is
>   contextualization.
>
> Both errors share a root worth keeping: this note reasoned about *pooling*
> because that is what the design's name points at. The mechanism lives in the
> forward pass.
>
> §1's placement survives and sharpens. It said *"the longer the document, the
> more effective late chunking becomes… we are the short end."* Measured, the
> collapse is **stronger on short documents** (+0.201 over 190 records) than
> long ones (+0.102 over 50) — so being the short end is not why it failed to
> help; being a **record-returning** system is. §2's finding is untouched but
> also not the explanation: short documents never leave the trained 2,048-token
> window and collapse hardest of all.

## 6. Source quality — read this before citing the above

Not all of these are equal, and the ones carrying the most weight here are
the weakest-sourced.

**Primary, fetched, quoted directly:** the Nomic paper's 2048/NTK sentence;
Anthropic's unit/metric/baseline; Chroma's metric table and its missing
whole-document arm; Jina's no-chunking sentence and BEIR deltas. These are
load-bearing and verified.

**Verified locally by us:** every number in §2's code block, and the
`pooling: "mean"` fact. Measured with the real tokenizer against the real
cache.

**Secondary — blog summaries, not the papers:** the RRF k ∈ [40, 80] range,
BEIR's 43.42 → 52.59, Doc2Query's >15%, and Doc2Query++'s concatenation
clause. Cormack 2009 was not fetched. Directionally consistent with our own
measurements, which is why they are here, but **do not quote these numbers as
established without reading the papers.**

**Weakest:** Fayyaz et al.'s abstract came back truncated on fetch, so the
early/short/literal biases are reported as summarized rather than quoted. The
claim is load-bearing for §2's mechanism and deserves a proper read before
anyone builds on it.

**And the standing bound:** every result here is someone else's corpus. Ours
is 306 tightly topical argumentative records with a median of 2,220 chars —
short documents by every benchmark cited. OBS-013's 9.5MB adopted corpus is
the one place these findings might genuinely invert, and Jina's
"longer documents benefit more" makes that a **hypothesis with a mechanism**
rather than an open mystery.

## Sources

- [Anthropic — Introducing Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Chroma — Evaluating Chunking Strategies for Retrieval](https://www.trychroma.com/research/evaluating-chunking)
- [Günther et al. — Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models (arXiv:2409.04701)](https://arxiv.org/abs/2409.04701)
- [Jina AI — Late Chunking in Long-Context Embedding Models](https://jina.ai/news/late-chunking-in-long-context-embedding-models/)
- [Nussbaum et al. — Nomic Embed: Training a Reproducible Long Context Text Embedder (arXiv:2402.01613)](https://arxiv.org/html/2402.01613v2)
- [Fayyaz et al. — Collapse of Dense Retrievers: Short, Early, and Literal Biases Outranking Factual Evidence (arXiv:2503.05037)](https://arxiv.org/abs/2503.05037)
- [Doc2Query++: Topic-Coverage based Document Expansion and its Application to Dense Retrieval via Dual-Index Fusion (arXiv:2510.09557)](https://arxiv.org/abs/2510.09557)
- Cormack, Clarke & Buettcher (2009) — *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods* — **not fetched**; consulted via [secondary summary](https://bigdataboutique.com/blog/reciprocal-rank-fusion-how-it-works-and-when-to-use-it)
- [BEIR reference models & leaderboard (arXiv:2306.07471)](https://arxiv.org/pdf/2306.07471) — hybrid numbers via [secondary summary](https://jatinbansal.com/ai-engineering/hybrid-search/)
