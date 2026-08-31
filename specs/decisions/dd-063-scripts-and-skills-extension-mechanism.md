---
id: DD-063
title: "Project extension: scripts for deterministic ops, skills for agent workflows"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-027 under DD-034's artifact-resilience lens. `.docdog/scripts/` holds project-specific TypeScript/JS for deterministic operations (run via `docdog run`). `.docdog/skills/` holds provider-neutral markdown skills for agent workflows. Both are shipped as template seed content and user-owned post-init."
relationships:
  - supersedes: EJ-027
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-048
  - references: DD-061
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check
  - references: DD-039
    context: retired skills need no ceremony — git history preserves them per DD-039
---

# DD-063: Scripts and skills as the extension surface

Two extension points, each for a different audience:

## `.docdog/scripts/`

Project-specific TypeScript or JavaScript files that run
deterministic operations. Invoked via `docdog run <name>`. The
runner resolves `.docdog/scripts/<name>.ts`, loads the project
config, opens an Arango connection, and calls the script's
default export with a `ScriptContext` (`config`, `db`,
`projectRoot`, `args`).

Scripts are the escape hatch for anything too project-specific
to live in docdog core but too mechanical to delegate to an
agent — custom ingest for a legacy format, one-off data fixups,
render passes that produce a materialized view.

## `.docdog/skills/`

Provider-neutral markdown skills (DD-048). Shipped via the
active template at init time and copied into the user's project
for ownership. `docdog templates refresh` can sync updates
explicitly; nothing syncs automatically.

## Lifecycle

No formal one-off vs permanent distinction. Delete scripts and
skills when they're done — git preserves the history if anyone
needs to resurrect one (DD-039).

## DD-034 check

Direct fit. Both extension points are plain files under
`.docdog/`. A vanilla agent can `ls .docdog/scripts/` and
`ls .docdog/skills/` and know exactly what extension points the
project has added, with no docdog-mediated step.
