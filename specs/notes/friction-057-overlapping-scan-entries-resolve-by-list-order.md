---
id: FRICTION-057
title: "Two scan_paths entries covering one file both index it, each deleting the other's vertices — the parse the file has alternates on every run, silently"
collection: notes
status: resolved
fixed_date: 2026-09-27
resolution_approach: fix
date: 2026-09-25
description: "RESOLVED 2026-09-27. Discovery iterates scan_paths entries independently with no specificity rule and no `exclude` key, so a directory entry and a file entry covering the same file produce two ParsedFiles with one repoRelPath. `reindexFile` clears prior vertices by file_path, so the two passes delete each other's rows. Measured 2026-09-25 (0.4.0), the result is not list order: the file FLIPS between its two parses on successive `docdog index` runs, in either order, each run reporting success — so the corpus holds the wanted parse on every other run. Nothing reports the overlap. This is undeclared behaviour presenting itself as configuration, and it makes a per-file parser rule an addition to a directory rule rather than an override of it."
severity: blocks-work
upstream_issue: https://github.com/yasnikoff/docdog/issues/1
relationships:
  - references: DISC-042
    context: "the triage that found this, while answering whether splitting rules are per-repo, per-collection or per-document — the answer is per-entry, and per-entry does not compose"
  - references: DD-067
    context: "the decision that hung parser config off a scan entry; it never said what happens when two entries reach one file, and discovery answers by accident"
  - references: PROPOSAL-031
    context: "the contested-id machinery this stresses from a direction it was not designed for — the ids are not contested across FILES here, they are contested across two readings of ONE file"
  - references: FRICTION-021
    context: "the other defect in this seam: change detection is config-blind, so the parse a file gets is decided by state that the file hash cannot see"
  - references: DP-001
    context: "most-specific-path-wins is longest-prefix matching, tier 1 — no judgment enters; the tier-3 shape would be inferring which of two entries the author meant"
  - references: FRICTION-050
    context: "the same failure class one layer up: a defect nothing could SEE, closed by making the invariant testable rather than by fixing the one instance"
  - references: PROPOSAL-048
    context: "the proposal this blocks in practice — a node-anchored pattern for three files inside a default-parsed directory is unusable until an entry can override rather than add"
---

# FRICTION-057: overlapping scan entries race, and the file flips every run

## What was being attempted

Answering a design question from triage: can an adopter give one document
a different parser from the directory it lives in? Issue #1's corpus is
exactly that shape — `spec/` default, plus three files each wanting
different treatment.

The obvious configuration:

```yaml
scan_paths:
  - spec/
  - path: spec/design-decisions.md
    parser: split
    split_on: "## D-"
```

## What went wrong

There is no `exclude` key anywhere in the config, and
`discoverAndParseAll` (`engine/discovery.ts:62-86`) iterates entries
independently:

```js
for (const entry of scanPaths) {
  const pathConfig = normalizeScanPath(entry);
  // … collect files under this entry, parse each with THIS entry's config
}
```

No specificity, no overlap detection, no dedupe by path. The file above
is discovered **twice** and yields two `ParsedFile` objects sharing one
`repoRelPath`, parsed two different ways.

Then `reindexFile` (`storage/indexer.ts`) clears prior vertices by
`file_path`:

```sql
SELECT id FROM vertices WHERE file_path = ?
```

removing every row not in *this* pass's section set. So the whole-file
pass writes 1 vertex and deletes the N split rows; the split pass writes
N and deletes the 1. Both run inside one `docdog index`, in `scan_paths`
order.

**Consequences** — the first bullet was code-derived at filing and is
**contradicted by measurement**; see *Measured* below:

- ~~**The last entry in the list wins.**~~ It does not. The file
  alternates between its two parses on successive runs, in either
  order. There is no ordering that makes the configuration correct.
- **Every run churns.** One side's rows upserted and the other's removed,
  per overlapped file, per run. Embeds are content-keyed so the vector
  cost is near zero and the *visible* cost is a misleading
  `upserted`/`removed` count.
- **Nothing says so.** Not discovery, not the indexer, not
  `docdog status`. `findMissingScanPaths` reports an entry pointing at
  nothing; no surface reports two entries pointing at the same thing.
- **A per-file rule is an addition, not an override.** Which is the
  finding that matters: the natural way to express "this one file is
  different" does not express it.

## Measured (2026-09-25)

Reproduced on installed 0.4.0 in a throwaway project, while verifying
the `parser: script` sketch drafted for issue #1 — so this is now hit on
the path the acknowledgment recommends *today*, not only after
PROPOSAL-048. `spec/` (default) plus `spec/design-decisions.md`
(`parser: script`, three `D-` rows), each order run twice or more:

| run | upserted / removed | corpus holds |
|---|---|---|
| 1 | 1 / 3 | the whole-file record |
| 2 | 3 / 1 | the three rows |
| 3 | 1 / 3 | the whole-file record |
| 4 | 3 / 1 | the three rows |

Identical in the reversed order. The code reading above — both passes
in one run, last one standing — predicts a stable state and a churn
count; what happens is one reindex per run, the side reindexed
alternating. The likeliest mechanism is FRICTION-021's hash, which
folds the scan entry's signature in: one `files` row per path can hold
only one entry's signature, so whichever entry did *not* write it last
sees a mismatch and reparses. Unconfirmed — the fix does not depend on
it, since specificity leaves one entry per file and one signature.

## Workaround

Enumerate every *other* file in the directory as its own entry, so the
directory entry can be dropped. For issue #1's corpus that is every file
in `spec/` by hand, maintained forever, with a new file silently
unindexed until someone remembers. That is not a workaround so much as a
reason not to adopt.

## What should change in docdog

**Specificity: the most-specific entry covering a file wins.** Longest
matching path prefix; a file entry beats a directory entry; a deeper
directory beats a shallower one. Pure mechanics, DP-001 tier 1 — no
judgment enters, because the author still declares both entries and the
rule is positional-independent.

Two open details, both worth deciding deliberately rather than falling
out of the implementation:

1. **Exact ties.** Two entries with the same path and different parser
   config is a contradiction, not a precedence question. Refuse by name
   at load, the FRICTION-038 shape.
2. **Whether the overlap is reported even after precedence exists.** It
   should not be — under a specificity rule an overlap is the normal,
   intended way to say "this one is different", and warning about the
   normal case is how a warning gets turned off (PROPOSAL-047's own
   argument about the undecided state).

Note this is true today regardless of issue #1 and regardless of
PROPOSAL-048. It is a defect in what already ships.

## Resolution (2026-09-27)

Specificity, as proposed, and both open details decided as proposed.

- **Discovery parses each file once, under its governing entry**:
  `governingScanEntry` in engine/discovery.ts, longest canonical path
  prefix, list order irrelevant. `./spec/`, `spec\` and `spec` are one
  path. `matchScanEntry` — the write tools' and single-file reindex's
  resolver, which was *already* longest-prefix — now delegates to it, so
  a write and a full index cannot disagree about a file's parser. That
  pre-existing divergence was the defect's shape: one code path had the
  rule and the other had none.
- **Resolved against the configured entries, not the run's.** A second
  defect of the same kind fell out: `index --path spec/` handed discovery
  a bare string, so it default-parsed every file under it whatever the
  config said. It now parses as a full index does. A file no configured
  entry covers keeps the entry that found it (`--path` outside config,
  the implicit `.docdog/local/`).
- **Exact ties are refused by name** before anything is read, quoting
  both configs. An identical duplicate passes.
- **The overlap is not reported.** It is the normal way to say "this one
  file is different".

`tests/unit/scan-entry-specificity.test.ts` runs the measured table —
four runs, both orders — through the real indexer; 8 of its 12 tests fail
on the pre-fix source. End to end on the built CLI with issue #1's
configuration: three runs, `1 reindexed` then `0` and `0`, the rows held.
The flip's mechanism (FRICTION-021's single signature per path) was not
separately confirmed and no longer needs to be: one entry per file is one
signature.
