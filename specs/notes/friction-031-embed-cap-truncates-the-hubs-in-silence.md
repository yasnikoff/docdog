---
id: FRICTION-031
title: "The embed cap silently truncates 15% of records — and it takes the conclusions, not the preamble"
collection: notes
status: resolved
date: 2026-07-16
description: "embedInput caps embedding input at 8000 chars with no warning, no count and nothing in status: 45 of 302 records truncated, 16% of the corpus never embedded, concentrated on the hubs. Reporting shipped. The fix this note demanded was then measured and refused — OBS-016 found every chunking design makes retrieval worse, because the whole-record centroid is what record-finding queries match and FTS was covering the hole anyway. The hole is real, disclosed, and accepted."
severity: cosmetic
relationships:
  - discussed_in: OQ-47
    context: "the thread that surfaced it — a question about the retrieval subagent's citation unit turned into 'does docdog chunk?', which turned into reading embedInput and finding an unmeasured cap"
  - references: OBS-016
    context: "the measurement that overturned this note's conclusion — every chunking design tested made retrieval worse, so the fix demanded here is refused and the hole is accepted rather than owed; the reporting half survives unchanged"
  - references: PROPOSAL-023
    context: "§2 designed the chunking this note called the reachable fix, and §8 deferred it as eval-driven follow-up — the eval ran (OBS-016) and vindicated the deferral, so the unused ord/start_line/end_line columns stay unused"
  - references: OBS-010
    context: "the eval whose 0.871 MRR was measured with this hole already open — the number is not invalidated, it is what docdog scores while 16% of the corpus reaches no vector, and OBS-016 reproduced it at 0.874 while failing to beat it"
  - references: OBS-013
    context: "the adopted-corpus 0.694 MRR this makes a live hypothesis for — a 9.5MB corpus of long records would truncate harder than this one, and nobody has measured it; OBS-016's refusal is scoped to this corpus's genre and does not settle that one"
  - references: FRICTION-028
    context: "the same failure class named again — a defect that produces well-formed output and reports nothing, which is the shape this project keeps paying for"
  - references: DP-001
    context: "tier 1 is the whole resolution — a length compared to a constant, reported; deciding where a record should be cut, or cutting it, is tier 3 and stays out of code"
---

# FRICTION-031: the embed cap truncates the hubs, in silence

## What I was doing

Designing the retrieval subagent's return contract (OQ-47). The question
was whether a citation should be a record id or something finer, which
turned on whether docdog chunks. Reading `storage/indexer.ts` to find out:

```ts
function embedInput(content: string): string {
  return content.length > MAX_EMBED_CHARS ? content.slice(0, MAX_EMBED_CHARS) : content;
}
```

A bare `slice`. No warning, no count, nothing in `status`. The cap has
been there since v3 step 3 and nobody had ever asked what it costs.

## What went wrong

Nothing failed. That is the report.

A record past 8,000 chars indexes cleanly, keeps its full body in
`vertices.body_text` and FTS, and is findable by keyword exactly as
before. Only its **vector** is a prefix. So its tail is retrievable only
by someone who already guessed its words — which is the one thing vector
search exists to spare them. The degradation is real, permanent, and
produces no signal anywhere.

Measured on this corpus, for the first time:

| | |
|---|---|
| records | 302 |
| over the 8,000-char cap | **45 (14.9%)** |
| characters never embedded | **190,074 of 1,187,946 (16.0%)** |
| median record | 2,220 chars — comfortably clear |
| largest | PROPOSAL-018, 24,311 chars — **67% unembedded** |

**It is correlated with importance.** Long records are long because they
are substantive, so the truncated set is the corpus's spine: DD-070,
DP-002, PROPOSAL-003, DD-035, CONTRIBUTING.md.

**And it takes the wrong half.** These are argumentative records — the
head is setup, the tail is the conclusion. Checking where the knife lands:

- **DD-070** loses `## 8. Rationale`, `## 9. Principle walk`,
  `## 10. Supersession pass`. Ask this corpus *why* v3 dropped ArangoDB
  and the vector leg cannot see the answer.
- **DP-002** cuts mid-sentence at *"Every new collection or relationship
  type added to docdog must: 1. Have a meta entry written as part of i—"*.
  A principle truncated through the obligations it imposes.
- **OQ-47**, the record that surfaced this, loses 39% including its own
  conclusion.

So the embedding encodes what a record is *about* and not what it *says*.
For a corpus whose value is its reasoning, that is close to the worst
available 8,000 characters to keep.

## Workaround

None. There is nothing an author can do, which is the sharp part.

The reflex is `docdog split`, and it does not apply. **Splitting turns
*file* boundaries into *record* boundaries** — it helps when one file
holds several records. A truncated record here is one long argument with
no record boundary inside it: DD-070 is a single decision with ten
sections, and it cannot become ten decisions. The only boundary inside it
is a heading, and headings are what *chunking* consumes.

This is worth stating plainly because the two get conflated: chunking and
splitting are not the same operation at different times. They act on
different boundaries, and only one of them can reach these 45 records.

## What changed

**Reporting, and only reporting** (`storage/embed-health.ts`, mirroring
`edge-health.ts`):

- `docdog index` warns once, corpus-scoped, leading with the share rather
  than the record count — *"16.0% of the corpus is findable by keyword but
  not by meaning"* — with the three worst named and the rest counted.
- `docdog status` / `docdog_status` list the records worst-first, bounded
  at ten with the remainder counted out loud; `--json` carries all of them.
- `MAX_EMBED_CHARS` moved to `embed-health.ts` so `status` can report
  against it without importing the indexer to read one number.

Two deliberate details:

- **Measured in UTF-16 code units, by loading bodies rather than using
  SQLite's `length()`.** SQLite counts characters; `embedInput` compares
  code units; they disagree on astral content and SQLite's is *smaller* —
  so it would under-report a truncation. Under-reporting is the failure
  this check exists to end. Pinned by a test.
- **It suggests nothing.** No "split this." The remedy is docdog's work,
  not the reader's, and a warning that demands an impossible action is
  worse than the silence it replaced.

An FTS assertion pins the wording honest: the tail of an over-cap record
*is* still keyword-searchable. If it were not, "findable by keyword but
not by meaning" would be a lie and the true report would be far worse.

## What should still change — nothing. Measured 2026-07-16 (OBS-016)

This section originally read: *"Chunking — PROPOSAL-023 §2 … the deferral
has no basis left. Reporting is not the fix. It is what makes the fix
arguable with numbers."*

**The numbers arrived and argued the other way.** Three designs were A/B'd
against the 40 frozen queries with the real `search()` (OBS-016):

| design | chunks | hybrid MRR |
|---|---|---|
| baseline — today, with this 16% hole | 303 | **0.874** |
| split at every heading, no truncation left | 1,834 | 0.785 |
| every level: doc + sections + blocks | 5,600 | 0.729 |

Doing nothing wins on all four metrics, monotonically. Both designs
eliminate truncation completely; both make retrieval worse. Of the five
queries whose gold is a truncated record — the ones this note is about —
one improved, one broke, three did not move.

Two reasons, and neither was visible from this note's evidence:

1. **The whole-record centroid is what record-finding queries match.**
   DD-070 is found at vector rank 2 for *"which decisions did DD-070
   supersede"* **without §10 ever being embedded**, because its one vector
   encodes what the record is *about*. Chunking replaces that composite
   with fragments and the rank collapses to not-found. Chunking optimizes
   passage retrieval; docdog's search returns records.
2. **FTS has been covering this hole the whole time.** The full body
   reaches FTS — this note says so, and pins it with a test. It did not
   draw the conclusion: for DP-002, the keyword leg alone lands rank 1
   while the vector leg cannot find it at all. The hole is real *and*
   nearly free.

So the framing above was wrong. **A silent degradation is not
automatically a defect worth fixing, and this one is cheaper than every
available repair.** The measured cost of the hole is approximately zero
where it matters, and the measured cost of closing it is 0.874 → 0.785.

What survives: the reporting, which is now the honest disclosure of a
**known, measured, accepted** limitation rather than a bill of work. And
PROPOSAL-023 §8, whose eval-driven deferral was right for a better reason
than it knew.

> **Stronger than accepted — the hole is load-bearing. 2026-07-17 (OBS-019).**
> This note framed the choice as split or chunk. **It never asked why the cap
> is 8,000.** It is a resource guard, nothing about retrieval chose it, and
> the corpus turns out to fit: the longest record is 6,694 tokens against
> nomic's 8,192, so every record can be embedded whole — no chunks, no
> summaries, no length tax. That arm was built and measured.
>
> **It loses, and it loses on exactly these records.** Vector MRR 0.674 →
> 0.625, hybrid 0.874 → 0.846, and **0 for 4** on the queries whose gold is
> truncated. The mechanism is absolute, not a ranking artifact: the gold
> record's cosine to its own query fell on **12 of 12** pairs — DD-070 by
> **−0.13** on *"which decisions did DD-070 supersede"*, the query whose
> answer is precisely the §10 tail this note reports as missing. Embed the
> missing section and the record gets *harder* to find by the question that
> section answers.
>
> So the resolution is not "the hole is cheap". It is:
>
> > **The truncated prefix is a better vector than the whole document.**
> > Truncation is accidentally doing summarization — these records open with
> > framing and close with detail, so the first 8,000 chars are near the
> > *best* available summary, not the worst available fragment. The 16% is
> > not lost content; it is what keeps the centroid sharp.
>
> This note's title still stands — the truncation *was* silent, and it *does*
> take the conclusions. Both facts are true and neither is a defect. The cap
> question is now closed in all three directions: don't chunk (OBS-016), don't
> summarize into the input (OBS-017), don't raise it (OBS-019).

> **The fourth and last direction — 2026-07-17 (OBS-020).** One design remained
> that this note's split-or-chunk frame could not see: **chunk it, but keep the
> context that made chunking fail.** Late chunking — one forward pass over the
> whole document, pooled per span afterward. It is the best chunking ever
> measured here, **0.785 → 0.838**, and it loses to doing nothing at 1,881
> vectors and an hour of forward passes. On the five queries whose gold is a
> truncated record — the ones this note is about — it is **0 better, 2 worse**.
>
> It also supplies the reason all four refusals are one refusal. Docdog's search
> returns **records**, and a record is scored by the **max over its vectors**.
> Any multi-vector layout buys fragment recall it cannot spend and pays a
> lottery tax it cannot avoid — and late chunking only wins as much as it does
> by *smearing its spans into 92% copies of the document vector*, which reduces
> the tax by ceasing to be multi-vector. Its ceiling is the whole-record
> centroid, because that is what it is approximating.
>
> So the hole this note found is not a hole to be filled by a better recipe.
> **The whole-record centroid is the shape of the problem**, and the 16% is the
> price of a vector sharp enough to be worth searching. Do not reopen this
> without a new corpus (OBS-013) or a system that returns passages instead of
> records.
