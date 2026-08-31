---
id: FRICTION-001
title: "infra status misreports Arango as down when it returns HTTP 401"
collection: issues
status: resolved
fixed_date: 2026-04-14
description: "docdog infra status prints 'container running but not responding yet' even when ArangoDB answers on localhost:8529. The check appears to treat non-200 as not-up, but 401 (auth required) means the server is fully up."
severity: cosmetic
---

# Friction: `infra status` misreports Arango as down on HTTP 401

## What happened

Running `docdog infra status` against a healthy Arango container prints:

```
ArangoDB container: running
ArangoDB HTTP:      container running but not responding yet (still starting?)
```

But `curl -s -o /dev/null -w "%{http_code}" http://localhost:8529/_api/version`
returns `401` — the server is up, just behind auth.

## Expected

Status should treat 401 as "up". The check is for liveness, not auth.

## Impact

Cosmetic. Misleading during dogfooding — made it look like Arango wasn't ready
when it was fine. No workaround needed, just confusing.

## Repro

1. `docker ps` shows `docdog-arango` running
2. `curl http://localhost:8529/_api/version` → 401
3. `docdog infra status` → "not responding yet"

Surfaced: 2026-04-12 during self-hosting Phase 1.

## Resolution (2026-04-14)

`docdog infra status` now treats HTTP 401 from `/_api/version` as
healthy with the label `(auth required — server up)`. The probe is
unauthenticated on purpose — it's a liveness check, not an auth
check. Smoke-tested against the local Arango container.
