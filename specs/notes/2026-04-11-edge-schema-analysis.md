---
id: NOTE-2026-04-11-edge-schema-analysis
title: 2026-04-11 — Edge Schema Analysis
collection: notes
description: Analysis of graph edge collections and labels for the structured template — inputs to EJ-029.
relationships:
  - references: EJ-011
  - references: EJ-004
  - references: EJ-010
---

# 2026-04-11 — Edge Schema Analysis

Analysis of relationship types observed in the host project's repos, plus general-purpose
attributes for a multi-project context management system.

## Part 1: Relationships Observed in the Host Project

### Structural (document hierarchy)

| Relationship | Example | Frequency |
|-------------|---------|-----------|
| `parent` / `child` | DD-ARCH-09 §Saga Compensation → DD-ARCH-09 | High — every subsection |
| `belongs_to_file` | DD-ARCH-09 → design/decisions/architecture.md | Universal — provenance link back to source file |
| `belongs_to_category` | DD-ARCH-09 → "Architecture" | Universal — from categories.yaml equivalent |

### Semantic (meaning relationships)

| Relationship | Example | Frequency |
|-------------|---------|-----------|
| `references` | DD-ARCH-19 mentions DP-11 | Very high — most common edge type |
| `constrains` | DP-11 constrains all workflow implementations | Medium — principles → decisions/requirements |
| `implements` | DD-ARCH-16 implements FR-ARCH-01 through FR-ARCH-11 | Medium — decisions → requirements |
| `uses_term` | DD-ARCH-16 uses "WorkflowEngine" | High — glossary links |
| `defined_by` | "WorkflowEngine" defined by DD-ARCH-16 | Low — one per glossary term |
| `example_of` | TASK-052 provisioning workflow is an example of DD-ARCH-09 pattern | Low but valuable |

### Temporal (evolution)

| Relationship | Example | Frequency |
|-------------|---------|-----------|
| `supersedes` | TASK-013 supersedes TASK-007 adapter pattern | Medium — architecture evolves |
| `revised_by` | DD-ARCH-09 revised by refinement 0050, then 0065, then 0068 | Medium — tracks decision history |
| `sourced_from` | DP-11 sourced from refinement 0068 | Universal — every decision has a source |
| `companion` | DD-ARCH-19 and DP-11 created together in refinement 0068 | Low but critical — the TASK-052 failure case |

### Dependency (task/implementation)

| Relationship | Example | Frequency |
|-------------|---------|-----------|
| `depends_on` | TASK-052 depends on PROV-L2 (done in TASK-051) | Medium — task chains |
| `produced_by` | PROV-L2 step types produced by TASK-051 | Medium — task outputs |
| `applies_to` | CG-024 applies to all packages | Medium — scope markers |

### Cross-cutting / scope

| Relationship | Example | Frequency |
|-------------|---------|-----------|
| `cross_cutting` | DP-11 applies to "all workflow-bearing requirements" | Low count but high impact — the hardest to discover |
| `scoped_to` | DD-BAK-01 scoped to backup domain only | Medium — narrows applicability |

## Part 2: Base Edge Schema (host project)

**Principle (EJ-011):** Edge attributes are intrinsic properties of the relationship.
Relevance is NOT stored on edges — it is query-dependent and computed dynamically by
the agent or Foxx query function based on task context + intrinsic properties.

Every edge should carry:

```
{
  // Identity
  _from: "decisions/dd-arch-09",
  _to: "principles/dp-11",

  // Semantics (intrinsic)
  type: "references",           // from taxonomy above (also implied by edge collection)
  role: "constrains",           // directional meaning: how _to relates to _from
  context: "DP-11 defines halt behavior for uncertain compensation in saga workflows",

  // Provenance (intrinsic, EJ-004)
  source: "indexer-full-scan",  // or "/finalize-task TASK-052", or "refinement-0068"
  date: "2026-04-11",
  discovered_via: "explicit",   // explicit (written in markdown) | inferred (agent extracted)
  anchor_text: "See DP-11",     // the actual text that triggered edge creation

  // Lifecycle (intrinsic)
  status: "current"             // current | superseded | deprecated
}
```

### Why each field matters for agents

| Field | Agent use |
|-------|----------|
| `type` | Filter: "show me only `supersedes` edges to understand evolution" |
| `role` | Triage: "does this edge help me or is it tangential?" |
| `context` | Preview: decide whether to follow the edge without reading the target |
| `source` | Trust: skill-produced (EJ-004 — additive, possibly incomplete) vs. full-scan |
| `date` | Freshness: old edges may be stale |
| `discovered_via` | Reliability: explicit edges are more trustworthy than inferred ones |
| `anchor_text` | Audit: why does this edge exist? |
| `status` | Skip superseded edges unless exploring history |

### What edges do NOT carry

- ~~`weight`~~ — relevance to what? Depends on the task.
- ~~`confidence`~~ — confident for what purpose?
- Any pre-computed relevance score.

Relevance is computed at query time. An edge between DD-ARCH-19 and DP-11 is critical
when designing a workflow, irrelevant when configuring logging.

## Part 3: General-Purpose Extensions (multi-project SDD system)

Beyond the host project, a general-purpose context management system for AI-assisted
development would benefit from:

### Project isolation

```
  project: "host-project",       // multi-tenant: edges scoped to a project
  namespace: "orchestrator",     // sub-project or module scope
```

Enables one ArangoDB instance serving multiple projects. Agents query within their
project scope by default, cross-project only when explicitly exploring.

### Abstraction level

```
  level: "architecture",         // architecture | design | implementation | convention
```

Agent working on high-level design can filter out implementation-level edges.
Agent writing code can prioritize implementation-level edges. Maps to the existing
ID taxonomy (DD-* = design, FR-* = requirements, CG-* = convention).

### Volatility / stability

```
  volatility: "stable",          // stable | evolving | experimental
```

"This decision has been revised 3 times in 2 weeks" vs. "this has been unchanged
for months." Agents can weight stable edges higher when making decisions. Computed
from revision history, not manually set.

### Bidirectional summary

```
  forward_summary: "DD-ARCH-19 distinguishes business outcomes from infrastructure errors",
  reverse_summary: "DP-11 is referenced by DD-ARCH-19 as the escalation principle"
```

Edges are traversed in both directions. The one-line `context` field is
direction-dependent — what's useful when arriving from _from is different from
arriving from _to. Two summaries eliminates this ambiguity.

### Strength / weight

```
  weight: 0.9,                   // 0.0–1.0 relevance weight
```

Not all references are equally important. DD-ARCH-19 → DP-11 is a hard dependency
(weight ~1.0). A glossary term mention in a changelog entry is weak (weight ~0.2).
Agents can threshold: "only follow edges with weight > 0.5."

### Discovery metadata

```
  discovered_via: "explicit",    // explicit (written in markdown) | inferred (agent extracted)
  anchor_text: "See DP-11",      // the actual text that triggered edge creation
```

Explicit edges (author wrote "Related: DP-11") are more reliable than inferred ones
(agent decided these concepts are related). The `anchor_text` lets a human or agent
audit why the edge exists.

### Tags / facets

```
  tags: ["compensation", "error-handling", "workflow"]
```

Free-form tags on edges enable faceted traversal: "show me all edges tagged
'compensation' reachable from DD-ARCH-09." Useful for cross-cutting concern
discovery — the exact problem that surfaced DP-11.

## Part 4: Recommended Phasing

### Phase 1 (host-project MVP)

Base schema only: `type`, `role`, `context`, `source`, `date`, `confidence`, `status`.
This is sufficient for the TASK-052 use case and covers all observed relationship types.

### Phase 2 (Multi-project / general-purpose)

Add: `level`, `forward_summary` / `reverse_summary`, `tags`.
Multi-tenancy handled by database-per-project (EJ-010), not edge fields.

### Phase 3 (Mature system)

Add: `volatility` (computed from revision history).
Advanced query patterns as the system matures.
