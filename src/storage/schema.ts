/**
 * V3 embedded cache schema — PROPOSAL-023 §2, implementing DD-070
 * commitments 2 (disk-canonical, disposable cache) and 3 (embedded
 * storage).
 *
 * One SQLite file at `.docdog/cache/index.db` (gitignored). Every
 * table here is derived state rebuilt from the markdown corpus by
 * `docdog index`; deleting the file is always safe. There are no
 * migrations, ever (DD-070 §2 supersedes DD-062): a schema change
 * bumps SCHEMA_VERSION and a version mismatch on open drops all
 * tables and rebuilds from disk.
 */

/**
 * Bump on ANY schema change below. Mismatch on open → drop and
 * rebuild, never migrate.
 *
 * v2: added `files` (per-file hash for the incremental fast-path and
 * the FRICTION-009 ghost sweep) and `embed_cache` (DD-051 content-hash
 * embedding reuse, moved into the cache file per the session-3 handoff).
 * v3: removed `embed_cache` — it now lives in its own relocatable file
 * (src/storage/embed-store.ts, PROPOSAL-029). That is what makes a bump
 * of this constant cheap: the expensive state no longer lives in the
 * file a version mismatch drops.
 * v4: added `contested_ids` (PROPOSAL-031) — the first bump to spend that
 * cheapness: it costs a reindex, not a re-embed.
 */
export const SCHEMA_VERSION = 4;

/**
 * Well-known keys in the `meta` table.
 *
 * PROPOSAL-023 §2 also sketched a `corpus_fingerprint`. Nothing ever wrote
 * or read one, so it is gone: a declared key that is never populated reads
 * like a staleness signal the cache does not actually have. If a
 * content-level staleness check is ever wanted, it comes back with the code
 * that maintains it.
 */
export const META_KEYS = {
  schemaVersion: "schema_version",
  /**
   * The bare model, kept because it is what `status` DISPLAYS. It used to
   * be what the indexer COMPARED as well, and one field doing two jobs is
   * how FRICTION-046 happened: a dtype change moved the store's key and
   * not this one, so nothing invalidated and the cache went quietly mixed.
   */
  embedModel: "embed_model",
  /**
   * The full recipe — `embedRecipe(model, cap, dtype)` — and the only
   * thing the full-rebuild guard compares (FRICTION-046). Absent from a
   * cache written before that fix; the indexer synthesizes the value such
   * a cache implies rather than treating the gap as "unchanged".
   */
  embedRecipe: "embed_recipe",
} as const;

/**
 * All cache tables, in creation order. `fts` is FTS5-virtual; its
 * shadow tables (fts_data, fts_idx, ...) are managed by SQLite and
 * dropped automatically with it.
 */
export const CACHE_TABLES = [
  "meta",
  "files",
  "vertices",
  "edges",
  "chunks",
  "fts",
  "contested_ids",
] as const;

/**
 * DDL statements, executed in order on (re)build.
 *
 * - `vertices` — one row per record; `collection` is a column, not a
 *   physical table per type (DD-070 §6 restating DD-046's survival).
 * - `edges` — the single edges table (answers OQ-20 by construction).
 *   Derived exclusively from `relationships:` frontmatter blocks; no
 *   source/discovered_via provenance columns — with a single origin
 *   there is nothing to distinguish (PROPOSAL-023 §1.1).
 * - `chunks` — section-granularity retrieval home; `embedding` is a
 *   Float32Array BLOB, content-hash cached per DD-051. Vector search
 *   is brute-force cosine over these rows as the guaranteed path;
 *   sqlite-vec is an optional accelerator wired in at search time.
 * - `fts` — FTS5 with BM25 ranking over title/description/body,
 *   replacing v2's unranked CONTAINS. A plain (non-external-content)
 *   FTS table: the indexer writes it alongside `vertices`; the text
 *   duplication is irrelevant at docdog corpus scale and keeps the
 *   rebuild path trivially correct.
 * - `files` — one row per indexed source file; `file_hash` drives the
 *   incremental fast-path (DD-050 tier 1) and the row set drives the
 *   ghost-file sweep (FRICTION-009): a row whose path is under a
 *   scanned prefix but missing from disk means the file was deleted.
 * - `contested_ids` — one row per (id, claiming file) when two or more
 *   files claim one id (PROPOSAL-031, answering OQ-43's open half). The
 *   indexer already detected this and warned; the warning scrolled past
 *   and the loser's record simply vanished from the cache, unqueryable.
 *   These rows make it state instead: `docdog_status` reports them, and
 *   an agent resolves them with `docdog renumber`. Derived like every
 *   other table — recomputed whole on any corpus-wide index run.
 *
 * `embed_cache` is NOT here: DD-051's content-hash embedding reuse
 * lives in its own file now (embed-store.ts, PROPOSAL-029). A table
 * keyed by content has no business inside a file scoped to a branch —
 * and keeping it out is what lets this file be dropped freely.
 */
export const SCHEMA_DDL: readonly string[] = [
  `CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID`,

  `CREATE TABLE files (
    path      TEXT PRIMARY KEY,
    file_hash TEXT NOT NULL
  ) WITHOUT ROWID`,

  `CREATE TABLE vertices (
    id               TEXT PRIMARY KEY,
    collection       TEXT NOT NULL,
    status           TEXT,
    title            TEXT,
    description      TEXT,
    file_path        TEXT NOT NULL,
    content_hash     TEXT NOT NULL,
    frontmatter_json TEXT NOT NULL,
    body_text        TEXT NOT NULL
  )`,
  `CREATE INDEX idx_vertices_collection ON vertices(collection)`,
  `CREATE INDEX idx_vertices_file_path ON vertices(file_path)`,

  `CREATE TABLE edges (
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    type       TEXT NOT NULL,
    context    TEXT,
    extra_json TEXT,
    PRIMARY KEY (from_id, to_id, type)
  ) WITHOUT ROWID`,
  `CREATE INDEX idx_edges_to ON edges(to_id)`,

  `CREATE TABLE chunks (
    vertex_id    TEXT NOT NULL,
    ord          INTEGER NOT NULL,
    heading_path TEXT,
    start_line   INTEGER,
    end_line     INTEGER,
    text         TEXT NOT NULL,
    embedding    BLOB,
    PRIMARY KEY (vertex_id, ord)
  ) WITHOUT ROWID`,

  `CREATE TABLE contested_ids (
    id        TEXT NOT NULL,
    file_path TEXT NOT NULL,
    won       INTEGER NOT NULL,
    PRIMARY KEY (id, file_path)
  ) WITHOUT ROWID`,

  `CREATE VIRTUAL TABLE fts USING fts5(
    vertex_id UNINDEXED,
    title,
    description,
    body
  )`,
];
