---
id: FRICTION-009
title: "Indexer doesn't detect whole-file deletion from disk"
collection: notes
status: resolved
fixed_date: 2026-04-12
description: "Vertices whose source file is removed from disk stay live in the graph until manually GC'd. §7.6 cascade only fires on ghost sections inside an existing file. FIXED by the sweepMissingFiles helper in runIndexer — now runs on every index pass, scoped to scan_paths, and uses cascadeVertexSoftDelete to keep inbound/outbound edges in sync."
severity: inconvenient
related: [PROPOSAL-003]
relationships:
  - references: PROPOSAL-003
    context: hit while implementing its §7.6 cascade — whole-file deletion never triggered the vertex soft-delete
---

# FRICTION-009: Indexer doesn't detect whole-file deletion

## What I was trying to do

While implementing PROPOSAL-003 cascade soft-delete (§7.6), write an
integration test that simulates the "author removes a source file
entirely" case. The spec describes cascade as triggered when "a vertex
X is soft-deleted because its source file disappeared from disk" —
I expected `rm specs/notes/cascade-a.md && docdog index` to soft-delete
the CASCADE-A vertex and then run the §7.6 cascade on its edges.

## What actually happens

`docdog index` doesn't detect disk-file deletion at all. The indexer:

1. Calls `discoverAndParseFiles` — walks `scan_paths` and finds
   whatever is currently on disk.
2. Calls `loadExistingFileHashes` against **only the files it found**
   (via `FILTER doc.source_file IN @paths` where `@paths` is the list
   of found files).
3. Reconciles each on-disk file individually.

Vertices whose `source_file` is no longer in the on-disk set are
never visited. They stay `deleted_at: null` forever, which also means
§7.6 cascade never fires for them — so inbound edges stay pointing at
a "live" vertex that no longer has a file, and outbound orphan records
never get swept.

## Workaround I used

I sidestepped it in the cascade test by rewriting the file with a
different `id` field. That changes the section_key, so the OLD vertex
becomes a ghost (section in DB not in parsed sections) and the
existing `reconcileFile` toRemove branch fires — which is where I
wired the cascade call. That gets the test green, but it only
exercises the "section disappears from inside a still-present file"
half of §7.6. The "whole file gone" half stays untested.

## What should change in docdog

The indexer needs a whole-file orphan sweep. After pass 1 but before
pass 2 (or folded into pass 1), it should:

1. Load all non-deleted vertices with `source_file != null` across all
   `vertex_collections`.
2. Diff against the set of files discovered on disk during this run.
3. For each vertex whose `source_file` isn't in the disk set, run
   `cascadeVertexSoftDelete` then set `deleted_at = now`.

Complication: the sweep needs to be scoped to the paths the current
`--path`/`scan_paths` covered. Deleting a file outside the scan scope
shouldn't trigger cleanup (that path may not have been asked about).
So the diff is really "within this run's scan roots, which files are
on disk vs which files have vertices."

This is ~30 LOC plus tests. Not blocking anything shipped, but it's
the last piece needed for PROPOSAL-003 §7.6 to be fully load-bearing.
Until it lands, users who rename or remove whole spec files need to
run `docdog gc` manually (or their spec graph slowly accumulates
dangling vertices).

## Severity: inconvenient

Not blocking — the test is green via the section-rename workaround
and the cascade helper itself is correct. But the CLI doesn't do the
thing the spec promises for whole-file removal, and that's a trap for
anyone who deletes a spec file expecting docdog to notice.
