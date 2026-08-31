---
id: FRICTION-030
title: docdog_search `collection` filter silently returns zero for a name the corpus doesn't define
collection: notes
status: resolved
description: Filtering docdog_search by a `collection` value that is not one of the corpus's actual collection names returns "No results found" instead of erroring — so a filter by the tool's documented short name (`guidelines`) against a corpus that named the collection `upstream-guidelines` silently reviews against an empty result; the worst of the three possible behaviours.
severity: inconvenient
relationships:
  - references: FRICTION-006
    context: Same family — the indexer/search layer handles a wrong-or-unknown collection name by silently doing nothing rather than warning
  - references: PROPOSAL-027
    context: The `where` equality filter shares this silent-empty-on-non-matching-value shape (records lacking the field never match); a collection that doesn't exist is the collection-filter instance of it
---

## What was reported

Secondary finding in the orchestrator adoption note
(`specs/investigations/docdog-adoption/feedback-2026-07-14-eapi-ids-unindexed.md`),
surfaced during a docdog-first `/enhance-spec` sweep.

## The behaviour

`docdog_search`'s `collection` parameter is documented (in the tool
description) as taking short names — `decisions`, `guidelines`,
`requirements`. The orchestrator corpus, however, named its collections
`upstream-decisions`, `upstream-guidelines`, `upstream-requirements`.
Filtering by the **documented short name** returned nothing:

```
docdog_search(query="admission-governed workflow yield park fencing guard step
                     retry budget", collection="guidelines")
  → zero results
  — the same query UNFILTERED surfaced CG-080, which lives in
    `upstream-guidelines`.
```

So the filter value `guidelines` matched no collection, and search
returned an empty set **silently** — no warning, no "unknown collection"
error, no list of the names that do exist.

## Why it matters

This is the same silent-failure shape as FRICTION-006 (collection
reassignment silently ignored) and the broader family (FRICTION-019 /
FRICTION-028): the corpus does something other than what the caller asked,
and says nothing. An agent following the docdog-first protocol reads the
empty result as *"no such content exists"* and proceeds — here, reviewing
against a world where the guideline is absent. The note's own words: a
silent empty result is **"the worst of the three possible behaviours"**
(vs. matching, or erroring).

The tool description enumerates a fixed short-name list, but a corpus can
define arbitrary collection names, and nothing reconciles the two: either
the description promises a mapping that doesn't exist, or the filter should
validate its argument against the corpus's actual collections.

## What should change (open — DP-001 tier 1, mechanical)

When `collection` is set to a value that matches **no** collection present
in the cache, don't return an empty result as if the filter succeeded.
Either:

1. **Error** with `UNKNOWN_COLLECTION`, listing the collection names the
   corpus actually defines (the same set `docdog_status` prints). A fact
   check against the cache — no inference.
2. **Warn** on the index/log channel and fall through to unfiltered, if
   erroring is judged too strict.

Option 1 is preferred and strictly mechanical: "does a collection with
this name exist?" is a `SELECT DISTINCT collection` lookup, not a guess.
The tool description's short-name list should also either be corrected to
say the value is the corpus's own collection name, or a documented alias
map should be built — but the silent-zero is the bug regardless of which
way that resolves.

## Resolution (2026-07-15 — resolved/feature)

Option 1 shipped, strictly mechanical (DP-001 tier 1). `search()`
(`storage/search.ts`) now validates a `collection` filter before running
and throws a typed `SearchError` (`code: "UNKNOWN_COLLECTION"`) when the
name is in neither the corpus's **declared** vocabulary
(`getVertexCollections` — config's shipped ∪ user collections) **nor** the
set actually present in the cache (`SELECT DISTINCT collection`, which
covers `--create-collections` records). The refusal lists the collections
that hold content — the same set `docdog status` prints — and tells the
caller to omit the filter. Both surfaces render it as a first-class
refusal, mirroring `WriteError`: `docdog_search` returns
`UNKNOWN_COLLECTION: …` with `isError`, and the CLI prints
`Error [UNKNOWN_COLLECTION]: …` and exits 1 (without the misleading
"cache is stale" hint).

Deliberate split preserving the *other* two behaviours:

- A **declared-but-empty** collection (a valid name no record uses yet)
  passes validation and returns an honest empty result — it is not a typo.
  This is why validation checks the declared vocabulary, not only what is
  present: erroring on `guidelines` in a corpus that ships it empty would
  be a regression.
- The exact reported case — filtering by `guidelines` against a corpus
  that named its collection `upstream-guidelines` — now errors and names
  `upstream-guidelines` among the valid options.

The tool descriptions (MCP `docdog_search` and CLI `--collection`) were
also corrected: they no longer promise a fixed short-name list, and state
that the value is the corpus's own collection name, that an unknown name
is refused (not emptied), and that `docdog status` lists the real names.
No alias map was built — inferring `guidelines` → `upstream-guidelines`
is exactly the intent-guessing DP-001 tier 3 forbids.
