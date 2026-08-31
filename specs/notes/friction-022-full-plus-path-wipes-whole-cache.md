---
id: FRICTION-022
title: "`docdog index --full --path X` wipes every derived row but reindexes only X"
collection: notes
status: resolved
fixed_date: 2026-07-13
description: "Found while verifying FRICTION-021, not reported by the adopter. The full-rebuild branch DELETEs edges/chunks/fts/vertices/files unconditionally (indexer.ts:101-109) while discovery is scoped to `options.paths` — so combining the two documented flags silently guts the index down to one subtree. Recoverable (the cache is disposable, and a plain reindex restores it) but the failure is silent and the summary line reports success."
severity: inconvenient
source: code review during harvest of the orchestrator adoption feedback
relationships:
  - references: FRICTION-021
    context: "found while trying to reproduce F-021's `--full` report; the two flags interact badly, which may or may not be what the adopter actually hit"
  - references: DD-070
    context: "the blast radius is bounded precisely because v3 made the cache disposable — a plain `docdog index` rebuilds; under v2's Arango era this class of bug destroyed canonical state"
  - references: DP-001
    context: "the fix is mechanical: scope the DELETE to the paths being reindexed, or refuse the flag combination outright"
---

# FRICTION-022: `--full --path` wipes the whole cache

## How it was found

Reading `src/storage/indexer.ts` to reproduce FRICTION-021's claim
that `docdog index --full` no-ops. It doesn't — but the two flags the
adopter was working with (`--full` and `--path`) combine badly, and
that is a defect nobody reported.

## The defect

Both flags are documented and independently sensible:

- `--full` — "Full rebuild (wipe derived rows, reindex everything)"
- `--path <path>` — "Index only this path (overrides config scan_paths)"

But `runCacheIndexer` applies them at different scopes. The wipe is
unconditional and global (`indexer.ts:101-109`):

```ts
if (fullRebuild) {
  db.transaction(() => {
    for (const table of ["edges", "chunks", "fts", "vertices", "files"]) {
      db.exec(`DELETE FROM ${table}`);
    }
  })();
}
```

while discovery is scoped to `options.paths` (`indexer.ts:84`). So
`docdog index --full --path specs/foo/` means: **delete every vertex,
edge, chunk and FTS row in the cache, then reindex only
`specs/foo/`.** The rest of the corpus is gone from the index until
someone runs a plain `docdog index` again. The summary line reports
the scoped counts and looks like success.

If the path also matches nothing, the result is an empty index
reported as `0 file(s), 0 reindexed` — which is exactly the string
the orchestrator run saw, though their cache was demonstrably not
emptied, so this is a lead rather than a confirmed explanation.

The MCP write path is unaffected: `reindexCacheFile` passes
`full: false` explicitly (`indexer.ts:205`).

## Severity

Inconvenient, not blocks-work, and only because of DD-070: the cache
is disposable and `docdog index` restores it from disk. The cost is
confusion plus a full re-embed, not lost content.

## What should change

Either scope the wipe to the paths being reindexed (delete rows whose
`file_path` falls under `options.paths`), or reject the combination
with an error. Scoping is the better fix — it makes `--full --path X`
mean the obvious thing ("rebuild X from scratch"), which is a genuinely
useful operation and is precisely what the orchestrator needed when
their `code-guidelines/` parser change wouldn't take.

Ship it with the FRICTION-021 fix; they are the same code path and the
same afternoon's work.

## Resolution (2026-07-13)

Scoped, as recommended. The indexer now distinguishes a whole-corpus run
from a scoped one (`options.paths !== undefined`) and wipes accordingly:

- `docdog index --full` — unchanged, `DELETE`s every derived row.
- `docdog index --full --path X` — clears only the rows under `X` and
  rebuilds them. The scoped wipe reuses `sweepGhostFiles` against an
  empty discovered-set, which is exactly "drop every file under these
  prefixes".

The CLI now passes `paths: undefined` when `--path` is absent (it used
to pass `config.scan_paths`, which made the two cases indistinguishable
from inside the indexer). `docdog_index`'s MCP handler already had the
right shape and inherits the fix. Both behaviors are pinned by tests —
one asserting a scoped rebuild leaves records outside the path intact
(including their edges), one asserting an unscoped `--full` still drops
a record whose file has left the corpus.

`--full --path X` now means the obvious and useful thing: rebuild X from
scratch. Which is what the orchestrator needed when their
`code-guidelines/` parser change wouldn't take, and could not get.
