# DocDog Context Management

This project uses [docdog](https://github.com/yasnikoff/docdog) for AI-native context management.
Docdog maintains a graph of all specs, decisions, requirements, and design principles —
queryable by any MCP-compatible agent. Markdown files are the source of truth; the
index is a disposable local cache rebuilt by `docdog index`.

## Skills

Skills are in `.docdog/skills/`. Read the relevant skill before performing operations.

## MCP Tools

When the MCP server is running (`docdog serve`), you have direct access to:

| Tool | Purpose |
|------|---------|
| `docdog_search` | Hybrid keyword + semantic search across records |
| `docdog_get` | Get a specific record by ID |
| `docdog_traverse` | Follow relationship edges from a record |
| `docdog_relate` | Record an outbound relationship (patches the source file) |
| `docdog_create` | Create a record file at a path you choose, then index it |
| `docdog_update` | Patch a record file, then reindex it |
| `docdog_index` | Re-index changed files into the cache |
| `docdog_status` | Cache/corpus statistics |

To delete a record: delete its file, then run `docdog index` (files + git are the archive).

## Configuration

- Scan paths and collections: `.docdog/config.yaml`
- Local overrides (gitignored): `.docdog/config.local.yaml`
