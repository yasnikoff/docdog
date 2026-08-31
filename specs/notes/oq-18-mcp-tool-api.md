---
id: OQ-18
title: MCP tool API surface
collection: questions
status: resolved
description: "RESOLVED by DD-070's kernel 8 — shipped surface: search, get, traverse, relate, create, update, index, status. explain never shipped (edge meaning lives in concepts records per DP-002); create/update landed beyond the proposal. Original question: tool names, parameter shapes, return formats are the contract between docdog and all agents/skills — HARD to change once skills depend on it."
relationships:
  - references: EJ-004
  - references: DD-070
    context: "the v3 kernel decision that resolved this — its kernel-8 MCP surface is the shipped answer"
  - references: DP-002
    context: the reason `docdog_explain` never shipped from the proposed surface — edge semantics live in concepts records, not in a tool that explains them
---

# OQ-18: MCP tool API surface

**Status note (2026-07-11, FEATURE-002):** resolved by DD-070 — the
kernel 8 shipped as `docdog_search`, `docdog_get`, `docdog_traverse`,
`docdog_relate`, `docdog_create`, `docdog_update`, `docdog_index`,
`docdog_status`. Of the surface proposed below, `explain` never
shipped (edge semantics live in concepts records per DP-002), and
`create`/`update` went beyond it. Naming followed the stable-names
principle proposed here.

**Status:** HARD to change once skills depend on it

Tool names, parameter shapes, return formats are the contract between docdog and
all agents/skills. Not yet designed.

**Proposed tools:**

| Tool | Purpose |
|------|---------|
| `docdog_search` | Vector + keyword search across sections |
| `docdog_get` | Get a specific section by ID |
| `docdog_traverse` | Follow edges from a vertex |
| `docdog_explain` | Get edge context/metadata |
| `docdog_index` | Trigger re-index (incremental or full) |
| `docdog_relate` | Submit outbound relationships (EJ-004) |
| `docdog_status` | Graph stats, health, last indexed commit |

**Design principles needed:** stable names, composable primitives (not monolithic),
consistent naming convention.
