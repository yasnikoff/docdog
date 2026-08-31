/**
 * docdog_traverse — retargeted to the embedded cache (P-023 §7
 * step 5). Tool name and inputs unchanged (DD-070 §4), except
 * `edge_collections`: the six dd_edges_* collections collapsed into
 * one edges table (DD-070 §2), so the option is gone by construction
 * and silently ignored if passed. Inverse labels resolve through the
 * cache-loaded registry (session-4 option b) — no Arango round-trip.
 */
import type { DocdogConfig } from "../../types/config.js";
import { openCacheRead } from "../../storage/cache.js";
import { traverse } from "../../storage/traverse.js";
import { loadRegistryFromCache } from "../../storage/relations.js";
import type { RelationsRegistry } from "../../engine/relations-registry.js";
import { withNextActions, type NextAction } from "../next-actions.js";

export async function handleTraverse(
  _config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const vertexId = args.vertex_id as string;
  const depth = Math.min((args.depth as number | undefined) ?? 1, 3);
  const direction = (args.direction as "outbound" | "inbound" | "any" | undefined) ?? "any";

  const handle = openCacheRead(projectRoot);
  let results;
  let registry: RelationsRegistry;
  try {
    results = traverse(handle.db, { vertexId, depth, direction });
    registry = loadRegistryFromCache(handle.db);
  } finally {
    handle.close();
  }

  if (results.length === 0) {
    return { content: [{ type: "text", text: `No connections found from ${vertexId}.` }] };
  }

  // Apply PROPOSAL-003 §8.1 effective_type resolution on the fly.
  const text = results
    .map((r) => {
      const v = r.vertex;
      const resolved = registry.effectiveType(r.edge, vertexId);
      const label = `${resolved.effective_type} (${resolved.direction.toLowerCase()})`;
      const ctx = r.edge.context ? ` — ${r.edge.context}` : "";
      return [
        // A walk hands back neighbours the caller never named, which makes
        // it the surface with the most reason to say whether each is live.
        `→ [${v.id}] **${v.title}** (${v.status}, depth ${r.depth})`,
        `  file: ${v.source_file}`,
        `  edge: ${label}${ctx}`,
      ].join("\n");
    })
    .join("\n\n");

  const actions: NextAction[] = [];
  if (results[0]) {
    actions.push({
      tool: "docdog_get",
      args: { id: results[0].vertex.id },
      hint: "read the full content of the first neighbor",
    });
  }
  if (results[1]) {
    actions.push({
      tool: "docdog_get",
      args: { id: results[1].vertex.id },
      hint: "read the full content of another neighbor",
    });
  }

  return withNextActions({ content: [{ type: "text", text }] }, actions);
}
