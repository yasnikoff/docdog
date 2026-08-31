/**
 * docdog_update — file-writing, not DB-writing (DD-070 §4).
 *
 * Patches the record's markdown file (frontmatter fields line-wise,
 * body wholesale when `content` is given), then reindexes that file.
 * Re-embedding happens at reindex only when the body actually changed
 * (content-hash keyed embed cache, DD-051).
 *
 * Takes the record id (e.g. DD-070). The legacy `_id` arg is accepted
 * as an alias — in the cache the two are the same value.
 */
import type { DocdogConfig } from "../../types/config.js";
import { updateRecordFile, WriteError } from "../../storage/writes.js";
import { FrontmatterPatchError } from "../../storage/frontmatter.js";

export async function handleUpdate(
  config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const id = (args.id as string | undefined) ?? (args._id as string | undefined);
  if (!id) {
    return { content: [{ type: "text", text: "Missing required field: id" }], isError: true };
  }

  const fields = args.fields;
  if (fields !== undefined && (typeof fields !== "object" || fields === null || Array.isArray(fields))) {
    return {
      content: [
        {
          type: "text",
          text: "fields must be an object mapping frontmatter keys to scalar values (null deletes the key).",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await updateRecordFile(
      { config, projectRoot, log: () => {}, warn: () => {} },
      {
        id,
        title: args.title as string | undefined,
        description: args.description as string | undefined,
        status: args.status as string | undefined,
        scope: args.scope as string | undefined,
        content: args.content as string | undefined,
        fields: fields as
          | Record<string, string | number | boolean | (string | number | boolean)[] | null>
          | undefined,
      },
    );

    if (result.updatedFields.length === 0) {
      return { content: [{ type: "text", text: `Nothing to update on ${id}.` }] };
    }

    const embedNote =
      result.stats && result.stats.embedded > 0 ? " (re-embedded)" : "";
    return {
      content: [
        {
          type: "text",
          text: `Updated ${id}: ${result.updatedFields.join(", ")} — ${result.filePath} patched and reindexed${embedNote}.`,
        },
      ],
    };
  } catch (err) {
    if (err instanceof WriteError || err instanceof FrontmatterPatchError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
}
