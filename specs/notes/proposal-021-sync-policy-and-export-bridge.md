---
id: PROPOSAL-021
title: "Sync policy + export bridge — per-collection archive retention with ejection mitigation"
collection: proposals
status: superseded
date: 2026-04-13
related:
  - DP-001
  - PROPOSAL-019
  - PROPOSAL-020
  - DD-034
  - DD-035
relationships:
  - sourced_from: "orchestrator sidecar planning — tasks as long-term agentic-reasoning artifacts beyond disk deletion"
    context: "the host-project orchestrator's existing /finalize-task deletes task folders; docdog should retain the task content in vertices, but the retention itself becomes a new ejection trap unless there's a materialization bridge back to disk"
  - references: DP-001
    context: "sync_policy is a tier-2 visible default (mirror), the indexer change is tier-1 literal skip-on-match, and export is tier-1 directory write — no inference anywhere"
  - references: PROPOSAL-020
    context: "PROPOSAL-020 establishes the ejection-friendliness mandate; this proposal closes a gap PROPOSAL-020 exposes — tasks live in docdog but must remain recoverable when docdog is removed"
  - references: DD-034
    context: "artifact-resilience: if docdog disappears, on-disk artifacts must remain useful. Export is that guarantee for archive collections"
---

# PROPOSAL-021: Sync policy + export bridge

**Superseded 2026-07-06 by DD-070** — with disk canonical there is no DB→disk sync to police; export remains only as the one-time cutover step (DD-070 §7).

## Motivation

The orchestrator sidecar plan in DISC-014 §5 landed on a position: docdog
should keep task vertices alive beyond the orchestrator's existing
`/finalize-task` folder deletion, because tasks are valuable
agentic-reasoning artifacts and keeping them out of the host repo is
part of docdog's value. Today the indexer is implicitly **mirror** —
a file missing from disk causes its vertex to be soft-deleted on the
next index run (the FRICTION-009 ghost-file sweep in
`src/engine/indexer.ts:241`). There is no knob to say "keep it."

Adding a knob is easy. The hard part is the **new ejection trap it
creates**: under an "archive" policy, Arango becomes load-bearing for
that collection's content. If docdog breaks or the user wants out, the
content is stuck in vertices and not on disk. This contradicts
PROPOSAL-020's entire ejection-friendliness framing unless it ships
alongside a materialization bridge. PROPOSAL-021 is the combined
feature: knob + bridge.

## Specification

### 1. `sync_policy` field on `dd_collection_meta`

Add an optional field to `CollectionMetaEntry` in `src/arango/meta.ts`:

```ts
export interface CollectionMetaEntry {
  // ...existing fields...
  /**
   * How the indexer handles vertices whose source file disappeared
   * from disk. "mirror" (default): soft-delete. "archive": persist.
   * PROPOSAL-021.
   */
  sync_policy?: "mirror" | "archive" | null;
}
```

Default when absent is `"mirror"` — current behavior, zero-migration
on upgrade. Seed content in `meta-seed.ts` is unchanged (all shipped
collections stay mirror). The field is opted in per collection via
`docdog collections update <name> --sync-policy archive` (new flag on
the existing update command — ~10 LOC of CLI wiring), or by hand
editing the meta entry.

The field is tier-2 per DP-001: visible default with override, not
inference. `mirror` stays the global default because every existing
collection today relies on it, and a surprise silent switch would be
worse than the current behavior. A fresh installation of docdog in a
new repo is identical to today.

### 2. Indexer change — skip soft-delete for archive collections

Three sweep sites in `src/engine/indexer.ts` perform disk-driven
vertex soft-deletes. All three must consult sync_policy before
removing a vertex. Each is a literal per-collection skip — no
fuzzy matching, no wildcards.

| Site | Lines (as of `5044e04`) | Behavior under `archive` |
|---|---|---|
| `sweepMissingFiles` — the FRICTION-009 ghost-file sweep | ~241–279 | Early-`continue` the outer `for (colName of ...)` loop when the collection's sync_policy is `archive`. The collection's vertices are never scanned for ghosts. |
| Full-rebuild pre-delete — `On full rebuild, soft-delete all existing vertices first` | ~84 | Filter the to-delete list to exclude archived collections. |
| `reconcileFile` section-level soft-delete — sections that existed but aren't in the new parse | ~484 | If the parent collection is `archive`, skip the section-level soft-delete. |

Each site gets a single AQL filter or a single pre-check against an
in-memory set of archived collection names, built once at the start
of `runIndex` from one `listCollectionMeta` call. One subtraction,
three sites, ~40 LOC of mechanical change + tests that seed a
collection with `sync_policy: "archive"`, delete a source file, and
assert the vertex is still alive after reindex.

### 3. `docdog export` — the materialization bridge

New CLI command:

```
docdog export <collection> [--target <dir>] [--force]
```

- `<collection>` — name of a vertex collection. Unknown collection →
  hard error listing the known vertex collections. Any collection may
  be exported, not just archived ones (the bridge is general-purpose;
  archive is the first felt need).
- `--target <dir>` — target directory for the materialized files.
  **Must be relative to CWD**, same rail as `docdog skill install` per
  PROPOSAL-019 §1. Default: `.docdog/export/<collection>/`.
- `--force` — overwrite existing files in the target. Without it, a
  non-empty target is a hard error (don't silently clobber).

Behavior:

1. Fetch all non-soft-deleted vertices in the collection via a
   literal AQL query.
2. For each vertex, emit one markdown file at
   `<target>/<slug>.md` where `<slug>` is derived from the vertex
   id by a single literal rule: lowercase, replace non-alnum runs
   with `-`, trim trailing `-`. Vertex id `TASK-052` → `task-052.md`.
   Collisions (two vertices producing the same slug) are a hard
   error that names both offending ids — don't merge, don't suffix.
3. Each file contains: frontmatter reconstructed from the vertex's
   indexed fields (`id`, `title`, `collection`, `status`,
   `description`, `relationships` block rebuilt from outgoing
   edges), then the vertex body.
4. After writing, print a one-line summary: `Exported N vertices to
   <target>/`.

**Round-trip contract**: the emitted files are accepted by
`docdog index` without modification. A fresh `docdog init` followed
by `cp -r <target>/ <some-scan-path>/` followed by `docdog index`
reconstructs the collection. This is the ejection path in its
entirety — no docdog runtime required to *read* the files, and one
reindex required to *re-ingest* them into a future docdog.

Relationships are preserved because frontmatter is the source of
truth docdog ingests. Edges that reference vertices in other
collections round-trip as long as those vertices are also exported
or still present in the indexed corpus.

### 4. DP-001 compliance walkthrough

| Operation | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| `sync_policy` default `mirror` | — | ✅ visible default, override via `collections update --sync-policy` | — |
| Indexer skip under `archive` | ✅ literal collection-name membership check | — | — |
| `export` vertex fetch | ✅ literal AQL | — | — |
| `export` slug derivation | ✅ single literal rule, collisions hard-error | — | — |
| `export` frontmatter reconstruction | ✅ literal field mapping | — | — |
| `export` target-relative-to-CWD rail | ✅ absolute-path rejection | — | — |
| `export` clobber safety | — | ✅ `--force` override | — |

No tier-3 inference. The slug rule is deliberately naive (literal
transform, no "friendly" overrides, no collision resolution);
surfacing collisions to the user is the right behavior per DP-001.

### 5. The trade-off, named explicitly

Under `sync_policy: archive`, Arango becomes **load-bearing** for the
collection's content between exports. If docdog's database is lost
and no recent export exists, the vertices are recoverable only via
git history of whatever files originally seeded them (which, in the
task-lifecycle case, is exactly the scenario archive exists to
circumvent — the files are gone from main and only live in past
commits).

Mitigation is the export command itself, used as a **periodic
discipline** rather than a safety net:

- **Day-to-day**: docdog is the convenient home.
- **Before risky operations** (docdog version upgrade, migration,
  schema change): `docdog export tasks --target .docdog/archive/`.
- **On a schedule** (git hook, cron, CI): same command, optionally
  committed or gitignored.
- **Worst case**: the most recent export is the source of truth for
  a clean reinstall or a migration to another tool.

The discipline is the user's to adopt, not docdog's to enforce.
Documenting it in `/navigate-specs` (and a new short paragraph in
the CONTRIBUTING guide) is sufficient — we don't build scheduled
exports or pre-operation hooks in this proposal.

### 6. Estimated effort

**Core:**
- `src/arango/meta.ts` — extend `CollectionMetaEntry`, add
  `sync_policy` to `CollectionMetaInput` / `CollectionMetaPatch`,
  extend `updateCollectionMeta` passthrough. ~15 LOC.
- `src/engine/indexer.ts` — load archived-collection set once at
  `runIndex` start, three skip sites. ~40 LOC.
- `src/cli/commands/collections.ts` — `--sync-policy` flag on
  `collections update`. ~10 LOC.
- `src/cli/commands/export.ts` — new command, vertex fetch, slug
  derivation, frontmatter reconstruction, file write. ~120 LOC.
- Registration in `src/cli/index.ts`. ~5 LOC.

**Tests:**
- `tests/unit/export.test.ts` — slug derivation, collision error,
  frontmatter round-trip shape, relative-path rail. ~80 LOC.
- `tests/integration/sync-policy.test.ts` — seed archive collection,
  delete source, reindex, assert survival; then flip to mirror and
  assert disappearance. ~60 LOC.
- `tests/integration/export-roundtrip.test.ts` — seed collection,
  export, wipe db, re-init, ingest export, assert vertices
  reconstructed with relationships intact. ~80 LOC.

**Total:** ~190 LOC core + ~220 LOC tests. Small. One commit.

### 7. Not in scope

- **Scheduled / automatic exports** — the discipline is the user's.
- **Partial exports** (by id range, status, date) — single-collection
  export is sufficient for the task-lifecycle use case. Filtering is
  a future proposal if felt.
- **Export of edges as a separate file** — relationships live inside
  frontmatter; a separate edge export is redundant.
- **Delete-on-export** to prune vertices after materialization — the
  two operations are orthogonal and combining them is how data gets
  lost. `docdog gc` is the explicit prune path.
- **`sync_policy: snapshot`** or any third value — two values cover
  the observed need; a third is speculative.
- **Runtime migration of existing collections to `archive`** —
  opt-in per collection via explicit command, no bulk flip.
- **Export format other than markdown+frontmatter** — round-trippable
  with `docdog index` is the whole point; any other format would
  need a separate importer.

### 8. Implementation order

One commit. All three pieces (meta field, indexer change, export
command) land together because they're interdependent: archive
without export is a trap, export without archive is a toy, meta
field without indexer change is dead config.

1. Extend `CollectionMetaEntry` + update helpers + CLI flag.
2. Load archived-collection set in `runIndex`; add the three skip
   sites.
3. Implement `docdog export` + slug rule + frontmatter writer.
4. Unit + integration tests covering all three pieces and the
   round-trip.
5. Self-smoke: on this repo, `docdog collections update tasks
   --sync-policy archive` (if a tasks collection exists locally),
   export, delete a task file, reindex, confirm vertex survived.

## Status

Proposed. All design decisions pinned during the orchestrator-sidecar
planning thread (DISC-014 §5). Ready for implementation once
PROPOSAL-020 commit 1 lands — PROPOSAL-021 is independent of
PROPOSAL-020's commits and can land in either order, but sequencing
it after PROPOSAL-020 commit 1 keeps the repo state reviewable in
single-proposal slices.
