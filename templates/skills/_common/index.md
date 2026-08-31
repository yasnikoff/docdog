---
name: index
description: Re-index section files into the graph after adding or editing specs
---

# Index

Re-index section files after changes. The indexer scans configured `scan_paths`,
parses frontmatter, computes content hashes, generates embeddings, and upserts
rows into the embedded cache (`.docdog/cache/index.db` — disposable derived
state; disk is canonical per DD-070).

## One path is scanned without being configured

`.docdog/local/` is indexed whenever it exists, with no `scan_paths` entry.
It is gitignored from `init` onward, so markdown you put there is **retrievable
and never committed** — the home for reasoning you want to search and not
publish. `docdog index` prints the count whenever it holds anything, so the
records are never in the corpus silently.

Two consequences worth knowing:

- A local record is a **second-class record**: no history, no `git blame`, no
  merge driver, no recovery path. Git is docdog's archive and this opts out of
  it. Fine for personal reasoning; think twice for anything you would miss.
- A **committed record may not declare an edge to a local one**. That would
  publish the local record's id and leave every clone pointing at a record it
  does not have, so `relate` refuses it. Record the relationship on the local
  record instead — `traverse` reads inbound edges, so nothing is lost.

## When to index

- After creating or editing markdown section files
- After **deleting** a record's file — the sweep removes its rows
  (deletion = delete the file + `docdog_index`; there is no delete tool)
- After pulling new specs from a branch
- After bulk file operations (rename, move, reorganize)

## Workflow

### Incremental (default)

```
docdog_index({})
```

Compares file hashes against stored hashes. Only re-embeds changed files.
Fast — typically seconds for a few changed files.

### Full rebuild

```
docdog_index({ full: true })
```

Wipes the cache's derived rows and re-indexes everything from disk (cached
embeddings are kept and reused by content hash). Use when:
- Switching branches with major structural changes
- Recovering from a corrupted index
- After changing embedding model (this also triggers automatically)

### Single path

```
docdog_index({ path: "specs/decisions/" })
```

Index only files under a specific path.

## Section file format

Each section file is one markdown file with optional YAML frontmatter:

```markdown
---
id: DD-ARCH-09
title: Saga pattern for compensation
collection: decisions
status: current
scope: shared
description: Default compensation approach for multi-step workflows
---

# Saga Pattern for Compensation

Content here...
```

### Frontmatter fields

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | No | Human-readable ID (DD-*, FR-*, DP-*, CG-*) |
| `title` | No | Falls back to first heading |
| `collection` | No | Target vertex collection. Inferred from directory if absent |
| `status` | No | `current` (default), `superseded`, `draft` |
| `scope` | No | `shared` (default), `personal`, `draft`, or custom |
| `description` | No | Agent-authored summary — preferred over mechanical preview |

### Collection inference

Without `collection` in frontmatter, the indexer infers from the directory name:
- `decisions/`, `design/` → `decisions`
- `requirements/` → `requirements`
- `principles/` → `principles`
- `guidelines/`, `code-guidelines/` → `guidelines`
- `glossary/`, `terms/` → `terms`
- Other directories → `decisions` (default)

## Embedding cache

Embeddings are cached by content hash. Frontmatter-only edits (changing status,
adding description) skip re-embedding — only body changes trigger new embeddings.
Branch switches are cheap: cached embeddings are reused when content matches.
