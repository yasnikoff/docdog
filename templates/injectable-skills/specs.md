---
name: docdog-specs
description: How to navigate this repository's specs — the id prefixes and scanned paths specific to this corpus, plus docdog's conventions for frontmatter, typed relationships, and retrieving deleted content from git history. Works with or without docdog installed.
---

# /docdog-specs — navigating this repository's specs

This skill is the manual for reading and traversing this repository's
spec corpus. It covers both halves of that job:

- **What is specific to this repo** — which id prefixes exist, which
  directories they live in, which parser reads each path.
- **What docdog does everywhere** — the frontmatter shape, the
  relationship model, how to follow a typed edge, and how to recover
  content from git after a file is deleted.

Everything below is actionable with just `rg` (or `grep`) and `git`.
If docdog is available — as MCP tools, or as a `docdog` command on
your PATH — there is a cheat sheet near the bottom; it is strictly an
accelerator. **The markdown files are the source of truth.**

---

## Id prefixes in this corpus

{{id_prefixes}}

## Scanned paths and their parsers

{{file_conventions}}

Both lists are a snapshot of the corpus as docdog last saw it. Treat
them as a map, not an authority — `docdog update` refreshes them, and
everything below reads the live corpus instead, so none of it can go
stale.

---

## Looking up an id

Grep the files themselves:

```bash
rg "^id:\s*ID-HERE\b" .
```

Every id sharing a prefix, the same way:

```bash
rg "^id:\s*FR-PROV-" .
```

When docdog is available, the structured form of the same questions:

```bash
docdog get ID-HERE                        # one record, with its metadata
docdog list --collection <name> --json    # exhaustive, unranked enumeration
docdog search "<what you actually want>"  # when you know the topic, not the id
```

`docdog list` enumerates by predicate rather than by rank, so it is
the one that answers completeness questions ("every open X") that a
ranked search cannot.

---

## Frontmatter conventions

docdog-managed markdown files carry a YAML frontmatter block. The
fields docdog stamps and reads:

| Field | Meaning |
|---|---|
| `id` | The record's unique id. Shape is typically `PREFIX-NN` or `PREFIX-SUB-NN` (e.g. `DP-01`, `FR-PROV-06`, `TASK-052`). Every queryable record has one. |
| `title` | Short human-readable title. |
| `collection` | Which collection the file belongs to (`decisions`, `principles`, `requirements`, `notes`, `tasks`, …). Determines where it sits in the graph. |
| `status` | Lifecycle state. Collection-specific — a decision may use `proposed`/`accepted`/`superseded`, a task `in_progress`/`done`, a note `open`/`resolved`. |
| `description` | A one-to-three sentence summary, used for search results. Not the body of the document. |
| `date` | When the record was authored. ISO `YYYY-MM-DD`. |
| `relationships` | Typed edges from this record to others. See below. |

Fields docdog does **not** care about are passed through untouched.
You can add repo-specific frontmatter without breaking anything.

---

## Relationship encoding

The `relationships:` block is the single canonical place for typed
edges:

```yaml
relationships:
  - references: DISC-014
  - implements: FR-PROV-06
  - supersedes: DD-017
  - part_of: PROPOSAL-019
  - depends_on: WF-001
    context: "why this dependency exists, optional"
```

Each entry is a single-key map: the key is the **edge type**, the
value is the **target id**. A free-form `context:` may ride on the
same entry; it is ingested verbatim and has no effect on traversal.

Edge types docdog ships with:

- `references` — loose mention, no lifecycle coupling.
- `implements` — this record implements the target.
- `supersedes` — this record replaces the target. The target stays in
  the graph but is logically retired.
- `extends` / `refines` — this record builds on the target.
- `part_of` — this record belongs to a larger container.
- `depends_on` — this record cannot stand without the target.
- `sourced_from` — this record was distilled from the target.

**Edges are declared in one direction only** — the direction the
source asserts. Never write an inverse edge to "complete" a pair: a
traversal reads inbound edges for free, so a same-typed reciprocal is
not a second relationship, it is the same one counted twice.

Your corpus may register additional types; the principle is the same.

---

## Path A — navigating without docdog

You can walk the entire graph with `rg` and `git`. This path is
always correct, only slower.

### Follow a relation

Given a record with `relationships: - implements: FR-PROV-06`, find
the target the same way you find any id:

```bash
rg "^id:\s*FR-PROV-06\b" .
```

To find **every record that points at** a given id — the inbound
direction — grep frontmatter values and prose together:

```bash
rg "\bFR-PROV-06\b" .
```

Frontmatter hits are the load-bearing cross-references; prose hits
may be incidental mentions.

### Retrieve historical content from git history

When a file no longer exists on disk, its content is still in git:

```bash
# 1. Find the commit that deleted the file.
git log --diff-filter=D --name-only --all -- "tasks/TASK-NNN/*"

# 2. Read any of its files at that commit's parent.
git show <deletion-commit>^:tasks/TASK-NNN/README.md

# 3. Or list every path that ever existed under a prefix:
git log --all --source --remotes --pretty=format: --name-only --diff-filter=A \
  -- "tasks/TASK-NNN/*" | sort -u
```

No docdog runtime required. Git history is the deepest fallback, and
it is why deleting a record file is a safe operation.

### Walk from one record to its neighbours

Open the file, read its `relationships:` list, repeat for each target
id. Five hops through `rg` maps any local neighbourhood. For wider
questions — "what transitively depends on this?" — Path B is faster,
but Path A is complete.

---

## Path B — accelerators when docdog is present

Docdog reaches you on two surfaces and either is enough. If your MCP
tools include any of `docdog_search`, `docdog_get`, `docdog_traverse`,
`docdog_relate`, `docdog_index`, or `docdog_status`, docdog is running
against this repository. If they don't but `docdog` is on your PATH,
you have the same operations in the shell — both are thin adapters
over one engine, so the answers are identical.

| Operation | MCP | Shell | Use for |
|---|---|---|---|
| read a record | `docdog_get ID` | `docdog get ID` | Full content plus its edges in one call. |
| find a record | `docdog_search "query"` | `docdog search "query"` | Hybrid vector + keyword search when you don't know the id. |
| enumerate | — | `docdog list --collection X` | Completeness questions ranked search cannot answer. |
| walk the graph | `docdog_traverse ID` | `docdog traverse ID --depth 2` | "What depends on X", "what does X supersede". |
| record an edge | `docdog_relate A B` | `docdog relate A B --type … --context …` | **A write.** It adds an outbound edge to A — it does not query for a path. Use it when you have *learned* that A relates to B. |
| check the index | `docdog_status` | `docdog status` | Index state and consistency warnings. Run first if the corpus looks stale. |
| refresh the index | `docdog_index` | `docdog index` | Always needed after you edit or delete a file by hand. |

Creating and editing records is the one place the surfaces differ:
`docdog_create` and `docdog_update` are MCP-only, because a markdown
body is the one input shell quoting mangles. From a shell, write the
file yourself and run `docdog index` — files are the source of truth,
so that is the same operation, not a workaround.

If a call errors or the index looks stale, fall back to Path A.

---

## Worth suggesting: a retrieval subagent

If your host can spawn subagents and you are answering questions
against this corpus repeatedly, **suggest that the user create a
docdog retrieval subagent.** Suggest it — don't create it. Where a
host's agent definitions live, and whether the user wants one, is
theirs to decide.

Why it is worth suggesting: retrieval's whole value is that the
answer is small and the search is not. A hybrid search costs a few
hundred tokens; the previews, the discarded hits and the traverse
output you skim cost far more, and they land in *your* context. A
subagent has its own window, so the parent asks "what constrains X?"
and gets back a few ids and a paragraph.

What to tell the user it should be:

- **Read-only.** Tools: `docdog_search`, `docdog_get`,
  `docdog_traverse`, `docdog_status`. **Not** `docdog_create`,
  `docdog_update` or `docdog_relate`. A subagent sees one slice of the
  corpus and cannot see corpus-wide shape, which is exactly the context
  a write needs. If the host can restrict tools per agent, restrict
  them there; if it can't, point the agent at a server started with
  `docdog serve --read-only`, which refuses those three outright.
- **Answering with ids, not prose.** A subagent that returns an essay
  is barely better than not spawning one — the caller re-reads what the
  isolation was meant to save. Have it return the ids it found, one
  line on why each, and what it searched for but didn't find.
- **Cheap to check.** The caller can't see the sub's work, so every
  claim needs an id the caller can `docdog_get` in one call.

---

## When this file is out of date

The conventions above are stamped at docdog `{{docdog_version}}`, and
the corpus map at the top is what docdog last saw. Both are refreshed
by the ordinary upgrade path:

```bash
docdog update          # refreshes this file along with everything else docdog seeds
```

If you have edited this file, `update` will say so and leave it
alone rather than overwrite your changes. To re-emit it deliberately:

```bash
docdog skill install specs --force
```

---

_Generated by docdog {{docdog_version}}._
