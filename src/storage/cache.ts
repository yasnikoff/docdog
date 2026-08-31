/**
 * Cache open/rebuild lifecycle — PROPOSAL-023 §2, first code work of
 * the v3 branch.
 *
 * The cache contract (DD-070 §2): `docdog index` is the only writer
 * of canonical-derived state; deleting `.docdog/cache/` is always
 * safe; a schema version mismatch means drop and rebuild, never
 * migrate.
 *
 * Concurrency: WAL + busy_timeout set at every open. This is the
 * multi-session reality — a `docdog serve` MCP process and a
 * `docdog index` CLI run concurrently. N readers + one writer with
 * queued writers is sufficient for batch indexing plus small tool
 * writes, but only with WAL on; otherwise SQLITE_BUSY surfaces in
 * normal use.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { META_KEYS, SCHEMA_DDL, SCHEMA_VERSION } from "./schema.js";

/** Repo-relative home of the cache file. Gitignored, disposable. */
export const CACHE_DIR = ".docdog/cache";
export const CACHE_FILE = "index.db";

export interface CacheHandle {
  db: Database.Database;
  /** Absolute path of the cache file. */
  path: string;
  /**
   * True when this open dropped and recreated the schema (fresh
   * file, version mismatch, or corrupt/foreign file). The caller
   * (indexer) must treat a rebuilt cache as empty and do a full
   * reindex from disk.
   */
  rebuilt: boolean;
  close(): void;
}

export interface OpenCacheOptions {
  /**
   * Override the cache file path (absolute), e.g. a temp file in
   * tests. Default: `<projectRoot>/.docdog/cache/index.db`.
   */
  filePath?: string;
}

/**
 * Where this project's cache file lives, honouring an explicit override.
 * Unlike the embed store (PROPOSAL-029) this never relocates: the cache
 * describes one working tree, so it belongs inside it.
 */
export function cacheFilePath(projectRoot: string, override?: string): string {
  return override ?? join(projectRoot, CACHE_DIR, CACHE_FILE);
}

/**
 * Open the project's cache, creating or rebuilding it as needed.
 * Always returns a usable handle with the current schema in place —
 * every failure mode (missing file, stale version, foreign or
 * corrupt database) resolves by rebuilding, because the cache is
 * derived state and disk is canonical.
 */
export function openCache(projectRoot: string, opts: OpenCacheOptions = {}): CacheHandle {
  const path = cacheFilePath(projectRoot, opts.filePath);
  mkdirSync(dirname(path), { recursive: true });

  let db: Database.Database;
  try {
    db = connect(path);
  } catch {
    // Not a SQLite file at all (corrupt, truncated, foreign). The
    // cache is disposable: remove and start over.
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    db = connect(path);
  }

  let rebuilt = false;
  if (readSchemaVersion(db) !== SCHEMA_VERSION) {
    rebuildSchema(db);
    rebuilt = true;
  }

  return {
    db,
    path,
    rebuilt,
    close: () => db.close(),
  };
}

/**
 * Open the cache for a read surface (search/get/traverse). Unlike
 * `openCache`, a missing or stale cache is NOT silently rebuilt —
 * rebuilding on the read path would leave an empty schema and turn
 * "not indexed yet" into a misleading "no results". Throws an
 * actionable error instead; `docdog index` is the only writer
 * (DD-070 §2).
 */
export function openCacheRead(projectRoot: string, opts: OpenCacheOptions = {}): CacheHandle {
  const path = cacheFilePath(projectRoot, opts.filePath);
  if (!existsSync(path)) {
    throw new Error(`Cache not found at ${path} — run "docdog index" first.`);
  }

  const db = connect(path);
  const version = readSchemaVersion(db);
  if (version !== SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `Cache schema is ${version === null ? "unreadable" : `v${version}`} (expected v${SCHEMA_VERSION}) — run "docdog index" to rebuild.`,
    );
  }

  return { db, path, rebuilt: false, close: () => db.close() };
}

function connect(path: string): Database.Database {
  const db = new Database(path);
  try {
    // WAL persists in the file; the pragmas below are per-connection.
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    // Fail fast if the main file isn't a readable database.
    db.pragma("user_version");
    return db;
  } catch (err) {
    // Release the file handle before the caller deletes the file —
    // on Windows an open handle makes the unlink fail with EBUSY.
    db.close();
    throw err;
  }
}

/**
 * Current schema version of an opened database, or null when absent
 * (fresh file, pre-`meta` layout, or unreadable table structure).
 */
function readSchemaVersion(db: Database.Database): number | null {
  try {
    const row = db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get(META_KEYS.schemaVersion) as { value: string } | undefined;
    if (!row) return null;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Drop every known cache table and recreate the schema at
 * SCHEMA_VERSION. Also sweeps any unknown leftover tables so a
 * downgrade-then-upgrade cycle can't strand orphans: the file holds
 * only derived state, so anything unrecognized is safe to remove.
 */
export function rebuildSchema(db: Database.Database): void {
  const existing = db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;

  const names = existing.map((r) => r.name);
  const virtuals = names.filter((n) => isFts5Table(db, n));
  const drop = db.transaction(() => {
    // Drop FTS5 virtual tables first — DROP TABLE on the virtual
    // table cascades to its shadow tables, and dropping a shadow
    // directly errors.
    for (const name of virtuals) {
      db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
    }
    for (const name of names) {
      if (virtuals.includes(name) || isShadowOf(name, virtuals)) continue;
      db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
    }
  });
  drop();

  const create = db.transaction(() => {
    for (const stmt of SCHEMA_DDL) db.exec(stmt);
    db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)`).run(
      META_KEYS.schemaVersion,
      String(SCHEMA_VERSION),
    );
  });
  create();
}

/** A table is FTS5-virtual when its schema SQL says so. */
function isFts5Table(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { sql: string | null } | undefined;
  return /USING\s+fts5/i.test(row?.sql ?? "");
}

/** FTS5 shadow tables carry the virtual table's name as a prefix. */
function isShadowOf(name: string, virtuals: string[]): boolean {
  return virtuals.some((t) => name.startsWith(`${t}_`));
}

/** Read a `meta` value; null when unset. */
export function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

/** Upsert a `meta` value. */
export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
