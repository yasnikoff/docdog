---
id: FRICTION-059
title: "Editing a parser script re-parses nothing — FRICTION-021's fix hashes the scan entry that names the script, not the script"
collection: notes
status: open
date: 2026-09-25
description: "Incremental `docdog index` skips a file whose hash is unchanged, and since FRICTION-021 that hash covers the file's content plus a signature of its scan entry. For `parser: script` the entry holds only the script's NAME, so editing `.docdog/scripts/<name>.ts` changes nothing the key sees: the old parse stays in the cache, the run reports success, and only `--full` applies the new script. Every script author hits this on their second iteration and reads it as their fix not working."
severity: inconvenient
upstream_issue: https://github.com/yasnikoff/docdog/issues/1
relationships:
  - references: FRICTION-021
    context: "the resolved friction this is the residue of — its fix made change detection config-aware, and a script parser's behaviour lives in a file the config only names"
  - references: DISC-042
    context: "found in the same pre-post verification of issue #1's script sketch as FRICTION-058"
  - references: FRICTION-046
    context: "the same shape one layer over: an invalidation key that omits an input which changes the output, so a change is silently not applied"
  - references: FRICTION-058
    context: "the other defect the same verification found; together they are what a first-time script author meets in their first two runs"
  - references: DD-067
    context: "the parser system; `parser: script` is its escape hatch and the only parser whose code is not versioned with docdog"
---

# FRICTION-059: a parser script edit is invisible to incremental index

## What was being attempted

Fixing the issue #1 sketch after FRICTION-058: edit
`.docdog/scripts/rows.ts` to apply the entry's collection and to skip
fenced code, then `docdog index`.

## What went wrong

`Graph total: 14 record(s)` — unchanged. The fenced `D-ARCH-99` was still
a record, every row still `[notes]`. `docdog index --full` then produced
13 records in `decisions`, i.e. the edit was correct and had simply never
run.

FRICTION-021's resolution hashes file content plus *"a signature of the
scan entry that governs it (every key except `path`)"*. For a script
entry that signature includes `script: rows` — the name — and nothing
about what `rows.ts` contains.

## Workaround

`docdog index --full` after every script edit. Cheap on a small corpus;
embeddings are reused, so it costs parse time, not vectors. The drafted
issue #1 comment says so.

## What should change

Fold the script file's content hash (LF-normalized, per the discovery
convention) into the scan-entry signature for `parser: script` entries.
Then editing the script dirties exactly the files that entry governs —
FRICTION-021's own semantics, extended to the one input it could not see.
Mechanical (DP-001 tier 1). Imports the script makes are out of reach of
this and should be named as the residual rather than chased: a script
importing a helper can still go stale, and `--full` stays the answer
there.
