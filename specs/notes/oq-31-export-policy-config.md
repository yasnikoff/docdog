---
id: OQ-31
title: "Collection-level export policy config"
collection: questions
status: resolved
related: [EJ-029]
relationships:
  - references: EJ-029
  - references: DD-070
    context: resolved by — nothing canonical is DB-resident, so there is nothing to export
description: "EJ-029 establishes the two-tier content model. Need concrete config format. Option A: inline on vertex_collections (breaking). Option B: separate export block (additive). Leaning B."
---

# OQ-31: Collection-level export policy config

**Resolved 2026-07-06 by DD-070** — no export policy needed: nothing canonical is DB-resident, so there is nothing to export in normal operation.

EJ-029 establishes the two-tier content model. Need concrete config format.
Candidates:

```yaml
# Option A: inline on vertex_collections
vertex_collections:
  - name: decisions
    export: true
  - name: refinements
    export: false

# Option B: separate export block
vertex_collections: [decisions, refinements, notes]
export:
  collections: [decisions]  # only these get written to disk
  output: specs/            # base directory
```

Option A changes vertex_collections from string[] to object[] — migration needed.
Option B is additive — no breaking change. Leaning B.
