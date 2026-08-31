/**
 * docdog_get — retargeted to the embedded cache (P-023 §7 step 5).
 * Tool name and inputs unchanged (DD-070 §4). The `Indexed:` line is
 * gone with Arango's indexed_at; everything else renders as before.
 */
import type { DocdogConfig } from "../../types/config.js";
import { openCacheRead } from "../../storage/cache.js";
import { getVertexById } from "../../storage/vertices.js";
import { withNextActions, type NextAction } from "../next-actions.js";

export async function handleGet(
  _config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const id = args.id as string;

  const handle = openCacheRead(projectRoot);
  let vertex;
  try {
    vertex = getVertexById(handle.db, id);
  } finally {
    handle.close();
  }

  if (!vertex) {
    return {
      content: [{ type: "text", text: `Section not found: ${id}` }],
      isError: true,
    };
  }

  const text = [
    `# ${vertex.title}`,
    `**ID:** ${vertex.id}`,
    `**Collection:** ${vertex.collection}`,
    `**Status:** ${vertex.status}`,
    `**Source:** ${vertex.source_file}`,
    ``,
    vertex.body_text,
  ].join("\n");

  const actions: NextAction[] = [
    {
      tool: "docdog_traverse",
      args: { vertex_id: vertex.id },
      hint: "see what this section connects to",
    },
    {
      tool: "docdog_search",
      args: { query: vertex.title },
      hint: "find sibling sections with related content",
    },
  ];

  return withNextActions({ content: [{ type: "text", text }] }, actions);
}
