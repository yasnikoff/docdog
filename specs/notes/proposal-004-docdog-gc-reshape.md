---
id: PROPOSAL-004
title: "`docdog gc` reshape — enumerate + explicit-delete + restore"
collection: proposals
status: shipped
date: 2026-04-12
shipped_date: 2026-04-14
related:
  - DP-001
  - FRICTION-008
  - DISC-007
  - DISC-005
  - PROPOSAL-003
  - OQ-21
relationships:
  - discussed_in: DISC-007
  - references: DISC-005
  - references: DP-001
    context: the reshape's whole motivation — auto-TTL hard-delete was Tier 3, gc becomes enumerate plus explicit delete
  - sourced_from: FRICTION-008
    context: FRICTION-008 surfaced TTL violating DP-001
  - references: PROPOSAL-003
    context: subsumes its relationships-pending surface — gc list --orphans replaces it
  - references: OQ-21
  - references: PROPOSAL-005
description: "Replace `docdog gc`'s TTL-based auto-cleanup with a three-subcommand surface: `gc list` (enumerate candidates), `gc hard-delete` (delete by explicit id), `gc restore` (un-soft-delete). Agent+user reasons about what to keep vs delete; code is a pure lever. Depends on FRICTION-008 removing `deleted_ttl_hours`."
---

# PROPOSAL-004: `docdog gc` reshape

## Motivation

DP-001 requires that docdog's code never infer significance. The
current `docdog gc` behavior — auto-hard-delete records older than
`gc.deleted_ttl_hours` — is a Tier-3 violation (see FRICTION-008).
This proposal replaces the auto-cleanup with a mechanical command
surface that agents and users drive directly.

## Design under DP-001

The command surface is strictly three tiers:

- **`gc list`** — enumeration (pure mechanics, Tier 1)
- **`gc hard-delete`** — deletion by explicit reference (Tier 1 given
  the caller has already decided)
- **`gc restore`** — un-soft-delete by explicit reference (Tier 1)

**All filters on `gc list` are enumeration filters, not decision
criteria.** Age, collection, record-type, source-path can narrow the
list the user sees, but the command never decides what's worth
deleting. The decision happens outside the command, in an agent+user
loop that consumes the list.

## Commands

### `docdog gc list`

```
docdog gc list [--soft-deleted] [--orphans] [--code-refs] [--all]
               [--collection NAME]
               [--since DATE] [--until DATE] [--older-than DUR]
               [--reason never-existed|target-deleted]
               [--doc-id ID]
               [--source-file PATH]
               [--json | --table | --ids]
```

Enumerates candidate records for review:

- **`--soft-deleted`** — soft-deleted vertices and their cascaded edges
  (`deleted_at != null` in any vertex or `dd_edges_*` collection)
- **`--orphans`** — records in `dd_edges_orphan` (from DISC-005 and
  DISC-007)
- **`--code-refs`** — records in `dd_code_refs` (from PROPOSAL-005),
  typically used with `--doc-id` to audit occurrences of a specific
  id for false positives
- **`--all`** — all of the above (default when no explicit flag is given)
- **`--collection NAME`** — limit to one collection
- **`--since DATE` / `--until DATE`** — absolute date range filters
- **`--older-than DUR`** — relative age filter (e.g. `30d`, `6h`). **Not
  a decision criterion** — just a display filter.
- **`--reason never-existed|target-deleted`** — orphan-specific filter
- **`--doc-id ID`** — code-refs-specific filter; limit to occurrences
  of a particular doc id (added by PROPOSAL-005 amendment)
- **`--source-file PATH`** — show records authored by or related to a
  specific source file; for `--code-refs`, this filters by the scanned
  source code file
- **`--json`** — machine-readable output for agent consumption
- **`--table`** — human-readable table (default)
- **`--ids`** — just the ids/keys, for piping into `gc hard-delete`

Output (table mode):

```
SOFT-DELETED VERTICES (3)
  _key        id             collection  deleted_at           source_file
  abc123      FRICTION-999   issues      2026-04-10 14:00:00  specs/notes/friction-999-...md
  def456      OQ-50          questions   2026-04-12 09:30:00  specs/notes/oq-50-...md
  ...

ORPHAN RECORDS (2)
  _key        target_id      type         reason          source_vertex    source_file
  xyz789      FUTURE-100     references   never-existed   decisions/a1b2   specs/decisions/ej-042.md
  pqr012      FRICTION-999   references   target-deleted  discussions/c3   specs/notes/discussion-004-...md
```

### `docdog gc hard-delete`

```
docdog gc hard-delete <_key|id>...
docdog gc hard-delete --from-stdin        # read ids from stdin (pipe from gc list --ids)
docdog gc hard-delete --confirm             # bulk confirmation skip for scripts
```

Hard-deletes the specified records. Accepts either `_key` or semantic
`id`. Mixed input is allowed.

**Safety:**
- For batch hard-deletes of 5+ records, require `--confirm` or an
  interactive y/n prompt
- Refuse to hard-delete records that are **not** already soft-deleted
  (or orphan records) — `hard-delete` is the second step of a
  two-step removal, never a one-shot destructive action. Error message
  points at `docdog index` (which soft-deletes missing sections
  automatically) or an appropriate alternative

**Dry-run:**
```
docdog gc hard-delete --dry-run <ids...>
```
Shows what would be deleted without touching the DB.

### `docdog gc restore`

```
docdog gc restore <_key|id>...
docdog gc restore --from-stdin
```

Un-soft-deletes the specified records. Sets `deleted_at = null` on the
vertex and, if cascade-deletion landed (from DISC-007), also finds and
restores its cascaded edges. If the source file has been re-added
between soft-delete and restore, a subsequent `docdog index` run will
normally reconcile state — `restore` is for the case where the user
wants the record back immediately without waiting for indexing.

Orphan records can also be restored (converted back into real edges)
if their target now resolves. Alternatively they resolve automatically
on the next `docdog index` via orphan replay (DISC-005 §7.2).

## Typical agent+user workflow

```
# 1. Agent enumerates
$ docdog gc list --older-than 30d --table

# 2. Agent reviews output, reasons about which records are worth
#    keeping vs deleting. Consults user on borderline cases.

# 3. Agent proposes deletion list. User confirms.

# 4. Agent executes:
$ docdog gc hard-delete FRICTION-999 OQ-50 abc123

# 5. Agent reports outcome to user.
```

Or piped:

```
$ docdog gc list --orphans --reason never-existed --older-than 90d --ids \
    | docdog gc hard-delete --from-stdin --confirm
```

The pipe is still explicit — the user (or the skill they're running)
is directing every stage. No background process is making judgment calls.

## What doesn't change

- `gc.cache_ttl_days` and the embedding-cache eviction pass stay as-is.
  Cache eviction is reversible (cache entries are reconstructable), so
  it's Tier 2 under DP-001 and the classical age-based policy applies.
  OQ-21's pending discussion on cache eviction policy is unaffected.
- `docdog gc --cache` (or equivalent flag triggering the cache pass)
  stays as a separate subcommand. Maybe `docdog gc cache`
  for consistency with the new subcommand style.

## New subcommand structure

```
docdog gc list          # enumerate soft-deleted + orphans
docdog gc hard-delete   # delete by explicit id
docdog gc restore       # un-soft-delete by explicit id
docdog gc cache         # cache eviction pass (reversible, mechanical, TTL-driven)
```

## Estimated effort

Small-to-medium.

- **New `gc` command tree** (~80 LOC): commander subcommand registration,
  arg parsing, flag handling
- **`gc list` implementation** (~120 LOC): AQL queries for
  soft-deleted vertices, cascaded edges, orphan records; output
  formatting (table, json, ids)
- **`gc hard-delete` implementation** (~60 LOC): accept ids, validate
  (must be soft-deleted or orphan), AQL remove, confirmation prompt,
  dry-run
- **`gc restore` implementation** (~60 LOC): accept ids, find record
  + cascaded relationships, unset `deleted_at`, AQL update
- **`gc cache` implementation** (~20 LOC): extract the existing
  cache-eviction code path into its own subcommand
- **Deprecate `gc.deleted_ttl_hours` field** (~15 LOC): config
  loader warning, remove the field from shipped template
- **Tests** (~200 LOC): list variants, hard-delete safety (refuse
  non-soft-deleted), restore variants, dry-run, pipe from list to
  hard-delete, confirmation prompt

**Total:** ~350 LOC + ~200 LOC tests.

## Dependencies

- **Blocking:** FRICTION-008 (`deleted_ttl_hours` removal must happen
  as part of or before this proposal)
- **Related:** DISC-007 cascade soft-delete + orphan rename (both
  consumed by `gc list`)
- **Related:** PROPOSAL-003's `docdog relationships pending` command
  from DISC-005 is subsumed — `docdog gc list --orphans` replaces it.
  Smaller command surface, same capability.

## Rejected alternatives

- **Keep `docdog gc` as a single command with flags.** Fails because
  we need three distinct behaviors (list, delete, restore) with
  different argument shapes. Subcommands are clearer.
- **Interactive TUI for gc review.** Nice-to-have but forces synchronous
  human interaction. Subcommands compose better with agents and
  scripts.
- **Auto-cleanup with explicit opt-in flag.** Rejected in DISC-007 /
  FRICTION-008 — the threshold is a semantic judgment the user can't
  correctly make at config time, and hard-delete is irreversible.

## Status

Proposed. Ships together with FRICTION-008 and the DISC-007 cascade
soft-delete design. Ready for review and decision.
