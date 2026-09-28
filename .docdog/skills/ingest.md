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

## Records that are not headings → a script parser

`split` and `split_on` only find records that begin at a **heading**. When a
file's units are something else — top-level list items (`- D-AREA-3. …`),
table rows, entries separated by a marker — and the file must not be
reformatted, give that one file a `parser: script` entry. The file stays
exactly as it is; the indexer calls your script on every index and makes one
record per section it returns.

```yaml
scan_paths:
  - spec/                         # everything else in the directory: one record per file
  - path: spec/design-decisions.md
    parser: script
    script: rows                  # .docdog/scripts/rows.js (or rows.ts)
    collection: decisions         # applied to every section the script leaves unset
```

```js
// .docdog/scripts/rows.js — one record per `- D-<AREA>-<n>.` list item
export default function (input) {
  // input: { raw, repoRelPath, absPath, parserConfig, projectConfig, projectRoot }
  const sections = [];
  let inFence = false;
  for (const line of input.raw.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence; // an example is not a record
    const m = !inFence && /^- (D-[A-Z]+-\d+)\.\s*(.*)$/.exec(line);
    if (!m) continue;
    sections.push({
      sectionKey: m[1],   // stable across edits: the id, never a line number
      id: m[1],           // what search returns and what edges resolve to
      title: m[2],
      content: line,      // what gets embedded and keyword-indexed
      frontmatter: {},
      collection: null,   // null = the entry's `collection:`
    });
  }
  return sections;
}
```

A real row usually runs past one line; collect its continuation lines into
`content`. Three things hold, so you do not have to work around them:

- **A file entry overrides the directory entry that also covers it.** The most
  specific path wins — a file beats a directory, a deeper directory beats a
  shallower one — and list order plays no part. Declaring the same path twice
  with different parser config is refused by name.
- **The entry's `collection:` applies** to every section whose `collection` is
  null. Set it in the script only when rows go to different collections.
- **Editing the script re-parses the files it governs** on the next
  `docdog index`; `--full` is not needed. A helper module the script imports is
  not tracked — after editing one of those, run `docdog index --full`.

- **A section's `frontmatter.relationships` becomes its edges**, exactly as a
  `relationships:` block in a file does — so a script can derive the graph a
  corpus already writes in its own spelling, with no file rewritten:

  ```js
  // `amends: [D-GRAPH-13]` in the entry's frontmatter, a `(slug, §7)` citation in its prose
  frontmatter: {
    id,
    relationships: [
      ...amends.map((row) => ({ amends: row })),                 // type must be registered
      ...cites.map(([slug, n]) => ({ references: `${slug}§${n}`, context: "cited in text" })),
      { part_of: headId },                                       // a section of an entry
    ],
  },
  ```

  Same type-as-key shape, same registration rule (an unregistered type is
  warned about at index time). The script sees one file, but `projectRoot` is
  in its input, so a citation that names a record by title can be resolved by
  reading the directory. These edges settle `docdog pairs` like any other when
  their type is in `pairs.edges.settle` — and, by default
  (`pairs.within_file: settle`), two records from one file are never offered
  as a pair, and an edge on a head record settles for the sections that are
  `part_of` it. So put an entry-level edge on the head, where the entry
  states it; do not copy it onto every section.

`.js` loads on every Node docdog supports; `.ts` needs a Node that strips types
natively (22.18+). Records a script produces live inside their file, so, like
split-parsed records, the write tools refuse them: an edge the script can
*derive* belongs in the script; one someone has to *decide* (an accepted
`suggest-edges` or `pairs` row) has to be recorded from the other end, on a
record that has its own file.

## Custom formats → project scripts

For formats that are not markdown at all (CSV exports, Confluence dumps,
table-based glossaries you want as files), write a project script that
produces files:

```typescript
// .docdog/scripts/ingest-glossary.ts
import type { ScriptContext } from "@yasnikoff/docdog";

export default async function(ctx: ScriptContext) {
  // Read your custom format, write section files to specs/terms/
}
```

Run with: `docdog run ingest-glossary`

## After bringing content in

1. Run `docdog index` to index the new sections
2. Verify with `docdog search "<query>"` or `docdog status` (`docdog_status` over MCP)
3. Optionally run the **populate** skill to extract relationship edges
