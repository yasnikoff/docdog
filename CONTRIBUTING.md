# Contributing to docdog

## Dev Environment Setup

### Prerequisites

- Node.js 20+
- npm

That's the whole list. V3 (DD-070) has **zero service dependencies**: the
index is an embedded SQLite file, embeddings run in-process via ONNX.

### First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Initialize a project (creates .docdog/, config, MCP wiring)
npx tsx src/cli/index.ts init --name my-project --template structured

# 3. Index spec files into the embedded cache
npx tsx src/cli/index.ts index
```

### Daily workflow

```bash
npx tsx src/cli/index.ts index           # Re-index changed section files
npx tsx src/cli/index.ts search "query"  # Hybrid search (BM25 + vector)
npx tsx src/cli/index.ts serve           # Start MCP server (for agent access)
npm test                                 # Run tests (no services needed)
npm run lint                             # TypeScript type check
npm run build                            # Build with tsup
```

### Environment variables

Loaded automatically from `~/.docdog/env` (system) + `.env.local` (project). Later wins.

Key variables: `DOCDOG_PROJECT_NAME`, `DOCDOG_EMBED_PROVIDER` (`onnx` default,
`ollama` opt-in), `DOCDOG_OLLAMA_URL`.

---

## Architecture

### Overview

docdog v3 is a **disk-canonical, MCP-native** context management toolkit.
Markdown files with YAML frontmatter are the single source of truth for every
record — including relationships. `docdog index` derives an embedded SQLite
cache (FTS5 keyword index + embeddings) from disk; deleting the cache is
always safe.

```
Section files (.md with YAML frontmatter — canonical)
  ↓ indexed by
Cache indexer (src/storage/indexer.ts)
  ↓ derives rows in
Embedded cache (.docdog/cache/index.db — SQLite, gitignored, disposable)
  ↓ queried via
MCP tools (docdog_search, _get, _traverse, _relate, _create, _update, _index, _status)
CLI commands (init, index, search, serve, add, split, gc, update, run, skill)
```

**Write path:** tools edit the markdown file first (create writes a new file,
update patches frontmatter/body, relate appends to the `relationships:`
block), then reindex that one file. The cache is never written directly.
**Deletion:** delete the file, run `docdog index` — the ghost sweep drops its
rows. Files + git are the archive (DD-039); there is no soft delete.

### Layer structure

```
CLI (src/cli/)           → Commander.js commands, user-facing
MCP Server (src/mcp/)    → MCP protocol, tool handlers for agents
Storage (src/storage/)   → cache lifecycle, schema, indexer, search, traverse,
                           frontmatter surgery, file-first writes
Engine (src/engine/)     → discovery + parsers, embedder, ingest (add/split),
                           relations registry, template engine, sanitization
Config (src/config/)     → config loader, defaults, collections, env loading
Types (src/types/)       → config, errors, scripts, search relevance
```

**Key rules:**
- CLI and MCP tools both call the same storage/engine layer — no duplication
- No REST API server. All access is via CLI or MCP
- The SQLite cache holds only derived state; disk is the sole canonical store
- Embeddings generated via ONNX (nomic-embed-text-v1) in-process — no external
  AI provider dependency (Ollama is an opt-in alternative)

### Collections

A collection is a config-declared record type routed from frontmatter
`collection:`. It materializes as a column value in the cache's `vertices`
table — not a physical table (DD-070 §6). The declared set is
system ∪ template-shipped ∪ `vertex_collections` (see
`src/config/collections.ts`).

Relationship types are records too: `.docdog/concepts/relation-*.md` carry
`name`, `inverse_label`, `symmetric` (DP-002's disk-canonical home). Unknown
types warn but never block.

### Data model (cache schema, src/storage/schema.ts)

- `vertices` — one row per record: id, collection, status, title,
  description, file_path, content_hash, frontmatter_json, body_text
- `edges` — single table (from_id, to_id, type, context, extra_json),
  derived exclusively from `relationships:` frontmatter blocks
- `chunks` — per-record embedding blobs (section-granularity ready)
- `fts` — FTS5 virtual table, BM25-ranked keyword search
- `files` — per-file hash for the incremental fast-path + ghost sweep

Schema changes bump `SCHEMA_VERSION`; a version mismatch on open drops and
rebuilds — there are no migrations, ever (DD-070 §2).

### The embed store (src/storage/embed-store.ts)

Embeddings are cached separately, in `embeddings.db` — a different file
from `index.db`, with its own version constant (DD-051, PROPOSAL-029).
Keeping the expensive state out of the file a schema bump drops is what
makes the rule above affordable.

Its location resolves, first match wins: `embed.cache_path` in
config.yaml → `<git-common-dir>/docdog/embeddings.db` when git answers →
`.docdog/cache/embeddings.db`. The git case means every worktree of a
clone shares one store, so a fresh worktree's cold index re-embeds
nothing (measured: 604s → 2.9s). `docdog index` prints the resolved path.

- Rows are keyed by (content_hash, recipe) — the recipe being `model@cap`
  plus `#dtype` when one is set, i.e. every input to the embedding
  function rather than the model alone (FRICTION-033). The hash is taken
  over **LF-normalized** content, so a checkout that rewrites line
  endings does not change a record's identity.
- Writes are `INSERT OR IGNORE`: a grow-only set, safe for two worktrees
  to write at once.
- `docdog gc` evicts rows with no live vertex. It used to **refuse** on a
  shared store — liveness is per-worktree and the store is not — which
  fired on every git project and made gc unreachable rather than careful;
  it unions every worktree's liveness now (DISC-032).
- **The version is in the file name from v2 onward** (`embeddings-v2.db`
  beside `embeddings.db`). The clone-wide reach that makes this file worth
  sharing is also what made an in-place version drop expensive: it deletes
  every worktree's vectors at once, and two docdog versions against one
  clone — npm-linked beside source mode, the documented dev loop — can do
  it to each other indefinitely (FRICTION-034). Vintages coexist, rollback
  is free, and `gc` names any sitting beside the current one. v1 keeps the
  bare name permanently; renaming it would charge every existing store the
  re-embed the scheme exists to avoid.

### Search

Hybrid (src/storage/search.ts): FTS5 BM25 keyword leg fused with a
brute-force cosine vector leg over `chunks.embedding` (milliseconds at
docdog scale). Results carry per-signal relevance (`keyword_bm25`,
`vector_search`), never a single merged score.

### Indexer

The cache indexer (`src/storage/indexer.ts`) scans `scan_paths`, parses
frontmatter (pluggable parsers: default / split / table / script), computes
hashes, and upserts derived rows.

- **Collection routing:** frontmatter `collection:` wins, then directory name
  match, then `default_collection` config
- **Incremental by default:** per-file hash comparison; single-file reindex
  path for tool writes
- **Ghost sweep:** files rows under scanned prefixes that no longer exist on
  disk get their derived rows dropped
- **Embedding cache:** keyed by (content_hash, model) — frontmatter-only
  edits don't re-embed; model switches trigger a clean full re-embed

---

## Testing

Tests are **Docker-free**: pure logic plus temp-file SQLite caches with an
injected fake embedder. No services, no setup.

```bash
# Run all tests
npm test

# Run a specific test file
npx vitest run tests/unit/storage-indexer.test.ts

# Watch mode
npm run test:watch
```

- `tests/unit/storage-*.test.ts` — cache lifecycle, indexer, search,
  traverse, frontmatter surgery, file-first writes
- `tests/unit/gc-eviction.test.ts` — embed-cache eviction
- The rest — parsers, ingest (add/split), config, registry, skills, MCP
  helpers
- `vitest.config.ts` — sequential file execution + forks pool for
  predictable temp-file behavior on Windows

---

## MCP Tools

When running `docdog serve`, the kernel tools are exposed:

| Tool | Purpose |
|---|---|
| `docdog_search` | Hybrid BM25 + vector search across all indexed records |
| `docdog_get` | Get a specific record by id (e.g. DD-070) |
| `docdog_traverse` | Follow relationship edges from a record |
| `docdog_relate` | Record an outbound edge — patches the source file's `relationships:` block |
| `docdog_create` | Create a record file at a caller-supplied repo-relative path, then index it |
| `docdog_update` | Patch a record's file (frontmatter/body), then reindex it |
| `docdog_index` | Trigger incremental or full re-index |
| `docdog_status` | Cache/corpus statistics |

Skill definitions in `.docdog/skills/` are also exposed as MCP resources.

---

## Project Structure

```
docdog/
├── src/
│   ├── cli/                    # Commander.js CLI
│   │   ├── index.ts            # Entry point, command registration
│   │   ├── commands/           # init, index, search, serve, gc, add, split, update, run, skill
│   │   └── output.ts           # Output formatting
│   ├── mcp/                    # MCP server
│   │   ├── server.ts           # Protocol handler, tool definitions
│   │   └── tools/              # search, get, traverse, relate, create, update, index-tool, status
│   ├── storage/                # Embedded cache (the v3 store)
│   │   ├── cache.ts            # Open/rebuild lifecycle (WAL, version check)
│   │   ├── schema.ts           # DDL + SCHEMA_VERSION
│   │   ├── indexer.ts          # Disk → cache derivation, ghost sweep, embed cache
│   │   ├── search.ts           # FTS5 + vector fusion
│   │   ├── traverse.ts         # Bounded-depth BFS over edges
│   │   ├── vertices.ts         # Row mapping helpers
│   │   ├── relations.ts        # Relations registry loader (from concepts rows)
│   │   ├── frontmatter.ts      # Line-wise frontmatter surgery + serializer
│   │   └── writes.ts           # File-first relate/create/update orchestration
│   ├── engine/                 # Parse + shared logic
│   │   ├── discovery.ts        # Scan-path walking + parser dispatch
│   │   ├── parsers/            # default, split, table, script
│   │   ├── embedder.ts         # ONNX embedding generation (Ollama opt-in)
│   │   ├── ingest.ts           # add/split file operations
│   │   ├── relations-registry.ts  # Type → inverse label/symmetric resolution
│   │   ├── skill-install.ts    # Injectable skills (cache-backed discovery)
│   │   ├── claude-md.ts        # CLAUDE.md block injection for init
│   │   ├── sanitization-engine.ts # Content sanitization for ingest
│   │   └── template-engine.ts  # {{config:*}} template rendering
│   ├── config/                 # Config + env loading
│   │   ├── collections.ts      # Collection-name resolution from config
│   │   ├── defaults.ts         # Default DocdogConfig values
│   │   ├── templates.ts        # Shipped project templates
│   │   ├── env.ts              # Env file loading (~/.docdog/env + .env.local)
│   │   ├── loader.ts           # YAML config parser (.docdog/config.yaml)
│   │   └── writer.ts           # Config editing helpers
│   └── types/                  # Shared TypeScript types
├── specs/                      # Indexed section files (dogfooding content)
├── .docdog/                    # Project config (docdog manages itself)
│   ├── config.yaml             # Project config
│   ├── cache/                  # Embedded SQLite cache (gitignored, disposable)
│   ├── concepts/               # Collection + relation concept records
│   └── skills/                 # Provider-neutral skill definitions
├── templates/                  # Shipped templates (skills, scripts, injectable-skills)
└── tests/
    ├── unit/                   # The whole suite — Docker-free
    └── fixtures/
```

---

## Self-Hosting (Dogfooding)

docdog manages its own documentation. The specs in `specs/` are indexed into
the embedded cache and searchable via MCP tools.

**Before code changes that touch storage/indexer/MCP:**
1. Commit current state: `git add specs/ .docdog/ && git commit`
2. Make your code change
3. Run tests: `npm test`
4. Re-index: `npx tsx src/cli/index.ts index`
5. Verify: `npx tsx src/cli/index.ts search "test query"`

**Config for self-hosting** (`.docdog/config.yaml`, abridged):
```yaml
project:
  name: docdog
scan_paths:
  - specs/
  - .docdog/skills/
  - .docdog/workflows/
  - .docdog/observations/
  - .docdog/reconciliations/
  - .docdog/concepts/
  - tasks/
  - CONTRIBUTING.md
template: workflows
vertex_collections:        # user additions beyond the template-shipped set
  - questions
  - issues
  - proposals
  - discussions
  - observations
  - concepts
default_collection: notes
```

---

## Reporting a problem with docdog

Bugs, limitations and friction go to
[GitHub issues](https://github.com/yasnikoff/docdog/issues) using the
**Friction report** template, whose fields mirror the frontmatter of a docdog
friction record — so a report you already wrote in your own corpus pastes
straight in.

Two things worth knowing before you file:

**Search closed issues, not just open ones.** A closed issue usually means
the fix already shipped, and then the answer is an upgrade rather than a
report:

```bash
docdog update --check     # is there a newer version?
docdog update             # bring this repo up to the one you installed
```

**Quote the minimum.** A useful report names record ids, titles and paths
from your corpus, and everything in an issue is public. Include what
reproduces the problem and nothing else. `docdog status --json` supplies the
environment block; redact anything in it you would rather not publish.

If you work with an agent, `docdog skill install feedback` installs the
procedure — formulate, redact, search, decide, ask, send, link back — as
`.claude/skills/docdog-feedback/SKILL.md`. It never sends anything on its
own: docdog holds no token, runs no endpoint, and collects nothing. Reports
go through your own `gh` or a link you click, so the account and the
authorship are yours.

**What docdog transmits, in full.** Three sockets exist in the whole codebase
and this is all of them:

1. **The version check.** One unauthenticated `GET` to `registry.npmjs.org`
   for the `latest` tag of a public package, when you run `docdog update
   --check` (or `docdog update` without `--offline`). It carries no version,
   no identifier and no information about your project — it is a lookup, and
   it stays one. That is what lets it be default-on: `docdog status` and
   `--offline` read the cached answer and open nothing.
2. **The embedding model, once.** On first index docdog downloads the ONNX
   model from `huggingface.co`. Pre-place the files under
   `.docdog/models/<model>/` and it never reaches out at all.
3. **Your own embedding server, if you asked for one.** With
   `embed.provider: ollama`, indexing POSTs record text to
   `embed.ollama_url` (`http://localhost:11434` by default, overridable with
   `DOCDOG_OLLAMA_URL`). This is the one path that sends your **content**
   anywhere, it is off unless you turn it on, and where it goes is a URL you
   chose.

Nothing else in docdog opens a socket. There is no telemetry, no crash
reporting and no analytics, and reports reach the issue tracker through your
own `gh` or a link you click — docdog holds no token.

### Triage, from the other side

An incoming issue becomes a `FRICTION-NNN` record in this corpus carrying
`upstream_issue`, drains through **WF-006**, and the issue is closed naming
the fix commit and the version it shipped in. The whole loop is **WF-007**
(`.docdog/workflows/wf-007-external-feedback-triage.md`) — including the step
that is easiest to skip and most expensive to skip: telling the reporter what
happened.
