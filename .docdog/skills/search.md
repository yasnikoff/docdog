---
name: search
description: Find context relevant to a query using vector + keyword search and graph traversal
---

# Search

Find sections relevant to your current work. Always search before creating or
modifying content — context exists that you haven't seen.

## When to search

- Before starting any task: find related decisions, requirements, principles
- When a section references an ID (DD-*, FR-*, DP-*, CG-*): use `docdog_get`
- When you find one relevant section: traverse its edges to find the cluster

## When *not* to search — enumeration

Search ranks by relevance to a text query, so it answers *"what is most
relevant"* and can never answer *"what are all of them"*: a record can match
your filter and still fall below the limit, or below the query's recall, for a
query it is semantically distant from. Raising `limit` does not fix this.

When the question is a **completeness** question — every record in a
collection, every unfinished task, everything carrying a given frontmatter
value — use the CLI's exhaustive list instead:

```
docdog list --status in_progress
docdog list --collection decisions --exclude-status "superseded,deprecated"
docdog list --where area=billing
docdog list --lacks upstream_issue
```

Unranked, uncapped unless you pass `--limit`, and it returns identity plus
metadata with no previews — so enumerate to find the set, then `docdog_get`
the one you want. There is no MCP equivalent yet; this one is CLI-only.

**`--scope` is a filter, not a `--where` key.** `collection`, `status` and
`scope` are refused inside `--where` because each has its own parameter —
`--collection`, `--status`/`--exclude-status`, `--scope` — on both `search`
and `list`. A record that declares no `scope:` counts as `shared`, so
`--scope shared` returns it. Unlike the other two, scope is a free string
with no registered vocabulary, so a value nothing carries returns an honest
empty rather than a refusal: run `docdog status` to see which scopes the
corpus actually uses before filtering by one.

**Absence is a filter, not a missing value.** `--where` compares a field
against a value, so a record that does not carry the field never matches —
which makes *"which records has this convention not reached yet"* unaskable
through `--where` at any spelling. `--has <field>` and `--lacks <field>` are
that question (comma-separated, repeatable, on `search` and `list` alike):

```
docdog list --collection notes --status open --lacks upstream_issue
docdog list --status resolved --has fixed_date
```

They partition the corpus — every record is in exactly one of `--has X` and
`--lacks X`, a field written with no value counting as absent — so the two
counts sum and a complement can be trusted. They read frontmatter rather than
the indexed columns, so `--lacks status` finds the records that are `current`
because nothing was written rather than because someone chose it. A field the
corpus has never carried is *not* refused: returning every record is the right
answer on the day a convention is invented, which is exactly when you ask.

**`--where` compares against a scalar, and a list is not one.** A frontmatter
field holding a list (`tags`, `topics`, `related`) is stored as an array, so
`--where tags=logging` would be testing your value against `["logging"]` and
matching nothing. It is refused by name rather than returning the empty result
that reads as "no such records" — the refusal tells you how many records store
the field and how. Equality is not membership here; to find records by a list
member, search for the value — `--has tags` finds the records that carry the
field at all, since presence never compares.

**Quote multi-value filters.** `--status`, `--exclude-status` and
suggest-edges' `--collection` are comma-separated *and* repeatable — the two
spellings mean the same thing — but PowerShell turns an unquoted `a,b,c` into
a single space-joined argument, so quote them. A status no record carries and
no collection concept declares is refused by name, which is also how you find
out the quoting went wrong: the refusal lists the statuses your corpus
actually uses, and `docdog status` lists them before you type.

## Workflow

### 1. Broad search

```
docdog_search({ query: "saga compensation error handling" })
```

Start with the conceptual question, not an ID. The search returns sections ranked
by relevance with previews.

### 2. Read promising results

```
docdog_get({ id: "DD-ARCH-09" })
```

Get full content for sections that look relevant from the search preview.

### 3. Traverse for context cluster

```
docdog_traverse({ vertex_id: "DD-ARCH-09", depth: 2 })
```

Follow edges from a relevant section to discover related sections you wouldn't
have found by search alone. This is critical for cross-cutting concerns.

### 4. Record what you found

If you discover a relationship while searching (e.g., a decision that constrains
a requirement), submit it using the **relate** skill.

## Tips

- Search returns at most 10 results by default. Use `limit` for more — but if
  you need *all* of them rather than the best of them, use `docdog list`
  (above), which a bigger `limit` is not a substitute for.
- Use `collection` to narrow: `docdog_search({ query: "...", collection: "principles" })`
- `docdog_search` takes `has` and `lacks` as well, so the presence question is
  askable with only the MCP tools:
  `docdog_search({ query: "...", lacks: ["upstream_issue"] })`
- Search is hybrid: BM25 keyword ranking fused with vector similarity — both
  legs run on the embedded cache.
- Cross-cutting principles (like DP-11) often don't appear in naive searches. Traverse
  edges from the sections you do find.
