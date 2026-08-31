/**
 * docdog_create — file-writing, not DB-writing (DD-070 §4).
 *
 * Writes a new markdown record file at the caller-supplied
 * repo-relative path, then reindexes that file. Placement is the
 * agent's decision (DP-001) — the tool validates the path
 * mechanically: under a configured scan path, default parser, no
 * existing file, no id collision. Any `relationships:` entries in the
 * supplied frontmatter become edges at reindex (DD-043).
 */
import type { DocdogConfig } from "../../types/config.js";
import { createRecordFile, WriteError } from "../../storage/writes.js";
import { withNextActions } from "../next-actions.js";

export async function handleCreate(
  config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const path = args.path as string | undefined;
  const collection = args.collection as string | undefined;
  const title = args.title as string | undefined;
  const content = args.content as string | undefined;

  if (!path || !collection || !title || content === undefined) {
    return {
      content: [
        { type: "text", text: "Missing required fields: path, collection, title, content" },
      ],
      isError: true,
    };
  }

  const frontmatter =
    typeof args.frontmatter === "object" && args.frontmatter !== null
      ? (args.frontmatter as Record<string, unknown>)
      : {};

  try {
    const result = await createRecordFile(
      { config, projectRoot, log: () => {}, warn: () => {} },
      {
        path,
        collection,
        title,
        content,
        id: (args.id as string | undefined) ?? null,
        description: (args.description as string | undefined) ?? null,
        status: args.status as string | undefined,
        scope: args.scope as string | undefined,
        frontmatter,
      },
    );

    const lines = [
      `Created ${result.filePath} (${result.collection})`,
      `  title: ${result.title}`,
    ];
    if (result.id) lines.push(`  id: ${result.id}`);
    lines.push(`  indexed: ${result.stats.verticesUpserted} record(s), ${result.stats.edges} edge(s)`);

    return withNextActions({ content: [{ type: "text", text: lines.join("\n") }] }, [
      {
        tool: "docdog_get",
        args: { id: result.id ?? result.title },
        hint: "verify the record as indexed",
      },
    ]);
  } catch (err) {
    if (err instanceof WriteError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
}
