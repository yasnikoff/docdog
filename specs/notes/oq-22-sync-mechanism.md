---
id: OQ-22
title: "Sync mechanism implementation"
collection: questions
status: resolved
related: [EJ-016]
relationships:
  - references: EJ-016
  - references: DD-070
    context: resolved by §5 — git is the collaboration substrate
  - references: DISC-020
    context: the shared-remote-DB path explored there was dropped in the resolution
description: "Scope-based sync decided. Remaining: concrete sync mechanisms per channel. MVP uses arangodump/arangorestore for manual sharing. Design checklist prevents lock-in (no absolute paths, no machine-specific data, first-class export/import)."
---

# OQ-22: Sync mechanism implementation

**Resolved 2026-07-06 by DD-070 §5** — git is the collaboration substrate; the shared-remote-DB path explored in DISC-020 is dropped.

**Status:** NARROWED (EJ-016)

Scope-based sync is decided. Remaining: concrete sync mechanisms for each channel.

**For `shared` scope (team):**
- Option B (shared ArangoDB instance) — simplest for small teams
- Option C (CI-built snapshots + local restore) — best for larger teams and offline
- MVP: `arangodump`/`arangorestore` for manual sharing. First-class export/import.

**For `personal` scope (solo multi-machine):**
- Same mechanisms as shared, just different channel (personal cloud, rsync)
- Or: `arangodump` of personal database only

**Design checklist (prevent lock-in):**
- No absolute file paths in Arango (use repo-relative paths)
- No machine-specific data in vertices or edges
- Export/import must be a first-class operation, not an afterthought

**Defer to post-MVP:** CI integration, automatic snapshot pull, real-time replication.
