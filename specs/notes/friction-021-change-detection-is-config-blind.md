---
id: FRICTION-021
title: "Parser-config changes never re-apply — change detection is file-hash-only and config-blind"
collection: notes
status: resolved
fixed_date: 2026-07-13
description: "Adding a `parser: split` entry for an already-indexed path does nothing: incremental `docdog index` skips files whose file_hash is unchanged (indexer.ts:164), and the hash covers only file content, not the scan-path config that governs how the file is parsed. The orchestrator's escape hatch (`--full`) reportedly returned `0 file(s), 0 reindexed` — NOT reproduced here (a full rebuild on this corpus reindexes 268/268) — so they hand-deleted rows from index.db instead."
severity: inconvenient
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-split-parser-gaps.md
relationships:
  - references: DD-067
    context: "pluggable parsers are selected by scan-path config — so the config is an input to the derivation, and change detection that ignores it is incomplete by construction"
  - references: DD-070
    context: "'the cache is disposable, rebuild from disk' is the v3 safety net; it only holds if a rebuild is reachable through the CLI rather than by hand-editing index.db"
  - references: DP-001
    context: "folding the governing scan entry into the file hash is pure mechanics — a derivation keyed on all of its inputs, not a judgment call"
  - references: WF-002
    context: harvested from the external dogfood track
  - references: FRICTION-022
    context: the prime suspect for the unreproduced half — `--full` combined with `--path` wipes the whole cache and reindexes only the scoped subtree, and a scoped path matching nothing prints exactly the `0 file(s), 0 reindexed` they saw
  - references: FRICTION-020
    context: the whether-`--full`-can-no-op question stays open with the adopter alongside FRICTION-020 — both are unexplained index-behavior reports from the same corpus
---

# FRICTION-021: Parser-config changes never re-apply

## What they were doing

Wiring `parser: split` over `specs/upstream-context/` in the
orchestrator corpus — specifically, adding a `split` entry for
`code-guidelines/` *after* those files had already been indexed with
the default parser.

## What went wrong

Nothing happened. Two layers:

**1. Incremental index is config-blind (confirmed in source).**
`src/storage/indexer.ts:164`:

```ts
const changedFiles = parsedFiles.filter(
  (f) => existingHashes.get(f.repoRelPath) !== f.fileHash,
);
```

The dirty check is `file_hash` only. The file content did not change —
the *config that governs how the file is parsed* did. So every
affected file is skipped, and the new parser never runs. This is the
root defect and it is real.

**2. `--full` reportedly did nothing either.** They report
`docdog index --full` printing `0 file(s), 0 reindexed` and changing
nothing.

**This half does not reproduce.** On this repo's corpus at `4553f18`,
`npx tsx src/cli/index.ts index --full` prints
`268 file(s), 268 reindexed` and exits 0, and the code path is sound:
`full` is wired through from the CLI (`index-cmd.ts`), sets
`fullRebuild`, and `DELETE`s every derived table before reindexing.
`0 file(s)` means *discovery returned nothing*, which points at their
invocation or scan-path state rather than at the `--full` flag —
notably, a full rebuild that had really run and found nothing would
have left them with an empty index, and it did not. **Needs their
exact command and config to pin down.**

## Workaround

Hand-deleted the affected rows from `files`/`vertices` in `index.db`
(or delete the whole cache and pay full re-embedding).

## What should change

Fold the governing scan entry into the change-detection key: hash the
file content **plus** the resolved scan-path config for that file
(`matchScanEntry` already computes exactly that resolution for the
write path). A config edit then dirties precisely the files it
governs, and re-parsing follows automatically — no flags, no cache
surgery.

That fix makes the `--full` question much less load-bearing, but the
unreproduced report should still be chased: if `--full` can silently
no-op in some configuration, the documented escape hatch is a lie in
exactly the moment someone reaches for it.

## Resolution (2026-07-13)

Fixed as described. `parseFile` (`src/engine/discovery.ts`) now hashes
the file content **plus** a signature of the scan entry that governs it
(every key except `path`, which is excluded so that a full scan and a
single-file reindex of the same file agree). Editing `parser:`,
`split_on:` or `collection:` in config now dirties exactly the files
that entry governs, and the new parser runs on the next plain `docdog
index` — no flags, no cache surgery. Covered by a test that flips a
byte-identical file from default to split parsing and asserts the
vertices change from one whole-file record to `CG-001` / `CG-002`.

One-time cost, as expected: the hash formula changed, so the first
index after this lands reports every file as changed. Embeddings are
reused from `embed_cache` (keyed on content, not file hash), so it is
cheap — this repo's corpus reindexed 277/277 with **0 embedded, 277
reused**.

**The unreproduced half stays unexplained** — but it now has a prime
suspect. FRICTION-022, found while chasing it, shows that `--full`
combined with `--path` wipes the whole cache and reindexes only the
scoped subtree; a scoped path matching nothing would print exactly the
`0 file(s), 0 reindexed` they saw. That is a lead, not a confirmation
(their cache was demonstrably not emptied), so the question of whether
`--full` can no-op stays open with them, alongside FRICTION-020.
