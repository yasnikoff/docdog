---
id: PROPOSAL-014
title: "MCP tool responses include `next_actions` hints"
collection: proposals
status: shipped
date: 2026-04-12
related: [OBS-003, PROPOSAL-013]
relationships:
  - sourced_from: OBS-003
    context: "internal complement to PROPOSAL-013 — nudge via MCP response shape"
  - references: PROPOSAL-013
  - references: DP-001
    context: hint templates are fixed Tier-2 defaults — the agent decides whether to follow
  - references: DP-003
    context: DP-003 check — advisory metadata only, escape hatch unchanged
description: "Every docdog MCP tool response gains an optional `next_actions` array with 2-3 concrete follow-up tool calls the agent could make. Internal nudge pattern — works with existing infrastructure, no external hooks, and teaches agents the retrieval flow through repetition rather than force."
---

# PROPOSAL-014: MCP tool `next_actions` hints

## Motivation

PROPOSAL-013 is an external forcing function — it installs a hook
in Claude Code to inject docdog output before every spec Read. It
works but depends on a specific provider and requires shell
plumbing. This proposal is the **internal** complement: every
docdog MCP tool response carries a small `next_actions` array
suggesting 2-3 concrete follow-up calls the agent can make.

The agent still chooses what to do, but the choices are visible in
the same response they're reading — no "I should have thought of
that" moment after the fact. Works for any MCP-compatible provider
(Claude Code, Cursor, Cline, custom agents) with zero hook config.

## Specification

### The shape

Every MCP tool response currently returns `{ content: [{ type,
text }] }`. Add a new optional `next_actions` field alongside:

```json
{
  "content": [{ "type": "text", "text": "..." }],
  "next_actions": [
    { "tool": "docdog_traverse", "args": { "vertex_id": "decisions/abc" },
      "hint": "see what this decision references and what cites it" },
    { "tool": "docdog_search", "args": { "query": "auth flow" },
      "hint": "find related context across the graph" }
  ]
}
```

`next_actions` is advisory metadata. MCP clients that don't
understand the field ignore it; clients that do render it as
"suggested next calls" text in the same response, teaching the
agent the retrieval flow inline.

### Per-tool hint templates

Each handler knows which follow-ups make sense after its own call.
Mechanical, not inferred:

- **`docdog_search` → ** suggest `docdog_traverse` on the top
  result's `_id` (see its neighborhood) and `docdog_get` on any
  interesting id (full content)
- **`docdog_get` → ** suggest `docdog_traverse` (see connections)
  and `docdog_search` with the vertex's title as query (find
  siblings)
- **`docdog_traverse` → ** suggest `docdog_get` on any neighbor
  the agent hasn't seen yet
- **`docdog_collections_list` → ** suggest
  `docdog_collections_describe` on any of the listed collections
- **`docdog_relations_list` → ** same for relations
- **`docdog_relate` → ** no follow-up; this is a write
- **`docdog_status` → ** suggest `docdog_index` if counts look
  stale (fact-based signal)

### Rendering fallback

For clients that render MCP responses as plain text only, handlers
also append a short "Next actions you could take:" block at the
end of the `content[0].text` field, carrying the same hints. That
way even minimal clients get the benefit.

### Not inference

The hint templates are **hardcoded per tool**. No judgment about
what the agent "probably" wants — just "here are the tools that
logically follow this one." DP-001 Tier 2 territory.

## DP-001 / DP-002 / DP-003 compliance

- **DP-001:** per-tool templates are fixed, visible in source, Tier
  2 defaults. The agent decides whether to follow up. ✅
- **DP-002:** N/A.
- **DP-003:** extends existing tool responses with advisory
  metadata; nothing about the escape hatch changes. ✅

## Complement to PROPOSAL-013

PROPOSAL-013 forces docdog usage for a specific trigger (Read on
spec files). PROPOSAL-014 teaches the retrieval pattern **after**
the agent has already started using docdog — it closes the loop
where "agent calls one docdog tool, but doesn't know what to call
next."

Both together: PROPOSAL-013 gets the agent to docdog in the first
place, PROPOSAL-014 keeps them moving through the retrieval
surface once they're there. Either alone would help; together they
cover the cold-start and steady-state sides of the habit problem.

## Not in scope

- **Ranking hints by relevance** — all suggestions are equal; the
  agent decides priority. Ranking would be inference.
- **Conditional hints** (show `docdog_index` only if
  `last_indexed_at` is stale) — keep hints path-independent for
  now; adding conditions invites inference creep.
- **Hint telemetry** (which hints do agents follow?) — valuable
  data but a privacy/consent issue. Separate proposal.
- **Writing docs about the hint surface** — first ship it, then
  see whether agents actually use it before investing in docs.

## Estimated effort

Small.

- Tool handler updates (~10 LOC per handler × 9 handlers = ~90 LOC)
- Per-tool template constants (~30 LOC in one shared file)
- Fallback text rendering at the end of `content[0].text` (~20 LOC)
- Integration test per hint template (~100 LOC)

**Total:** ~140 LOC + ~100 LOC tests.

## Status

Shipped. `src/mcp/next-actions.ts` carries the shared
`withNextActions` helper; hint templates are inlined in each
relevant handler (search, get, traverse, status, collections_list,
relations_list). Writes (relate/create/update/delete/index) and
describe/concepts handlers intentionally return no hints — nothing
mechanical follows them. Covered by
`tests/unit/next-actions.test.ts`.
