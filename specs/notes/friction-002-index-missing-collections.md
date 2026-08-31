---
id: FRICTION-002
title: Adding a vertex_collection to config crashes docdog index with raw ArangoError
collection: issues
status: resolved
fixed_date: 2026-04-14
description: "When new collections are added to .docdog/config.yaml vertex_collections, the next docdog index crashes with an unhandled ArangoError ('collection or view not found'). Workaround: re-run docdog init, which is idempotent and creates missing collections."
severity: blocks-work
relationships:
  - references: FRICTION-004
---

# Friction: `docdog index` crashes when config adds new collections

## What happened

During self-hosting Phase 2, I extended `.docdog/config.yaml` from 2 to 9
`vertex_collections` (adding requirements, principles, guidelines, terms,
domain, constraints, integrations).

Running `docdog index` next crashed:

```
ArangoError: collection or view not found: requirements
```

…followed by ~50 lines of raw Node.js stack trace and a Node crash. No
friendly error, no suggested fix.

## Expected

Either:
- `docdog index` auto-creates missing collections on startup, or
- It fails fast with a clear message: "Config references collections not in
  DB: requirements, principles, …  Run `docdog init` to create them."

## Workaround

Re-run `docdog init` in the same project. It's idempotent: skips the config,
creates only the missing collections, leaves data intact.

## Impact

Blocks work on first encounter. Once you know the workaround it's trivial.
The raw ArangoError crash is the worst part — looks like a code bug, not a
user config issue.

## Related

- Connected to FRICTION-004 (unhandled promise rejection path).

Surfaced: 2026-04-12 during self-hosting Phase 2.

## Resolution (2026-04-14)

`runIndexer` now probes every collection in `vertex_collections` +
`edge_collections` at startup. If any are missing, it logs
`"Config references collections not in DB — running setup..."` and
invokes the idempotent `setupCollections` before proceeding. Steady
state pays only for cheap `.exists()` checks. Also FRICTION-004 now
wraps the CLI entrypoint so any raw error gets a friendly message
anyway.

Covered by `graph-pipeline.test.ts > auto-creates collections that
were added to config between runs`.
