---
id: PROPOSAL-038
title: "Rebuild `docdog split` on the markdown AST, and let it derive its own heading depth from the embed cap instead of being told one"
collection: notes
status: shipped
shipped_date: 2026-07-29
description: "Close FRICTION-039 by pointing splitFile at src/markdown/ — the machinery its sibling parser has used since DISC-016 — and add the depth-selection design DISC-034 produced: with no --on/--depth given, descend to the shallowest heading level at which every resulting piece clears MAX_EMBED_CHARS, and refuse (report, never cut mid-prose) any leaf section still over the cap. No new CLI command, no MCP tool, no schema bump, no new relation type."
relationships:
  - references: FRICTION-039
    context: "the defect this closes; its three failure modes (code fences split, setext invisible, no depth concept) are the acceptance criteria"
  - discussed_in: DISC-034
    context: "the thread that produced both halves — the code read that found the defect and the size-driven descent design that answers 'different corpora nest differently' without inference"
  - references: DP-001
    context: "the principle that shapes it: AST parsing and size-driven descent are tier 1-2, while refusing to cut an over-cap leaf is the tier-3 line — choosing where prose divides is the author's judgment, not the tool's"
  - references: DISC-016
    context: "the decision this brings the command into compliance with; the parser has honored it since, the command never did"
  - references: PROPOSAL-034
    context: "the parser-side coverage fix; this is its command-side counterpart, and the two should end up sharing a matcher rather than re-deriving heading selection twice"
  - references: FRICTION-031
    context: "the cap disclosure that makes the descent policy meaningful — status already names the over-cap records, and this gives them a remediation path that does not require the author to guess a depth"
  - references: OQ-38
    context: "the open question that asked what restructuring helpers docdog should provide and named extract-sections as a nice-to-have; this is the concrete first piece of the answer"
---

# PROPOSAL-038: an AST splitter that picks its own depth

## Problem

Two halves, one from code and one from the field.

**The command does not parse markdown.** `splitFile` locates sections with
`lines[i].startsWith(on)`. It splits inside code fences, is blind to setext
headings, and has no concept of heading depth. FRICTION-039 has the detail.

**The caller has to know the depth in advance.** `--on` is required, and it
encodes both the level and the heading text. That works for docdog's own
`## DD-` corpora and fails for the general case the orchestrator represents:
a corpus where every document nests differently, and where the thing the caller
actually wants is not "split at H2" but *"split into pieces that fit."*

## Proposal

### 1. Structural matching

`splitFile` uses `parse()` and `sectionsByHeading()` from `src/markdown/`, the
same functions `engine/parsers/split.ts` calls. Section boundaries become
heading *nodes*, with `depth` and `text` read from the AST rather than derived
from a string prefix.

`--on "## DD-"` keeps working, parsed by the existing `parseSplitPattern` into
`{depth, prefix}` — the same normalization the parser already performs. What
changes is that it now means *a heading node at depth 2 whose text starts with
`DD-`*, so a code fence containing that line is no longer a boundary and a
setext H2 with that text now is one.

`--depth <n>` is added as the pattern-free form: split at every heading node of
that depth, whatever its text.

### 2. Size-driven descent

> **Amended 2026-07-29 by PROPOSAL-039 — demoted from default action to
> reported diagnostic.** This section originally made descent *the default when
> neither flag is given*: the tool picks a depth and splits. That is mis-tiered.
> A mechanical heuristic standing in for a judgment call is the shape DP-001
> exists to catch, and "every piece fits under the cap" optimizes the one
> property OBS-019 measured does not predict retrieval quality. The computation
> below is retained exactly and its **output is reported, not applied** — it
> becomes the strongest input the agent reads before choosing boundaries.
> With no flags and no plan, the command reports and writes nothing.

Walk heading depths from shallowest to deepest. At each level, slice the
document and measure every resulting piece. **Stop at the first level where
every piece is under `MAX_EMBED_CHARS`.** Report the level chosen.

This is mechanical: no content is interpreted, the rule is one comparison
against a constant the corpus already publishes, and the outcome is fully
determined by the document. It adapts per document without inferring anything
about it, which is what the "different corpora nest differently" objection
requires. DP-001 tier 2 — a visible default with an explicit override, and the
chosen depth is printed rather than silently applied.

### 3. Refuse, never cut blind

If descent runs out of heading levels and some leaf section is still over the
cap, the command **reports that section and does not split it further**.
Slicing prose at an arbitrary character offset is where a mechanical tool would
begin making semantic decisions — DP-001 tier 3. The output names the file, the
heading path, and the character count, and the author restructures.

`--dry-run` (already present) becomes the natural way to see the descent's
verdict before writing anything.

## What this does not include

- **No splitting into first-class records with `part_of` edges.** That design
  is DISC-034's open half and is gated on the per-query diagnostic and on a
  measurement design. This proposal produces files; what frontmatter they carry
  is unchanged from today.
- **No new CLI command.** `split` exists; this repairs it.
- **No MCP tool.** Splitting is a filesystem operation on a path, which the
  shell expresses fine — the DD-070 §4 parity rule is satisfied by the CLI
  command alone, and the body-bearing-write exception does not apply.
- **No schema bump, no new relation type, no config key.**

## Principle walk

- **DP-001.** §1 is pure mechanics (tier 1). §2 is a visible, overridable,
  printed default (tier 2). §3 is the tier-3 refusal — the one decision the
  tool declines to make. Nothing here guesses intent.
- **DP-002.** No new vocabulary, so nothing to register.
- **DP-003.** This *is* clause 3 firing: hand-splitting is the escape hatch,
  and the command exists precisely so it isn't needed.

## Acceptance

1. A file with a fenced code block containing `## X` splits at the real
   headings only.
2. A setext-headed file splits.
3. `--depth 2` splits at every H2 regardless of heading text.
4. With no flags, a document whose H2s are over-cap but whose H3s are not is
   split at H3, and the run prints that it chose H3.
5. A document with an over-cap section that has no subheadings is reported and
   not split at that section; other sections still split.
6. `--dry-run` shows the descent verdict without writing.

## Shipped

**§1 on 2026-07-29** (commit `2fc7582`, FRICTION-039 resolved): `splitFile`
calls `parse()` + `sectionsByHeading()`, `--depth <n>` is added, and
`parseSplitPattern` + the match predicate moved to `src/engine/split-pattern.ts`
so the command and the indexer-time parser derive heading selection once.

**§2 and §3 on 2026-07-29**, in the amended form. Criterion 4 above no longer
describes shipped behavior and is superseded by PROPOSAL-039: with no flags the
command **reports** the descent verdict and writes nothing, rather than choosing
H3 and splitting there. `--dry-run` is therefore not the way to see the verdict
(criterion 6) — running the command with no selector is. §3's refusal shipped
as designed, and it now has somewhere to go: an over-cap leaf is named in the
report, and the plan file is where an author says what to do about it.

Descent's one implementation departure from §2's text: it measures the
**partition** the boundaries would produce rather than each heading's own
section, including the preamble that stays with the parent. Same walk, same
constant, same stopping rule — but the sizes it prints are the sizes
`--apply-plan` writes, which they would not have been otherwise.
