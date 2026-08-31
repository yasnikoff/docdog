/**
 * `docdog traverse <id>` — the CLI counterpart of `docdog_traverse`
 * (PROPOSAL-032), restoring the command PROPOSAL-008 proposed and the
 * v3 pruning superseded.
 *
 * A second thin adapter over `traverse` (src/storage/traverse.ts), with
 * inverse labels resolved through the same cache-loaded relations
 * registry the MCP tool uses. Defaults are inherited from
 * `docdog_traverse`, deliberately: divergent defaults across two
 * adapters onto one engine would be a bug surface, not a feature.
 */
import { Command } from "commander";
import { findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";

const DIRECTIONS = ["outbound", "inbound", "any"] as const;
type Direction = (typeof DIRECTIONS)[number];

/** Depth ceiling — same clamp as src/mcp/tools/traverse.ts. */
const MAX_DEPTH = 3;

export function registerTraverseCommand(program: Command): void {
  program
    .command("traverse <id>")
    .description("Walk the edges from a record (bounded depth)")
    .option("--depth <n>", `Hops to follow (1-${MAX_DEPTH})`, "1")
    .option("--direction <dir>", "outbound | inbound | any", "any")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();

      try {
        const direction = opts.direction as Direction;
        if (!DIRECTIONS.includes(direction)) {
          throw new Error(`--direction must be one of ${DIRECTIONS.join(", ")} (got: ${opts.direction})`);
        }

        const parsedDepth = parseInt(opts.depth, 10);
        if (Number.isNaN(parsedDepth) || parsedDepth < 1) {
          throw new Error(`--depth must be a positive integer (got: ${opts.depth})`);
        }
        const depth = Math.min(parsedDepth, MAX_DEPTH);

        const { openCacheRead } = await import("../../storage/cache.js");
        const { traverse } = await import("../../storage/traverse.js");
        const { loadRegistryFromCache } = await import("../../storage/relations.js");

        const handle = openCacheRead(projectRoot);
        let results;
        let registry;
        try {
          results = traverse(handle.db, { vertexId: id, depth, direction });
          registry = loadRegistryFromCache(handle.db);
        } finally {
          handle.close();
        }

        // PROPOSAL-003 §8.1 effective_type resolution, on the fly.
        const resolved = results.map((r) => {
          const effective = registry.effectiveType(r.edge, id);
          return {
            id: r.vertex.id,
            title: r.vertex.title,
            collection: r.vertex.collection,
            // FRICTION-053: absent from this projection until 2026-08-30, so
            // `--json` consumers could not see status even though the traversal
            // carried it — `TraversalResult.vertex` is a full CacheVertex.
            status: r.vertex.status,
            source_file: r.vertex.source_file,
            depth: r.depth,
            type: effective.effective_type,
            direction: effective.direction.toLowerCase(),
            context: r.edge.context,
          };
        });

        if (opts.json) {
          console.log(JSON.stringify(resolved, null, 2));
          return;
        }

        if (resolved.length === 0) {
          console.log(`No connections found from ${id}.`);
          return;
        }

        for (const r of resolved) {
          const ctx = r.context ? ` — ${r.context}` : "";
          console.log(`\n→ [${r.id}] ${r.title} (${r.status}, depth ${r.depth})`);
          console.log(`    ${r.source_file}`);
          console.log(`    edge: ${r.type} (${r.direction})${ctx}`);
        }
      } catch (err) {
        printError(
          "TRAVERSE_ERROR",
          err instanceof Error ? err.message : String(err),
          'Cache missing or stale? Run "docdog index" first.',
        );
        process.exitCode = 1;
        return;
      }
    });
}
