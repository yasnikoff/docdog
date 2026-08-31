/**
 * docdog_index — the cache indexer is THE indexer (P-023 §7 step 5).
 * The v2 Arango pass is gone; disk → SQLite cache is the whole write.
 *
 * Indexer output is collected instead of hitting console — on a stdio
 * MCP server, stdout is the transport.
 */
import type { DocdogConfig } from "../../types/config.js";
import { runCacheIndexer, formatSkipSummary } from "../../storage/indexer.js";

export async function handleIndex(
  config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const full = (args.full as boolean | undefined) ?? false;
  const path = args.path as string | undefined;
  const warnings: string[] = [];

  try {
    const stats = await runCacheIndexer({
      config,
      projectRoot,
      full,
      paths: path ? [path] : undefined,
      log: () => {},
      warn: (m) => warnings.push(m.trim()),
    });

    const lines = [
      `Index complete (${full || stats.rebuilt ? "full" : "incremental"}) — this run: ` +
        `${stats.filesChanged}/${stats.filesSeen} file(s) reindexed, ` +
        `${stats.verticesUpserted} record(s) upserted, ${stats.verticesRemoved} removed, ` +
        `${stats.edges} edge(s), ${stats.embedded} embedded (${stats.embedReused} reused).`,
      // Skips are user content that did not land — above the total, for the
      // same reason as in the CLI summary (FRICTION-032).
      ...formatSkipSummary(stats).map((l) => l.trimStart()),
      // Cumulative — the per-run edge count above is scoped to touched files
      // and can shrink as the graph grows; this is the whole-graph size
      // (FRICTION-029).
      `Graph total: ${stats.totalVertices} record(s), ${stats.totalEdges} edge(s).`,
    ];
    if (warnings.length > 0) {
      lines.push("", `Warnings:`, ...warnings.map((w) => `  ${w}`));
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Indexing failed: ${msg}` }], isError: true };
  }
}
