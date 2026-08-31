---
id: FRICTION-013
title: "`docdog collections check` warns on soft-deleted edges; `docdog gc` doesn't prune edges under TTL"
collection: issues
status: resolved
severity: inconvenient
description: "Surfaced while trying to reach a zero-warning corpus after PROPOSAL-017. Eight `superseded_by` edges in `dd_edges_unspecified` from batch 1's aborted first attempt were soft-deleted (`deleted_at` set) but still counted by `docdog collections check`, producing a `relation_type_without_meta` warning. `docdog gc` skipped them because they were under the 24h TTL — and actually never swept edge collections at all. Manual purge via a one-off script cleared them. Resolved: consistency check + `listUnknownRelationTypes` now filter `deleted_at == null`; `runGc` now sweeps edge collections alongside vertex collections; `docdog gc --force` bypasses TTL."
relationships:
  - references: PROPOSAL-017
    context: the refactor whose aborted first batch created the stale soft-deleted edges; zero warnings only after this fix
  - references: EJ-016
    context: the triggering edit — stripping its top-level superseded_by field
  - references: FRICTION-012
    context: the aborted batch-1 attempt captured there created the stale edges
  - references: DD-049
    context: the soft-delete contract this leak violated — implementation bug, not model flaw
  - references: OBS-006
    context: suggests a consistency-check playbook analogous to OBS-006's vocabulary playbook
---

# FRICTION-013: Consistency check doesn't filter soft-deleted edges

## Trigger

Follow-up session after PROPOSAL-017 shipped. Tried to strip
EJ-016's top-level `superseded_by` field (the last known source
of the lone `relation_type_without_meta` warning). Re-indexed.
Warning persisted.

Grepping the corpus confirmed no remaining `superseded_by`
YAML-key occurrences in any frontmatter. `docdog traverse
EJ-016` showed a clean outbound edge set. The warning had to
be coming from stale data in `dd_edges_unspecified`.

## Diagnosis

A throwaway script (`.docdog/scripts/purge-stale-superseded-by.js`)
queried `dd_edges_unspecified` directly for edges with
`type == "superseded_by"`. Found 8 rows, all with
`deleted_at: 2026-04-12T22:53:22Z` — the exact timestamp of
batch 1's aborted first attempt (the one FRICTION-012
captured).

Two distinct bugs combined to keep the warning live:

### 1. `docdog collections check` counts soft-deleted rows

The consistency check appears to enumerate
`dd_edges_unspecified` without a `FILTER e.deleted_at == null`
clause. Soft-deleted edges still trigger
`relation_type_without_meta`. This contradicts the soft-delete
contract (DD-049): a soft-deleted row should be invisible to
read paths until `gc` hard-deletes it.

### 2. `docdog gc` respects TTL absolutely

The 8 stale edges were deleted at 2026-04-12T22:53Z. The
follow-up session ran at 2026-04-13T00:03Z — only ~1h10m
later, well under the 24h `deleted_ttl_hours` default. `gc`
correctly refused to purge them, but the combination with bug
#1 means the only way to reach a clean consistency-check state
within the TTL window is to either (a) wait 24h, (b) temporarily
lower the TTL, or (c) manually purge via a script, which is
what the workaround here did.

## Workaround used

Wrote `.docdog/scripts/purge-stale-superseded-by.js` — dry-run
by default, `--delete` to actually remove. Committed as an
artifact of the finding so the operation is reviewable and
repeatable if similar sludge surfaces later.

After the manual purge, `docdog collections check` reported
zero warnings for the first time since PROPOSAL-017 started.

## What should change

Two independent fixes:

1. **Consistency check should filter `deleted_at == null`.** This
   is the bug of real consequence — any soft-deleted edge in
   `dd_edges_unspecified` (or any collection) will produce phantom
   warnings for up to 24h after its removal. The fix is a one-line
   `FILTER` in the AQL the check emits.
2. **`gc --force` or `gc --include-recent`.** Add an explicit
   flag that bypasses TTL for cases where the user knows the
   soft-deleted rows are stale and wants them gone now. Alternative:
   `gc --orphans-only` for edges whose `_from` or `_to` vertex has
   been removed — that's the class of row that's definitionally
   garbage regardless of TTL.

Fix #1 is the higher-impact one and much smaller; fix #2 is a
nice-to-have that would let users skip the workaround script
entirely.

## Resolution

Both fixes shipped in the follow-up session:

1. **Consistency check filters soft-deletes.** Added
   `FILTER e.deleted_at == null` to both AQL queries over
   `dd_edges_unspecified` in `src/arango/meta.ts`
   (`runConsistencyCheck` and `listUnknownRelationTypes`).
   Regression covered by a new test in
   `tests/integration/meta-collections.test.ts` that seeds one
   live + one soft-deleted edge with unknown types and asserts
   only the live one surfaces.

2. **`gc` sweeps edges; `--force` bypasses TTL.** Diagnosing fix
   #2 turned up a deeper bug: `runGc` only iterated
   `getVertexCollections(config)`, so soft-deleted edges were
   *never* hard-deleted at all regardless of TTL. Extended the
   sweep to cover `getEdgeCollections(config)` too, then added
   the requested `--force` flag that bypasses
   `deleted_ttl_hours` for the "I know these are stale, remove
   them now" case. Regression test in
   `tests/integration/graph-pipeline.test.ts` seeds a fresh
   soft-deleted edge, asserts normal gc (24h TTL) leaves it
   alone, then asserts `--force` removes it.

The `--orphans-only` alternative from the original note was
not needed — now that gc sweeps edges, the manual purge script
goes away on its own, and `--force` handles the urgency case.

## Related

- DD-049 — soft-delete + `docdog gc` model. FRICTION-013 is a
  leak in that model's implementation, not a flaw in the model
  itself.
- FRICTION-012 — the batch 1 aborted attempt that created the
  stale edges. The edges lived inside the 24h TTL for the
  entire rest of PROPOSAL-017 and nobody noticed because the
  warning count was constant at 1.
- PROPOSAL-017 — the arc that surfaced this when it finally got
  around to trying for a clean consistency-check state.
- OBS-006 — three-way playbook for `status_not_in_vocabulary`
  warnings. FRICTION-013 suggests a similar playbook might be
  needed for `relation_type_without_meta` warnings, since the
  "real" and "phantom" cases currently look identical.
