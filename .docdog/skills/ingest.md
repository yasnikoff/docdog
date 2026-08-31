---
name: ingest
description: Guide for bringing existing documentation into docdog
---

# Ingest

Bring existing documentation into docdog. Two CLI commands cover most cases;
project scripts handle custom formats.

## The two commands

### `docdog add <source>` — prepare files for indexing

For existing individual files (one section per file) that need frontmatter:

```bash
docdog add specs/refinements/ --collection refinements --output specs/refinements/
docdog add specs/domain/ --collection domain --output specs/domain/
```

`add` stamps YAML frontmatter (title from first heading, collection, extracted
status/date) onto files. Existing frontmatter is merged, never overwritten.
It never infers ids (DP-001): the only way `add` sets `id:` is the explicit
`--id <value>` flag, one file at a time. Bulk id schemes (deriving ids from
filenames or numbering a cohort) are agent-script territory — you pick the
scheme, a script stamps it.

### `docdog split <file>` — split multi-section files

For files like `architecture.md` with many `## DD-ARCH-NN` sections. Splitting
is always **two commands**: a selector nominates boundaries into a plan file,
and `--apply-plan` is the only thing that writes.

```bash
docdog split specs/architecture.md --format plan --on "## DD-" --collection decisions > plan.yaml && docdog split --apply-plan plan.yaml --update-config
```

`--on "## DD-"` (or `--depth 2`) pre-populates the plan's `sections:` with every
matching heading, instead of with the depth descent suggests. That is all a
selector does — it no longer executes, and passing `--on` or `--depth` without
`--format plan` is an error naming the two-command form. `--on` is repeatable,
so two heading cohorts are selected as a union in document order (the same list
`split_on` takes in `scan_paths`). A selector that matches nothing writes no
plan and exits non-zero: a wrong pattern fails where you can see it, rather than
being discovered by reading the output directory afterwards.

**Boundaries partition the document**, so a heading your selector did *not*
match — a `## Notes` sitting between two `## DD-` sections — is absorbed into
the child above it rather than dropped. Everything from the first boundary
onward lands in some child; everything before it stays in the `.index.md`
preamble. Nothing is silently lost.

The extra command buys you the boundary list *before* anything runs — which is
where "the pattern matched 40 of 41 headings" is visible.

**The plan header says what comes out.**

```yaml
version: 2
source: specs/architecture.md
output: files            # or: records
collection: decisions
sections:
  - heading: 3
    at: "DD-ARCH-01 Storage"
    id: DD-ARCH-01
    title: Storage
```

- **`output: files`** — sibling files, which is the bulk-ingest shape. The
  source is renamed to `architecture.index.md` (its preamble and file-level
  frontmatter are preserved, and it is no longer indexed) and its sections
  become individual documents in a new subdirectory. No `part_of` edges are
  minted, `parent_id` is absent and legal, and `description:` and `id:` may be
  left empty — a child's id is filled from its heading text when the heading
  carries one.
- **`output: records`** — child records under a parent that stays live with its
  id and framing prose, each declaring `part_of` it (DD-072). It requires
  `parent_id`, and every child needs a real description. That is the
  composition case, not the ingest case: read the **compose** skill first.

The default is printed in the header and can be overridden: `records` when the
source declares an `id:`, `files` when it does not. A foreign document arriving
from outside docdog has no id, so it lands in files mode without being asked.

`output: files` produces:
```
specs/
├── architecture.index.md    (preamble preserved, not indexed)
└── architecture/
    ├── dd-arch-01.md
    ├── dd-arch-02.md
    └── ...
```

Useful flags on the apply step:

- `--update-config` — edit `.docdog/config.yaml` so the new files are scanned.
  In files mode it also removes the source's entry, because the source stops
  being a record; in records mode it only adds, because the parent still is one.
- `--dry-run` — preview without writing.

Apply reports whether `scan_paths` reaches what it wrote, on both output modes,
because that failure is otherwise silent: the writes succeed and indexing says
nothing.

## When to keep multi-section files instead

You don't have to split. If you prefer keeping `architecture.md` as one file,
add a parser hint to `scan_paths` instead:

```yaml
scan_paths:
  - path: specs/architecture.md
    parser: split
    split_on: "## DD-"
    collection: decisions
```

The indexer reads it as 25 separate vertices but the file stays intact (DD-067).
The tradeoff: per-section metadata on disk is limited to what the parser extracts
(id, title, status, date), and split-parsed records refuse the write tools
(relate/update need a per-record frontmatter block to patch). See DD-068.

## Custom formats → project scripts

For formats that don't fit `split` or `add` (table-based glossaries, CSV exports,
Confluence dumps), write a project script:

```typescript
// .docdog/scripts/ingest-glossary.ts
import type { ScriptContext } from "@yasnikoff/docdog";

export default async function(ctx: ScriptContext) {
  // Read your custom format, write section files to specs/terms/
}
```

Run with: `docdog run ingest-glossary`

Or, for runtime parsing without producing files, register a script parser:

```yaml
scan_paths:
  - path: specs/custom.md
    parser: script
    script: parse-custom
    collection: notes
```

The indexer calls your script at index time.

## After bringing content in

1. Run `docdog index` to index the new sections
2. Verify with `docdog search "<query>"` or `docdog status` (`docdog_status` over MCP)
3. Optionally run the **populate** skill to extract relationship edges
