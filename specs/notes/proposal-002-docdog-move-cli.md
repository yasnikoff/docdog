---
id: PROPOSAL-002
title: "`docdog move` CLI command for explicit collection migrations"
collection: proposals
status: superseded
date: 2026-04-12
related:
  - DISC-002
  - API-IMPROVEMENT-001
  - FRICTION-006
relationships:
  - discussed_in: DISC-002
  - sourced_from: FRICTION-006
    context: friction surfaced the need for an explicit move command
  - references: API-IMPROVEMENT-001
  - references: DISC-001
description: "SUPERSEDED at the v3 pivot (DD-070): collection moves need no command — edit collection: frontmatter and reindex; the disposable cache is rebuilt from disk. Original v2 pitch: promote the move-collection.ts workaround to a first-class docdog move CLI command as the explicit deliberate-migration UX."
---

# PROPOSAL-002: `docdog move` CLI command

**Status note (2026-07-11, FEATURE-002):** superseded — v3 (DD-070)
has no command trees and no persistent database to migrate. A
record's collection is its `collection:` frontmatter; changing it
plus `docdog index` is the whole move, because the cache is
disposable and rebuilt from disk. The v2 problem below (Arango
vertices to soft-delete, edges to rewrite) dissolved.

## Motivation

During the OQ→questions and friction→issues migrations (see DISC-001,
DISC-002), we reused the same recipe three times:

1. Add new collection to `vertex_collections`
2. `docdog init` (creates the Arango collection)
3. Edit `collection:` frontmatter on the affected files
4. Soft-delete the source vertices via
   `docdog run move-collection <from> <prefix>` (the workaround script)
5. `docdog index`

Step 4 relies on a workaround script discoverable only by reading
`.docdog/scripts/`. It's also a two-step dance with step 5. Users who hit
this pattern without our context would struggle.

## Proposal

A first-class `docdog move` command:

```
docdog move <pathOrPattern> <targetCollection>
```

Examples:

```
# Move a single file
docdog move specs/notes/oq-14-edge-attribute-schema.md questions

# Move everything matching a glob
docdog move 'specs/notes/oq-*.md' questions

# Move by source_file prefix
docdog move 'specs/notes/friction-' issues

# Dry run
docdog move --dry-run 'specs/notes/oq-*.md' questions
```

### What it does

1. **Resolve the file set** from the path/glob/prefix. Support glob, exact
   path, and prefix match (last segment ending in `-` treated as prefix).
2. **Edit frontmatter in place** on each file: set
   `collection: <targetCollection>`, preserving everything else.
3. **Soft-delete matching vertices** in the source collections by
   `source_file`, same as the current workaround script.
4. **Run incremental index** on the affected files so fresh vertices land
   in the target collection. Output summary: "Moved N files to <target>."
5. **Print next steps** if manual action is needed (git add/commit, etc.).

### Options

| Flag | Purpose |
|------|---------|
| `--dry-run` | Show what would change; don't write files or touch DB |
| `--no-index` | Do the frontmatter edit + soft-delete but skip `docdog index` (for users who want to review before the final step) |
| `--force` | Skip confirmation for batch moves ≥ 5 files |

### Safety

- **Confirm on batch moves ≥ 5 files** unless `--force`. Show the file
  list and target.
- **Refuse if target collection doesn't exist** in `vertex_collections`.
  Suggest: "Run `docdog init` after adding <target> to config."
- **Refuse if any source file already has `collection: <target>`** — no
  op, nothing to migrate. Report which files are already in place.

## Relationship to API-IMPROVEMENT-001

API-IMPROVEMENT-001 proposes making the **indexer itself** honor a
frontmatter `collection:` change by auto-moving the vertex. That's the
right default for users who edit frontmatter by hand and re-index.

This proposal (PROPOSAL-002) is **orthogonal** — it's the CLI for
deliberate, batch migrations where the user says "move these files to
that collection" without having to know about frontmatter mechanics.

Could both exist? Yes. The CLI helper uses the same underlying primitive
(whatever that ends up being — explicit soft-delete-then-index, or the
new move-aware indexer). The user-facing command is the right shape for
migration work.

Could one obsolete the other? Marginal. If API-IMPROVEMENT-001 lands,
users could migrate by editing frontmatter + re-indexing, no CLI needed.
But the `docdog move` command is still valuable for batch patterns (glob,
dry-run, confirmation) that would be clunky as manual edits.

## Estimated effort

Small. ~100 LOC in `src/cli/commands/move.ts` that:

- Imports the same AQL pattern as `move-collection.ts`
- Imports the frontmatter edit helper from `add.ts` (the stamping logic
  is reusable)
- Imports the indexer entry point for single-file incremental runs
- Tests: dry-run, single-file, glob, prefix, refusal on missing
  target collection

## Status

Proposed. Depends on no other work — could ship standalone before or
after API-IMPROVEMENT-001.
