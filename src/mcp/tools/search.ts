/**
 * docdog_search — retargeted to the embedded cache (P-023 §7 step 5).
 * Tool name, inputs, and output framing unchanged (DD-070 §4); only
 * the store behind it moved from Arango to SQLite.
 */
import type { DocdogConfig } from "../../types/config.js";
import { openCacheRead } from "../../storage/cache.js";
import { search, SearchError } from "../../storage/search.js";
import { withNextActions, type NextAction } from "../next-actions.js";

export async function handleSearch(
  config: DocdogConfig,
  projectRoot: string,
  args: Record<string, unknown>,
) {
  const query = args.query as string;
  const collection = args.collection as string | undefined;
  const scope = args.scope as string | undefined;
  const limit = (args.limit as number | undefined) ?? 10;

  // The array filters were cast, not checked: a caller passing a bare string
  // for `status` reached `.map` on a string and crashed the handler instead
  // of being told what it got wrong. Same guard for all four, since `has` and
  // `lacks` arrive with the same shape (FRICTION-045).
  const arrays: Record<string, string[] | undefined> = {};
  for (const [param, key] of [
    ["status", "status"],
    ["exclude_status", "excludeStatus"],
    ["has", "has"],
    ["lacks", "lacks"],
  ] as const) {
    const raw = args[param];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
      return {
        content: [{ type: "text", text: `${param} must be an array of strings.` }],
        isError: true,
      };
    }
    arrays[key] = raw as string[];
  }
  const status = arrays.status;
  const excludeStatus = arrays.excludeStatus;

  const where = args.where;
  if (where !== undefined && (typeof where !== "object" || where === null || Array.isArray(where))) {
    return {
      content: [
        {
          type: "text",
          text: 'where must be an object mapping frontmatter field names to scalar values, e.g. {"severity": "blocks-work", "is_outdated": true}.',
        },
      ],
      isError: true,
    };
  }

  const handle = openCacheRead(projectRoot);
  let results;
  try {
    results = await search(handle.db, config, {
      query,
      collection,
      scope,
      status,
      excludeStatus,
      where: where as Record<string, string | number | boolean> | undefined,
      has: arrays.has,
      lacks: arrays.lacks,
      limit,
    });
  } catch (err) {
    // An unknown collection (FRICTION-030), an unknown status (FRICTION-038),
    // a `where` aimed at a list (FRICTION-049), a malformed `where` key or
    // value (FRICTION-050) or a bad presence filter (FRICTION-045) is a
    // caller error, not a crash — render it as a refusal so the agent sees
    // why rather than an empty result it will read as an answer.
    if (err instanceof SearchError) {
      return { content: [{ type: "text", text: `${err.code}: ${err.message}` }], isError: true };
    }
    throw err;
  } finally {
    handle.close();
  }

  if (results.length === 0) {
    return { content: [{ type: "text", text: "No results found." }] };
  }

  const text = results
    .map((r, i) => {
      const idPart = r.id ? `[${r.id}]` : "";
      const preview = r.preview.replace(/\n/g, " ");

      // Relevance label — explicit about method and its limitations
      const signals: string[] = [];
      if (r.relevance.vector_search !== undefined) {
        signals.push(`vector_search=${r.relevance.vector_search.toFixed(3)}`);
      }
      if (r.relevance.keyword_bm25 !== undefined) {
        signals.push(`keyword_bm25=${r.relevance.keyword_bm25.toFixed(2)}`);
      }
      const relevanceNote =
        signals.length > 0
          ? `${signals.join(", ")} (hybrid RRF — informative, not authoritative)`
          : `(no relevance signal)`;

      // Show agent-authored description if present; mechanical preview as fallback
      const summary = r.description ?? preview;

      return [
        formatHitHeader(i, idPart, r),
        `   _id: ${r._id}`,
        `   file: ${r.source_file}`,
        `   relevance: ${relevanceNote}`,
        `   ${summary}`,
      ].join("\n");
    })
    .join("\n\n");

  const actions: NextAction[] = [];
  if (results[0]) {
    actions.push({
      tool: "docdog_traverse",
      args: { vertex_id: results[0]._id },
      hint: "see the neighborhood of the top result",
    });
  }
  if (results[1]) {
    actions.push({
      tool: "docdog_get",
      args: { id: results[1]._id },
      hint: "read the full content of the second result",
    });
  }

  return withNextActions({ content: [{ type: "text", text }] }, actions);
}

/**
 * The header line of one result. Exported for the same reason as the CLI's
 * `formatSearchHit` — this surface cannot be exercised in a test without
 * loading the real embedder, and FRICTION-053 was a field it omitted.
 *
 * `status` is UNCONDITIONAL where `scope` is suppressed at its default:
 * DD-058 gives scope a value every record inherits, so printing "shared" on
 * 323 of 360 records is noise, while status is the field that says whether
 * this hit is still live and has no such inherited default.
 */
export function formatHitHeader(
  i: number,
  idPart: string,
  r: { title: string; collection: string; status: string; scope: string },
): string {
  const scopePart = r.scope !== "shared" ? `, scope:${r.scope}` : "";
  return `${i + 1}. ${idPart} **${r.title}** (${r.collection}, ${r.status}${scopePart})`;
}
