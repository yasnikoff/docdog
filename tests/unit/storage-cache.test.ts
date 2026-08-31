/**
 * PROPOSAL-023 §2 storage module — cache open/rebuild lifecycle.
 * Pure SQLite against a temp directory; no Docker, no ArangoDB.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMeta, openCache, openCacheRead, setMeta, type CacheHandle } from "../../src/storage/cache.js";
import { META_KEYS, SCHEMA_VERSION } from "../../src/storage/schema.js";

describe("storage cache lifecycle", () => {
  let dir: string;
  let open: CacheHandle[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-cache-test-"));
    open = [];
  });

  afterEach(() => {
    for (const h of open) {
      try {
        h.close();
      } catch {
        // already closed by the test
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  function openAt(filePath: string): CacheHandle {
    const h = openCache(dir, { filePath });
    open.push(h);
    return h;
  }

  it("creates the schema on a fresh file and reports rebuilt", () => {
    const h = openAt(join(dir, "index.db"));
    expect(h.rebuilt).toBe(true);
    expect(getMeta(h.db, META_KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));

    const tables = h.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%'`)
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    // No embed_cache: it lives in its own file since PROPOSAL-029, which
    // is precisely what makes dropping this one cheap — and what let
    // `contested_ids` (PROPOSAL-031) arrive on a version bump.
    expect(tables).toEqual([
      "chunks",
      "contested_ids",
      "edges",
      "files",
      "fts",
      "meta",
      "vertices",
    ]);
  });

  it("defaults to <projectRoot>/.docdog/cache/index.db", () => {
    const h = openCache(dir);
    open.push(h);
    expect(h.path).toBe(join(dir, ".docdog", "cache", "index.db"));
  });

  it("reopens an up-to-date cache without rebuilding", () => {
    const path = join(dir, "index.db");
    const first = openAt(path);
    first.db.prepare(
      `INSERT INTO vertices (id, collection, file_path, content_hash, frontmatter_json, body_text)
       VALUES ('DD-001', 'decisions', 'specs/decisions/dd-001.md', 'sha256:x', '{}', 'body')`,
    ).run();
    first.close();

    const second = openAt(path);
    expect(second.rebuilt).toBe(false);
    const row = second.db.prepare(`SELECT collection FROM vertices WHERE id = 'DD-001'`).get() as {
      collection: string;
    };
    expect(row.collection).toBe("decisions");
  });

  it("drops and rebuilds on schema version mismatch, sweeping old rows", () => {
    const path = join(dir, "index.db");
    const first = openAt(path);
    first.db.prepare(
      `INSERT INTO vertices (id, collection, file_path, content_hash, frontmatter_json, body_text)
       VALUES ('DD-001', 'decisions', 'specs/decisions/dd-001.md', 'sha256:x', '{}', 'body')`,
    ).run();
    setMeta(first.db, META_KEYS.schemaVersion, String(SCHEMA_VERSION + 1));
    first.close();

    const second = openAt(path);
    expect(second.rebuilt).toBe(true);
    expect(getMeta(second.db, META_KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
    const count = second.db.prepare(`SELECT COUNT(*) AS n FROM vertices`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("recovers from a non-SQLite file by starting over", () => {
    const path = join(dir, "index.db");
    writeFileSync(path, "this is not a sqlite database, not even close");

    const h = openAt(path);
    expect(h.rebuilt).toBe(true);
    expect(getMeta(h.db, META_KEYS.schemaVersion)).toBe(String(SCHEMA_VERSION));
  });

  it("sweeps unknown leftover tables during rebuild", () => {
    const path = join(dir, "index.db");
    const first = openAt(path);
    first.db.exec(`CREATE TABLE stray_leftover (x TEXT)`);
    setMeta(first.db, META_KEYS.schemaVersion, "0");
    first.close();

    const second = openAt(path);
    expect(second.rebuilt).toBe(true);
    const stray = second.db
      .prepare(`SELECT name FROM sqlite_master WHERE name = 'stray_leftover'`)
      .get();
    expect(stray).toBeUndefined();
  });

  it("opens in WAL mode with a busy timeout", () => {
    const h = openAt(join(dir, "index.db"));
    expect(h.db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(h.db.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("supports BM25-ranked FTS5 matches over indexed text", () => {
    const h = openAt(join(dir, "index.db"));
    const insert = h.db.prepare(`INSERT INTO fts (vertex_id, title, description, body) VALUES (?, ?, ?, ?)`);
    insert.run("DD-070", "V3 umbrella decision", "disk-canonical corpus", "the database becomes a disposable cache");
    insert.run("DP-001", "Agent-first mechanics", "code never judges", "semantic decisions belong to the agent loop");

    const hits = h.db
      .prepare(`SELECT vertex_id, rank FROM fts WHERE fts MATCH ? ORDER BY rank`)
      .all("disposable cache") as Array<{ vertex_id: string; rank: number }>;
    expect(hits.map((r) => r.vertex_id)).toEqual(["DD-070"]);
    expect(hits[0].rank).toBeLessThan(0); // BM25 ranks are negative in FTS5
  });

  it("round-trips meta values", () => {
    const h = openAt(join(dir, "index.db"));
    expect(getMeta(h.db, META_KEYS.embedModel)).toBeNull();
    setMeta(h.db, META_KEYS.embedModel, "nomic-ai/nomic-embed-text-v1");
    setMeta(h.db, META_KEYS.embedModel, "nomic-ai/nomic-embed-text-v1");
    expect(getMeta(h.db, META_KEYS.embedModel)).toBe("nomic-ai/nomic-embed-text-v1");
  });

  // Read-path contract (P-023 §7 step 5): reads never rebuild — a
  // missing or stale cache is an actionable error, not an empty store.
  describe("openCacheRead", () => {
    it("opens an up-to-date cache and reads it", () => {
      const path = join(dir, "index.db");
      const writer = openAt(path);
      writer.db.prepare(
        `INSERT INTO vertices (id, collection, file_path, content_hash, frontmatter_json, body_text)
         VALUES ('DD-001', 'decisions', 'specs/decisions/dd-001.md', 'sha256:x', '{}', 'body')`,
      ).run();
      writer.close();

      const reader = openCacheRead(dir, { filePath: path });
      open.push(reader);
      expect(reader.rebuilt).toBe(false);
      const row = reader.db.prepare(`SELECT id FROM vertices`).get() as { id: string };
      expect(row.id).toBe("DD-001");
    });

    it("throws an actionable error when the cache file is missing", () => {
      expect(() => openCacheRead(dir, { filePath: join(dir, "index.db") })).toThrow(
        /docdog index/,
      );
    });

    it("throws instead of rebuilding on a schema version mismatch", () => {
      const path = join(dir, "index.db");
      const writer = openAt(path);
      writer.db.prepare(
        `INSERT INTO vertices (id, collection, file_path, content_hash, frontmatter_json, body_text)
         VALUES ('DD-001', 'decisions', 'specs/decisions/dd-001.md', 'sha256:x', '{}', 'body')`,
      ).run();
      setMeta(writer.db, META_KEYS.schemaVersion, "1");
      writer.close();

      expect(() => openCacheRead(dir, { filePath: path })).toThrow(/v1.*docdog index/);

      // The stale cache is untouched — rebuilding is the indexer's job.
      const check = new Database(path, { readonly: true });
      try {
        const version = check
          .prepare(`SELECT value FROM meta WHERE key = ?`)
          .get(META_KEYS.schemaVersion) as { value: string };
        expect(version.value).toBe("1");
        const count = check.prepare(`SELECT COUNT(*) AS n FROM vertices`).get() as { n: number };
        expect(count.n).toBe(1);
      } finally {
        check.close();
      }
    });
  });
});
