/**
 * docdog_status — cache/corpus statistics (P-023 §7 step 5). No
 * database service to ping anymore: status reports what the embedded
 * cache holds (per-collection record counts, edges, embeddings) plus
 * the config it was derived under. A missing cache is a state, not an
 * error — the report says so and points at docdog_index.
 *
 * The stats themselves come from `collectStatus` (src/storage/status.ts),
 * shared with the `docdog status` CLI counterpart (PROPOSAL-032). This
 * handler is the markdown-rendering adapter and nothing more.
 */
import type { DocdogConfig } from "../../types/config.js";
import { formatEmbedHealth, formatEmptyBodies } from "../../storage/embed-health.js";
import { collectStatus, formatContestedId, formatEmbedStore, formatScopes } from "../../storage/status.js";
import { formatStatusVocabulary } from "../../storage/status-vocabulary.js";
import { withNextActions } from "../next-actions.js";
import { assessVintage, formatVintage, type BootStamp } from "../../engine/vintage.js";
import { formatUpdateLine, readUpdateCheck } from "../../engine/upgrade.js";
import { docdogVersion } from "../../engine/seed-manifest.js";

export interface StatusOptions {
  /**
   * Whether this server refuses the corpus writes (PROPOSAL-035). Reported
   * so an agent can *say* it is read-only instead of learning it by having
   * a write refused. MCP-only: the flag governs a long-lived server, and
   * the `docdog status` CLI has no such session to describe — which is why
   * it lives here and not in the shared `collectStatus`.
   */
  readOnly?: boolean;
  /**
   * Facts captured at process start, for the vintage report (PROPOSAL-037).
   * MCP-only for the same reason `readOnly` is: the CLI is a fresh process
   * every invocation, so "is the server stale" is not a question it can be
   * asked — which is the reason PROPOSAL-032's parity rule asked for.
   */
  boot?: BootStamp;
}

/**
 * Read-only is a property of the *server*, not of the cache — so it is
 * reported on every path, including the no-cache one. A read-only server
 * whose cache is missing still refuses writes, and saying otherwise there
 * would be a lie at exactly the moment an agent is deciding what to do next.
 */
function modeLines(options: StatusOptions, projectRoot: string): string[] {
  const lines: string[] = [];
  if (options.readOnly) {
    lines.push(
      "**Mode:** read-only — this server refuses docdog_create, docdog_update and docdog_relate.",
      "",
    );
  }
  // Same rule, same reason: a property of the *server*, so it is reported on
  // every path including the no-cache one, and is identical whichever `root`
  // the call steered to.
  if (options.boot) lines.push(...formatVintage(assessVintage(options.boot)));
  // PROPOSAL-042 §3: rendered from the file `docdog update --check` wrote.
  // Status opens no socket on any path — that is what preserves
  // PROPOSAL-037's refusal to phone home while still surfacing the answer.
  lines.push(formatUpdateLine(options.boot?.version ?? docdogVersion(), readUpdateCheck(projectRoot)), "");
  return lines;
}

export async function handleStatus(
  config: DocdogConfig,
  projectRoot: string,
  options: StatusOptions = {},
) {
  let report;
  try {
    report = collectStatus(projectRoot, config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return withNextActions(
      {
        content: [
          {
            type: "text",
            text: [
              "## Docdog Status",
              "",
              ...modeLines(options, projectRoot),
              `No usable cache: ${msg}`,
            ].join(
              "\n",
            ),
          },
        ],
      },
      [{ tool: "docdog_index", args: {}, hint: "build the cache from disk" }],
    );
  }

  const lines: string[] = ["## Docdog Status", "", ...modeLines(options, projectRoot)];

  lines.push("**Records by collection:**");
  if (report.collections.length === 0) {
    lines.push("  (none indexed)");
  }
  for (const c of report.collections) {
    lines.push(`  ${c.collection}: ${c.count}`);
  }

  // The `status` filter's half of the same question (FRICTION-038): an agent
  // that can see the vocabulary does not have to discover it by being refused.
  lines.push("");
  lines.push("**Records by status:**");
  if (report.statuses.present.length === 0) {
    lines.push("  (none indexed)");
  }
  lines.push(...formatStatusVocabulary(report.statuses));

  // Only when the corpus has more than one (FRICTION-050). Scope is a free
  // string (DD-058), so unlike the two blocks above this one is not a
  // convenience — nothing can refuse an unknown scope, which makes the
  // roster the only path from "scope is filterable" to "these are its values".
  const scopeLines = formatScopes(report.scopes);
  if (scopeLines.length > 0) {
    lines.push("");
    lines.push("**Records by scope:**");
    lines.push(...scopeLines);
  }

  lines.push("");
  lines.push(`**Files indexed:** ${report.files}`);
  lines.push(`**Edges:** ${report.edges}`);
  lines.push(`**Embedded chunks:** ${report.embeddedChunks}`);

  // PROPOSAL-031: two files claiming one id is exactly health, and status is
  // the kernel's health surface — no ninth tool. Resolution is judgment, so
  // the report names the contenders and stops there (DP-001 Tier 3).
  if (report.contested.length > 0) {
    lines.push("");
    lines.push(`**Contested ids:** ${report.contested.length}`);
    for (const entry of report.contested) {
      for (const line of formatContestedId(entry)) lines.push(line);
    }
  }

  // The other half of "what can a query not reach". Contested ids hide whole
  // records from every leg; this hides record tails from the vector leg only.
  // Reported for the same reason and in the same voice: name the fact, name
  // nothing to do about it — the remedy is chunking (PROPOSAL-023 §2), which
  // is docdog's work and not the reader's.
  if (report.embedHealth.emptyBodies.length > 0) {
    lines.push("");
    lines.push(`**Records with an empty body:** ${report.embedHealth.emptyBodies.length}`);
    for (const line of formatEmptyBodies(report.embedHealth)) lines.push(line);
  }
  if (report.embedHealth.oversized.length > 0) {
    lines.push("");
    lines.push(
      `**Records past the embed cap:** ${report.embedHealth.oversized.length} of ${report.collections.reduce((n, c) => n + c.count, 0)}`,
    );
    for (const line of formatEmbedHealth(report.embedHealth)) lines.push(line);
  }

  lines.push("");
  lines.push(`**Embed model:** ${report.embedModel}`);
  lines.push(`**Cache:** ${report.cachePath} (${report.cacheSizeMb.toFixed(1)} MB, disposable)`);
  lines.push(`**Embed store:** ${formatEmbedStore(report.embedStore)}`);
  lines.push(`**Scan paths:** ${report.scanPaths.join(", ")}`);

  return withNextActions({ content: [{ type: "text", text: lines.join("\n") }] }, [
    {
      tool: "docdog_index",
      args: {},
      hint: "re-index if files changed since the last index",
    },
  ]);
}
