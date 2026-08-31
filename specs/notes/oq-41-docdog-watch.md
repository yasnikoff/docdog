---
id: OQ-41
title: "`docdog watch` — real-time file watching and incremental indexing"
collection: questions
status: open
description: "Watch mode that re-indexes on file change. Most valuable integrated with docdog serve — MCP server keeps its graph fresh, so agents never see stale state. Not blocking: docdog index is fast enough for manual use. QoL for future."
---

# OQ-41: `docdog watch` — real-time file watching and incremental indexing

A watch mode that re-indexes on file change, eliminating manual `docdog index`
calls during active authoring. Most valuable when integrated with `docdog serve`:
MCP server keeps its graph fresh transparently, so agents never see stale state.

**Use cases:**
- `docdog serve --watch` — MCP server auto-reindexes on file changes
- `docdog watch` standalone — keep the graph fresh during refactoring sessions
- Future: `docdog watch --check` for CI consistency checks

**Implementation sketch:** chokidar or fs.watch; debounced incremental indexer
calls; skip during batch operations. The indexer is already incremental so the
heavy lifting is done — only the file-event plumbing is new.

**Status:** not blocking. `docdog index` is fast enough for manual use. This is
a quality-of-life improvement for a future iteration.
