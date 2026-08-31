---
id: PROPOSAL-030
title: "A union merge driver for the relationships block — teach git that an edge list is a set, not lines"
collection: proposals
status: shipped
date: 2026-07-14
description: "Two branches each adding an edge to the same record is a set union, but git diffs lines and calls it a conflict — on precisely the hub records every branch touches. Ship a git merge driver that runs the ordinary three-way merge first and only intervenes when it conflicts: if the conflict is confined to the `relationships:` block, replay the edges the other side added using the same `appendRelationship` surgery docdog already writes edges with. Everything else — divergent prose, divergent scalars, the same edge with two different contexts — conflicts loudly, because choosing there is judgment. `.gitattributes` is generated from `scan_paths` so the scope cannot drift. DD-050's second Tier-2 feature."
relationships:
  - references: DISC-026
    context: "corollary 2 of its general theory — the relationships block is a grow-only set, so the correct merge is union; this proposal is that corollary cashed in"
  - references: PROPOSAL-029
    context: "the sibling tier-2 feature, and the same structural fact pays for both: .git is shared across every worktree of a clone, so the embed store lands there and the merge-driver config installs once for all worktrees"
  - references: DD-050
    context: "the second real tier-2 feature: git-aware, never git-dependent — with no driver configured git falls back to the default text merge, which is exactly today's behavior"
  - references: DP-001
    context: "tier walk: union of a set is arithmetic (tier 1), while picking between two divergent contexts for the same edge is inference (tier 3) — so the driver refuses and conflicts rather than choosing"
  - references: DD-034
    context: "the constraint that rules out the easy fix — edges cannot move to sidecar files to dodge YAML conflicts, because the relationships block lives in the record so a vanilla agent reading specs/ on disk sees it; the driver unions it in place"
  - references: FRICTION-012
    context: "why union is sufficient rather than merely convenient — the forward-edge-only rule means an edge is written to exactly one file, so two branches adding edges touch disjoint entries and never contend for the same line's meaning"
  - references: DD-070
    context: "this grows the CLI past the §4 kernel with a plumbing subcommand git invokes, never a user — the same proposal-gated way suggest-edges came back; the MCP kernel 8 is untouched"
  - references: OBS-011
    context: "the measured reason hub records are the conflict surface — its context backfill drove DP-001/DD-034/PROPOSAL-003/DD-070 to ~100% edge coverage, which is exactly what every branch now appends to"
  - references: PROPOSAL-028
    context: "the write path this reuses — `appendRelationship` is the surgery `relateManyFileFirst` already applies, so a merged frontmatter block is formatted identically to one docdog wrote itself"
  - references: PROPOSAL-032
    context: "the parity rule this one sits outside of, deliberately: the rule runs MCP-tool to CLI-command, and merge-driver is the reverse — a CLI command with no MCP counterpart and no need for one, because git is its only caller"
---

# PROPOSAL-030: A union merge driver for the `relationships:` block

## Motivation

The `relationships:` block **is** the graph. Every branch that relates
anything edits it — and the records it relates *to* are the hubs:
OBS-011's context backfill drove DP-001, DD-034, PROPOSAL-003 and DD-070
to ~100% edge coverage precisely because everything points at them.

So concurrent authoring converges on the same few files, and:

```yaml
relationships:
  - references: DD-070
    context: "..."
+ - references: DD-051          # branch A appends
+   context: "..."
+ - supersedes: PROPOSAL-021    # branch B appends
+   context: "..."
```

is a guaranteed adjacent-line conflict. But the *correct* result plainly
contains **both** edges. That is not a conflict — it is a set union that
git renders as a conflict because it diffs lines and does not know the
block is a set.

## Design

### 1. The driver never touches a merge git can already do

Git calls the driver for every merge of a matching path, so the driver's
**first** act is to run the ordinary three-way text merge. If that comes
out clean — the overwhelmingly common case — write it and exit 0. Done.

Only when the plain merge **conflicts** does docdog logic engage. The
blast radius is therefore bounded by construction: the driver can only
ever act on a merge that already failed. **It cannot make a clean merge
worse.**

### 2. The intervention is an edge replay, not a YAML merge

The naive design parses all three sides into YAML, merges the trees and
re-serializes. Reject it: re-serialization reformats frontmatter, churns
every file it touches, and is impossible to fully trust.

Instead, when the conflict is confined to the `relationships:` block:

1. Read the relationship entries of base, ours, and theirs.
2. Three-way set merge on edge **identity** — `(type, target)`:
   - entries added by either side relative to base are **kept**;
   - entries removed by either side relative to base **stay removed**
     (a deletion is not resurrected by the other side's untouched copy).
3. Apply the delta to *ours* by calling `appendRelationship` for each
   entry theirs added that ours lacks.

Step 3 is the same line-based surgery `relateFileFirst` and
`relateManyFileFirst` already use to write edges (`src/storage/frontmatter.ts`).
So a merged block comes out formatted exactly like a block docdog wrote
itself — because it is one. No reformatting, no churn, no YAML
round-trip risk.

### 3. Everything else conflicts, loudly

| situation | result |
|---|---|
| body prose diverged | **conflict** — two agents rewriting a paragraph is a real semantic disagreement, and no mechanism should paper over it |
| both sides set a scalar (`status:`, `title:`, …) differently | **conflict** |
| both sides added the same `(type, target)` with **different** `context:` | **conflict** — see below |
| frontmatter fails to parse on any side | **conflict**, falling back to the plain text-merge output |

The same-edge-divergent-context case is the one worth being explicit
about: docdog **must not** pick a context. That is choosing which
sentence better describes a relationship — inference, DP-001 Tier 3,
forbidden in code. The driver refuses and leaves both for an agent.

Every ambiguity therefore resolves *toward* a conflict. The failure
direction is always "a human or agent looks at it", never "docdog
guessed."

### 4. `.gitattributes` is generated from `scan_paths`

The scope of the driver is exactly the set of files docdog manages, so
it is **derived from `config.yaml`'s `scan_paths`**, not hand-written
and left to rot:

```gitattributes
# >>> docdog managed — generated from .docdog/config.yaml scan_paths <<<
specs/**/*.md    merge=docdog
.docdog/**/*.md  merge=docdog
CONTRIBUTING.md  merge=docdog
# <<< docdog managed >>>
```

- **`docdog init`** generates the block, using the same delimited-block
  injection `injectClaudeMdBlock` already does for `CLAUDE.md` — so a
  user's own `.gitattributes` rules outside the markers are preserved.
- **`docdog index` warns** when the block no longer matches `scan_paths`,
  and names the drift. It does **not** silently rewrite a tracked file as
  a side effect of indexing — report, don't mutate (the `suggest-edges`
  precedent).
- Re-running `docdog init` regenerates the block idempotently.

### 5. Installation, and why it covers every worktree

Git will not let a repository ship an executable merge driver — otherwise
cloning a repo would be arbitrary code execution. So `.gitattributes`
(tracked) names the driver, and the **definition** must be local config:

```sh
git config merge.docdog.name   "docdog frontmatter-aware merge"
git config merge.docdog.driver "docdog merge-driver %O %A %B %L %P"
```

`docdog init` writes both.

**A clone that has not run `docdog init` gets git's default text merge** —
an ordinary conflict, i.e. exactly today's behavior. Safe degradation, in
the only direction an optional feature is allowed to fail.

And `git config --local` writes to the **shared** `.git/config`, which
every worktree of the clone reads. Install once, and all present and
future worktrees are covered — the same structural fact PROPOSAL-029
exploits for the embed store.

### 6. CLI surface

```
docdog merge-driver <base> <ours> <theirs> <marker-size> <path>
```

Plumbing, invoked by git, never by a user. It writes the merge result
into `<ours>` (git's contract) and exits 0 for a clean merge, non-zero
for a conflict.

## Principles walk

- **DP-001.** Union of a set is arithmetic — Tier 1. The one place
  judgment would be required (two contexts for one edge) is *refused*,
  not inferred. The `.gitattributes` scope is derived mechanically from
  config rather than guessed.
- **DD-050.** The second real Tier-2 feature. Git-*aware*, never
  git-*dependent*: nothing in the core calls this, and an uninstalled
  driver degrades to git's default. Tier 1 is untouched.
- **DD-034.** The rejected alternative is worth naming: moving edges to
  sidecar files (one file per edge) would let git merge them trivially
  and needs no driver at all — but the `relationships:` block lives *in*
  the record precisely so a vanilla agent reading `specs/` on disk sees
  it. The driver unions the block in place instead of dismantling the
  artifact.
- **FRICTION-012.** Union is *sufficient*, not merely convenient, because
  the forward-edge-only rule means an edge is written to exactly one
  file. Two branches adding edges append disjoint entries; they never
  contend over the meaning of one line.
- **DD-070 §4.** The MCP kernel 8 is untouched. The CLI does grow — by a
  plumbing subcommand that git invokes, not a user — which is the same
  proposal-gated path `suggest-edges` came back on, and is argued here
  rather than waved through.

## Deliberately not in scope

- **The id race** (DISC-026 corollary 1). The driver merges one path at a
  time; two worktrees minting `DD-072` produce two *different files*, so
  the driver never sees them together. It cannot help, and this proposal
  does not pretend otherwise.
- **Merging the body intelligently.** Prose conflicts are real conflicts.
- **A merge driver for anything but `relationships:`.** Other frontmatter
  keys are scalars, and scalars do not union.
- **Reviving DD-050 Tier 3 (patches).** This proposal plus corollary 1 is
  what *replaces* it (DISC-026).

## Touched surface

| file | change |
|---|---|
| `src/cli/commands/merge-driver.ts` | **new** — the plumbing entry point: plain 3-way merge first, edge replay on relationships-only conflict, conflict otherwise |
| `src/storage/merge.ts` | **new** — three-way set merge over `RelationshipEntry` by `(type, target)`; pure, unit-testable, no I/O |
| `src/storage/frontmatter.ts` | add a *reader* for relationship entries if the existing parse path is not reusable as-is; `appendRelationship` is reused unchanged |
| `src/cli/commands/init.ts` | generate the `.gitattributes` managed block from `scan_paths`; write the two `git config` keys |
| `src/cli/commands/index-cmd.ts` | warn when the `.gitattributes` block has drifted from `scan_paths` |
| `src/storage/git.ts` | shared with PROPOSAL-029 — gains the `git config` writes |
| tests | three-way set merge (add/add, add/delete, delete/delete, same-edge-divergent-context); driver end-to-end on real conflicting files; `.gitattributes` generation + drift detection |

## Open sub-questions — answered at implementation

1. **Ordering of appended edges.** *Answered: acceptable, not sorted.*
   Replay preserves ours' order and appends theirs', so two people merging
   in opposite directions get the same set in a different order. Sorting
   would rewrite lines nobody touched — the exact churn §2 exists to avoid
   — and the set is what gets indexed. The no-churn property is now pinned
   by a byte-equality test: the merged file is ours' bytes plus the
   appended entry, nothing else.
2. **Rename/`supersedes` interaction.** *Answered: tolerated dangling
   edge, no conflict.* The driver merges the id rename and the edge
   pointing at the old id cleanly, exactly as the sub-question described.
   That is the intended outcome: the indexer tolerates dangling edges by
   design (DD-070 §2) and `suggest-edges` surfaces them, so the failure
   lands in a report a human reads rather than in a merge conflict that
   blocks one. Conflicting here would also mean the driver *reasoning
   about ids*, which is not set arithmetic.

## Shipped (2026-07-14)

Built as designed; the three-sentence shape survived contact. Facts worth
recording that the design did not state:

- **The "is the conflict confined to `relationships:`?" test is a second
  text merge, not a parse.** Each side's block is swapped for one
  identical sentinel line and the same `git merge-file` runs again. If it
  comes out clean, the whole fight was over the edge list — git itself
  answers the question, so no code has to decide what "confined to" means.
  A conflict there is a conflict git would have had regardless of edges,
  and the driver emits the original conflicted text unchanged.
- **`appendRelationship` is reused literally, and ours' surviving entries
  are replayed as their own source lines** — not re-serialized. That is
  what makes the no-churn guarantee a byte-equality test rather than a
  formatting hope.
- **`readRelationshipsBlock` refuses a flow-style (`[{...}]`) block**, a
  case §2 never contemplated: an entry with no lines of its own cannot be
  replayed line-wise, so a block whose bullet count does not match its
  parsed entry count conflicts rather than getting rewritten.
- **`git config --local` is written on `docdog init`, and a repo-less
  directory just says so** and carries on — the `.gitattributes` block is
  still generated, since it is tracked content, and the driver simply lies
  dormant until someone defines it.
- **The drift warning is silent when the block is *absent*.** Only an
  existing block that no longer matches `scan_paths` is reported. A
  project that never installed the driver is a project git merges the
  ordinary way, and nagging it on every index would be noise.

Surface: `src/storage/merge.ts` (the set arithmetic, pure),
`src/cli/commands/merge-driver.ts` (the plumbing),
`src/engine/gitattributes.ts` (managed block + drift),
`src/storage/frontmatter.ts` (`readRelationshipsBlock`,
`spliceRelationshipsBlock`), `src/storage/git.ts` (`gitMergeFile`,
`gitConfigSet`), plus `init` and `index` wiring. 28 new tests (313 total),
including the driver end-to-end on files that really conflict, through the
real `git merge-file`.
