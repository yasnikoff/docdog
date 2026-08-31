---
id: PROPOSAL-005
title: Doc-id code-reference tracking — `docdog refs` feature
collection: proposals
status: superseded
date: 2026-04-12
related:
  - FR-001
  - DP-001
  - DISC-009
  - PROPOSAL-004
relationships:
  - discussed_in: DISC-009
  - implements: FR-001
    context: first concrete application of the opt-in feature pattern
  - depends_on: PROPOSAL-006
    context: step 1 needs dd_collection_meta for dd_code_refs creation
  - references: DP-001
    context: scanner and reconciler are Tier 1, id patterns ship as Tier-2 visible config
  - references: PROPOSAL-004
  - references: EJ-017
  - references: OQ-42
  - references: FRICTION-006
  - references: EJ-013
  - references: DISC-007
  - references: DP-002
  - references: DISC-010
  - references: DP-003
  - references: PROPOSAL-003
    context: explicitly not a dependency — code refs land in dd_code_refs, independent of the edge work
  - references: OQ-43
description: "SUPERSEDED at the v3 pivot: dd_code_refs and the FR-001 opt-in feature rail died with v2 (DD-070 §3), and no v3 successor is committed — the nearest living relative is docdog suggest-edges (PROPOSAL-024), which scans indexed records rather than source code. A code-scanning revival would be a new proposal. Original pitch: scan source code for doc-id occurrences, store them in dd_code_refs, provide traceability queries."
---

# PROPOSAL-005: Doc-id code-reference tracking (`docdog refs`)

**Status note (2026-07-11, FEATURE-002):** superseded — `dd_code_refs`,
the `refs` command namespace, and the FR-001 opt-in rail all died at
v3 step 6 (DD-070 §3). The code→doc traceability need itself has no
committed v3 answer; `docdog suggest-edges` (PROPOSAL-024) covers
only doc→doc mentions. Reviving code scanning would be a new
proposal against the v3 kernel.

## Motivation

Projects that reference docdog ids in source code (e.g. `# implements
EJ-017` in a Python docstring, `// per DD-ARCH-09` in a Go file)
create a traceability link between code and docs. Today docdog has no
way to surface this link — the ids exist in the code, but docdog can't
answer "show me all code that references EJ-017" or "what docs does
this file reference?"

This proposal adds a first-class, opt-in feature for scanning source
code for doc-id occurrences and storing them in a queryable collection.

**User-driving context:** the orchestrator project bootstrap is blocked
on this feature. User: *"i'll not bootstrap the orchestrator without
that feature."*

## DP-001 + FR-001 compliance

This is the **first proposed feature that tests FR-001 as the feature
delivery pattern.**

- **Default off** (FR-001 clause 1): shipped config has `code_refs.enabled:
  false`; `docdog init` does not create `dd_code_refs` on a fresh project
  unless the user opts in.
- **Applicability detector** (FR-001 clause 2): `docdog features scan`
  runs a preview regex pass over default code scan paths and reports
  counts. No judgment — just facts.
- **Own command namespace** (FR-001 clause 3): `docdog refs scan`,
  `docdog refs find`, `docdog refs list`. No cross-cutting flags on
  `docdog index`.

Scanner and reconciler are Tier 1 under DP-001 (deterministic regex
walk + state reconciliation). Default id patterns ship as visible
config (Tier 2). No semantic judgment anywhere in code.

## Specification

### 1. Storage: `dd_code_refs` collection

New collection created by `docdog refs scan` on first invocation if
the feature is enabled. Regular document collection; one document per
occurrence (per DISC-009 §7):

```yaml
_key: auto
doc_id: EJ-017
file: src/indexer.ts
line: 142
col: 7
context: "  // per EJ-017: source_file points to the section file"
match_text: "EJ-017"
indexed_at: "2026-04-12T16:00:00Z"
file_hash: "abc123..."          # for incremental reconcile
```

**Indexes:**
- Secondary on `doc_id` — primary query ("find refs to X")
- Secondary on `file` — reverse query ("what docs does this file reference?")
- Secondary on `file_hash` — incremental reconcile fast-path

### 2. Config

New section in `.docdog/config.yaml`:

```yaml
code_refs:
  enabled: false                  # opt-in per FR-001 clause 1
  scan_paths:
    - src/
    - lib/
  file_patterns:
    include: ['*.ts', '*.tsx', '*.py', '*.go', '*.rs', '*.js', '*.jsx', '*.java', '*.kt', '*.rb']
    exclude:
      - '**/node_modules/**'
      - '**/dist/**'
      - '**/build/**'
      - '**/.git/**'
      - '**/target/**'
  id_patterns:
    - '[A-Z]{2,}-\d+'             # EJ-017, DD-ARCH-09, OQ-42, FRICTION-006
  context_chars: 120              # characters of surrounding text to snapshot
```

All fields visible, editable, no hidden defaults.

### 3. Scanner (Tier 1 — mechanical)

Walk `code_refs.scan_paths`, apply `file_patterns` include/exclude,
for each matching file:

1. Read file content
2. Compute file hash
3. Apply `id_patterns` regex; for each match, record `(doc_id, line,
   col, context)` with `match_text` captured verbatim
4. Output a list of `CodeRefOccurrence` records for this file

No heuristics, no false-positive filtering at scan time. Regex matches
the entire file content. False positives (a variable name matching
`[A-Z]{2,}-\d+` by coincidence, for example) are accepted and cleaned
up via the gc loop (see §6).

### 4. Reconciler (mirrors vertex reconcile pattern)

On `docdog refs scan`, for each file:

1. **Fast-path:** look up existing `dd_code_refs` entries where `file
   == <path>`; if their `file_hash` matches the current file hash,
   skip the file entirely (no changes).
2. **Reconcile:** extract current occurrences; compare against existing
   by composite key `(file, line, doc_id, match_text)`:
   - New occurrence → insert
   - Existing with changed `context` (nearby code changed) → update
   - Existing with no new match → soft-delete (file or line content
     shifted)
3. **Update `file_hash`** on all surviving entries for this file.

File removal: when a file is removed from scan_paths or deleted on
disk, all `dd_code_refs` entries for that file are soft-deleted on the
next scan.

### 5. Commands

**`docdog refs scan`** — run the scanner, reconcile state. Output:

```
refs scanning...
  Scanned 312 file(s)
  47 unchanged, 265 recomputed
  Occurrences: 118 (12 new, 3 updated, 5 soft-deleted)
```

**`docdog refs find <doc_id>`** — list all code occurrences of a
specific doc id:

```
EJ-017 — 3 occurrences:
  src/engine/indexer.ts:142   // per EJ-017: source_file points to the section file
  src/engine/parsers/types.ts:18   // EJ-017 compliance — one section = one file
  tests/integration/indexer.test.ts:234   // verifies EJ-017 behavior
```

**`docdog refs list`** — aggregated counts by doc id:

```
Top referenced doc ids:
  EJ-017     7
  EJ-013     5
  DD-ARCH-09 4
  OQ-42      3
  ...
```

Flags: `--file <path>` (filter), `--older-than <dur>`, `--json`,
`--doc-id <id>` (filter on list), etc.

**`docdog refs detect`** — the FR-001 applicability detector. Runs a
**preview scan** (no writes to `dd_code_refs`) and reports signal
counts. Called by `docdog features scan` when probing which features
apply to this project.

```
code-refs detector:
  Scanned 312 file(s) in src/, lib/
  Pattern [A-Z]{2,}-\d+ matched 118 times across 47 files
  Top matches: EJ-017 (7), EJ-013 (5), DD-ARCH-09 (4)
```

No state is written during detection — it's a read-only preview.

### 6. gc integration — false positive cleanup

`docdog gc list` (from PROPOSAL-004) gains a `--code-refs` flag.
Output enumerates `dd_code_refs` entries for agent/user review:

```
$ docdog gc list --code-refs --doc-id XY-99
CODE REFERENCES (matched XY-99)
  _key       file                        line   context
  abc123     src/legacy/stuff.ts         89     const XY_99_LIMIT = 1024  // false positive
  def456     src/test/fixture.ts          12     // XY-99 test case
  ...
```

The agent reviews, decides which are real and which are false
positives, issues targeted `docdog gc hard-delete <_keys>`. This
mirrors the orphan-cleanup pattern: mechanical enumeration + agent
judgment + explicit delete. No auto-filter, no heuristic "is this a
real id" code.

**This is a minor amendment to PROPOSAL-004** — the `--code-refs` flag
is new.

### 7. No cascade from vertex soft-delete

When `EJ-017` the vertex is soft-deleted (file removed, sections
reparsed), `dd_code_refs` entries for `EJ-017` are **not** cascaded.

**Rationale** (DISC-009 §5): code references to a deleted doc id are
a **useful stale signal** — the agent/user should see "code still
mentions EJ-017, but EJ-017 was removed." Killing the refs hides the
signal. The staleness itself is information.

Cleanup happens via the gc loop when the user decides the stale refs
are no longer interesting: `docdog gc list --code-refs --doc-id EJ-017`
enumerates them; agent and user review; explicit deletion.

This is a **deliberate asymmetry** from edge cascade (DISC-007):
edges are intra-graph structure where a dangling reference is noise;
code refs are external signals where staleness is signal.

### 8. MCP tool

`docdog_find_code(doc_id, limit?)` — returns the same data as
`docdog refs find` but as a structured response for agent consumption:

```json
[
  {
    "doc_id": "EJ-017",
    "file": "src/engine/indexer.ts",
    "line": 142,
    "col": 7,
    "context": "  // per EJ-017: source_file points to the section file",
    "indexed_at": "2026-04-12T16:00:00Z"
  },
  ...
]
```

Complementary MCP tool: `docdog_find_doc_refs(file_path, limit?)` —
the reverse query, returning all doc ids referenced in a specific
file.

### 9. Applicability detector hook

When the broader `docdog features scan` command is implemented, it
calls `docdog refs detect` (§5) to get the code-refs signal for its
feature listing. Until that command exists, `docdog refs detect`
stands alone and can be invoked directly by agents or users exploring
whether to enable the feature.

## Enabling the feature

```
# 1. User/agent explores
$ docdog refs detect
code-refs detector:
  Scanned 312 file(s) in src/, lib/
  Pattern [A-Z]{2,}-\d+ matched 118 times across 47 files

# 2. User decides to enable
$ docdog refs enable
Enabled code_refs in .docdog/config.yaml
Created collection dd_code_refs
Run `docdog refs scan` to populate.

# 3. First scan
$ docdog refs scan
refs scanning...
  Scanned 312 file(s)
  Occurrences: 118 (118 new)

# 4. Ongoing
$ docdog refs find EJ-017
...
```

Alternatively, user edits `.docdog/config.yaml` directly
(`code_refs.enabled: true`) and runs `docdog refs scan`. The
`enable` subcommand is sugar.

## Estimated effort

Small.

- **Collection init** (~20 LOC): create `dd_code_refs` on first
  enable, set up secondary indexes
- **Config schema** (~30 LOC): `code_refs` section validation
- **Scanner** (~120 LOC): file walking, pattern matching, context
  extraction, gitignore honoring
- **Reconciler** (~80 LOC): fast-path by file_hash, per-file
  reconcile with composite-key matching
- **`refs scan`** command (~30 LOC)
- **`refs find`** command (~40 LOC)
- **`refs list`** command (~30 LOC)
- **`refs detect`** command (~40 LOC)
- **`refs enable`/`refs disable`** commands (~30 LOC)
- **MCP tools** `docdog_find_code` + `docdog_find_doc_refs` (~60 LOC)
- **gc `--code-refs` flag** in PROPOSAL-004 (~20 LOC)
- **Tests** (~250 LOC integration + unit): fresh enable flow, scan +
  reconcile, file modification, file deletion, pattern override, gc
  cleanup path, MCP tool response shape

**Total:** ~500 LOC + ~250 LOC tests. Contained, self-sufficient.

## Dependencies

- **FR-001** (accepted) — the opt-in pattern this feature implements
- **DP-001** — compliance checked; all three tiers respected
- **DP-002** (accepted in DISC-010) — compliance requires that the
  new `dd_code_refs` collection has a `dd_collection_meta` entry at
  creation time. **BLOCKS on PROPOSAL-006 step 1** (core meta
  collections + seed + read CRUD) so the meta collection exists
  before step 1 here needs to write into it.
- **DP-003** — `docdog refs` command namespace covers the common
  operations; direct DB access to `dd_code_refs` remains allowed as
  the escape hatch.
- **PROPOSAL-004** — amendment to add `--code-refs` flag to `gc list`
  (tiny); doc-refs feature does not block PROPOSAL-004 shipping
- **PROPOSAL-006** — blocking for step 1; the `dd_collection_meta`
  entry for `dd_code_refs` is written as part of `docdog refs enable`
- **Nothing else** — no dependency on PROPOSAL-003, OQ-42, OQ-43, or
  any edge work

## Not in scope

- **Language-aware parsing** (comment vs code distinction). MVP scans
  all file content with regex. False positives in literal strings or
  variable names get cleaned via the gc loop. A future iteration can
  add language-aware filtering behind a config flag if false-positive
  noise becomes a problem.
- **Git-history-aware refs.** The scanner sees the current working
  tree only. Previous occurrences in git history are not captured.
- **Cross-project refs.** A single `dd_code_refs` collection per
  project; no federation.
- **Editing / auto-linking from docs to code.** One-directional
  storage only — code refs → doc ids. The reverse (finding docs that
  should mention a given file) is not supported.

## Implementation plan — three landing steps

Implementation is split into three independently shippable steps.
Each commits when tests pass. The feature becomes partially usable
after step 1; fully usable after step 2; fully integrated after step 3.

### Step 1 — Scanner + collection + reconciler (~280 LOC)

*(Estimate bumped from ~250 to ~280 LOC to account for the
`dd_collection_meta` entry write at enable time, per DP-002.)*

Mechanical core. `docdog refs scan` works end-to-end, `dd_code_refs`
populated, reconcile handles add/update/soft-delete correctly. A
`dd_collection_meta` entry describing `dd_code_refs` is written at
enable time, satisfying DP-002.

Deliverables:
- `dd_code_refs` collection setup (indexes on `doc_id`, `file`,
  `file_hash`)
- **`dd_collection_meta` entry for `dd_code_refs`** written at
  `docdog refs enable` time (description, when_to_use, examples).
  Depends on PROPOSAL-006 step 1 having created `dd_collection_meta`.
- `code_refs` config schema + validation
- Scanner module (walk, regex, context extraction, gitignore)
- Reconciler (per-file, file_hash fast-path, composite-key matching)
- `docdog refs scan` subcommand
- `docdog refs enable` / `refs disable` subcommands (flip config
  flag, create collection on enable, write meta entry on enable,
  remove meta entry on disable)
- Integration tests: fresh enable → scan → reconcile → second scan
  no-op, file modification, file deletion, pattern override. **Plus
  verification that `docdog collections describe dd_code_refs`
  returns the expected meta after enable.**

### Step 2 — Query commands + MCP tools (~150 LOC)

User-facing query surface.

Deliverables:
- `docdog refs find <doc_id>` subcommand
- `docdog refs list` subcommand (aggregated counts)
- `docdog refs detect` subcommand (preview scan for FR-001 detector)
- `docdog_find_code` MCP tool
- `docdog_find_doc_refs` MCP tool
- Query-shape tests, empty-result tests, large-result-set tests

### Step 3 — Opt-in plumbing + gc integration (DEFERRED)

*(Explicitly deferred per user direction during DISC-009 follow-up.
Step 3 lands after steps 1 and 2 have been exercised and after
PROPOSAL-004's `docdog gc` reshape is implemented, since this step
integrates with the new gc command surface.)*

Deliverables when resumed:
- `docdog gc list --code-refs` flag plumbing
- `--doc-id` filter on `docdog gc list`
- `docdog gc list` output formatting for code-ref records
- Integration tests: enumerate code refs, filter by doc_id, hard-delete
  false positives through the gc loop

## Status

Proposed. Steps 1 and 2 scheduled for implementation next. Step 3
deferred pending PROPOSAL-004 gc reshape landing. Self-contained
first PROPOSAL implementation serving as the reference for the
opt-in feature pattern.
