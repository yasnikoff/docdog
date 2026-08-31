---
id: DD-052
title: "Visibility scopes as database-per-scope (historical, superseded by DD-058)"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-016 under DD-034's artifact-resilience lens. Historical record of the abandoned database-per-scope visibility model. Batch 3 of PROPOSAL-017 closed the historical link chain: live replacement is DD-058 (which itself mirrors EJ-022)."
relationships:
  - supersedes: EJ-016
    context: "mirror under DD-034's artifact-resilience lens — historical record"
  - references: DD-058
    context: "DD-058 is the live replacement, mirroring EJ-022 which itself supersedes EJ-016"
  - references: DD-046
---

# DD-052: Visibility scopes — database-per-scope (historical)

**Already historical when mirrored.** EJ-016 proposed visibility
scopes backed by one ArangoDB database per scope. That model was
superseded by EJ-022 (single database, scope as a per-document
string field) because cross-database edges are impossible in
ArangoDB and graph traversal across scopes is the primary use case.

**Live replacement:** DD-058, the DD-NNN mirror of EJ-022. Batch 3
of PROPOSAL-017 closed the chain: EJ-016 → EJ-022 → DD-058,
mirrored on the DD side as DD-052 → DD-058.

## Why the original model was abandoned

Cross-database edges do not exist in ArangoDB. The workaround
(plain `ref_*` fields resolved by Foxx) breaks graph traversal at
scope boundaries. Personal notes that reference shared decisions
— the primary use case — need real edges, and real edges need a
shared database.

## DD-034 check

Preserved as a historical record. The DD mirror stands alone as a
readable artifact that explains what was tried and why it was
abandoned, without requiring a reader to reconstruct the story
from edge traversals.
