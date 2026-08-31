---
id: FRICTION-008
title: "`gc.deleted_ttl_hours` config field is a DP-001 Tier-3 violation — remove entirely"
collection: issues
status: resolved
fixed_date: 2026-04-14
severity: blocks-work
description: "Current shipped config has `gc.deleted_ttl_hours: 24` and `docdog gc` auto-hard-deletes soft-deleted records older than the threshold. This is code making a semantic judgment about 'safe to delete' — forbidden by DP-001. Post-hoc visibility cannot rescue the violation because hard-delete is irreversible. Fix: remove the field, replace with explicit enumerate+delete per PROPOSAL-004."
related:
  - DP-001
  - DISC-007
  - PROPOSAL-004
  - OQ-21
relationships:
  - references: DP-001
    context: the violation reported — the TTL value is a semantic judgment neither code nor a config-time user can make
  - references: DISC-007
  - references: PROPOSAL-004
  - references: OQ-21
  - references: PROPOSAL-003
    context: its §7.3 orphan-cleanup TTL sweep fell with this fix — orphans never auto-expire now
  - references: FRICTION-013
    context: its --force workaround was obsoleted by this fix's gc list/hard-delete replacement path
---

# FRICTION-008: `gc.deleted_ttl_hours` is a DP-001 violation

## Current state

`.docdog/config.yaml` ships with:

```yaml
gc:
  deleted_ttl_hours: 24
  cache_ttl_days: 30
```

`docdog gc` uses `deleted_ttl_hours` as the threshold for hard-deleting
soft-deleted vertices (and, once cascade deletion ships from DISC-007,
their cascaded edges).

## Why this is a DP-001 violation

Under DP-001's three-tier test:

- **Tier 1 (pure mechanics):** "hard-delete records older than X" is
  mechanical given a threshold.
- **Tier 2 (visible defaults):** a config field is visible and overridable.
- **Tier 3 (forbidden):** the **value** of the threshold is a semantic
  judgment about when a soft-deleted record is "safe to delete." Code
  can't make this call; the user can't correctly make it at config time
  either, because they don't know at config time which future records
  they're signing up to lose.

The threshold is a proxy for "the user has realized their mistake by
now and anything older is definitely trash." That proxy is sometimes
right and sometimes wrong. **Code picking a proxy for significance is
exactly what DP-001 Tier 3 forbids** — the proxy is code pretending
to make a judgment it can't make.

### Why opt-in doesn't rescue it

Keeping the field for users who explicitly opt in was my first
hedge during DISC-007. It fails for two reasons:

1. **Hard-delete is irreversible.** A user opting in still has to
   guess the threshold, and if they guess wrong, there's no recovery.
   "Post-hoc visibility" via index output is too late — the records
   are gone.
2. **A reasonable-looking default is a footgun.** A field named
   `deleted_ttl_hours` with a sample value of `24` reads as "this is
   the suggested setting." Users will accept it and regret it later.

### Why `cache_ttl_days` is fine

The embedding cache TTL is a different animal:

- Evicted cache entries are **reconstructable** — re-generated on
  cache miss during the next index run.
- No data loss, only a latency hit.
- Cache eviction based on staleness is a classical mechanical pattern
  with well-understood properties.

Cache TTL is Tier 2: visible, overridable, mechanical, reversible.
Soft-delete TTL was Tier 3 because the deletion is irreversible and
the "safe threshold" is a semantic judgment.

## Proposed fix

1. **Remove `gc.deleted_ttl_hours` from the default shipped
   `.docdog/config.yaml`** written by `docdog init`.
2. **Schema: deprecate the field.** Config loader accepts it with a
   warning: *"`gc.deleted_ttl_hours` is deprecated and ignored. Use
   `docdog gc list` + `docdog gc hard-delete` instead."*
3. **Remove the auto-hard-delete code path** in `docdog gc` that reads
   the field. Replace with the enumerate + explicit-delete command
   surface from PROPOSAL-004.
4. **`gc.cache_ttl_days` stays** — see §why-cache-ttl-is-fine.
5. **Migration:** projects that already have `gc.deleted_ttl_hours` in
   their config get the deprecation warning on load. The field being
   ignored is the migration — nothing else breaks.

## Impact

Blocks work for the cascade-deletion feature from DISC-007: cascaded
edges would currently pick up the same TTL and auto-vanish, amplifying
the violation. Must be fixed before or alongside PROPOSAL-003's cascade
spec.

## Related

- **DP-001** — this is the first surfaced code-path violation of the
  principle; confirms the principle works as a review lens
- **DISC-007** — discussion that surfaced this
- **PROPOSAL-004** — the replacement gc command surface
- **OQ-21** — embedding cache eviction, unaffected by this change

## Status

**Resolved 2026-04-14** by landing PROPOSAL-004 together with the field
removal in a single commit:

- `GcConfig.deleted_ttl_hours` removed from the type and default config.
- Config loader emits a deprecation warning and strips the field if it
  still appears in `.docdog/config.yaml` or `config.local.yaml`.
- `runGc` no longer sweeps soft-deleted vertices/edges at all — only
  reversible passes (embedding-cache eviction, terminal-run sweep).
- `docdog gc` with no subcommand now errors and prints usage. Removal is
  always explicit via `docdog gc hard-delete <key…>` which refuses to
  touch records that aren't already soft-deleted.
- `--force` and `--undo` flags deleted. `--undo` → `docdog gc restore`.
- Shipped `.docdog/config.yaml` no longer lists the field.
- MCP `docdog_delete` message now points at `docdog gc hard-delete`
  instead of quoting a TTL.

FRICTION-013's `--force` workaround is obsolete — the replacement path
is `docdog gc list --ids | docdog gc hard-delete --from-stdin --confirm`.

Surfaced: 2026-04-12 during DISC-007.
