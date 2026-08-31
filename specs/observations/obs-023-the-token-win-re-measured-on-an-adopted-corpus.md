---
id: OBS-023
title: "The token win re-measured on an adopted corpus, same day and same code: 43× here, 326× there — and the aggregate that looked like a regression was a content migration"
collection: observations
status: current
date: 2026-08-25
description: "OBS-013's external replication re-run 6 weeks later with the harness itself ported, so both corpora run identical code on the same day: docdog's own 344 records score hybrid 0.833 MRR / 75% Hit@1 / 144 median tokens, an adopted 1,134-record corpus in another repo scores 0.623 / 45% / 224. The paired per-query token ratio against the honest grep transcript is 43× here and 326× there — the claim that matters for adopters is the one that grows with corpus size, and it is now measured on both sides of the same instrument rather than quoted across two dates. Two corrections fall out. The ratio-of-medians those older numbers use is unstable (it reads 160× today against OBS-013's 500× purely because the corpus lost 2 MB of long files that used to pad transcripts); the paired ratio is the sound statistic. And the corpus's headline 0.721 → 0.623 is not degradation: 9 of its 22 golds were remapped after a content migration, and on the 13 queries that migration never touched the number went 0.753 → 0.772 while the record count nearly doubled."
relationships:
  - references: OBS-013
    context: "the first external replication, whose numbers this supersedes for the adopted corpus — and whose central caveat it inverts: OBS-013 reported the token win as a ratio of medians (248 vs 123,551), a statistic that moved to 160× here without docdog changing at all, because the corpus deleted the long files that padded grep transcripts"
  - references: OBS-010
    context: "the first measurement, whose 0.871 the README still leads with — this repo's own corpus now reads 0.833 at 344 records, so the self-corpus number has drifted down 0.038 as the corpus grew 250 → 344 while the adopted corpus's token advantage grew"
  - references: OBS-018
    context: "its 'complementarity is the product' rule confirmed a third time, on a corpus with different authoring conventions again (hybrid 0.623 over vector 0.553 and FTS 0.430) — but by +0.070 rather than the +0.163 this corpus shows today, so fusion's margin is thinner where records are machine-adopted rather than agent-authored"
  - references: DD-070
    context: "§8's measured retrieval win, which had one external data point taken on someone else's instrument — this is the first time both corpora have been measured by the same code on the same day, which is what makes the two numbers a comparison rather than two quotations"
  - references: WF-002
    context: "dual-track dogfooding: the external track's whole purpose is answering what the numbers look like on a corpus nobody wrote for docdog, and this is the run that made that answerable on demand instead of by negotiation"
  - references: OBS-024
    context: "the second finding from the same afternoon, on the detail query set — where the same instrument found fusion losing to its own keyword leg; that one qualifies a closed question, this one refreshes a claim"
  - references: DP-001
    context: "tier 1 throughout — every number here is mechanical, and the one judgment in the loop (which file answers which question) was frozen by the adopting project before docdog was installed, which is exactly where relevance judgment belongs"
---

# OBS-023: the token win, re-measured on both corpora at once

## What ran

`tests/eval/run-retrieval-eval.ts`'s five systems — hybrid, the two
isolated legs, and two grep baselines — against two corpora on
2026-08-25, from one commit, with the systems, the grep
reimplementation and the metrics extracted into a shared `engine.ts`
so the two runs cannot differ in anything but the corpus.

That extraction is the point. OBS-013's numbers were taken by the
adopting project's own scorer, which ran hybrid alone through the CLI;
the legs and both grep baselines were carried over from a report a day
apart, and the comparison to this repo's numbers crossed a month, two
codebases and two authors. `run-external-eval.ts` closes that: same
five routes, same stopword list, same tokens-to-locate rendering,
pointed at any docdog project via `--root`.

The refactor was verified byte-identical — the self-corpus runner's
stdout and `report.md` are unchanged before and after.

## Numbers

| system | this repo (344 records, 40 queries) | adopted corpus (1,134 records / 602 files / 7.6 MB, 22 queries) |
|---|---|---|
| hybrid | **0.833** MRR · 75% Hit@1 · 144 tok | **0.623** MRR · 45% Hit@1 · 224 tok |
| vector (leg) | 0.670 | 0.553 |
| fts (leg) | 0.525 | 0.430 |
| rg-rank (generous grep) | 0.347 | 0.238 |
| rg-walk (honest grep) | 0.046 · 7,541 tok | **0.000** · 35,740 tok |
| paired per-query token ratio | **43×** | **326×** |

On the adopted corpus the honest grep transcript reaches a gold within
its first ten files for **zero of 22 queries**.

## The token claim survives, and the statistic behind it needed fixing

The pitch OBS-013 identified is the one that grows: ranking quality
falls with corpus size and authoring quality, while the *value* rises,
because the alternative degrades faster. That still holds, and it is
now measured on one instrument: **43× against 326×**, same day, same
code.

But the number OBS-013 quoted — median hybrid tokens over median
rg-walk tokens — is not stable enough to quote. It reads **160×**
today against OBS-013's **500×**, and docdog is not why. The adopted
corpus deleted ~150 long per-task specs in a consolidation; those
files both padded grep transcripts and sorted before the surviving
golds in path order, so the denominator collapsed. A ratio of two
medians drawn from differently-shaped distributions is measuring the
corpus's file layout as much as anything else.

**The paired per-query ratio is the statistic to carry.** Every query
produces both numbers from the same run, so the pairing is real:
median 326×, mean 383×, range 6× to 1,148×. It cannot be moved by
where a gold sorts.

## The apparent regression is a content migration

The adopted corpus last scored 0.721 on this query set in July. Today
it scores 0.623. That difference is not retrieval getting worse.

Nine of its 22 golds were remapped when the project deleted its
per-task architecture specs in favour of consolidated current-state
documents. The query set's own header says runs across that date are
not comparable for those queries. Splitting on it:

| subset | n | July | today | Δ |
|---|---|---|---|---|
| all | 22 | 0.721 | 0.623 | −0.098 |
| **untouched by the migration** | 13 | 0.753 | **0.772** | **+0.019** |
| remapped | 9 | 0.676 | 0.407 | −0.269 |

So like-for-like the corpus is **flat to slightly up across six weeks
in which its record count nearly doubled**, and the entire aggregate
move is nine queries whose answers left the corpus. Two of the three
hybrid misses confirm it directly: one remapped gold contains no
mention of the thing its query asks about, and another mentions it in
a single passing line. Those questions are no longer answerable from
that corpus at all.

**The lesson for anyone quoting a cross-date eval number: a frozen
query set does not freeze the corpus.** Freezing the questions is what
makes runs comparable; it does nothing about a migration that moves
the answers, and the aggregate will report that migration as a
retrieval result.

## Resolvable is not answerable

`run-external-eval.ts` carries OBS-013's Q22 lesson as a guard: a gold
no scan path reaches is reported and excluded, never scored as a
retrieval miss, because a query whose answer was never indexed cannot
fail informatively. That guard works and fired four times on the
companion query set.

It cannot catch what happened here. A remapped gold *is* indexed and
*does* resolve — it simply no longer answers. Path resolvability is a
strictly weaker guarantee than answerability, and only reading the
file closes the gap. Worth stating because the failure looks identical
from inside the harness: a miss on a query whose gold the corpus
holds.

## Secondary

- **Fusion beats both its legs a third time**, on a third set of
  authoring conventions — but by **+0.070** here against **+0.163** on
  this repo's corpus today. Complementarity is real everywhere it has
  been measured and thinner where records are machine-adopted.
- **This repo's own corpus fell 0.871 → 0.833** as it grew 250 → 344
  records. Same direction as everything else. The README currently
  leads with 0.871.
- **`rg-rank` has a degenerate mode at scale.** On the adopted corpus
  the same three hub files — a 193 KB log, the architecture decisions
  file, the principles file — are its top-3 for eight different
  queries. Term-frequency ranking collapses when a corpus contains
  files large enough to match any term set, which is a size effect
  this repo's corpus is too small to show.

## What this does not say

Nothing about ranking design. Every arm here is the shipped ranker;
the only variable is the corpus. The finding that touches the ranker
came from the same afternoon's second run and lives in
[[OBS-024]].
