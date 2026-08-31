---
id: NOTE-tooling-tech-stack
title: Eject — External Tooling Tech Stack
collection: notes
description: TypeScript-only, local-first tech stack decisions for docdog (Orama spike results, ArangoDB choice, etc.) — motivating context for EJ-004 and related OQs.
relationships:
  - references: EJ-004
  - references: OQ-10
  - references: OQ-11
  - references: EJ-001
---

# Eject — External Tooling Tech Stack

Tech stack decisions and options for the external content quality tooling
discussed in EJ-004 and OQ-10/OQ-11.

## Hard Constraints

- **TypeScript only.** No Python. The current docs-internal RAG pipeline is Python
  (LanceDB + nomic-embed-text via Ollama) — this is explicitly not carried forward.
- **Local-first.** Must run on the developer machine. Docker is acceptable.
- **No cloud dependencies.** Free/open-source tools only.

## Confirmed Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Language | TypeScript | Non-negotiable |

## Spike Results: Orama (2026-04-10)

Indexed `doc/output/` (86 files, ~1210 chunks, 768-dim nomic-embed-text via Ollama).
Ran the TASK-052 case study queries to test whether vector search alone solves the
context discovery problem.

### Results

| Query | DP-11 found? | DD-ARCH-19 found? | Verdict |
|-------|-------------|-------------------|---------|
| `"saga compensation uncertain error"` | No | No | **Failed** — keyword "error" pulled CG-024 error-handling guidelines |
| `"what happens when a workflow step outcome is unknown"` | No | No | **Failed** — got admin ops and workflow versioning |
| `"human in the loop compensation halt uncertain"` | Yes (#3) | No | **Partial** |
| `"business outcomes vs infrastructure errors workflow"` | Indirectly | Yes (#1) | **Good** — but requires knowing the exact terms |
| `"DP-11"` | Yes (#1) | Yes (#2) | **Perfect** — but this is just grep |

### Key Insight: Vector Search Alone Is Not Enough

The saga question requires **cross-document reasoning**: "saga is the pattern (DD-ARCH-09),
but some errors shouldn't trigger it (DD-ARCH-19 + DP-11)." No single chunk contains all
three concepts. Vector search can surface each individually if queried with the right terms,
but it cannot compose the answer from fragments across documents.

**What's needed in addition to vector search:**
- **Relationship graph.** Pre-computed edges: "DD-ARCH-19 references DP-11",
  "DD-ARCH-09 §Saga mentions compensation." A query for saga-related decisions should
  traverse to DD-ARCH-19 and DP-11 through the graph.
- **Smarter pre-processing.** Cross-references extracted from markdown and stored as
  typed edges with metadata (source, date, confidence).

This finding shifts the requirement from "vector search" to "vector search + graph
traversal" — which eliminates pure vector stores and favors multi-model databases.

## Shortlisted

### ArangoDB (Community Edition)

Native multi-model database: document store + graph + vector search (HNSW) in one.

**Why shortlisted:**
- All three capabilities needed (document, graph, vector) are free in Community Edition
  (Apache 2.0 license for core features)
- Native graph with rich edges — edge collections are full documents:
  `{ _from, _to, type: "references", source: "refinement-0068", date, confidence }`
- Vector search via HNSW indexes (`APPROX_NEAR_COSINE()`), available since 3.12
- AQL graph traversal: `FOR v, e, p IN 1..N OUTBOUND ...` exposes edge metadata
- Official TypeScript SDK (`arangojs`, actively maintained, full TS types)
- Docker: `arangodb/arangodb` on Docker Hub, single-node or cluster
- Solves the spike's failure: a query for "saga compensation" finds DD-ARCH-09 via
  vector search, then traverses edges to DD-ARCH-19 and DP-11

**Trade-offs:**
- Docker dependency (unlike Orama's zero-infra model)
- Another database to learn and operate
- Heavier than a pure search library

**Foxx microservices:** ArangoDB runs JavaScript (V8) inside the database. All search
logic, graph traversal, and relationship extraction can live as Foxx services — direct
AQL access, no network hop, no ORM. The MCP server shrinks to a thin protocol adapter
(~100 lines) that translates MCP tool calls to Foxx HTTP calls. Embedding generation
and file watching remain outside (need Ollama and filesystem access).

```
MCP Server (thin adapter, Node.js) → ArangoDB + Foxx (data + queries + all logic)
                                      ↑
                              one Docker container
```

**Fits the MCP server model:** One Docker container (ArangoDB + Foxx) plus one thin
MCP adapter process. Agents query via MCP tools; the container can be stopped when
not needed.

### Orama

Pure TypeScript full-text + vector + hybrid search engine. Zero dependencies, no
server, no Docker.

**Spike validated:** Works well for keyword and keyword+vector queries. Fast setup,
trivial persistence. Good for the "find chunks similar to X" use case.

**Spike limitation:** No graph layer. Cannot traverse relationships between documents.
The conceptual query problem (saga → DD-ARCH-19 → DP-11) requires cross-document
reasoning that pure search cannot provide.

**Role in the stack:** Could complement ArangoDB as a lightweight search layer for
simple queries (keyword lookup, "find all chunks mentioning FR-PROV-01") without
needing the full database. Or could be replaced entirely by ArangoDB's built-in search.

**Decision:** Keep as a fallback / complement option. Not sufficient as the primary tool.

### ~~MongoDB Atlas (local Docker)~~ — Eliminated

`mongodb/mongodb-atlas-local` container initially considered for familiarity.

**Eliminated because:**
- `$vectorSearch` is Atlas-only. MongoDB Community Server does not support it.
- The `mongodb-atlas-local` Docker image is licensed for **development and testing
  only** — not viable for production use without a paid Atlas agreement.
- No native graph traversal (would need `$graphLookup` which is limited compared
  to a native graph DB).

## Other Candidates (not shortlisted but noted)

| Tool | Docker | TS SDK | Assessment |
|------|--------|--------|------------|
| **Qdrant** | Yes | Official, high quality | Rust-based, fast, mature. Vector-only — no graph. |
| **LanceDB** | Embedded (no server) | Official, first-class | Zero infra. Vector-only — no graph. |
| **Typesense** | Yes | Official | Hybrid keyword + vector. No graph. |
| **pgvector** | Yes (Postgres ext) | Via pg drivers | Orchestrator already uses Postgres. No graph (unless adding Apache AGE extension). |

### Embedding Strategy

**Primary: `@huggingface/transformers` (in-process ONNX)**

Runs embedding models directly in Node.js via ONNX runtime. No external process needed.
Same model quality as Ollama — just loaded as an ONNX file instead of going through
an HTTP API. The indexer/MCP process generates embeddings in-process.

**Fallback: Ollama (HTTP API)**

If ONNX performance or model support is insufficient, fall back to Ollama
(`nomic-embed-text` via `fetch()` to `localhost:11434`). Ollama is a Go binary,
not Python — but it's an extra process to run.

| Model | Dimensions | Runtime | Notes |
|-------|-----------|---------|-------|
| nomic-embed-text | 768 | ONNX (primary) or Ollama (fallback) | Proven in spike. Best quality for retrieval. |
| all-MiniLM-L6-v2 | 384 | ONNX | Lighter, faster. Good enough if 768-dim is too heavy. |

## Architecture Notes

The spike revealed three operations the tool must support (refined from original two):

1. **Vector search:** "Find chunks semantically similar to X" — the basic retrieval.
   Necessary but not sufficient (spike proved this).
2. **Graph traversal:** "DD-ARCH-09 mentions saga → what other decisions constrain saga
   compensation?" — follow pre-computed relationship edges to find companion decisions.
3. **Full-scan propagation:** "New DP-* introduced — which existing specs should reference
   it?" — batch operation combining vector similarity with graph edge creation.

The relationship graph is the key differentiator. Edges between documents are extracted
during indexing (markdown cross-references like "Related: DP-11", "See DD-ARCH-19")
and during maintenance passes. The graph enables the "conceptual query" that pure
vector search fails at.

## Incremental Indexing

The indexer tracks the last-indexed git commit hash (stored in ArangoDB or a local
file). On each run:

1. `git diff --name-only <stored-hash> HEAD -- specs/` → changed files only
2. Delete old chunks + edges for changed files
3. Re-chunk, re-embed (in-process ONNX), re-extract cross-references
4. Insert new chunks + edges
5. Update stored hash to HEAD

Full scan: same flow over all files. Triggered by `--full` flag or when stored hash
is missing / too far behind to diff reliably.

## Delivery Model: MCP Server

The external tool should be packaged as an **MCP server**, not just a CLI. Benefits:

- Orchestrator agents query it directly during task work ("find specs relevant to saga
  compensation") without the human running a command first.
- Fits the EJ-004 model: available if present, not required. If the MCP server isn't
  running, agents fall back to file-based navigation. No hard dependency.
- MCP is already the standard interface for Claude Code tool integration — no custom
  protocol needed.
- The same server can expose both query tools (semantic search + graph traversal) and
  maintenance tools (re-index, propagate tags, gap analysis) as separate MCP tools.

## What Replaces the Current Python Pipeline

| docs-internal (Python) | Ejected system (TypeScript) |
|------------------------|---------------------------|
| `scripts/rag/cli` via `uv run` | TypeScript MCP server |
| LanceDB (file-based) | ArangoDB (Docker) for graph + vector |
| nomic-embed-text via Ollama | Same model, same runtime |
| Batch embed + query scripts | Persistent index with incremental updates |
| Contradiction detection | Vector similarity + graph edge analysis |
| Drift detection | Unnecessary if docs co-located (EJ-001) |
| Topic index (static file) | Graph-based relationship index (queryable) |
