/**
 * MCP `docdog_relate` — file-first (P-023 §7 step 5, write half).
 *
 * Patches the source record's `relationships:` frontmatter block with
 * the defaults-elide serializer and reindexes that file; the cache
 * indexer derives the edge row (DD-043: edges are born only in
 * frontmatter — this tool never writes an edge directly). Outbound
 * only (EJ-004), unchanged.
 *
 * The legacy `role` arg is accepted as an alias for `type` for
 * backwards-compat with pre-PROPOSAL-003 agent code. Unknown types and
 * unknown targets are warnings, not errors: the type registry
 * (relation concepts) is advisory, and a dangling target is exactly
 * what the frontmatter says (honest, resolvable by indexing the
 * target later).
 */
import type { DocdogConfig } from "../../types/config.js";
import { relateFileFirst, WriteError } from "../../storage/writes.js";
import { FrontmatterPatchError } from "../../storage/frontmatter.js";

export async function handleRelate(
  config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const fromId = args.from_id as string;
  const toId = args.to_id as string;
  const type = (args.type as string | undefined) ?? (args.role as string);
  const context = args.context as string;
  const anchorText = args.anchor_text as string | undefined;
  const allowCrossVisibility = args.allow_cross_visibility === true;

  if (!fromId || !toId || !type || !context) {
    return {
      content: [
        { type: "text", text: "Missing required arg: from_id, to_id, type/role, and context." },
      ],
      isError: true,
    };
  }

  try {
    const result = await relateFileFirst(
      { config, projectRoot, log: () => {}, warn: () => {} },
      { fromId, toId, type, context, anchorText: anchorText ?? null },
      { allowCrossVisibility },
    );

    const warnings: string[] = [];
    if (!result.typeKnown) {
      warnings.push(
        `⚠ Type "${type}" has no relation concept entry — search the concepts collection (docdog_search, collection: "concepts") to see registered types.`,
      );
    }
    if (!result.targetKnown) {
      warnings.push(
        `⚠ Target "${toId}" is not in the index — the edge dangles until a record with that id is indexed.`,
      );
    }

    const lines = [
      `Edge recorded: ${fromId} --[${type}]--> ${toId}`,
      `File: ${result.filePath} (relationships: block patched, file reindexed)`,
      `Context: ${context}`,
    ];
    if (warnings.length > 0) lines.push("", ...warnings);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err) {
    if (err instanceof WriteError || err instanceof FrontmatterPatchError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
}
