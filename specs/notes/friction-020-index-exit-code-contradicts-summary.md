---
id: FRICTION-020
title: "First full `docdog index` exited 1 after printing a successful summary, with nothing on stderr"
collection: notes
status: resolved
fixed_date: 2026-08-27
resolution_approach: fix
description: "Reported by the orchestrator adoption: the first full index printed `343 file(s) … 561 vertices upserted` and then exited 1 with an empty stderr; the incremental re-run exited 0. An exit code that contradicts the printed summary makes scripted gating unreliable. NOT reproduced here — two cold indexes on Windows (fresh cache, 268 and 276 records, full ONNX embed sessions) both exit 0 — so this needs their environment to pin down. The obvious suspect is embedder/ONNX-runtime teardown, since the only difference between their exit-1 and exit-0 runs was whether any embedding happened."
severity: inconvenient
source: external-dogfood (host-project orchestrator, PLAN-DOCDOG-001)
harvested_from: specs/investigations/docdog-adoption/feedback-2026-07-12-malformed-frontmatter-silent.md
relationships:
  - references: FRICTION-019
    context: reported in the same note and the same first-index run; the two are independent defects and are filed separately
  - references: FRICTION-004
    context: "the last exit-path bug — the top-level handler added then prints `error: …` before exiting 1, which is exactly what did NOT happen here (empty stderr), so this is a different path"
  - references: FRICTION-018
    context: "the shared suspect — both are ONNX-embedder lifecycle problems, and this one only appeared on a run that actually embedded"
  - references: WF-002
    context: harvested from the external dogfood track
  - references: PROPOSAL-045
    context: "the command whose implementation already used `process.exitCode = 1; return;` — the house idiom the other twenty-three exit sites converged on to fix this"
---

# FRICTION-020: Index exit code contradicts the printed summary

## What they reported

The orchestrator adoption's first full `docdog index` printed a
successful summary line (`343 file(s) … 561 vertices upserted`) and
then **exited 1, with nothing on stderr**. The incremental re-run of
the same command exited 0.

A scripted gate cannot trust that. "Did the index succeed?" has two
answers in the same run — the summary says yes, `$?` says no.

## Reproduction attempt (2026-07-13, this repo, Windows)

**Not reproduced.** Two cold runs, cache deleted first so every record
embeds from scratch (the closest local analogue of their first index):

| run | result | exit |
|---|---|---|
| `index --full` (warm embed_cache, 0 embeds) | 268 file(s), 268 reindexed | 0 |
| cold `index` (cache deleted, 268 embeds) | 268 file(s), 268 reindexed | 0 |
| cold `index` (cache deleted, 276 embeds) | 276 file(s), 276 reindexed | 0 |

Stderr in every case contained only the usual transformers.js noise
(`dtype not specified for "model"…`). So on Windows, a full ONNX
embedding session exits cleanly.

## What the shape of it suggests

Their exit-1 run and their exit-0 run differ in one thing: the first
embedded ~561 vertices, the second embedded none (everything was
cached). That points at **teardown of the embedder / ONNX runtime**,
not at the indexer — the indexer had already printed its summary and
returned. The CLI's own top-level error handler is not the culprit
either: it prints `error: <message>` before exiting 1 (FRICTION-004),
and their stderr was empty.

Plausible causes, untested: a native ORT thread-pool teardown setting a
nonzero exit status on Linux; a worker thread kept alive and killed at
exit; a platform-specific onnxruntime-node quirk absent on Windows.

## What's needed to close this

From the adopter side: the exact command, the platform/Node version,
and whether it still reproduces now that the model is cached locally.
If it only reproduces on the *first* run on a given machine (i.e. the
run that downloads the model), the download path — not the embed path —
is the suspect.

Until then this stays open and unreproduced rather than being guessed
at. Worth fixing when it can be seen, because it is a correctness
problem for exactly the automation (CI gates, adoption scripts) that a
tool like docdog invites people to write.

## Resolution (2026-08-27) — the cause was never found; the two paths that could produce it are closed

**The verdict first, because it is unusual.** This is resolved without the
cause being identified, and probably without it being identifiable. What
changed is not "we found it" but "docdog can no longer be the one doing it,
and if it happens again it will say why".

### What is knowable six weeks on

The adopter's corpus lives on this machine, so the record is checkable rather
than remembered. The report is **one occurrence**, on 2026-07-12, in their
first-ever index. Twenty-odd feedback notes and six weeks of daily indexing
have followed it and not one mentions an exit code again. Their environment
that day is also gone: it was a network-restricted sandbox into which the
547 MB fp32 `model.onnx` had been **hand-copied** from another machine's
transformers cache (their sibling report, same day), which is not a state
anyone can restore, and not one docdog forces any more now that
`embed.dtype: q8` exists.

So the original closing condition — "the exact command, the platform, whether
it still reproduces" — cannot be met, and waiting for it is waiting for
nothing.

### What reading the exit path found instead

Two paths inside docdog produce **exactly** the reported shape: a printed
success summary, then exit 1, then an empty stderr. Neither needs the
adopter's environment to be believed, and both are now closed.

**1. Docdog's only explanation of a failure was the thing most likely to be
dropped.** Every command ended a refusal with `printError(...)` immediately
followed by `process.exit(1)` — twenty-three sites. `process.exit` terminates
before pending writes to stdout and stderr have necessarily reached the
terminal, and Node documents those streams as synchronous or asynchronous
*depending on the destination*, with a TTY on Windows — the platform this
project is developed on — among the asynchronous cases. Node's own
documentation gives `printUsageToStdout(); exit(1)` as its example of what
**not** to do, and names setting `process.exitCode` as the fix.

That is FRICTION-020's signature written out: exit 1, nothing said. And the
sharpest instance was the handler FRICTION-004 added *to make failures
visible* — it printed a friendly message and then called the one function
that can throw the message away.

All twenty-three converged on `process.exitCode = 1; return;`, which was
already the house idiom (`split`, PROPOSAL-045) and already how every
**success** path exits — `index`, `init`, `add` and `update` simply return and
let the loop drain. So the change only makes failure behave the way success
always did. `process.exit` had been doing double duty as `return` at every one
of those sites, which is why each needed an explicit one; that is a control-
flow tidy-up, not a behaviour change.

**2. The index's teardown ran after the index's verdict.** `runCacheIndexer`
prints the summary and then closes its handles in a `finally`. A throw from
there turns a completed index into a nonzero exit with nothing on screen to
say which half failed — and at the time of the report, `handle.close()` was
*literally the last docdog code to run* after that summary line (the embed
store and the auto-sweep came later). Closing a handle is housekeeping: every
write is committed by then, and a WAL left uncheckpointed is still durable, so
a failed close costs a file handle the exiting process is about to drop
anyway. It is reported as a teardown warning now and the index keeps its
verdict — the same call `autoSweepEmbedStore` already makes one command over,
for the same reason.

### What is pinned

`tests/unit/cli-exit.test.ts`. A source sweep asserting **nothing under `src/`
calls `process.exit`** — no allowlist, because a command that cannot return
from where it is has a control-flow problem rather than an exit problem, and
commander's own `--help`/parse-error exits are its call and outside this tree.
Plus one spawned refusal (`serve --root <missing>`), because the single way
this change could have gone wrong is a command that used to exit 1 quietly
returning 0 and reading, to a scripted gate, as success.

### What is still not fixed, and cannot be

A native crash or a signal during runtime teardown is invisible to any of
this — no JavaScript runs. If that was the cause, it is still the cause. So is
a dependency setting `process.exitCode` behind docdog's back, which nothing
has been observed doing. Both would still be silent, and both are outside what
a Node process can defend against. What is no longer possible is docdog
throwing, explaining itself, and losing the explanation on the way out.
