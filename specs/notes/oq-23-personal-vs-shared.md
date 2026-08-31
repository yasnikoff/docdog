---
id: OQ-23
title: "Personal vs shared artifacts"
collection: questions
status: resolved
related: [EJ-016]
relationships:
  - references: EJ-016
description: "Separate database per scope. Personal database with cross-scope references (plain fields, resolved by Foxx at query time) to the shared project graph. Full isolation, independent sync channels."
---

# OQ-23: Personal vs shared artifacts

**Status:** RESOLVED (EJ-016)

Separate database per scope. Personal database (`docdog_personal_{user}`) with
cross-scope references (plain fields, resolved by Foxx at query time) to the
shared project graph. Full isolation, independent sync channels. See EJ-016.
