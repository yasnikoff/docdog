---
id: DP-001
title: Agent-first mechanics — code is levers, agents are thinkers
collection: principles
status: accepted
date: 2026-04-12
related:
  - EJ-030
  - DISC-006
  - FRICTION-005
  - PROPOSAL-003
  - OQ-27
  - OQ-32
relationships:
  - discussed_in: DISC-006
    context: the design conversation that established this principle
  - references: EJ-030
    context: complements the memory-layer framing — DP-001 adds that the memory layer's code never makes the judgment calls
  - references: FRICTION-005
    context: the canonical Tier-3 cautionary tale — id inference from filenames reframed as a principle violation, not just a bug
  - references: OQ-27
    context: conversation capture must stay on the agent-authors-summaries side of the line
  - references: OQ-32
    context: the DB-first write path ships primitives; the agent decides what to write
  - constrains: PROPOSAL-003
    context: DP-001 is a reviewable criterion every proposal must pass
  - references: OQ-42
    context: the user-extensibility commitment that keeps the shipped relationship vocabulary Tier 2, not a closed set
description: Docdog provides infrastructure and convenience for agent-first document work. Code — CLI, indexer, scripts, MCP tools — is strictly mechanical. Semantic judgment (what matters, what things mean, when to merge/split, what's significant) belongs to the agent+user loop. Code ships levers; agents supply thinking.
---

# DP-001: Agent-first mechanics

## Statement

Docdog's code — CLI commands, indexer, scripts, MCP tools, background
services — must be **strictly mechanical**. Semantic decisions belong
to the agent+user loop, not to code.

Every code path in docdog should be usable **from an agent** without
the code making decisions on the agent's behalf. Code ships **levers**;
agents supply the **thinking** that pulls them.

## Rationale

Docdog is a memory layer for agent-first document work (EJ-030). The
entire point is that agents are the primary authors, curators, and
readers of the graph. If docdog's own code starts making semantic
choices — guessing user intent, inferring meaning, auto-categorizing
content — it competes with the agent instead of serving it.

Semantic decisions that look reasonable in code become wrong over time
as the corpus evolves. Agents have full context at the moment of
decision; code has only the arguments it was given. Pushing judgment
into code calcifies bad calls and silently biases the graph.

This principle gives every future feature a reviewable criterion:
*"does this push a decision into code?"* If yes, push back or refactor.

## The three tiers

Every docdog code path must fit into one of these tiers:

### Tier 1: Pure mechanics (always allowed)

Deterministic transforms of inputs to outputs. No judgment, no
inference of meaning.

- Content-hash comparison for skip-on-unchanged
- Reconcile state from A to B given a complete definition of both
- Extract literal strings from structured fields (frontmatter)
- Save, load, query, garbage-collect expired records
- Atomic writes via AQL or arangojs primitives
- Two-pass indexer orchestration
- Vector similarity ranking (statistical, not judgmental)

### Tier 2: Defaults with visible override (allowed)

Opinions may ship, but only as **visible artifacts** that the user
or agent can see, criticize, and override. A default hidden in code is
a violation; a default that lives in a config file written to disk by
`docdog init` is allowed.

- Embedding model choice (default shipped in `.docdog/config.yaml`)
- Soft-delete TTL (default in config)
- Relationship type→collection routing map (lives in config, not code)
- Collection category taxonomy (lives in config, not code)
- Scan paths and include/exclude patterns

The rule: if you can't point at the default on disk, it's hidden, and
hidden defaults are hidden opinions.

### Tier 3: Inference and judgment (forbidden in code)

Any code path that tries to infer meaning, guess intent, decide what's
significant, or categorize content without an explicit mapping.

- Guessing an `id` from a filename (see FRICTION-005 — this is what
  happens when Tier 3 slips in as "convenience")
- Deciding which of two conflicting records is authoritative
- Auto-summarizing content for capture without agent judgment
- Picking "important" sections from a document
- Inferring relationship types from prose
- Merging records that "look similar"

These are all legitimate operations, but they belong to **agents**.
Code provides the primitives (create, update, relate, soft-delete) that
the agent calls after deciding.

## Deliberate exceptions

### Templates (`minimal`, `structured`, `workflow`)

Templates ship opinions about project structure: which collections
exist, which skills get installed, what the default config looks like.
This is allowed because templates are **explicit scaffolding** — the
user picks a template deliberately at `docdog init`, the output lands
visibly in the repo, and nothing is hidden from later review. Templates
are Tier 2 at the meta-level: the choice of template is visible.

If we ever ship "smart" templates that change content post-init based
on inferred project type, that crosses into Tier 3 and is forbidden.

### Shipped vocabulary for relationship types

PROPOSAL-003 ships a default vocabulary (`references`, `implements`,
`supersedes`, etc.). Shipping the vocabulary itself is Tier 2 — the
set is visible, documented, and users can extend via OQ-42's
user-extensibility commitment. The shipped set is convenience, not
concealment.

The **routing map** from type to edge collection is Tier 2 only if it
lives in visible config. If hardcoded in source, it's Tier 3 in
disguise. PROPOSAL-003 currently encodes the map in source — follow-up
refactor required.

## Implications / follow-ups

1. **PROPOSAL-003 refactor** — move the hardcoded type→collection
   routing map from source into `.docdog/relationships.yaml` or a
   block inside `.docdog/config.yaml`. Written by `docdog init` as a
   default. User can edit. The indexer reads it at extraction time.
   No algorithmic change — same lookup, different source.

2. **FRICTION-005 reframing** — `docdog add`'s id-inference isn't just
   a parsing bug. It's a Tier-3 violation: code guessing meaning from
   a filename. Correct fixes are all mechanical:
   - Require `--id` explicitly, or
   - Default to the full filename stem (deterministic transform, no
     inference), or
   - Refuse to stamp without explicit id and suggest the stem as a
     proposal for the user to accept

3. **Future feature review lens** — every new feature's design review
   must identify which tier it falls into. Tier 3 proposals should be
   redesigned or rejected.

## What this principle does NOT say

- It doesn't say docdog ships zero defaults. Sensible defaults are
  fine — they just have to be visible artifacts.
- It doesn't say agents are always right. Agents can make mistakes;
  the principle is about **where** mistakes should live. Mistakes in
  agent output are correctable by the next agent pass; mistakes baked
  into code are stuck until a release.
- It doesn't forbid convenience commands. `docdog relationships pending`
  is fine — it's a mechanical query. A `docdog auto-relate` that uses
  an embedder to guess relationships would not be.
- It doesn't preclude agentic tooling that docdog ships. Skills are
  agentic; they're allowed to make decisions because they operate at
  agent-tier. The boundary is that shipped *skills* may reason;
  shipped *code* may not.

## Relationship to other decisions

- **Complements EJ-030** (docdog-as-memory-layer): EJ-030 says "docdog
  is a memory layer, not a workflow engine." DP-001 sharpens it with
  "and the memory layer's code never makes the judgment calls."
- **Informs PROPOSAL-003** — routing map must move to config (follow-up
  above).
- **Informs OQ-27 / OQ-32** — conversation capture and DB-first write
  tools must stay on the agent-authors-summaries side of the line, not
  auto-judge significance. Both OQs already lean this way; DP-001
  formalizes it.
- **Explains FRICTION-005** retroactively as a principle violation, not
  just a bug.

## Test for new features

When designing any new docdog feature, ask in order:

1. Is the transform strictly deterministic given its inputs? → Tier 1, proceed.
2. Does it ship an opinion? → Tier 2 allowed only if the opinion is in
   visible config, extendable, overridable.
3. Does it require interpreting meaning, weighing significance, or
   categorizing content beyond an explicit map? → Tier 3, forbidden.
   Redesign so the code is the lever and an agent/user makes the call.
