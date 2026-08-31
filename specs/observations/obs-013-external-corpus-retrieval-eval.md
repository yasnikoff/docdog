---
id: OBS-013
title: "External-corpus eval corroborates the retrieval win — quality drops as predicted, the token win grows 45× → 500×, and the chunking evidence turns out to be a misdiagnosis"
collection: observations
status: current
date: 2026-07-13
commit_hash: 4553f18227a3612d692510f9fd9160967f0a156b
description: "OBS-010's measurement, re-run by someone else on someone else's corpus: 22 frozen queries over the orchestrator's 347 files / 629 records (~9.5 MB), docdog hybrid vs FTS/vector legs vs two grep baselines. Hybrid MRR falls 0.871 → 0.694 — OBS-010's 'the gap would narrow on a less self-describing corpus' caveat was right — while median tokens-to-locate goes 143-vs-6.5k (45×) to 248-vs-123,551 (500×), because the grep baseline degrades with corpus size far faster than docdog does. Fusion beats both its legs a second time. And the eval's headline chunking evidence does not survive: the glossary record it blames on the 8,000-char embed window was never in a scan path at all."
relationships:
  - references: OBS-010
    context: "the first measurement, on docdog's own 249-record corpus; this is its independent external replication — same harness, different corpus, different author, and it confirms OBS-010's own stated caveat rather than its headline number"
  - references: DD-070
    context: "§8's 'measured retrieval win' now has a second, external data point — and one that grows rather than shrinks with corpus size, which is the claim that actually matters for adopters"
  - references: PROPOSAL-023
    context: "§6's accepted gaps re-tested on a 2.5×-larger corpus: the unthresholded vector leg still produced no false-positive flood, and section-granularity chunking is still not bought by the data"
  - references: DD-059
    context: "the description-field lift is visible in the negative: the orchestrator corpus is machine-adopted rather than agent-authored, and hybrid MRR drops 0.18 against docdog's own — the token win survives anyway"
  - references: FRICTION-024
    context: "the single hybrid miss (Q05, a reverse-reference question) is an edge question, not a search question — and it is why the suggest-edges accept backlog matters"
  - references: FRICTION-023
    context: "Q17's inversion (a navigation index.md outranking the real record on keyword density) is the same index-file problem the split parser silently drops"
  - references: WF-002
    context: dual-track dogfooding at scale, on the external track — the whole point of the orchestrator adoption
  - references: DP-001
    context: "the finding that kills the chunking case is the principle working: measure before building, and don't let a plausible story stand in for a verified one"
---

# OBS-013: The retrieval win, measured by someone else on someone else's corpus

## What ran

The orchestrator adoption (PLAN-DOCDOG-001) ran docdog's own eval
harness — `tests/eval/run-retrieval-eval.ts`, adapted to score golds
by file path — over its corpus: **347 files / 629 records, ~9.5 MB**,
22 frozen queries, top-10, five systems. Reports live at
`specs/investigations/docdog-adoption/eval-2026-07-12-day0-post-adoption.md`
and `…/eval-2026-07-13-grep-vs-docdog.md`.

Note for future readers: those are **one docdog measurement reported
twice**, not two runs. The docdog numbers are identical in both
(Hit@1 55%, MRR 0.694); the second report adds the four comparison
systems. Nothing was tuned between them.

## Numbers (347 files / 629 records @ their `052e51f`)

| system  | Hit@1 | Hit@5 | Hit@10 | MRR@10 | median tokens-to-locate |
|---|---|---|---|---|---|
| hybrid  | 55% | 86% | 95% | **0.694** | **248** |
| vector (leg) | 50% | 86% | 91% | 0.622 | — |
| fts (leg) | 27% | 73% | 91% | 0.470 | — |
| rg-rank (generous grep) | 14% | 55% | 73% | 0.318 | — |
| rg-walk (honest grep) | 0% | 5% | 5% | 0.011 | **123,551** |

## What it corroborates, and what it corrects

**OBS-010's caveat was right, and its headline was optimistic.**
OBS-010 measured hybrid at 0.871 MRR / 80% Hit@1 on docdog's own
249-record corpus, and flagged the reason to distrust it: *"the corpus
is small and self-describing… on a corpus with bare frontmatter the
gap would narrow."* On a 2.5×-larger corpus that was machine-adopted
rather than agent-authored, hybrid lands at **0.694 / 55%**. The
caveat predicted the direction and roughly the size of the drop. That
is the honest read of docdog's ranking quality: **~0.7 MRR is the
number to quote for a real adopted corpus**, not 0.87.

**But the token win goes the other way — it grows.** Median tokens an
agent reads before reaching the first gold: 143 vs ~6,500 (45×) on
docdog's corpus; **248 vs 123,551 (~500×)** here. The mechanism is
structural and worth stating plainly: a ranked top-10 costs the same
regardless of corpus size, while a grep transcript grows linearly with
it. So docdog's *ranking* degrades with corpus size and authoring
quality, while its *value* increases — because the alternative
degrades faster. On a 9.5 MB corpus the honest grep baseline finds a
gold in its first ten files for exactly **one query in 22**.

**Fusion earns its keep, again.** Hybrid (0.694) beats both its own
legs (vector 0.622, FTS 0.470) on a corpus with entirely different
authoring conventions. Two for two — RRF fusion is not riding one leg.

**The vector leg still needs no threshold.** PROPOSAL-023 §6's
accepted gap drew no failures here either. The deferral keeps its
data.

## The chunking evidence does not survive contact

This is the finding worth the harvest. OBS-010 set an explicit bar:
section-granularity chunking *"becomes proposal material only if
repeated real usage — not this eval alone — keeps hitting the same
wall."* The orchestrator's day-0 note reads like exactly that second
hit:

> Q22 "What is a cabinet in the resource model?" — the answer is the
> first row of `glossary.md` (46 KB), but the record embeds only its
> first 8,000 characters and BM25 dilutes across ~150 term rows. This
> is live evidence for docdog's deferred sub-record chunking decision.

**It isn't.** Their own later report contradicts it:
`specs/upstream-context/glossary.md` **is not in any scan path** —
there is no 46 KB record, so there is nothing for the 8,000-char embed
window to truncate. Q22 scored a gold file that docdog was never given.
The demonstrated defect is a corpus config gap (and an eval-hygiene
gap: a query whose gold is unindexable cannot fail informatively).

So: **the OBS-010 bar is not met, chunking stays deferred**, and the
`MAX_EMBED_CHARS = 8000` truncation remains a plausible-but-unmeasured
problem. The correct next step is theirs, not ours: add the glossary
to a scan path (split-parsed per term is the obvious shape) and re-run
Q22. If it still fails, that is a real second hit and chunking becomes
proposal-eligible on the strength of it.

Worth noticing how close this came to shipping a feature on a story.
The dilution narrative was plausible, specific, quantified, and
written by a competent agent — and wrong. DP-001's discipline is
usually described as keeping judgment out of *code*; this is the same
discipline applied to evidence.

## The one real miss is an edge question

Q05 — "which architecture specs reference FR-PROV-01?" — is hybrid's
only top-10 miss, and it is not search's job. `docdog_traverse
FR-PROV-01 direction=inbound` answers it directly (31 referencing
records, once their edge backlog was drained). Same lesson as OBS-010's
q15: **a graph question wearing a search costume**. It is also the
concrete payoff argument for FRICTION-024's missing bulk-accept surface
— the answer exists only if the edges do.

Q17 is the other one worth keeping: `constraints/index.md`, a
navigation stub, outranks `non-negotiables.md` for "what are the
project's non-negotiables" on pure keyword density. Navigation files
are retrieval poison — they are all keywords and no content. Related to
FRICTION-023, where the split parser silently drops exactly those files.

## Reusable outcome

The eval harness travelled. It was written for docdog's own corpus
(`tests/eval/`), and an external adopter adapted it to a foreign corpus
with file-path golds and got a comparable, interpretable result on the
first try. That is a stronger signal about the harness than about the
corpus, and it raises a question docdog has not asked: the harness
currently lives in `tests/`, unshipped. An adopter-facing "measure your
own corpus" surface would let every adoption produce this table — which
is the only honest way to answer "will this help *my* repo?"
