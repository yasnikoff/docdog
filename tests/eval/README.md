# Retrieval eval

The measurement behind DD-070 §8's "measured retrieval win" claim
(P-023 §7 step 7). Compares docdog's hybrid search against an honest
ripgrep baseline on this repo's own corpus, using the frozen query set
in `queries.yaml`.

## Run

```
docdog index                                # fresh cache first
npx tsx tests/eval/run-retrieval-eval.ts    # ~1 min, writes report.md
```

Needs the real ONNX embedder and `rg` on PATH. Not part of `npm test`
(vitest only picks up `tests/**/*.test.ts`). Deterministic: same corpus
+ same query set → same report.

## Systems

| system | what it is |
|---|---|
| `hybrid` | the real `search()` from `src/storage/search.ts` — FTS5 BM25 + brute-force cosine, RRF fusion, top-10 |
| `fts` | the keyword leg alone (diagnostic — quantifies what fusion adds) |
| `vector` | the cosine leg alone (diagnostic) |
| `rg-rank` | grep, *generous* reading: mechanical keyword extraction from the query, an `rg --count-matches`-equivalent pass per term over the scan paths, files ranked by (distinct terms matched, total matches) — a poor-man's TF ranking an agent or script could plausibly build |
| `rg-walk` | grep, *honest transcript*: a single `rg -in` OR-run, output in path-sorted order — what an agent actually reads after one grep |

The isolated legs **mirror** `search.ts`'s SQL rather than importing
internals — the eval must not grow the prod surface (session-7 handoff
guardrail). If the legs change, update the mirrors.

The grep engine is an in-harness reimplementation of ripgrep's
`--ignore-case --fixed-strings --line-number --sort path` semantics
(case-insensitive literal matching over the scan paths' `*.md` files),
so the eval needs no PATH-dependent binary. Validated against ripgrep
14.1.1: occurrence counts and matching line numbers are identical on
probe terms ("supersedes" ×10 in the DD-070 file, "arango" ×4 in the
OQ-30 file).

## Metrics

- **Hit@k** — the query's gold record set intersects the top k. Gold
  sets are 1–3 records; any counts (they were judged once, frozen in
  `queries.yaml` — DP-001: relevance judgment is agent+user work, done
  once, so runs stay mechanical).
- **MRR@10** — mean reciprocal rank of the first gold (0 when absent
  from the top 10).
- **tokens-to-locate** — approximate tokens (chars/4) of tool output
  the consumer must scan, in the tool's own presentation order, until
  the first gold reference appears. Measured only on the two
  end-to-end consumer surfaces:
  - `hybrid`: the MCP text rendering (`src/mcp/tools/search.ts` shape —
    id, title, file, relevance, description/preview per entry);
  - `rg-walk`: the raw `rg -in` transcript up to the first gold-file
    line.

## Running it on another project's corpus

The numbers above are measured on a corpus this project wrote about
itself, which is the most favourable case there is. The same harness
runs against any docdog project:

```
npx tsx tests/eval/run-external-eval.ts   --root <abs path to the project>   --queries <frozen set, absolute or relative to --root>   --out <where to write the report>   [--label <name>]
```

Both runners share `engine.ts`, so the only variable between a run
here and a run there is the corpus — that is the entire point, and it
is why the systems must never be forked per runner.

Two things differ, both forced by the fact that an adopting project
freezes its query set *before* `docdog init` runs:

- **Golds are file paths, not record ids.** A project with no docdog
  ids yet can still name the file that answers a question. Path mode
  expands a gold to every record that file holds, so a split-parsed
  section counts as a hit on its source file.
- **An unresolvable gold is reported, not thrown.** A gold no scan
  path reaches is a corpus-config gap, and scoring it as a retrieval
  miss is how one such query spent a day looking like evidence for
  sub-record chunking (OBS-013). Those queries are excluded from every
  number and listed in their own section.

Note what that check still cannot see: a gold that is indexed but no
longer *answers* — the usual cause being a content migration whose
golds were remapped to successor files. Path resolvability is a weaker
guarantee than answerability, and only reading the file closes the gap.

The report quotes query text and gold paths verbatim. For a private
corpus that is private content: write it outside this repo and publish
aggregates only.

## Caveats (read before quoting numbers)

- **rg gets the same corpus docdog indexes** (the config `scan_paths`,
  `*.md`), mapped back to record ids by file. rg hits on files hosting
  no record stay in its ranking as noise — that is the honest agent
  experience.
- **rg-rank has no reading transcript** — its ranked list is a
  construct, so it gets Hit/MRR but no tokens metric. Its real cost is
  *higher* than any list suggests: a filename alone doesn't confirm an
  answer; the agent still opens files. The tokens comparison
  (hybrid vs rg-walk) is the honest end-to-end pair.
- **Keyword extraction is fixed and mechanical** (stopword list frozen
  in the harness). A human might pick better grep terms; an agent
  might pick worse. Reformulation loops are not modeled on either
  side.
- **Gold sets contain 1–3 near-equivalent records** (e.g. a DD and the
  EJ it mirrors). This helps every system equally.
- **Token counts are chars/4 approximations**, not a real tokenizer.
- The corpus is self-describing (titles and descriptions are
  agent-authored) and, for a corpus, small. Generalization is not a
  matter of argument here — run `run-external-eval.ts` against the
  larger, messier corpus you actually care about.

## Files

- `queries.yaml` — frozen query set with gold answers (versioned; do
  not reword — append)
- `engine.ts` — the five systems, the grep reimplementation, and the
  metrics; shared by both runners
- `run-retrieval-eval.ts` — this repo's runner (golds are record ids)
- `run-external-eval.ts` — the same harness pointed at another
  project's corpus (golds are file paths)
- `report.md` — generated report (committed as the run's evidence)
