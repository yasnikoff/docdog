---
id: PROPOSAL-034
title: "Split parser: a list of split_on patterns, and an opt-in whole-file fallback"
collection: proposals
status: shipped
description: "Close the two open halves of FRICTION-023 with two backward-compatible ScanPathConfig keys: split_on accepts a list of heading prefixes (a heading matches if it matches any), and a new fallback: whole-file per-entry option indexes a zero-match file as one vertex instead of dropping it. Both are DP-001 tier-2 (author declares patterns and fallback explicitly; no inference enters code). No new collection, relation type, CLI command, MCP tool, or schema bump."
relationships:
  - references: FRICTION-023
    context: resolves the two open halves — multi-pattern split_on (gap 1) and opt-in whole-file fallback (gap 2's deferred half); the EAPI recurrence is the real-use evidence this proposal answers
  - references: DD-067
    context: extends the pluggable-parser config shape — split_on becomes a list, and a new fallback key joins the per-entry parser options
  - references: DD-068
    context: distinguishes multi-pattern heading split from the inline-metadata patterns DD-068 rejected; multiple heading prefixes are the same heading-slicing mechanism, not a new on-disk format commitment
  - references: DP-001
    context: "both keys stay tier-2: the agent declares exactly which prefixes are id-bearing and whether non-matching files are kept whole — report/scaffold, never guess"
---

## Problem

FRICTION-023 named two coverage gaps in the `split` parser. Gap 2's
silent half shipped (2026-07-13): a zero-match file now warns instead of
vanishing. Two halves remain open, and the 2026-07-14 `EAPI-*` recurrence
raised both to real-use, high-severity evidence:

1. **One `split_on` per scan entry.** A file carrying `### FR-` *and*
   `### NFR-` headings can split only one cohort; the other folds into the
   preceding record and its ids stay dangling. Two scan entries for the same
   path overlap, so no config splits both today.
2. **A split entry cannot keep its non-matching files.** With gap 2's
   resolution, adding `split_on: '### EAPI-'` to `constraints/` would split
   `external-apis.md` (9 cited `EAPI-*` ids, all currently unresolvable) but
   *drop* the folder's other prose files — trading one hole for several.

The two compound: you cannot split the one file you need without a way to
keep the rest. The note already named the two clean fixes; this proposal is
their design record.

## Design

Two backward-compatible keys on `ScanPathConfig` (`src/types/config.ts`).
Both are read only by the `split` parser.

### 1. `split_on` accepts a list

```yaml
- path: specs/requirements/
  parser: split
  split_on: ["### FR-", "### NFR-"]   # a heading matches if it matches ANY
  collection: requirements
```

`split_on?: string | string[]`. A string is unchanged. A list parses each
element into `{depth, prefix}` and the slice predicate becomes
`patterns.some(p => h.depth === p.depth && h.text.startsWith(p.prefix))`.
Sections come out in document order regardless of which pattern matched
(the underlying `sectionsByHeading` collects matches in heading order).
Patterns are expected to be non-nesting (typically the same depth); a
shallower pattern whose section encloses a deeper matched heading would
double-count, which is an author error, not a case the code guesses around.

### 2. `fallback: whole-file`

```yaml
- path: specs/constraints/
  parser: split
  split_on: "### EAPI-"
  fallback: whole-file            # non-matching files index whole, not dropped
  collection: constraints
```

`fallback?: "whole-file"`. Omitted (default) is today's behavior: a
zero-match file is dropped with the FRICTION-023 warning. Set to
`whole-file`, the split parser delegates a zero-match file to the `default`
parser — one vertex, frontmatter-and-body as written, collection from the
entry. The discovery-level zero-match warning then fires only when the
parser genuinely returns nothing (fallback off), which is correct.

Together they solve the EAPI case: `split_on: "### EAPI-"` +
`fallback: whole-file` on `constraints/` splits the one file with `EAPI-`
headings and indexes the folder's other files whole.

## Why not the source note's auto-fallback

The feedback note argued for making whole-file fallback *automatic*. That is
the silent default FRICTION-023 already declined on DP-001 grounds — guessing
the owner wanted the whole file is a judgment. The evidence strengthens the
case to *build the opt-in option*, not to make it silent. Warn (shipped) +
opt-in `fallback` (this proposal) + per-file scoping (available today) is the
DP-001-clean shape.

## Principle walk

- **DP-001 — agent-first mechanics.** Tier 2 both. The author declares
  exactly which heading prefixes are id-bearing and whether non-matching
  files are kept whole; the code does a `.some(...)` and a delegation. No
  inference, no auto-fallback, no confidence scoring. Passes the test —
  neither key pushes a semantic decision into code.
- **DP-002 — concepts carry meaning.** No new vertex collection and no new
  relationship type, so the "new concept needs a meta entry" test does not
  fire. `fallback`/`split_on` are parser config keys, documented in the
  `ScanPathConfig` doc-comments (the same place `split_on`, `group_by_heading`
  and `script` already live), not concepts an agent must infer from a token.
- **DP-003 — comprehensive toolbelt.** This is clause 3 firing: the
  workaround (per-file scoping + accepting dangling `NFR-*`/`EAPI-*` edges)
  was reached for repeatedly across two corpora. The gap is config
  expressiveness, and the fix is to grow the config, not a new command.
- **DD-034 / shape-preserving.** Both keys live in `config.yaml` where a
  vanilla agent reads them; the artifact on disk is untouched; re-indexing
  never writes back. `parserSignature` already hashes every config key, so
  both new keys correctly re-index on edit (FRICTION-021).
- **DD-067 — pluggable parsers.** A direct extension of the per-entry parser
  options; strings still mean `default`, single `split_on` unchanged.
- **DD-068 — minimal on disk / rejected inline patterns.** DD-068 rejected
  *inline metadata* patterns (per-section frontmatter conventions wedged into
  prose) as a format commitment docdog would own forever. Multi-`split_on` is
  not that: it is multiple *heading* prefixes over the same heading-slicing
  mechanism `split` already uses. No new on-disk format, no metadata
  convention — the author still writes plain headings and declares each
  prefix explicitly in config. The DD-068 rejection does not reach here.

## Scope (what this is NOT)

No new CLI command, no new MCP tool, no new collection, no new relation type,
no SCHEMA_VERSION bump (config-only). The MCP kernel 8 and the CLI surface
are untouched. Non-`split` parsers ignore both keys.

## Test plan

- `split_on` list splits both cohorts in one file (FR + NFR), document order
  preserved; single-string `split_on` unchanged (regression).
- Empty list / empty element rejected with the existing guard message.
- `fallback: whole-file` on a zero-match file yields one vertex with the
  entry's collection; without it, zero vertices + the existing warning
  (regression on the FRICTION-023 warn test).
- A file that *does* match still splits normally when `fallback` is set
  (fallback only engages on zero matches).

## Shipped (2026-07-15)

- `src/types/config.ts` — `split_on?: string | string[]`, new `fallback?: "whole-file"`.
- `src/engine/parsers/split.ts` — `normalizePatterns` (string | list | unset →
  non-empty list; blanks dropped so an empty config still hits the guard), the
  `.some(...)` multi-pattern predicate, and a zero-match delegation to
  `defaultParser` when `fallback === "whole-file"`.
- `tests/unit/parsers.test.ts` — list-split (order preserved), empty/blank-list
  rejection, whole-file fallback (id + collection), fallback-only-on-zero-match.
- Verified end-to-end through `parseFile` (real discovery path): list-split and
  fallback both index with zero warnings; the no-fallback zero-match case still
  emits the FRICTION-023 warning. Full suite 356 green; `docdog index` clean.

One implementation fact not in the design: `defaultParser.parse` is typed as
the sync/async `Parser` union, so the fallback return is narrowed back with an
`as ParsedSection[]` cast — `defaultParser` is synchronous, so the cast is safe
and keeps the split parser's own signature synchronous.
