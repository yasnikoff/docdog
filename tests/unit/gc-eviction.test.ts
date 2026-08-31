/**
 * `docdog gc` — cache eviction (DD-070 §4). Ports the surviving intent
 * of the v2 Docker gc suite: stale embed store rows are evicted, live
 * ones survive. Since PROPOSAL-029 the sweep spans two files (liveness
 * from index.db, rows from embeddings.db); since DISC-032 the liveness
 * set is an argument rather than a second database handle, because gc
 * passes the union of every worktree's hashes and status passes one
 * tree's. Pure SQLite against a temp corpus; embedder injected.
 */
import { mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { openCacheRead } from "../../src/storage/cache.js";
import {
  compactStore,
  countSupersededRecipeRows,
  deleteSupersededRecipeRows,
  evictStaleEmbeddings,
  liveContentHashes,
  openEmbedStore,
  retentionCutoff,
} from "../../src/storage/embed-store.js";
import { shouldAutoSweep } from "../../src/engine/embed-gc.js";


const DD_001 = `---
id: DD-001
title: First decision
---

Alpha body one.
`;

const DD_002 = `---
id: DD-002
title: Second decision
---

Bravo body two.
`;

describe("gc cache eviction", () => {
  let dir: string;
  let cachePath: string;
  let storePath: string;
  let config: DocdogConfig;

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-gc-"));
    cachePath = join(dir, "cache.db");
    storePath = join(dir, "embeddings.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "dd-002.md"), DD_002);
    config = {
      ...defaultConfig,
      project: { name: "gc-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embedStorePath: storePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    };
  }

  /** Run `fn` against both open databases, then close them. */
  function withDbs<T>(fn: (index: ReturnType<typeof openCacheRead>, store: ReturnType<typeof openEmbedStore>) => T): T {
    const handle = openCacheRead(dir, { filePath: cachePath });
    const store = openEmbedStore(dir, config, { filePath: storePath });
    try {
      return fn(handle, store);
    } finally {
      handle.close();
      store.close();
    }
  }

  function embedCacheCount(): number {
    return withDbs(
      (_index, store) =>
        (store.db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }).n,
    );
  }

  it("evicts store rows whose content left the corpus, keeps live ones", async () => {
    await runCacheIndexer(opts());
    expect(embedCacheCount()).toBe(2);

    // Delete one record's file; reindex sweeps its vertex but store rows
    // deliberately survive reindexes (DD-051) — that's gc's job.
    unlinkSync(join(dir, "specs", "dd-002.md"));
    await runCacheIndexer(opts());
    expect(embedCacheCount()).toBe(2);

    withDbs((index, store) => {
      const result = evictStaleEmbeddings(liveContentHashes(index.db), store.db);
      expect(result.scanned).toBe(2);
      expect(result.evicted).toBe(1);
      expect(result.kept).toBe(1);

      // The survivor is DD-001's hash.
      const live = index.db.prepare(`SELECT content_hash FROM vertices`).all() as Array<{
        content_hash: string;
      }>;
      const rows = store.db.prepare(`SELECT content_hash FROM embed_cache`).all() as Array<{
        content_hash: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(live.map((r) => r.content_hash)).toContain(rows[0].content_hash);
    });
  });

  it("dry-run reports without deleting", async () => {
    await runCacheIndexer(opts());
    unlinkSync(join(dir, "specs", "dd-002.md"));
    await runCacheIndexer(opts());

    withDbs((index, store) => {
      const result = evictStaleEmbeddings(liveContentHashes(index.db), store.db, { dryRun: true });
      expect(result.evicted).toBe(1);
    });
    expect(embedCacheCount()).toBe(2);
  });

  it("is a no-op on a fully live cache", async () => {
    await runCacheIndexer(opts());
    withDbs((index, store) => {
      const result = evictStaleEmbeddings(liveContentHashes(index.db), store.db);
      expect(result.evicted).toBe(0);
      expect(result.kept).toBe(2);
    });
  });

  it("spares a row that is dead here but live in another tree's hash set", async () => {
    // The whole point of taking `live` as an argument (DISC-032). The row is
    // orphaned from this cache's point of view; a sibling worktree still
    // holding that content is what the union expresses, and it must survive.
    await runCacheIndexer(opts());
    const orphanedHash = withDbs(
      (index) =>
        (index.db.prepare(`SELECT content_hash FROM vertices WHERE id = 'DD-002'`).get() as {
          content_hash: string;
        }).content_hash,
    );

    unlinkSync(join(dir, "specs", "dd-002.md"));
    await runCacheIndexer(opts());

    withDbs((index, store) => {
      const union = liveContentHashes(index.db);
      union.add(orphanedHash); // as a sibling worktree's cache would contribute
      const result = evictStaleEmbeddings(union, store.db);
      expect(result.evicted).toBe(0);
      expect(result.kept).toBe(2);
    });
    expect(embedCacheCount()).toBe(2);
  });
});

/**
 * The four sweeps OBS-026 added, each pinned at the seam it belongs to:
 * the retention floor and the recipe prune are pure functions over a
 * store, compaction is the file-size behaviour nothing exercised before,
 * and `shouldAutoSweep` is the gate `docdog index` consults.
 */
describe("retention floor (embed.retain_days, DISC-032 item 3)", () => {
  let dir: string;
  let storePath: string;
  let config: DocdogConfig;

  const NOW = new Date("2026-08-27T12:00:00.000Z");
  /** `days` before NOW, as the indexer would have written it. */
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-floor-"));
    storePath = join(dir, "embeddings.db");
    config = { ...defaultConfig, project: { name: "floor-test" } };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A store holding one row per (hash, recipe, age) triple. */
  function seed(rows: Array<{ hash: string; recipe: string; days: number }>) {
    const store = openEmbedStore(dir, config, { filePath: storePath });
    for (const r of rows) {
      store.put(r.hash, r.recipe, Buffer.from(new Float32Array([1, 2, 3]).buffer), ago(r.days));
    }
    return store;
  }

  it("keeps unused rows younger than the floor and evicts the rest", () => {
    const store = seed([
      { hash: "young", recipe: "m@8000", days: 2 },
      { hash: "old", recipe: "m@8000", days: 30 },
    ]);
    try {
      const result = evictStaleEmbeddings(new Set<string>(), store.db, {
        retainSince: retentionCutoff(7, NOW),
      });
      expect(result.evicted).toBe(1);
      expect(result.retained).toBe(1);
      // Both are unused; `kept` counts liveness, not the floor.
      expect(result.kept).toBe(0);

      const left = store.db.prepare(`SELECT content_hash FROM embed_cache`).all() as Array<{
        content_hash: string;
      }>;
      expect(left.map((r) => r.content_hash)).toEqual(["young"]);
    } finally {
      store.close();
    }
  });

  it("evicts everything unused when the floor is off", () => {
    const store = seed([{ hash: "young", recipe: "m@8000", days: 2 }]);
    try {
      const result = evictStaleEmbeddings(new Set<string>(), store.db, {
        retainSince: retentionCutoff(0, NOW),
      });
      expect(result.evicted).toBe(1);
      expect(result.retained).toBe(0);
    } finally {
      store.close();
    }
  });

  it("is a floor, not a ceiling — an OLD row that is LIVE always survives", () => {
    // OBS-021's trap, pinned as a test so nobody reinvents age-based
    // eviction on this column: `created_at` is age-since-first-embed, so
    // comparing it the other way round would discard exactly this row.
    const store = seed([{ hash: "ancient-but-live", recipe: "m@8000", days: 900 }]);
    try {
      const result = evictStaleEmbeddings(new Set(["ancient-but-live"]), store.db, {
        retainSince: retentionCutoff(7, NOW),
      });
      expect(result.evicted).toBe(0);
      expect(result.kept).toBe(1);
    } finally {
      store.close();
    }
  });

  it("retentionCutoff returns null for 0 and negatives", () => {
    expect(retentionCutoff(0, NOW)).toBeNull();
    expect(retentionCutoff(-3, NOW)).toBeNull();
    expect(retentionCutoff(7, NOW)).toBe("2026-08-20T12:00:00.000Z");
  });

  it("prunes superseded-recipe rows only when asked, whatever their age", () => {
    // FRICTION-035's unreachable stratum: live content, dead recipe. The
    // liveness sweep must not touch it (that is what keeps reverting free)
    // and the floor must not shield it (the flag is the consent).
    const store = seed([
      { hash: "live", recipe: "m@8000", days: 40 },
      { hash: "live", recipe: "m", days: 1 },
    ]);
    try {
      const live = new Set(["live"]);
      expect(countSupersededRecipeRows(store.db, "m@8000")).toBe(1);

      // Content-keyed liveness sees both rows as used.
      expect(evictStaleEmbeddings(live, store.db, { retainSince: null }).evicted).toBe(0);

      expect(deleteSupersededRecipeRows(store.db, "m@8000", { dryRun: true })).toBe(1);
      expect(countSupersededRecipeRows(store.db, "m@8000")).toBe(1);

      expect(deleteSupersededRecipeRows(store.db, "m@8000")).toBe(1);
      expect(countSupersededRecipeRows(store.db, "m@8000")).toBe(0);
      expect(
        (store.db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }).n,
      ).toBe(1);
    } finally {
      store.close();
    }
  });

  it("compaction shrinks the file after a sweep, and reports what it gave back", () => {
    // The gap the whole exercise started from: deleting rows returns pages
    // to SQLite's freelist, not to the filesystem, so before compactStore
    // existed `gc` could evict most of the store and move the file size by
    // nothing at all.
    const rows = Array.from({ length: 400 }, (_, i) => ({
      hash: `h${i}`,
      recipe: "m@8000",
      days: 30,
    }));
    const store = seed(rows);
    try {
      expect(evictStaleEmbeddings(new Set<string>(), store.db, {}).evicted).toBe(400);

      const result = compactStore(store.db);
      expect(result.error).toBeNull();
      expect(result.after).toBeLessThan(result.before);

      // The reported numbers are the numbers on disk. This is the half a
      // naive `statSync` around the VACUUM gets wrong: in WAL mode the
      // inserts and the freed pages both sit in `-wal` until a checkpoint,
      // so an unchecked `before` reads as a nearly empty file and the
      // compaction looks like growth. compactStore checkpoints both sides,
      // which is the only reason its delta means anything.
      expect(statSync(storePath).size).toBe(result.after);
    } finally {
      store.close();
    }
  });
});

describe("shouldAutoSweep (embed.auto_gc gate)", () => {
  const base = { ...defaultConfig, project: { name: "gate" } };

  it("sweeps by default on a full-scope run", () => {
    expect(shouldAutoSweep(base, { scoped: false }).sweep).toBe(true);
  });

  it("defaults to sweeping when the key is absent entirely", () => {
    // An adopting project whose config.yaml predates PROPOSAL-029's
    // successor never gained the key; it must read as the shipped default
    // rather than as false.
    const legacy = { ...base, embed: { ...base.embed, auto_gc: undefined } };
    expect(shouldAutoSweep(legacy, { scoped: false }).sweep).toBe(true);
  });

  it("never sweeps on a scoped run, and says why", () => {
    const gate = shouldAutoSweep(base, { scoped: true });
    expect(gate.sweep).toBe(false);
    expect(gate.reason).toMatch(/--path/);
  });

  it("opts out silently when auto_gc is false", () => {
    const off = { ...base, embed: { ...base.embed, auto_gc: false } };
    const gate = shouldAutoSweep(off, { scoped: false });
    expect(gate.sweep).toBe(false);
    expect(gate.reason).toBeNull();
  });
});
