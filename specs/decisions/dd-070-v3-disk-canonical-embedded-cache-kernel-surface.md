---
id: DD-070
title: "V3: disk-canonical corpus, embedded disposable cache, kernel surface"
collection: decisions
status: current
date: 2026-07-02
description: "Umbrella decision for v3. Three commitments: (1) the workflow engine is removed — DD-066 reaffirmed and enforced; (2) markdown files + frontmatter are the single source of truth and the database becomes a disposable local cache — PROPOSAL-022's DB-first framing rejected; (3) ArangoDB + Docker is replaced by an embedded SQLite index (FTS5 + vectors) — zero service dependencies. Supersedes eight decisions, moots three proposals, answers four open questions. Storage specifics in PROPOSAL-023."
relationships:
  - supersedes: DD-065
    context: "the two-tier published/working split collapses — there is no DB-only tier; everything canonical lives on disk"
  - supersedes: DD-069
    context: "features stop being DB-first; the templates-user-owned half survives and is restated in §6"
  - supersedes: DD-062
    context: "forward-only migrations die — a disposable cache is dropped and rebuilt, never migrated"
  - supersedes: DD-049
    context: "opaque keys and soft-delete+TTL GC were DB-canonical mechanics; gc becomes cache eviction, deletion means deleting the file"
  - supersedes: DD-058
    context: "the single-ArangoDB-database model dies with Arango; scope-as-field survives in the cache schema"
  - supersedes: DD-061
    context: "docdog_<project> database naming dies with Arango; the template set (minimal/structured/workflow) survives per §6"
  - supersedes: DD-056
    context: "Foxx services are moot without ArangoDB; TypeScript core is unaffected"
  - supersedes: DD-046
    context: "config-declared typed collections survive as frontmatter routing; the Arango collection-per-type materialization dies"
  - references: DD-066
    context: "reaffirmed and enforced — v3 deletes the shipped workflow interpreter that violated it"
  - references: DD-043
    context: "reaffirmed and strengthened — the relationships: frontmatter block is now the only canonical edge store"
  - references: DD-034
    context: "reaffirmed — disk-canonical makes artifact-resilience the architecture, not just a test"
  - references: DD-035
    context: "reaffirmed — the .docdog/ opt-in marker and scope rules carry into v3 unchanged"
  - references: DD-039
    context: "reaffirmed — git history as archive extends to git as the collaboration substrate (§5)"
  - references: DISC-019
    context: "the disk-kit ejection discussion whose sync-asymmetry findings this decision resolves in the opposite direction from PROPOSAL-022"
  - references: DISC-020
    context: "the shared-remote-Arango collaboration path explored there is explicitly dropped (§5)"
  - references: PROPOSAL-022
    context: "DB-first normal mode rejected; its serializer, one-tier edge materialization, vocabulary reconciliation, and FRICTION-015 invariant carry into PROPOSAL-023"
  - supersedes: PROPOSAL-018
    context: workflow interpreter deleted; P-018 set superseded in this decision's batch pass
  - supersedes: PROPOSAL-007
    context: Arango named graph mooted by the storage swap; set superseded in the batch pass
  - supersedes: PROPOSAL-021
    context: sync policy + export bridge mooted — no second store; set superseded in the batch pass
  - references: WF-001
    context: workflow documents WF-001..006 survive as ordinary markdown records; only the interpreter dies
  - references: PROPOSAL-023
    context: the storage spec implementing commitments 2 and 3 (schema and cutover mechanics)
  - references: OQ-20
    context: resolved by construction — the single edges table answers the boundary question
  - references: OQ-22
    context: resolved — git is the collaboration substrate (§5)
  - references: OQ-31
    context: resolved — no export policy needed once nothing is DB-only
  - references: OQ-32
    context: resolved — writes are disk-first
  - references: FR-001
    context: amends FR-001's core feature list to the §4 CLI set
  - references: PROPOSAL-024
    context: "§4 amendment (2026-07-11): suggest-edges resurrected as a read-only cache scan"
  - references: OBS-003
    context: usage evidence behind the §4 suggest-edges amendment
  - references: DD-050
    context: git-optional ladder holds for single-machine use; collaboration is the git tier
  - references: DP-002
    context: concept metadata re-seeded as indexed markdown, preserving DP-002's searchable-meaning property
  - references: FRICTION-006
    context: structural sync bug motivating the single writable store
  - references: FRICTION-009
    context: structural sync bug motivating the single writable store (slash-list mention with FRICTION-006)
  - references: FRICTION-011
    context: structural sync bug motivating the single writable store (slash-list mention with FRICTION-006)
  - references: FRICTION-015
    context: structural sync bug motivating the single writable store (slash-list mention with FRICTION-006)
  - references: OQ-40
    context: two-writable-stores question mooted by making disk the only writable store
  - references: DP-001
    context: DP-001 check — indexing disk to cache is Tier-1 mechanics, no new judgment in code
  - references: DP-003
    context: DP-003 check — smaller toolbelt, better escape hatch (direct SQL against the cache)
  - references: WF-003
    context: the frozen supersession batch pass executed under WF-003 as one mechanical commit
  - references: PROPOSAL-032
    context: "§4 amendment (2026-07-14): the CLI gains get/status/traverse/relate as counterparts to the MCP kernel — the same proposal-gated way suggest-edges came back; the MCP kernel 8 itself is unchanged"
  - references: PROPOSAL-030
    context: "§4 amendment (2026-07-14): the CLI gains merge-driver — the one command that grows the CLI without growing the user surface, since git invokes it and a user never does; the MCP kernel 8 is unchanged"
  - references: PROPOSAL-031
    context: "§4 amendment (2026-07-14): the CLI gains renumber — new capability, not a resurrection, since no version of docdog could rename an id; contested ids ride docdog_status rather than becoming a ninth tool, because two files claiming one id is health"
  - amends: DD-068
    context: "the Arango-only half: a disposable cache cannot hold enrichment, so v3 write tools refuse split-parsed sections instead"
---

# DD-070: V3 — disk-canonical corpus, embedded disposable cache, kernel surface

Decided in discussion 2026-07-02; recorded 2026-07-06. The source
discussion is conversation-only (not captured as a DISC record) —
this decision is the canonical statement of the v3 direction and
carries the full rationale.

## Statement

V3 is a **scope cut plus a storage swap**, executed on branch `v3`
off `v2`. It is not a rewrite: IDs, the decision corpus, the remark
pipeline, parsers, reconciliation, skills, and refs all continue.
DD numbering continues from this record.

Three commitments:

1. **The workflow engine is removed.** `src/workflow/`, the
   `dd_task_runs` collection, the run predicates, and the
   gate/delegate/pause execution markers shipped under PROPOSAL-018
   are deleted. DD-066 said docdog is a memory layer, not a workflow
   engine; the interpreter violated it and v3 enforces it. Workflow
   *documents* (WF-001..006 and any user process docs) are ordinary
   markdown records and stay.

2. **Disk is canonical; the database is a disposable cache.**
   Markdown files with YAML frontmatter — including the
   `relationships:` block (DD-043) — are the single source of truth
   for every record. The database holds only derived state
   (index, embeddings, denormalized edges) and can be deleted and
   rebuilt from disk at any time with zero information loss.
   PROPOSAL-022's DB-first normal mode is rejected. Write path for
   agents: edit the file (or call a create/update tool that edits
   the file), then reindex.

3. **ArangoDB + Docker is replaced by an embedded index.** SQLite
   (better-sqlite3) with FTS5 for ranked keyword search and a
   vector table (sqlite-vec where available; brute-force cosine as
   the guaranteed designed path) for semantic search. No server, no
   container, no experimental flags. `npm install` is the entire
   dependency story; in-process ONNX embedding remains the default
   with Ollama as an opt-in provider. Schema and cutover mechanics
   live in PROPOSAL-023.

## 2. The cache contract

- `docdog index` builds the cache from disk; it is the only writer
  of canonical-derived state.
- Deleting the cache directory (`.docdog/cache/`, gitignored) is
  always safe. There are no migrations (supersedes DD-062): a
  schema version bump means drop and rebuild.
- `docdog gc` becomes cache eviction (stale embeddings, rows for
  deleted files). Deleting a record means deleting its file.
- Export-as-sync dies. There is nothing to export in normal
  operation because nothing canonical lives only in the DB. The
  `docdog export` command is retained once, as the pre-cutover
  step (§7), then removed or repurposed.
- The six `dd_edges_*` collections collapse into a single edges
  table. OQ-20's boundary question is thereby answered by
  construction.

## 3. What dies

| Surface | Disposition |
|---|---|
| `src/arango/` (driver, setup, graph, queries, migrations) | replaced by SQLite storage module |
| `src/workflow/` + `dd_task_runs` + run predicates | deleted |
| `docdog infra` (Docker lifecycle) | deleted |
| `docdog migrate` | deleted — drop-and-rebuild |
| Soft-delete, TTL indexes, restore | deleted — files + git are the archive (DD-039) |
| Workflow/discuss/recent/meta MCP tools beyond the kernel | deleted |
| `workflow` template's interpreter-coupled parts | pruned; document templates stay |
| Docker from the dev loop and test suite | tests run against embedded SQLite |

## 4. Kernel surface

The MCP surface shrinks to the retrieval/write kernel:
`docdog_search`, `docdog_get`, `docdog_traverse`, `docdog_relate`,
`docdog_create`/`docdog_update` (file-writing, not DB-writing),
`docdog_index`, `docdog_status`. Tool names are unchanged so
existing consumers don't notice the storage swap. The CLI keeps
`init`, `index`, `search`, `serve`, `add`, `split`, `gc`
(as eviction), `templates`, `run`. FR-001's core list is amended
accordingly (`infra` and `migrate` leave the core by ceasing to
exist).

*Amended 2026-07-11 by PROPOSAL-024: `suggest-edges` returns to the
CLI list — the one pruned command with usage evidence behind it
(OBS-003), resurrected for corpus adoption as a read-only cache
scan. The MCP kernel above is unchanged.*

*Amended 2026-07-14 by PROPOSAL-032: the CLI gains `get`, `status`,
`traverse`, and `relate` — counterparts to the MCP kernel tools of
the same name, each a second thin adapter over the storage function
the MCP handler already wraps. The asymmetry they close was
incidental to the §3 pruning rather than intended by it: a
shell-only caller could previously reach only `search` and `index`,
leaving DP-003's escape hatch (raw SQL) as the sole path to reading
a record by id. The standing rule is now: every MCP kernel tool has
a CLI counterpart wherever the shell can express its inputs. The
two body-bearing writes, `docdog_create` and `docdog_update`, are
the stated exception — multi-line markdown resists shell quoting,
and MCP remains their surface until usage argues for a `--file`
path. The MCP kernel 8 is, again, unchanged.*

*Amended 2026-07-14 by PROPOSAL-031: the CLI gains `renumber` — the
promotion primitive a provisional-id scheme needs (DISC-027), and the one
entry on this list that is new capability rather than a resurrection: no
version of docdog could ever rename an id. Like `merge-driver` it has no
MCP counterpart and needs none under PROPOSAL-032's rule, which runs from
an MCP tool to its CLI counterpart and not the other way. The same
proposal makes contested ids queryable **inside** `docdog_status` rather
than as a ninth tool: two files claiming one id is health, and status is
already the kernel's health surface. The MCP kernel 8 is, a fourth time,
unchanged.*

*Amended 2026-07-14 by PROPOSAL-030: the CLI gains `merge-driver`,
which is the one entry on this list that grows the CLI without
growing the *user* surface — git invokes it through
`.gitattributes`, and a user never types it. It is therefore the
exception to PROPOSAL-032's rule rather than a violation of it: that
rule runs from an MCP tool to its CLI counterpart, and this runs the
other way — a CLI command with no MCP counterpart and no need for
one, because its only caller is git. The MCP kernel 8 is, a third
time, unchanged.*

## 5. Collaboration substrate: git, explicitly

DISC-020 explored a shared remote ArangoDB as a collaboration
substrate. That path is **dropped**, deliberately: once the DB
holds nothing canonical, sharing the cache is pointless. Two
clones collaborate the way the rest of the repo does — through
git. Each clone rebuilds its own cache. DD-050's git-optional
ladder still holds for single-machine use; collaboration is the
tier that requires git.

## 6. Restated survivals (from superseded records)

So the supersessions don't orphan their living parts:

- **From DD-069:** templates are user-owned scaffolding — copied
  at init, never auto-synced, core never interprets task/feature
  semantics. Features become ordinary disk records like everything
  else; the `render-matrix` snapshot is obsolete.
- **From DD-061:** the three-template set (`minimal`, `structured`,
  `workflow`) continues; only the database-naming half dies.
- **From DD-058:** `scope` remains a field on records, not a
  storage boundary.
- **From DD-046:** collections remain config-declared types routed
  from frontmatter `collection:`; they materialize as rows in one
  vertices table, not as per-type physical collections.

## 7. Cutover prerequisites (one-time, before code changes)

1. `docdog export` every DB-only record (features and any working-
   tier content per DD-065/DD-069) to disk files, reviewed and
   committed. After this, nothing canonical is DB-resident.
2. `dd_task_runs` content is dropped, not exported — run state is
   workflow-engine residue with no disk-canonical meaning.
3. `dd_collection_meta` / `dd_relation_meta` (DP-002) are re-seeded
   as indexed markdown files under `.docdog/`, preserving DP-002's
   "meaning lives in the graph, searchable" property with a
   disk-canonical home.

## 8. Rationale

Three compounding problems, identified in the 2026-07-02 spec
review, each answered by one commitment:

1. **Platform drift.** A shipped workflow interpreter contradicted
   DD-066 while the memory-layer core still lacked a measured
   retrieval win. Cutting it re-concentrates the project on docs
   delivery for agent accuracy.
2. **Infrastructure weight.** Docker + a server DB + an
   experimental vector flag + migrations + GC is a heavy toll for
   a ~200-file corpus, and it made every onboarding and every test
   run pay for it. Measured Arango usage was thin: unranked
   CONTAINS keyword search, one bounded-depth traversal query, no
   views, no analyzers. FTS5 with BM25 is an upgrade on the axis
   that matters, and the embedded cache removes the toll entirely.
3. **Structural sync bugs.** FRICTION-006/009/011/015 and OQ-40
   all stem from two writable stores. Making disk the only
   canonical store dissolves the class instead of patching
   instances.

## 9. Principle walk

- **DP-001:** indexing disk to cache is Tier-1 mechanics; cache
  rebuild is deterministic; no new judgment enters code. Removing
  the interpreter removes shipped semantics from code.
- **DP-002:** concept metadata stays in the graph — as indexed
  markdown records rather than DB-seeded vertices. Searchability
  is preserved; visibility improves (files beat seeds).
- **DP-003:** the toolbelt shrinks but stays comprehensive for the
  memory-layer job; the escape hatch improves — direct SQL against
  the cache plus, more fundamentally, grep and an editor against
  the canonical files.
- **FR-001:** the core set is redefined (§4). Non-core features
  (refs, etc.) keep the opt-in + detector + namespace pattern.

## 10. Supersession pass (frozen target set)

This decision's batch pass (WF-003, executed as a single
mechanical batch — one commit, target set frozen here in lieu of
a FEATURE record, since features are DB-first until §7 runs):

- **Decisions → `superseded`:** DD-046, DD-049, DD-056, DD-058,
  DD-061, DD-062, DD-065, DD-069 (DD-052 was already superseded).
- **Proposals → `superseded`:** PROPOSAL-007 (Arango named graph),
  PROPOSAL-018 (workflow interpreter), PROPOSAL-021 (sync policy +
  export bridge), PROPOSAL-022 (DB-first normal mode; parts carry
  into PROPOSAL-023).
- **Questions → `resolved`:** OQ-20 (single edges table), OQ-22
  (git is the substrate), OQ-31 (no export policy — nothing to
  export), OQ-32 (writes are disk-first).
