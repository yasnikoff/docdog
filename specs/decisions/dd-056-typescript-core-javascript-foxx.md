---
id: DD-056
title: "TypeScript for the core, JavaScript only where ArangoDB Foxx requires it"
collection: decisions
status: superseded
date: 2026-04-13
description: "DD-mirror of EJ-020 under DD-034's artifact-resilience lens. Core code (indexer, MCP server, CLI, everything in src/) is TypeScript. JavaScript is reserved for Foxx services deployed to ArangoDB's V8 runtime. Cross-platform by construction."
relationships:
  - supersedes: EJ-020
    context: "mirror under DD-034's artifact-resilience lens"
  - references: DD-046
  - references: DD-055
---

# DD-056: TypeScript core, JavaScript only for Foxx

**Superseded 2026-07-06 by DD-070** — Foxx is moot without ArangoDB; the TypeScript-core half is unaffected and needs no successor record.

## Language split

- `src/` — TypeScript. Indexer, MCP server, CLI, all core logic.
- `foxx/` — JavaScript, when needed. ArangoDB's Foxx services run
  on V8 and that's the runtime they target.
- `dist/` — compiled output from tsup, shipped as the npm package.

## Cross-platform

Linux, Windows, macOS — the natural consequence of Node.js +
Docker + no native modules. Paths stored in Arango are
forward-slash normalized; the indexer converts on read/write.

## Why TypeScript

- The MCP tool API is a contract. Typed parameters catch
  breaking changes at compile time, not at agent call time.
- Arango document schemas (`VertexBase`, `EdgeBase`) need real
  types or every query result is `any` and every mistake is a
  runtime surprise.
- Multi-layer pipeline (parse → hash → embed → upsert → query)
  with distinct data shapes at each layer — exactly TS's sweet
  spot.
- Free d.ts generation for consumers.

## DD-034 check

Orthogonal to the artifact layer. What the type system buys is
that the indexer and MCP server can't drift from the
`VertexBase`/`EdgeBase` shapes silently — which is the machinery
that makes the artifact-resilience story hold up under code
changes.
