---
id: PROPOSAL-023
title: "V3 storage: embedded SQLite cache over a disk-canonical corpus"
collection: proposals
status: shipped
date: 2026-07-06
related:
  - DD-070
  - PROPOSAL-022
  - DD-043
  - DD-051
  - FRICTION-011
  - FRICTION-015
  - OQ-20
  - OQ-21
  - DISC-019
  - DISC-020
relationships:
  - implements: DD-070
    context: "the storage-swap and cache-contract halves of DD-070 (commitments 2 and 3); the scope-cut half (workflow engine removal, tool pruning) is deletion work DD-070 already authorizes"
  - supersedes: PROPOSAL-022
    context: "carries its §3 one-tier edge materialization, §4 defaults-elide serializer, and §7 denormalized-column analysis — retargeted to disk-canonical. Rejects its §2 DB-first write path, §5 clobber-guard, and §6 index demotion: with disk canonical there is no export step to guard and index stays primary."
  - references: DD-043
    context: "the relationships: frontmatter block is the only place edges are born; the cache edges table is purely derived"
  - references: FRICTION-011
    context: "createVertexWithEdges (src/engine/create-vertex.ts) is the frontmatter→edges half that survives wholesale; the reverse (edge→frontmatter) half now runs at relate time against the file, not at export time against the DB"
  - references: FRICTION-015
    context: "under DB-first the denormalized-column fix was a write-path correctness invariant; under a disposable cache it relaxes back to a rebuildable projection — wrong columns are a reindex away from correct"
  - references: DD-051
    context: "content-hash keying of the embedding cache survives; the cache rows move from Arango to the SQLite cache file"
  - references: OQ-21
    context: "embedding-cache eviction becomes ordinary cache eviction under docdog gc"
  - references: DD-046
    context: collection-as-column restates DD-046's config-declared registry with the physical materialization dead
  - references: OQ-20
    context: the single edges table answers OQ-20 by construction
  - references: DP-001
    context: ranking mechanics are Tier-1 statistical per DP-001
  - references: DP-002
    context: cutover prereq — DP-002 concept meta re-seeded as indexed markdown
  - references: DISC-019
    context: normal mode becomes the disk kit — DISC-019's ejection framing dissolves
  - references: OBS-010
    context: step-7 retrieval eval result recorded there; harness frozen in tests/eval/
description: "Implementation proposal for DD-070's storage swap. One SQLite file at .docdog/cache/index.db (gitignored, disposable): a vertices table, a single edges table, a chunks table for section-granularity retrieval, FTS5 for BM25 keyword search (an upgrade over v2's unranked CONTAINS), and vectors via sqlite-vec where loadable with brute-force cosine as the guaranteed path. WAL + busy_timeout for multi-session safety. No migrations — schema version mismatch drops and rebuilds. Edges are born only in relationships: frontmatter; docdog_relate becomes file-first (patch the source vertex's block with PROPOSAL-022's defaults-elide serializer, reindex that file). Deletes src/arango/, src/workflow/, docdog infra, docdog migrate; tests drop Docker."
---

# PROPOSAL-023: V3 storage — embedded SQLite cache, disk-canonical

Implements DD-070 commitments 2 (disk-canonical, disposable cache)
and 3 (embedded storage). Rewritten from PROPOSAL-022 with the
canonicality arrow flipped: everything below assumes files are the
source of truth and the database is derived state.

## 1. What carries over from PROPOSAL-022

Three parts survive, retargeted:

1. **One-tier edge materialization (was §3).** Every semantic edge
   lives in the source vertex's `relationships:` block at full
   fidelity. Under disk-canonical this stops being an export
   obligation and becomes a birth rule: **edges are only ever born
   in frontmatter.** The cache's edges table is derived, never
   authoritative. The `source`/`discovered_via` provenance
   vocabulary from v2 (`EdgeSource = indexer|skill|human|...`)
   dissolves — with a single origin there is nothing to
   distinguish; drop the columns.
2. **Defaults-elide serializer (was §4).** Needed at `relate` time
   rather than export time: `docdog_relate` patches the source
   vertex's `relationships:` block deterministically, omitting
   fields at default values so diffs stay readable. Same rules,
   new call site.
3. **Denormalized-column analysis (was §7 / FRICTION-015).** The
   invariant *relaxes*: cache columns are rebuildable projections
   again. A wrong column is a bug, but the fix is reindex, not a
   migration or a data repair.

Rejected with the DB-first framing: the DB-first-then-export write
path (§2), the `last_export_sha` clobber-guard (§5 — nothing
overwrites disk out-of-band because nothing but the agent writes
disk), and the demotion of `docdog index` to bootstrap (§6 —
index is and stays the primary derivation step).

## 2. Storage layout

One file: `.docdog/cache/index.db`, gitignored, disposable.

- **`meta`** — `schema_version`, embed model id, corpus fingerprint.
  Version mismatch on open → drop all tables, rebuild from disk
  (DD-070 §2: no migrations, ever).
- **`vertices`** — `id` PK, `collection`, `status`, `title`,
  `description`, `file_path`, `content_hash`, `frontmatter_json`,
  `body_text`. One row per record; `collection` is a column, not a
  physical table per type (DD-070 supersedes DD-046's
  materialization; the config-declared type registry still
  validates values).
- **`edges`** — `from_id`, `to_id`, `type`, `context`,
  `extra_json`. The single edges table that answers OQ-20 by
  construction. Derived exclusively from `relationships:` blocks
  by the indexer (FRICTION-011's `createVertexWithEdges` path).
- **`chunks`** — `vertex_id`, `ord`, `heading_path`, `start_line`,
  `end_line`, `text`, `embedding BLOB`. The home for
  section-granularity retrieval: search can return a section and
  its file+line span instead of a whole record, saving consumer
  context. Initial search may rank at vertex granularity; the
  schema supports section granularity from day one.
- **`fts`** — FTS5 virtual table over title/description/body,
  BM25-ranked. This replaces v2's unranked `CONTAINS` keyword
  search (src/types/graph.ts noted "no score" as a known gap) —
  a strict upgrade.
- **Vectors** — `sqlite-vec` virtual table when the extension
  loads; **guaranteed designed path is brute-force cosine** over
  `chunks.embedding` in JS. At docdog scale (10²–10⁴ chunks,
  768-dim) brute force is milliseconds; the extension is an
  accelerator, never a requirement.

Concurrency: WAL mode + `busy_timeout` set at open. This is the
multi-session reality (a `docdog serve` MCP process and a
`docdog index` CLI run concurrently): N readers + one writer with
queued writers is sufficient for batch indexing plus small tool
writes, but only if WAL is on — otherwise `SQLITE_BUSY` surfaces
exactly in normal use.

## 3. Search

Hybrid: run FTS5 (BM25) and vector similarity, merge with a simple
score fusion (reciprocal-rank is fine to start), return vertex or
chunk hits with file+line spans. Ranking mechanics are Tier 1 per
DP-001 (statistical, not judgmental). Embedding pipeline is
unchanged: in-process ONNX (`nomic-ai/nomic-embed-text-v1`)
default, Ollama opt-in provider, content-hash cache per DD-051.

## 4. Traversal

V2 had exactly one traversal shape: bounded-depth
directional walk (src/arango/queries.ts). Port it as a recursive
CTE or a short JS BFS over `edges` — identical semantics, label
resolution via the existing relations registry
(src/engine/relations-registry.ts) untouched.

## 5. Deletions

`src/arango/` (driver, setup, graph, queries, migrations),
`src/workflow/` + `dd_task_runs` + predicates, `docdog infra`,
`docdog migrate`, soft-delete/restore/TTL GC (gc becomes cache
eviction: rows for deleted files, stale embeddings). Tests drop
the Docker dependency entirely and run against a temp cache file —
the suite gets faster and CI-trivial.

## 6. Known gaps, accepted

- **Fuzzy matching.** FTS5 has no Levenshtein. Agents reformulate
  failed queries, which covers most of the human use case for
  fuzziness; a trigram tokenizer is the escape hatch if it ever
  matters.
- **No DB web UI.** Arango's browser UI (and graph visualizer)
  goes away. `sqlite3`/DB Browser cover table inspection; a
  `docdog export --mermaid` view is a cheap future nicety if
  missed. The canonical graph remains readable as markdown.
- **Native modules.** better-sqlite3 and onnxruntime both ship
  prebuilds for mainstream platforms; when a platform breaks the
  embedder install, the Ollama provider is the documented
  fallback. Zero *service* dependencies stands.

## 7. Implementation order

1. **Cutover prereqs** (DD-070 §7): one-time `docdog export` of
   DB-only content, commit; re-seed DP-002 meta as markdown under
   `.docdog/`; drop `dd_task_runs`.
2. **Storage module**: schema above + open/rebuild logic behind
   the existing engine interfaces.
3. **Indexer retarget**: remark pipeline and reconcile write to
   SQLite; single-file reindex path for tool writes.
4. **Search + traverse** on the new store (FTS5 + vector fusion;
   CTE/BFS).
5. **Kernel MCP/CLI retarget**: same tool names, file-writing
   create/update/relate, prune per DD-070 §4.
6. **Deletions** (§5) + test migration off Docker.
7. **Retrieval eval**: docdog vs ripgrep-baseline (and vs
   vault+generic-MCP) on this repo's corpus — the product
   validation DD-070's rationale demands.

## 8. Not in scope

- Section-granularity *ranking* tuning (schema ships; tuning is
  eval-driven follow-up).
- `docdog eject` / ejected-mode ceremony — moot: normal mode *is*
  the disk kit now; DISC-019's ejection framing dissolves.
- Any shared/remote cache — dropped per DD-070 §5.
- Renumbering, spec rewrites beyond DD-070's frozen supersession
  set.

## Status

Proposed 2026-07-06, implementing DD-070. **Implemented 2026-07-11:**
§7 steps 1–6 shipped across v3 sessions 1–6 (cutover prereqs; storage
module; indexer retarget; search + traverse; file-first kernel
writes; step-6 deletions — src/arango/, src/workflow/, Docker suite,
arangojs, CLI/MCP prune all landed). Step 7 (retrieval eval — docdog
vs ripgrep baseline on this corpus, the validation DD-070 §8 demands)
ran 2026-07-11 in v3 session 7: hybrid 80% Hit@1 / 0.871 MRR vs
grep-rank 30% / 0.446 over 40 frozen queries; fusion beat both
isolated legs; §6's accepted gaps drew no failures. Result recorded
as OBS-010; harness + frozen query set live in `tests/eval/`.
