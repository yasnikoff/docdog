---
id: PROPOSAL-028
title: "suggest-edges --accept-from — a batch applier for reviewed edge candidates"
collection: proposals
status: shipped
date: 2026-07-13
description: "Close the write half of the suggest→review→accept loop. `docdog suggest-edges --format review` emits a flat YAML candidate list; the agent deletes rejects and writes a context per keeper; `docdog suggest-edges --accept-from <file>` applies each row as a forward edge in its source's frontmatter, grouped one write + one reindex per file, idempotent on re-run. No MCP tool, no schema bump, and — by construction — no way to apply a candidate nobody read."
relationships:
  - references: FRICTION-024
    context: "the evidence this proposal answers: the same bulk-accept step hand-scripted three times across two corpora, against a standing 3,947-candidate backlog"
  - extends: PROPOSAL-024
    context: "the v3 resurrection that shipped suggest-edges deliberately read-only; this adds the accept half without touching the scan half — and the read path stays write-free unless --accept-from is passed"
  - references: DP-003
    context: "clause 3 is the loop that produced this: three ad-hoc scripts for one recurring operation is the defined signal that the toolbelt has a gap — friction report first (FRICTION-024), then the proposal"
  - references: DP-001
    context: "tier walk: applying a list an agent authored and signed off on is Tier-1 mechanics; the judgment lives in the reviewed file, and no flag may ever apply an unreviewed candidate"
  - references: DP-002
    context: "an unrecognized relation type warns and applies — the registry is advisory data, it does not gate writes"
  - references: DD-070
    context: "kernel 8 stands: this is CLI-only, and nothing touches the SQLite schema — no SCHEMA_VERSION bump, no reindex of unrelated files"
  - references: OBS-011
    context: "the prior art being promoted: its relateFileFirst driver knew the correct write order, and its context backfill is why an empty context is refused by default here"
  - references: OBS-003
    context: "the first hand-scripted drain (131 edges) — recorded as a win, when the script was already the tell"
  - references: FRICTION-012
    context: "settles the write order this applier obeys: forward edge only, never the stored inverse — and the code-side inverse-form lint stays rejected, so this proposal does not reintroduce it"
  - references: DISC-023
    context: "why an unknown relation type warns rather than refuses — vocabulary is advisory, nothing in code enforces it"
  - references: FRICTION-019
    context: explains which guard fires on a corrupt source — a body-only-indexed file never gets its declared id into the cache, so naming it as `from:` resolves to nothing and skips as an unknown source
---

# PROPOSAL-028: `suggest-edges --accept-from`

## Motivation

`docdog suggest-edges` reports candidates and stops. Accepting them
means one `docdog_relate` per edge or a hand-edited frontmatter block,
so every bulk drain to date has been an ad-hoc script — three of them,
two corpora, two authors, one identical mechanical step (FRICTION-024;
131 edges in OBS-003, 271 in OBS-011, 50-of-3,947 in the orchestrator
adoption). DP-003 clause 3 names that pattern as the signal to build
the command, and this is its second instantiation.

The reason it keeps mattering: reverse-reference questions ("which
specs reference FR-PROV-01?") are the one class search cannot fake.
Only edges answer them, and edges only exist if accepting them is
cheap. A 3,947-candidate backlog with no applier is a backlog that
never drains.

## Design

### 1. The exchange format — `--format review`

A flat YAML document, emitted by the tool and consumed by the tool.
Round-trip symmetry is the property that matters: **what it emits is
exactly what it accepts**, minus the rows the agent deleted, plus the
context sentences the agent wrote.

```yaml
# docdog suggest-edges --format review --id 'DD-*'
# 445 candidates across 92 records.
# Delete the rows you reject. Write a context: for each row you keep.
# Apply with: docdog suggest-edges --accept-from candidates.yaml
version: 1
edges:
  # DD-070 — specs/decisions/dd-070-v3-architecture.md
  - from: DD-070
    to: DP-001
    type: references
    context: ""
  - from: DD-070
    to: DD-057
    type: supersedes
    context: ""
```

- **Flat, not nested by source.** Grouping is a `#` comment; the rows
  are a single list so rejecting a candidate is deleting one
  contiguous block, which is the operation the agent performs 90% of
  the time. The applier regroups by source itself.
- **Four load-bearing keys per row: `from`, `to`, `type`, `context`**
  (plus optional `anchor_text`). *Nothing else is data.* The source
  file path appears only as a comment: the applier resolves it from
  the cache, so a stale or hand-edited path cannot send a write
  somewhere unintended. This deletes a whole class of drift by not
  representing it.
- **`version: 1`** — an unknown version is a hard error, not a guess.
- **Non-recordable sources are omitted**, with a footer saying how
  many and why. Split/table/script-parsed files have no per-section
  frontmatter, so `relate` refuses them by construction (writes.ts)
  and so does this. Their candidates are exactly what `--format yaml`
  already serves: paste-ready fragments for a hand-edit. The two
  formats are not parallel shortcuts — they serve disjoint source
  populations, and the orchestrator's read-only split-parsed mirror is
  the live case for the second one.

### 2. The applier — `--accept-from <file>`

```
docdog suggest-edges --accept-from candidates.yaml [--dry-run] [--allow-empty-context]
```

**Validate everything, then write.** The file parses and every row is
guard-checked before a single byte is written. A malformed file exits
1 having touched nothing. There is no half-applied review file.

**One write and one reindex per source file, not per edge.** Rows
group by `from` → source vertex → source file; each file is read once,
gets all of its accepted relationships appended, is written once, and
is reindexed once. This is precisely what the three hand-scripts got
wrong — OBS-011's driver called `relateFileFirst` per edge and paid
271 single-file reindexes for 92 files.

**Per-row guards** (each skips its row, reports, and does not abort the
run):

| condition | behavior | why |
|---|---|---|
| `from` not in cache | skip row | can't resolve a file to write |
| source is not default-parsed | skip all its rows | `relate` refuses these; hand-edit path exists |
| edge already declared | skip row | makes re-running the same file a no-op |
| `context` empty | skip row, unless `--allow-empty-context` | OBS-011: bare edges are the ones we had to go back and backfill |
| relation type not registered | **apply**, warn | registry is advisory (DP-002, DISC-023) |
| target id unknown | **apply**, warn | the edge dangles honestly, as `relateFileFirst` already does |

**Idempotent by construction.** Re-running an accept file applies
nothing the second time (every row hits the already-declared guard) and
exits 0. That is what makes a 3,947-row backlog drainable in reviewed
batches without bookkeeping about which batch already landed.

**Forward edges only.** The `type` is written on the source, and the
inverse is never stored — FRICTION-012's convention, which the applier
obeys and does not police.

Summary line, and `--dry-run` prints exactly it without writing:

```
applied 271 edges across 92 files
skipped 12 — 8 already declared, 3 empty context (--allow-empty-context), 1 multi-record file
warned 6 — 4 unregistered type, 2 dangling target
```

Skips are normal, so they exit 0. Only a broken input file exits 1.

## Principles walk

- **DP-001 (agent-first mechanics) — passes, Tier 1.** Every semantic
  decision (is this candidate a real relationship? what type? what does
  the context sentence say?) is made by the agent *before* the tool
  runs, and the reviewed file is the written record of it. The applier
  reads a file, appends frontmatter, reindexes. The one thing that
  would violate the principle is the obvious "convenience" flag —
  `--accept-all`, or a confidence score that auto-accepts above a
  threshold. **That is Tier 3 and must never be built.** The review
  file is not an inconvenience to be optimized away; it is where the
  judgment lives, and the whole design is arranged so that the tool
  cannot apply a candidate nobody read.
- **DP-002 (concepts carry meaning) — passes.** An unregistered
  relation type warns and applies. Vocabulary is advisory data in
  concept records; it does not gate writes, and this proposal does not
  make it start.
- **DP-003 (comprehensive toolbelt) — this *is* the principle firing.**
  Clause 2 promises first-class tooling for common graph mutation;
  clause 3 says three scripts for one operation is a gap worth filing.
  Filed (FRICTION-024), now proposed. (Clause 2's command list is
  Arango-era and cites dead commands — noted, not fixed here; the v3
  escape hatch is a tsx script against `src/storage/writes.ts`, not
  arangosh, and the clause structure survives the substitution intact.)

## Deliberately not in scope

- **No MCP tool.** The kernel 8 stands (DD-070). `docdog_relate`
  already covers one-at-a-time accepts with context, which is what an
  agent does in conversation; bulk drain is a CLI operation on a file
  the agent authored. PROPOSAL-024 shipped the scan CLI-only for the
  same reason.
- **No `--accept-all`, no auto-accept, no confidence scoring, no
  suggested contexts.** See the DP-001 walk. This is the line.
- **No inverse-edge writing and no inverse-form lint.** FRICTION-012
  settled both: forward type only, and the code-side warning was
  rejected per DP-001/DISC-023.
- **No new candidate-scoring or ranking in the scan half.** The scanner
  is untouched by this proposal.
- **No schema change.** Nothing new is stored; edges are derived from
  frontmatter by the indexer exactly as today. No `SCHEMA_VERSION`
  bump, no full reindex.
- **No JSON input.** `--accept-from` consumes exactly what
  `--format review` emits, and nothing else. One syntax path.

## Touched surface

- `src/storage/accept.ts` *(new)* — parse + validate the review
  document, resolve sources against the cache, group by file, report.
- `src/storage/writes.ts` — a `relateManyFileFirst(options, edges[])`
  alongside `relateFileFirst`: same guards, one read/append/write and
  one `reindexCacheFile` per source file. The single-edge function
  keeps its behavior and becomes a one-element call.
- `src/cli/commands/suggest-edges.ts` — `--format review`,
  `--accept-from`, `--dry-run`, `--allow-empty-context`; the
  report-only contract stays true unless `--accept-from` is present,
  and the help text says so.
- `.docdog/skills/` — the populate/relate skills lead with the sweep
  today; they gain the accept half of the loop.
- Tests: round-trip (emit → apply → re-emit yields nothing), each
  guard row, grouped single-write-per-file, idempotent re-run,
  malformed input touches nothing, `--dry-run` writes nothing,
  non-recordable omission.

Estimated a day including tests. The prior art is three scripts deep;
this is mostly promoting `relateFileFirst`'s known-good write order to
a supported command and giving the review file a shape the tool both
emits and eats.

## Shipped (2026-07-14)

Landed as designed. `src/storage/accept.ts` owns the review format in
both directions (round-trip symmetry is a property of one module, not a
convention two modules agree on); `relateManyFileFirst` in
`src/storage/writes.ts` does the grouped write; the CLI gained
`--format review`, `--accept-from`, `--dry-run`, `--allow-empty-context`,
and refuses the latter two without the former. 16 new tests, 264 total.

Three things worth recording, because they only became visible in code:

**`relateFileFirst` did not become a one-element call**, as the touched-
surface section above predicted it would. Its guards *refuse* — NOT_FOUND,
DUPLICATE_EDGE, UNSUPPORTED_PARSER — and those error codes are the shipped
`docdog_relate` MCP contract. The batch path *skips* instead, because one
stale id must not cost a 3,947-row drain its other 3,946 edges. Folding
one into the other would have meant translating skips back into throws to
keep the kernel tool's behavior byte-identical: indirection bought with
risk to a shipped surface. They share the guards (`isDefaultParser`, the
declared-pair check) and not the control flow.

**A source whose frontmatter won't parse can't be named at all.** The
guard table has a "source not in cache" row and an (added) "unpatchable
frontmatter" row, and the interesting part is which one fires. A file with
malformed YAML frontmatter is indexed body-only (FRICTION-019), so the id
it *declares* never reaches the cache — naming it as `from:` resolves to
nothing and skips as an unknown source. The unpatchable row is reached by
the *other* corruption: valid YAML whose `relationships:` key is a scalar
rather than a list. Both skip, neither writes; the distinction is only in
what the report tells you to go fix.

**The write phase is all-or-nothing per file, and every patch is computed
in memory before any file is opened for writing.** A source that fails to
patch takes only its own rows down, and it does so with nothing yet on
disk — so a broken file in the middle of a batch cannot leave the corpus
half-drained.

Smoke-tested on this corpus: two edges into one file produced one write and
one reindex (`1 file(s), 1 reindexed`), embed cache reused, existing
frontmatter lines byte-identical. FRICTION-024 closes with this.
