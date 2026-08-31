---
id: DD-048
title: "AI-first interface — provider-neutral skills in .docdog/skills/"
collection: decisions
status: current
date: 2026-04-13
description: "DD-mirror of EJ-012 under DD-034's artifact-resilience lens. The primary interface is AI-first via MCP tools; skills are provider-neutral markdown in .docdog/skills/ with thin provider adapters layered on top."
relationships:
  - supersedes: EJ-012
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-046
  - references: DD-040
  - references: DD-034
    context: carries the mandated DD-034 artifact-resilience check — plain-markdown skills are maximally aligned
---

# DD-048: AI-first interface, provider-neutral skills

Docdog's primary interface is AI-first. The MCP server exposes a
provider-agnostic tool surface (`docdog_search`, `docdog_get`,
`docdog_traverse`, …) that any MCP-compatible agent can call.

Skills are provider-neutral markdown in `.docdog/skills/`.
Each skill is authored once and consumed by any agent runtime
without translation. Provider-specific adapters are thin layers on
top; the skill files themselves are the source of truth.

## Subagent model

A skill's markdown body is, effectively, a subagent prompt. The
calling agent loads the skill, applies it to a concrete query, and
runs its MCP tool calls. The main conversation stays uncluttered
by search internals.

## MCP resource discovery

The MCP server exposes skill definitions as read-only resources.
An agent that has never loaded `.docdog/skills/` into its context
can still discover what docdog can do by enumerating the resource
list.

## DD-034 check

Preserved with sharpening. Skills as plain markdown files are
maximally DD-034-aligned: they are the canonical form, readable
without docdog running, editable with any text editor, reviewable
in a PR. The provider adapters are the only place where runtime
coupling is allowed.
