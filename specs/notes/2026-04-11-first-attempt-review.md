---
id: NOTE-2026-04-11-first-attempt-review
title: 2026-04-11 — First Attempt Review
collection: notes
description: Review of docdog v1 implementation identifying carry-forward patterns and tradeoffs, feeding the v2 reframe.
relationships:
  - references: EJ-008
  - references: EJ-015
  - references: EJ-012
  - references: EJ-016
  - references: EJ-017
    context: cited with EJ-008 as the decision pair behind the v2 data model — sections, one per file — in the v1-vs-v2 comparison table
---

# 2026-04-11 — First Attempt Review (E:\projects\docdog)

Review of the first docdog implementation to identify carry-forward patterns
and avoid repeating solved problems.

## Status of First Attempt

Functionally complete MVP. Published as `@yasnikoff/docdog` v0.1.0 on GitHub Packages.
41 design decisions documented. Self-hosting (dogfooding) its own documentation.
Integration tests passing. Not a failed attempt — a completed v1 with a different
architecture than what we've now designed.

## Architecture Comparison

| Aspect | v1 (first attempt) | v2 (current design) |
|--------|-------------------|-------------------|
| Database | MongoDB Community | ArangoDB (graph + vector) |
| Data model | Pages (full documents) | Sections (one per file, EJ-008/017) |
| Search | MongoDB text indexes (keyword) | Vector + keyword + graph traversal |
| Relationships | Categories + labels (flat) | Graph edges with typed relationships |
| MCP | Deferred to Phase 2 | Core from day one |
| Embeddings | Deferred to post-MVP | Core (in-process ONNX, EJ-015) |
| Skills | `skills/` with YAML frontmatter | `.docdog/skills/` provider-neutral (EJ-012) |
| Architecture | REST API + CLI | MCP server + Foxx + CLI |
| History | Hybrid snapshots + backward patches | Soft delete + embedding cache |
| Multi-project | `X-Docdog-Project` header → per-project DB | Scope-based databases (EJ-016) |

## Code/Patterns to Carry Forward

### Direct reuse (lift with minor adaptation)

1. **CLI structure** — Commander setup, command registration, api-client pattern.
   Adapt: commands change (no REST, add MCP-related commands), but the structure is sound.

2. **Config loading** — YAML + local override + env vars, precedence chain.
   `defaults.ts` → `.docdog/config.yaml` → `.docdog/config.local.yaml` → env.
   Adapt: schema changes (ArangoDB connection, scopes), but the loader is reusable.

3. **Template engine** — `{{config:*}}` substitution in skill files. Simple, proven.
   Reuse as-is.

4. **CLAUDE.md injection** — `<!-- docdog:start -->` / `<!-- docdog:end -->` markers.
   Idempotent, re-runnable. Directly useful for provider adapters (EJ-012).

5. **AppError hierarchy** — typed errors with factory methods (`AppError.notFound()`,
   `AppError.versionConflict()`). `ErrorCode` union type for exhaustive client handling.
   Adapt for MCP error responses instead of HTTP status codes.

6. **Export engine patterns** — content-hash dedup (skip write if hash matches),
   disk-modification detection, manifest tracking, ENOSPC guard.
   Relevant for the indexer's file→Arango sync and `docdog export` if needed.

7. **Sanitization engine** — pre-storage secret scrubbing with configurable patterns.
   Useful for personal→shared scope boundary and ingest pipelines.

8. **Docker Compose setup** — init scripts, user creation, service definition.
   Adapt: MongoDB → ArangoDB, but the pattern (docker/ folder, init scripts) carries over.

### Patterns to preserve (reimplemented in new architecture)

9. **Skill format** — markdown with YAML frontmatter. v1 proved this works for AI agents.
   v2 generalizes it (provider-neutral, EJ-012) but the format is essentially the same.

10. **Project context routing** — v1's `X-Docdog-Project` → per-request DB selection.
    v2's scope model (EJ-016) is more general but the routing pattern is similar.
    Foxx equivalent: read scope from request context → select database.

11. **Atomic counters** — `findOneAndUpdate` + `$inc` + `upsert`. ArangoDB equivalent
    exists. Useful for sequential ID generation (edge numbering, counter fields).

12. **Self-bootstrap integration test** — full end-to-end workflow in one test.
    Must be recreated for v2 with ArangoDB + MCP, but the *approach* carries over.

13. **Dogfooding protocol** — docdog manages its own documentation. Enforced via
    CLAUDE.md rules in the v1 repo. Same principle for v2.

### What does NOT carry forward

- MongoDB driver code / repository classes (different DB)
- REST API routes / Fastify plugins (replaced by MCP + Foxx)
- Page model (replaced by section model)
- Category/label system (replaced by graph edges + collections)
- Diff/patch history engine (replaced by soft delete + embedding cache)
- Optimistic concurrency via version field (ArangoDB has built-in `_rev`)

## Relevant Design Decisions from v1

Some of v1's 41 decisions may still apply. Key ones to review:

- **D4:** Optimistic concurrency from day 1 — ArangoDB has `_rev`, but the principle holds
- **D11:** REST not GraphQL for AI agents — we're using MCP, same reasoning (reliability)
- **D14:** Community MongoDB default, Atlas opt-in — maps to our ArangoDB Community stance
- **D18/D19:** CLI = deterministic, skills = intelligent — same split in v2
- **D29:** Import vs. Ingest distinction — different trust models for different sources
- **D35:** Export metadata as HTML comments — may inform section frontmatter design

A full decision-by-decision review is worth doing when starting the v2 build.
