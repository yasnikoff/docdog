---
id: FRICTION-060
title: "A record with an empty body is embedded anyway — every such record gets the same vector, and `pairs` ranks them as the strongest similarity in the corpus"
collection: notes
status: resolved
fixed_date: 2026-09-28
resolution_approach: fix
date: 2026-09-27
description: "RESOLVED 2026-09-28: an empty body gets no vector, a stored one is cleared on the next index, and index + status name the records. `embedInput` embeds whatever a section's content is, including an empty or whitespace-only string. Every empty-bodied record in a corpus therefore gets one identical vector, and `docdog pairs` nominates every pair of them at cosine 1.000, above all real candidates, with nothing in its output saying why. On the reporter's corpus: 18 empty log-entry heads, C(18,2) = 153 candidates at the top of the report. Nothing at index time or in `status` counts empty bodies."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/2
evidence: yasnikoff/complexpoint-docdog-evidence@06980bf
relationships:
  - references: PROPOSAL-049
    context: "the command whose output this defect tops — pairs trusts every stored vector, and a vector of nothing is the one vector it cannot trust"
  - references: FRICTION-033
    context: "the constraint on the fix: whatever an empty body embeds as (nothing, or the title) changes what embedInput emits, so it must join the recipe or be a refusal to embed rather than a new input"
  - references: DD-067
    context: "how an empty body arises without anyone writing one — a parser, here a project script, emits a head record whose content is whatever precedes the first section"
---

# FRICTION-060: an empty body is embedded as if it were content

## What happened

Issue #2. `docdog pairs` (0.5.0, defaults) over an adopted corpus of 5,415
records opened with 153 candidates at cosine **1.000** between unrelated
records. 153 = C(18, 2): eighteen records, every pair of them.

The corpus indexes its log with a `parser: script` that emits one head
record per entry plus one record per numbered section. The head's content
is whatever precedes `## 1.`; eighteen entries open directly on `## 1.`, so
eighteen heads have an empty body. All eighteen embed to the same vector.

## What docdog does wrong

The reporter's parser produced the empty body and they can fix their side.
docdog's part:

1. **`embedInput` (storage/indexer.ts) has no empty case.** An empty or
   whitespace-only string is embedded like any other, and the model's
   answer to "nothing" is one fixed vector.
2. **`pairs` cannot tell.** A cosine of exactly 1.000 between two different
   records is either a duplicate body or a degenerate input, and it is
   ranked as the best candidate rather than reported as either.
3. **Nothing counts it.** Neither `index` nor `status` says how many records
   have no body, so the first sign is the top of a `pairs` report.

The same shape is reachable without a script: a markdown file that is only
frontmatter.

## Direction (for WF-006, not decided here)

- Do not embed an empty body. Skipping is the smaller change: the record
  keeps its FTS row and simply has no vector leg, like any record the vector
  leg does not surface. Embedding the title instead changes `embedInput`'s
  output and must join the recipe (FRICTION-033).
- Say so at index time, collapsed: `N records have an empty body: …`, and
  count them in `status` (`--json` listing them).
- `pairs` skips records with no vector, and reports identical vectors
  between different records as a defect row, not a candidate. Deciding that
  two records ARE duplicates is judgment; reporting that their vectors are
  bit-identical is not.

## Resolution (2026-09-28)

- `hasEmbeddableBody` (storage/embed-health.ts) is the one predicate.
  `resolveEmbeddings` skips such a section, so its chunk has a null
  embedding, which search and `pairs` already skip. It is a refusal, not a new
  input, so the recipe is unchanged and nothing re-embeds.
- An unchanged file is skipped before that refusal runs, so an older
  cache would have kept its vector until `--full`. The whole-corpus pass
  clears those by id and says how many it cleared.
- `docdog index` warns once, collapsed (`N record(s) have an empty body …`),
  and `docdog status` lists them in text, MCP and `--json`
  (`embedHealth.emptyBodies`).
- **Not built:** reporting bit-identical vectors as a defect row in `pairs`.
  With empty bodies gone, a 1.000 pair means two identical bodies, which is
  exactly the candidate `pairs` exists to show.

Verified on `complexpoint-docdog-evidence@06980bf` with the reporter's
unmodified parser: 18 empty bodies named at index, 0 pairs at 1.000, and the
pool drops from 5,415 to 5,397 records with vectors. Tests:
`tests/unit/empty-body-embed.test.ts`.

## Workaround

Reporter side: put the entry's title in the head's content. docdog side:
none short of reading the pairs report from the 154th row.
