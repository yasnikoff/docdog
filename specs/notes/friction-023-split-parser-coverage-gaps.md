---
id: FRICTION-023
title: "Split parser: one `split_on` per path, and files that match nothing are dropped without a word"
collection: notes
status: resolved
description: "Two coverage gaps in the split parser, both code-confirmed. (1) `split_on` is a single string per scan entry, so a file carrying 105 `### FR-` and ~32 `### NFR-` headings can only split one cohort — the NFR sections fold into whichever FR record precedes them and NFR-* ids stay dangling. (2) A file under a split scan path whose headings match nothing produces zero vertices and no warning: its content is simply not indexed, a silent coverage hole."
severity: inconvenient
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-split-parser-gaps.md
relationships:
  - references: DD-067
    context: the pluggable-parser design this stresses — split is selected per scan entry, and the entry carries exactly one pattern
  - references: DD-068
    context: "multi-section files are the case split exists to serve; a requirements file with two id cohorts is that case, and today it can only be half-served"
  - references: DP-001
    context: "both fixes stay mechanical: a list of explicit patterns (agent decides which), and a warning for zero matches (report, don't guess)"
  - references: FRICTION-019
    context: same failure shape — the indexer knows something went wrong and doesn't say so
  - references: WF-002
    context: harvested from the external dogfood track
  - references: FRICTION-021
    context: the third finding in the same harvested feedback note — parser-config changes never re-applying — was split out as FRICTION-021
---

# FRICTION-023: Split-parser coverage gaps

Two findings from wiring `parser: split` over the orchestrator's
upstream mirror. (The third finding in the same source note — config
changes never re-applying — is FRICTION-021.)

## 1. One `split_on` per path: FR and NFR can't both split

`requirements/*.md` carry 105 `### FR-` headings **and** ~32 `### NFR-`
headings in the same files. `split_on: '### FR-'` captures the FRs;
the NFR sections are silently folded into whichever FR record precedes
them, and `NFR-*` ids cited by deferred-item edges (NFR-NOTIF-01,
NFR-SCALE-03) stay dangling. Two scan entries for the same path would
overlap, so **no config splits both cohorts today**.

Confirmed in source — `src/engine/parsers/split.ts:17,27-30`:

```ts
const pattern = parserConfig.split_on;          // one string
const slices = sectionsByHeading(
  doc, h => h.depth === depth && h.text.startsWith(prefix),
);
```

Suggested fix: allow `split_on` to take a list of patterns, matching a
heading if it matches *any* of them. Mechanically that is a
`.some(...)` over the parsed patterns; the agent still declares
exactly which prefixes are id-bearing, so no inference enters the code
(DP-001).

## 2. Files with zero matches produce zero records — silently

Under a split scan path, a file whose headings match nothing (e.g.
`code-guidelines/index.md`, `requirements/node-agent.md`) contributes
**no vertex at all**. `splitParser.parse()` returns `[]`, the indexer's
`validSections.length > 0` check drops the file from `parsedFiles`
entirely, and nothing is logged. The file's content is simply absent
from the corpus.

For navigation/index files that is tolerable. For a prose file that
happens to lack the heading pattern it is a silent coverage hole — the
same failure shape as FRICTION-019: the indexer knows and doesn't say.

Suggested fix: emit `no sections matched — file skipped` on the
existing `warn()` channel. A whole-file fallback is the more helpful
behavior but it is a *judgment* about what the corpus owner meant, so
it belongs behind an explicit per-entry option (`fallback: whole-file`)
rather than as a silent default — warn first, and let real use decide
whether the option is worth adding.

## Workaround adopted in the orchestrator repo

CG split shipped (all 78 `## CG-` headings are uniform and unique);
NFR sections remain unsplit, with 2 known dangling edges as the
accepted cost.

## Partial fix (2026-07-13) — gap 2 closed, gap 1 still open

**Gap 2 (silent zero-match drop) is fixed.** Discovery now warns when a
parser returns no sections, on the same channel as the other indexer
warnings, and names the parser that matched nothing:

```
Cache: upstream/index.md: parser "split" matched no sections — file not indexed
```

The file is still not indexed — that behavior is unchanged and probably
right — but the coverage hole is now visible instead of silent. The
whole-file fallback floated above stays unbuilt on purpose: choosing it
for the corpus owner is a judgment about what they meant (DP-001), and
the warning is what tells them there is a choice to make. If real use
shows people always want the fallback, it becomes an explicit per-entry
option, not a silent default.

**Gap 1 (one `split_on` per path) is untouched.** Allowing a list of
patterns changes the config schema, which per this project's own rule
is a design change that walks the principles first — it is not a
drive-by fix, and it wants a proposal. The orchestrator's NFR ids stay
dangling until then; their accepted workaround holds.

## Recurrence (2026-07-14) — the `EAPI-*` case: real-use evidence for both gaps, at high severity

Harvested from
`specs/investigations/docdog-adoption/feedback-2026-07-14-eapi-ids-unindexed.md`.
This is the "real use" gap 2 asked to wait for — and it lands on the
**high-severity** end of the taxonomy, not the tolerable one.

**What happened.** `constraints/external-apis.md` holds 9 `EAPI-*` ids
(`EAPI-PTERO-01…06`, `EAPI-BDS-01`, `EAPI-IPR2-01`, `EAPI-IPR2-02`), all
**cited by id** across the corpus. The config gives a `split` parser to
four upstream paths but **not** to `constraints/`, so the file indexes as
one whole-file record and **none of the 9 ids is resolvable**:

```
docdog_get(id="EAPI-IPR2-01")  → "Section not found: EAPI-IPR2-01"
```

Two `/enhance-spec` section agents followed the docdog-first protocol,
searched for content they had every reason to expect indexed, got nothing
usable, and recovered only by falling back to `Grep`. Not a stale index —
`docdog_index` ran at session start.

**Why high severity.** `constraints/external-apis.md` is precisely where
hard-won vendor-behaviour findings land — things a future engineer cannot
re-derive cheaply. An agent that trusts the empty result **silently
reviews against a world where the constraint does not exist.** Concretely
in that run, an agent would have concluded `tc -j` works uniformly (it
does not — `class show` silently ignores `-j`) and that `--cap-add
NET_ADMIN` grants the capability to a non-root container (it does not).
Two of its highest-severity findings hung on this one un-indexed file; it
caught them only because it fell back to grep.

**Why this is evidence for the fix, not just the warning.** Adding
`split_on: '### EAPI-'` to `constraints/` is unsafe *because of gap 2's
resolution*: `constraints/` holds other files with no `EAPI-` heading, and
those would now be dropped (warned, but dropped) — trading one hole for
several. So the two gaps compound: you cannot split the one file you need
without a way to keep the rest, and you cannot add a second prefix for the
rest without gap 1's multi-`split_on`. The clean fixes are exactly the two
already named above:

- the **opt-in `fallback: whole-file` per-entry option** (gap 2's deferred
  half) — so `constraints/` can split on `### EAPI-` and still index the
  non-matching files whole; and/or
- **per-file scoping** of a split entry
  (`path: .../constraints/external-apis.md`) alongside a whole-file entry
  for the rest of the folder — which works today with no code change and
  is the recommended interim workaround.

**One caution on the source note's own proposal.** The feedback note
argues for making whole-file fallback the *automatic* behaviour ("teach
the parser to fall back to whole-file when a file has no matching
headings"). That is the **silent default this record already declined on
DP-001 grounds** — guessing that the owner wanted the whole file is a
judgment. The evidence here strengthens the case to *build the opt-in
option* and makes it the strongest instance yet, but not to make it
silent. Warn (shipped) + opt-in option (unbuilt) + per-file scoping
(available now) is the DP-001-clean shape; auto-fallback is not.

The note's secondary finding (the `collection:` short-name filter silently
returning zero) is a separate bug, harvested as **FRICTION-030**.

## Resolved (2026-07-15) — both open halves shipped via PROPOSAL-034

Gap 1 and gap 2's deferred half are both closed. The config-schema change
went through **PROPOSAL-034** (the design record; walks DP-001/002/003 and
DD-034/067/068). Two backward-compatible `ScanPathConfig` keys, read only by
the `split` parser:

- **`split_on` accepts a list.** `split_on: ["### FR-", "### NFR-"]` — a
  heading matches if it matches any pattern, sections come out in document
  order. A single string is unchanged. The orchestrator's FR + NFR file now
  splits both cohorts; the `NFR-*` dangling edges can be reconnected.
  (`src/engine/parsers/split.ts`, `normalizePatterns` + `.some(...)` predicate.)
- **`fallback: whole-file`.** A zero-match file under a split entry is indexed
  as one vertex via the default parser instead of being dropped. Omitted
  (default) is unchanged: dropped, with the warning shipped in the 2026-07-13
  partial fix. This is the opt-in the EAPI case needed — `constraints/` can now
  split on `### EAPI-` *and* keep its other prose files, and the auto-fallback
  the source note asked for stays declined on DP-001 grounds.

Both keys are DP-001 tier-2: the author declares exactly which prefixes are
id-bearing and whether non-matching files are kept whole — no inference enters
code. `parserSignature` already hashes every config key, so both re-index on
edit (FRICTION-021). Tests in `tests/unit/parsers.test.ts` cover list-split,
empty/blank-list rejection, whole-file fallback, and fallback-only-on-zero-match;
full suite 356 green. No new collection, relation type, CLI command, MCP tool,
or schema bump.
