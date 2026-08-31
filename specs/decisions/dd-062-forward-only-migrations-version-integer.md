---
id: DD-062
title: "Forward-only migrations, single version integer in config"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-026 under DD-034's artifact-resilience lens. Schema migrations use a monotonic integer in `.docdog/config.yaml`. Runner applies pending migrations in order, updates config crash-safely after each. `dd_meta` is an audit trail. No rollback — git and Arango backups handle that."
relationships:
  - supersedes: EJ-026
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-046
  - references: DD-039
  - references: DD-049
---

# DD-062: Forward-only migrations, version integer in config

**Superseded 2026-07-06 by DD-070** — there is nothing to migrate: the cache is dropped and rebuilt on schema change (DD-070 §2).

## Version scheme

A single monotonic integer lives in `.docdog/config.yaml`:

```yaml
version: 2
```

- No version field → treated as version 0 (pre-existing
  projects).
- `docdog init` writes `LATEST_VERSION` directly (fresh projects
  need no migration).
- Each migration targets a specific version number.

## Migration interface

```typescript
interface Migration {
  version: number;
  description: string;
  up(ctx: MigrationContext): Promise<MigrationResult>;
}
```

The context provides `rawConfig` (deliberately untyped — old
schemas don't match the current `DocdogConfig` interface), `db`
(nullable — Arango may be unavailable), and `projectRoot` /
`configPath`. The result reports whether re-indexing is needed.

## Runner behavior

1. Read the current version from config (0 if absent).
2. Filter the registry for pending migrations (`version >
   current`).
3. Try connecting to Arango; not fatal if unavailable.
4. Apply each pending migration in order, writing config after
   each — crash-safe (if step N fails mid-run, step N-1 is
   already recorded as applied).
5. Record the migration in `dd_meta`; not fatal if Arango is
   unavailable.

## Key design choices

- **No rollback.** Git rolls back config changes (DD-039);
  Arango backups roll back data. Maintaining `down()` methods
  would be a maintenance cost for a local-first tool with no
  corresponding benefit.
- **`rawConfig` is untyped by design.** Migrations work on old
  schemas. Typing them to the current interface would make
  old-schema transforms harder to express, not easier.
- **DB nullable by design.** Config-only migrations run even
  when Arango is down; DB-dependent migrations skip gracefully
  and re-attempt on the next run. The user sees a warning, not
  a crash.
- **Integer, not semver.** Config and DB evolve together. Semver
  would add ordering complexity with no user-visible benefit.

## DD-034 check

Direct fit. `version:` lives in `config.yaml`, which a vanilla
agent reads directly. The `dd_meta` audit trail is
supplementary — it makes history queryable, but the config
field is the source of truth, and git history is the backstop
if anyone needs to see *how* the value got there.
