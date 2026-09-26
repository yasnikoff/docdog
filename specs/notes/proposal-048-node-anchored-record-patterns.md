---
id: PROPOSAL-048
title: "A record pattern anchored to markdown nodes, so a file's units may be list items rather than headings — and why PROPOSAL-045's regex refusal does not reach it"
collection: proposals
status: proposed
date: 2026-09-25
description: "One new ScanPathConfig key for the split parser: a pattern matched against markdown AST nodes rather than heading text, with a named `id` capture read out of the node's own text. It closes the single false premise in issue #1 — that `split_on` is heading-shaped — without touching identity, embedding, edges or retrieval, all of which already work for sub-file records. Backward compatible: `split_on` keeps its meaning and its string-or-list form. The regex refusal in PROPOSAL-045 is scope-checked rather than cited: both of its reasons are about the split COMMAND's `--on`, and neither survives transfer."
relationships:
  - references: DISC-042
    context: "the discussion this is split out of — the one piece that is a code change rather than a docs fix or a separate design question"
  - references: PROPOSAL-045
    context: "the standing regex refusal, scope-checked here: its two reasons are `multi-cohort was already solved by a list` and `overloading --on reinterprets a literal`, and a new key over a shape no list can express defeats both"
  - references: PROPOSAL-034
    context: "the precedent for the fix's shape — close a split-parser coverage gap with backward-compatible ScanPathConfig keys, no new command, no schema bump"
  - references: FRICTION-039
    context: "the defect this must not re-introduce: a raw-line scan splits inside fenced code blocks and cannot see setext headings, which is exactly why the pattern anchors to AST nodes"
  - references: DD-067
    context: "the parser system extended — this adds a matcher to the split parser, not a fifth parser"
  - references: DD-068
    context: "the cost carried unchanged: split-parsed records keep minimal on-disk metadata and refuse the write tools, which every new adopter of this key inherits"
  - references: DP-001
    context: "tier 1 — the author writes the pattern and docdog matches it; the tier-3 version would be inferring a document's units, which this must never grow into"
  - references: DD-064
    context: "the escape hatch this makes unnecessary for the common case, and deliberately does not replace — a script parser remains the answer for a shape no pattern reaches"
  - references: FRICTION-057
    context: "the defect that blocks this in practice: a pattern for three files inside a default-parsed directory needs an entry to override rather than add"
  - references: FRICTION-023
    context: "the earlier coverage gap in the same parser, and the source of the `fallback: whole-file` behaviour this key must compose with"
  - references: OBS-016
    context: "the refusal a reader will pattern-match onto this; it does not bind, because its mechanism assumes the record is one idea and this is many records sharing one vector"
  - references: OBS-024
    context: "why the status quo looks like it works on such a corpus — FTS covers the body and hands back the file — and why the vector leg is blind rather than weak"
  - references: OBS-023
    context: "the instrument the baseline runs on; its external runner pins path-mode golds, which cannot tell a row from its file, so it needs an id mode first"
  - references: FRICTION-058
    context: "the baseline's row arm is the script route, and a script must apply its entry's collection itself until this is fixed"
  - references: FRICTION-059
    context: "why the row arm indexes with --full: an edit to the script does not invalidate the parse it produced"
---

# PROPOSAL-048: record patterns anchored to markdown nodes

## Problem

The index-time split parser already produces sub-file records with
text-derived ids, per-section embeddings, and id-bearing hits. Everything
issue #1 asks for is built — except that `split_on` can only name a
heading:

```ts
export function parseSplitPattern(pattern: string): SplitPattern {
  const match = pattern.match(/^(#+)\s*(.*)$/);
  if (!match) throw new Error(`split pattern must start with '#' markers: ${pattern}`);
  return { depth: match[1].length, prefix: match[2] };
}
```

```ts
h.depth === p.depth && h.text.startsWith(p.prefix)
```

A corpus whose addressable units are **top-level list items** —
`- D-ARCH-44. **…**` — cannot be reached by any value of `split_on`, at
any length of list. 261 records collapse into one file-record whose
vector covers its first ~2-3%.

This is not a missing feature. It is a matcher that stopped where its
first corpus did. The **table** parser already emits sub-file records
whose unit is a table row, so the parser system was never heading-bound.

## Proposal

One new `ScanPathConfig` key for `parser: split`. Working name
`record_pattern`, bikeshed at review:

```yaml
scan_paths:
  - path: spec/design-decisions.md
    parser: split
    record_pattern:
      node: list_item
      match: '^(?<id>[A-Z]+-[A-Z]+-\d+)\.\s*(?<title>.*)'
    collection: decisions
```

Semantics:

- **`node`** selects which mdast node type begins a record. Enumerated,
  not free — start with `list_item`, and add types when a corpus asks.
  An enum is what keeps this a matcher rather than a query language.
- **`match`** is applied to the node's own text, not to a line. The
  named group `id` is required and becomes the record id and
  `sectionKey`; `title` is optional and falls back to the node's first
  line.
- A record's **content** runs from its node to the next matching node at
  the same nesting level — the same partition property `sectionsByHeading`
  already guarantees, so nothing between records is dropped.
- `split_on` and `record_pattern` are mutually exclusive on one entry.
  Declaring both is refused by name at load; there is no merge semantics
  worth inventing.
- `fallback: whole-file` composes unchanged.

**Anchoring to nodes is the whole design, not an implementation detail.**
A regex over raw lines re-introduces FRICTION-039 exactly: it would split
on a `- D-ARCH-44.` inside a fenced code example, and could not tell a
list item from a line that starts with a dash. Matching per mdast node
keeps the AST guarantee `split.ts` has held since DISC-016, and it is
what makes the regex safe enough to accept at all.

## Why PROPOSAL-045's regex refusal does not reach this

Stated here because a reader will otherwise cite it and close this. That
refusal reads:

> *Regex refused on EVIDENCE, not principle: multi-cohort was already
> solved by a list, and overloading `--on` silently reinterprets a
> literal `### [TASK-`.*

Both reasons are about `docdog split --on`, the **command's**
plan-boundary selector. Neither survives transfer:

- *Multi-cohort was already solved by a list.* A list of heading
  prefixes is unbounded in **cohorts** and closed in **shape**. No length
  of list expresses "a list item". The evidence that grounded the refusal
  is absent — that is the test it set for itself, and it fails it.
- *Overloading `--on` reinterprets a literal.* A **new key**
  reinterprets nothing. `split_on` keeps its meaning, its string-or-list
  form and its behaviour byte for byte; no existing config changes
  meaning.

Note also the asymmetry of stakes the refusal was written under: `--on`
nominates boundaries into a plan a human then reviews, so a wrong pattern
costs a re-run. `record_pattern` decides what the corpus *is*. That cuts
both ways and is an argument for the enum on `node` and for refusing
mutual declaration, not against the key.

## Scope — what this does NOT do

- **No new parser.** A matcher on the existing one.
- **No schema bump, no new CLI command, no new MCP tool, no new relation
  type, no new collection.**
- **No id inference.** The pattern must carry a named `id` group. A
  pattern without one is refused; docdog does not invent identity, and a
  positional fallback would recreate the exact property issue #1 declined
  adoption over.
- **No relation mapping.** Their `amends: [D-GRAPH-13]` frontmatter still
  is not an edge (DD-043). That is OQ-48, held separate on purpose.
- **Does not replace `parser: script`.** A shape no pattern reaches still
  needs the escape hatch; FRICTION-056 is about making it findable, and
  is true whichever way this lands.
- **Does not lift DD-068's cost.** Records produced this way keep minimal
  on-disk metadata and refuse the write tools. An adopter buys retrieval,
  not authoring.

## Cost, named

- **`docdog update` cannot help anyone adopt this.** It is a config key,
  and update never edits an adopter's `config.yaml`. Reach is
  documentation only — which is precisely FRICTION-056's problem
  recurring one feature later, and the reason the docs fix should land
  first or alongside.
- **Blocked in practice by FRICTION-057** — and so is the script route
  that works today, which is measured rather than inferred: an overlapped
  file flips between its two parses on every run. Three files needing
  patterns inside a default-parsed directory is unusable until a file
  entry overrides a directory entry instead of racing it.
- **An enum that grows by request is a slow interface.** Accepted: the
  alternative is a selector language, and DP-001 tier 3 is where that
  ends up.

## Measurement before shipping

Nothing here is measured. The retrieval claim — that 261 records sharing
one truncated vector retrieves worse than 261 records with their own —
is extremely plausible and is still a claim. OBS-016/019/020 all
overturned a retrieval intuition, and OBS-020's lesson is that an
aggregate cannot tell you a design is succeeding for the opposite of its
stated reason.

### The baseline does not need this proposal built

The row arm exists at 0.4.0: `parser: script` with the script posted on
issue #1 produces one record per row, id from the text, one vector each —
the same output this key would produce. So the retrieval claim is testable
**now**, and this proposal's own test shrinks to equivalence (below).
Building the matcher first and measuring after would spend the design
work before learning whether it buys anything.

Two arms on the reporter's corpus, same query set, same embed recipe:

- **A — status quo.** Zero config beyond `scan_paths`; the file is one
  default-parsed record.
- **B — rows.** `design-decisions.md` under `parser: script`, and the
  arm's config **enumerates entries so that no two overlap**, because
  FRICTION-057 would otherwise alternate the file between A's parse and
  B's on successive runs and the arm would measure whichever run it
  happened to be. Index with `--full` (FRICTION-059). The script applies
  the entry's collection itself (FRICTION-058).

### The instrument, as shipped, cannot see the claim

`run-external-eval.ts` hard-codes `goldMode: "path"`, and path mode
expands a gold to *every record its file holds*. Against a row question
with the file as gold, arm A scores a hit when the file comes back and
arm B scores a hit when **any** of its 261 rows comes back. Both arms
answer "the file", neither is asked "the row", and the comparison measures
nothing this proposal claims. That is the OBS-013 Q22 shape again — a
config fact scored as a retrieval fact.

The engine already has `goldMode: "id"` (the self-corpus runner uses it),
so the fix is a `--gold-mode` flag on the external runner; test tooling,
not shipped surface. Then, per arm:

1. **Row questions, row-id golds, arm B** — the number ask 4 is about:
   is the right row ranked, among its 260 siblings and the rest of the
   corpus. Arm A cannot be scored here; it has no row records. That is the
   finding, not a gap in the method, and it is reported as such rather
   than as a zero.
2. **Row questions, path golds, both arms** — does the right *file* come
   back at all. Arm A's best case. If B loses here, splitting hurt
   something even at file grain.
3. **Control questions, golds in other files (the 509 log entries), both
   arms** — the regression check. 261 new records compete for the same
   top-10; a design that finds rows by crowding out everything else is
   not a win.
4. **The mechanism, absolutely (OBS-019).** For each row question, the
   gold's cosine to its query: B's row vector against A's file vector.
   Split the rows by whether their text lies inside the first 8,000
   characters of the file.

**Written down before it runs**, so the result can contradict it: rows
past the cap should show A's cosine flat and query-independent (blind,
OBS-024's mechanism) and B's responsive; rows inside the cap may tie in
(4) and still differ in (1). If B's row MRR is low *and* its cosines are
responsive, the loss is ranking among near-identical siblings, not
embedding — a different problem from the one this proposal solves.

The query set is frozen **before** arm B is indexed, by the reporter if
they will write it: they know what they look rows up to find, and we
would write questions shaped by the parse we just built. Golds are row
ids for row questions and paths for control questions; the report stays
off this repo (DD-071), aggregates only.

### What this proposal then owes

An **equivalence test**, not a retrieval one: on the reporter's file,
`record_pattern` and the script produce the same section set — ids,
titles, content boundaries. Equal means B's numbers are this key's
numbers. They are expected to differ in known places and the test should
report the diff, not assert it away: the script is line-based with fence
tracking, the key is mdast-anchored, so they part on nested or indented
items, list items inside blockquotes, and any fence its simple opener/closer
match misreads. Each difference is either a defect in the script
(tell the reporter) or a reason this key is worth building over it.
