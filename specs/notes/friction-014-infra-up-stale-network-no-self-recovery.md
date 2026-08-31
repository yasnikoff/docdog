---
id: FRICTION-014
title: "`docdog infra up` can't recover from a half-created network; container pins to a stale network ID"
collection: issues
status: resolved
severity: inconvenient
fixed_date: 2026-07-11
resolution_approach: obsoleted
fix_commit: 095146bf77f1d52b8356b7e610407188342e1847
description: "Surfaced while reindexing after enriching DISC-019. First `docdog infra up` created the `docdog_default` network but the container failed to attach (`failed to set up container networking: network <id> not found`) — a Docker Desktop transient. The container was then pinned to the now-missing network id, so repeated `docdog infra up` kept failing identically with no self-recovery; only `docdog infra down && docdog infra up` cleared it. Secondary: `infra up` prints 'ArangoDB started' before the server accepts connections, so an immediate `docdog index` fails with 'cannot reach ArangoDB' until the DB is actually ready. Obsoleted 2026-07-11: DD-070's v3 scope cut deleted docdog infra, Docker, and ArangoDB wholesale — the surface this friction hardens no longer exists."
relationships:
  - references: DD-070
    context: "obsoleted by the v3 scope cut — docdog infra, Docker Compose, and ArangoDB were deleted (P-023 §5); resolved by deletion, not by a fix"
  - references: WF-001
    context: hit during a routine WF-001 capture follow-up
  - references: DISC-019
    context: the record being enriched when the indexing failure hit
  - references: FRICTION-001
    context: same infra-liveness neighborhood; both mooted when v3 deleted the surface
---

# FRICTION-014: `infra up` doesn't self-recover from a stale/missing Docker network

## Trigger

Routine WF-001 follow-up: after enriching DISC-019 I ran `docdog
index` to make the record searchable. ArangoDB was down, so I ran
`docdog infra up` first.

## What happened

The first `docdog infra up` half-succeeded and then failed:

```
Starting ArangoDB...
 Network docdog_default Creating
 Network docdog_default Created
 Container docdog-arango Starting
Error response from daemon: failed to set up container networking:
  network f4decd4e9888...62dc3 not found
Failed to start ArangoDB. Is Docker running?
```

The network was *created* one line earlier, then reported *not
found* when the container tried to attach — a Docker Desktop
daemon race/state glitch, not a docdog bug on its own.

The real friction is what came next. Every subsequent `docdog infra
up` failed with the **same stale network id**:

```
 Container docdog-arango Starting
Error response from daemon: failed to set up container networking:
  network f4decd4e9888...62dc3 not found
Failed to start ArangoDB. Is Docker running?
```

The container had been *created* pinned to that now-missing network
id, and `infra up` has no path to notice or repair that — re-running
it just retries the same doomed start. `docdog index` failed
throughout with `cannot reach ArangoDB — fetch failed`.

## Diagnosis

Two independent gaps:

### 1. `infra up` isn't idempotent against a half-created state

Once a container exists bound to a network that no longer exists,
`infra up` (a plain `compose up` under the hood) can't recover: it
tries to start the existing container as-is instead of recreating it
against a fresh network. There's no `--force-recreate`, no detection
of the stale-network condition, and the error message points at the
wrong cause ("Is Docker running?" — Docker *was* running).

### 2. `infra up` reports success before the server is ready

After recovery (below), `infra up` printed:

```
ArangoDB started on http://localhost:8529
```

but an immediately-following `docdog index` still failed with
`cannot reach ArangoDB — fetch failed`. The container had *started*
but ArangoDB wasn't yet accepting connections. `docdog infra status`
correctly reported `healthy (auth required — server up)` a moment
later, and `index` then succeeded. So the readiness signal exists
(status has it) but `infra up`'s success message races ahead of it.

## Workaround used

`docdog infra down` cleanly removed both the container and the
network:

```
 Container docdog-arango Removed
 Network docdog_default Removed
```

A fresh `docdog infra up` then created a new network + container and
started successfully. Polling `docdog infra status` until it reported
healthy, then running `docdog index`, worked. Total detour: three
extra commands and a readiness wait for what should have been a
single `infra up`.

## What should change

1. **`infra up` should self-recover from a stale/missing network.**
   Detect the "container exists but its network is gone" condition
   and recreate (compose `up --force-recreate`, or `down`-then-`up`
   internally when start fails on a networking error). At minimum,
   the error should name the real fix — *"container is bound to a
   stale network; run `docdog infra down && docdog infra up`"* —
   instead of "Is Docker running?".

2. **`infra up` should wait for readiness before printing success.**
   Reuse the liveness probe `infra status` already has (treats HTTP
   401 as up, per FRICTION-001) and poll until the server answers
   before printing `ArangoDB started`. That removes the "started but
   not reachable" window that trips an immediate `docdog index`.

Fix #1 is the higher-impact one — it turns a wedged-infra dead end
into a self-healing command. Fix #2 is a smaller ergonomic win that
prevents a confusing false failure right after startup.

## Related

- FRICTION-001 — `infra status` misreported Arango as down on HTTP
  401. Same neighborhood (infra liveness/readiness); the readiness
  probe fixed there is exactly what fix #2 should reuse in `infra
  up`.
- Root cause of the initial glitch appears to be Docker Desktop
  (network created then immediately not found), so #1 is about
  docdog *recovering gracefully* from a flaky daemon, not preventing
  the daemon glitch itself.

## Resolution (2026-07-11)

**Approach: obsoleted** — resolved by deletion, not by a fix. DD-070's
v3 scope cut removed `docdog infra` and the entire Docker/ArangoDB
runtime (P-023 §5, shipped in the v3 session-6 deletion pass, commit
`095146bf`). The embedded SQLite cache has no daemon, no network, and
no container to wedge — the problem class is unreachable.

- **What shipped:** nothing against this friction directly; the
  surface died. `src/arango/`, `docker/`, and the `infra` command all
  left the tree together.
- **Rejected alternatives:** the two fixes proposed above
  (self-recovery from a stale network; readiness-gated success
  message) — both still-valid designs against v2, mooted before
  either landed.
- **Knock-on:** FRICTION-001 (infra status 401 liveness) belonged to
  the same deleted surface and was already resolved on its own
  merits. No other open record depends on `infra`.
