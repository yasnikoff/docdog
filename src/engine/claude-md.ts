import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const CLAUDE_MD_START = "<!-- docdog:start -->";
export const CLAUDE_MD_END = "<!-- docdog:end -->";

/**
 * The block `docdog init` injects into an adopting repo's CLAUDE.md — the
 * first thing an agent reads there, which is what makes its accuracy
 * load-bearing (FRICTION-042: it shipped 6 of the kernel 8 for two releases,
 * omitting exactly the two writes that have no CLI counterpart and so cannot
 * be discovered from `--help`, and described config in dead v2 terms).
 *
 * `tests/unit/seed-prose.test.ts` pins the tool list against the server's own
 * definitions. Prose about docdog's surface, duplicated across seeds and
 * corrected in only some of them, is the failure mode this file had; a test is
 * the only thing that makes the duplication safe.
 */
export const CLAUDE_MD_BLOCK_TEMPLATE = `${CLAUDE_MD_START}
## Context (docdog)

This project uses [docdog](https://github.com/yasnikoff/docdog) for AI-native context management.
Docdog maintains a graph of specs, decisions, requirements, and principles — markdown files are
the source of truth; the index is a disposable local cache (\`.docdog/cache/\`, gitignored).

- **MCP tools available** when \`docdog serve\` is running: \`docdog_search\`, \`docdog_get\`,
  \`docdog_traverse\`, \`docdog_relate\`, \`docdog_create\`, \`docdog_update\`, \`docdog_index\`,
  \`docdog_status\`
- **Deleting a record** = delete its file, then \`docdog index\` (there is no delete tool;
  files + git are the archive)
- **Skills** in \`.docdog/skills/\` — read the relevant skill before operations
- **Config** in \`.docdog/config.yaml\` — scan paths, collections, embedding
- **Upgrades** — \`docdog status\` reports the last registry check and its age.
  If it says never checked, or the answer is more than a week old, run
  \`docdog update --check\` (one unauthenticated lookup; it sends nothing about
  this project). \`docdog update\` then brings the seeded files and the pinned
  MCP version in \`.mcp.json\` up to the installed docdog. A long-running
  \`docdog serve\` keeps the code it booted with until it is restarted.

To start the MCP server: \`docdog serve\`
To re-index after editing specs: \`docdog index\`
${CLAUDE_MD_END}`;

export function injectClaudeMdBlock(claudeMdPath: string, resolvedBlock: string): void {
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, "utf-8");
    const startIdx = existing.indexOf(CLAUDE_MD_START);
    const endIdx = existing.indexOf(CLAUDE_MD_END);

    if (startIdx !== -1 && endIdx !== -1) {
      const before = existing.slice(0, startIdx);
      const after = existing.slice(endIdx + CLAUDE_MD_END.length);
      writeFileSync(claudeMdPath, before + resolvedBlock + after, "utf-8");
    } else {
      writeFileSync(claudeMdPath, existing.trimEnd() + "\n\n" + resolvedBlock + "\n", "utf-8");
    }
  } else {
    writeFileSync(claudeMdPath, resolvedBlock + "\n", "utf-8");
  }
}
