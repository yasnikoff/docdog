/**
 * Cache vertex reads — the get-by-id shape shared by the traverse
 * walk (src/storage/traverse.ts) and the docdog_get tool (P-023 §7
 * step 5). One row per record; frontmatter parsed, scope defaulted
 * per DD-058.
 */
import type Database from "better-sqlite3";

/** A vertex row as stored in the cache, frontmatter parsed. */
export interface CacheVertex {
  /** Cache primary key — equals `id`. V2-shape compatibility alias. */
  _id: string;
  id: string;
  collection: string;
  title: string;
  description: string | null;
  status: string;
  scope: string;
  source_file: string;
  frontmatter: Record<string, unknown>;
  body_text: string;
}

export interface VertexRow {
  id: string;
  collection: string;
  status: string | null;
  title: string | null;
  description: string | null;
  file_path: string;
  frontmatter_json: string;
  body_text: string;
}

export const VERTEX_COLUMNS =
  "id, collection, status, title, description, file_path, frontmatter_json, body_text";

/** Fetch a single record by its id (v2's getById, minus the Arango _id leg). */
export function getVertexById(db: Database.Database, id: string): CacheVertex | null {
  const row = db
    .prepare(`SELECT ${VERTEX_COLUMNS} FROM vertices WHERE id = ?`)
    .get(id) as VertexRow | undefined;
  return row ? toCacheVertex(row) : null;
}

export function toCacheVertex(row: VertexRow): CacheVertex {
  const frontmatter = parseJsonObject(row.frontmatter_json);
  const scope = typeof frontmatter.scope === "string" ? frontmatter.scope : "shared";
  return {
    _id: row.id,
    id: row.id,
    collection: row.collection,
    title: row.title ?? "",
    description: row.description,
    status: row.status ?? "current",
    scope,
    source_file: row.file_path,
    frontmatter,
    body_text: row.body_text,
  };
}

export function parseJsonObject(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
