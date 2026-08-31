---
id: FRICTION-016
title: "Shipped ingest skill still claims `docdog add` infers ids from filenames"
collection: notes
status: resolved
fixed_date: 2026-07-11
description: "templates/skills/_common/ingest.md (and this repo's .docdog/skills/ingest.md copy) said add stamps 'id from filename' — exactly the behavior FRICTION-005 removed and DP-001 forbids. Fixed same day: the skill now states the real contract (id only via explicit --id, single file; bulk schemes are agent scripts), both copies synced, and a sweep of the other _common skills found no further v2-era claims."
severity: inconvenient
relationships:
  - references: FRICTION-005
    context: "the skill line describes the pre-FRICTION-005 behavior; the code comment in engine/ingest.ts explicitly refuses filename-derived ids"
  - references: DP-001
    context: the principle the stale skill claim violated — docdog never infers ids
  - references: PROPOSAL-024
    context: fixed in the same session and change as P-024's suggest-edges implementation
---

# FRICTION-016: Shipped ingest skill still claims `docdog add` infers ids from filenames

## What I was doing

Assessing whether docdog needs dedicated corpus-adoption tooling
(prompted by the orchestrator adoption plan, PLAN-DOCDOG-001). That
meant reading the skills an adopting repo actually receives at
`docdog init` — `templates/skills/_common/` — against the v3 code.

## What's wrong

`templates/skills/_common/ingest.md` says:

> `add` stamps YAML frontmatter (title from first heading, **id from
> filename**, collection, extracted status/date) onto files.

The code does the opposite, deliberately. `src/engine/ingest.ts`
(`stampFiles`) carries an explicit comment: *"FRICTION-005 / DP-001:
docdog does NOT infer ids from filenames — the only way `docdog add`
stamps an id is via the explicit `--id <value>` flag."* And `--id`
refuses multi-file sources outright.

So the one skill specifically written to guide corpus adoption
mis-describes the adoption command's core behavior. The failure mode
is silent: an agent runs `docdog add specs/foo/ --collection foo`
expecting ids, gets none, and everything still indexes — vertices
fall back to path-derived section keys — so nothing errors until
`docdog_get <ID>` or `docdog_relate` misses much later.

The same stale text exists in this repo's installed copy,
`.docdog/skills/ingest.md`.

## Workaround

None needed once you know; the orchestrator plan already routes id
assignment through an explicit per-cohort script instead of `add`.

## What should change

Fix the sentence in `templates/skills/_common/ingest.md` (and
re-sync this repo's `.docdog/skills/ingest.md`) to state the real
contract: `add` stamps title/collection/extracted status–date;
`id` only via explicit `--id`, single file at a time; bulk id
schemes are agent-script territory per DP-001. Worth a quick
sweep of the other `_common` skills for v2-era claims while there.

## Resolution (2026-07-11)

Done as described, same session (alongside PROPOSAL-024): sentence
replaced with the real contract, both copies synced, sweep of
`_common` skills found no other stale claims (the `.ts` project-
script example was verified accurate against run.ts). The ingest
skill's `docdog split` / split-parser guidance was already correct.
