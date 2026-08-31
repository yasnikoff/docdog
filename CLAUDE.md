<!-- docdog:start -->
## Context (docdog)

This project uses [docdog](https://github.com/yasnikoff/docdog) for AI-native context management.
Docdog maintains a graph of specs, decisions, requirements, and principles — markdown files are
the source of truth; the index is a disposable local cache (`.docdog/cache/`, gitignored).

- **MCP tools available** when `docdog serve` is running: `docdog_search`, `docdog_get`,
  `docdog_traverse`, `docdog_relate`, `docdog_create`, `docdog_update`, `docdog_index`,
  `docdog_status`
- **Deleting a record** = delete its file, then `docdog index` (there is no delete tool;
  files + git are the archive)
- **Skills** in `.docdog/skills/` — read the relevant skill before operations
- **Config** in `.docdog/config.yaml` — scan paths, collections, embedding
- **Upgrades** — `docdog status` reports the last registry check and its age.
  If it says never checked, or the answer is more than a week old, run
  `docdog update --check` (one unauthenticated lookup; it sends nothing about
  this project). `docdog update` then brings the seeded files and the pinned
  MCP version in `.mcp.json` up to the installed docdog. A long-running
  `docdog serve` keeps the code it booted with until it is restarted.

To start the MCP server: `docdog serve`
To re-index after editing specs: `docdog index`
<!-- docdog:end -->
