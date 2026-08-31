/**
 * The relocatable embed store — PROPOSAL-029.
 *
 * Covers the three resolution rules, union write semantics, the one-time
 * adoption of a pre-029 in-`index.db` embed_cache, and the two claims the
 * proposal is actually for: two project roots pointed at one store share
 * their embeddings, and a fresh git worktree of the same HEAD re-embeds
 * nothing.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import {
  countSupersededRecipeRows,
  openEmbedStore,
  resolveEmbedStorePath,
  EMBED_SCHEMA_VERSION,
  EMBED_STORE_FILE,
  embedStoreFileName,
  findOtherVintages,
  parseStoreFileName,
} from "../../src/storage/embed-store.js";
import { MAX_EMBED_CHARS } from "../../src/storage/embed-health.js";
import { resetGitProbeCache } from "../../src/storage/git.js";
import {
  embedRecipe,
  runCacheIndexer,
  type CacheIndexerOptions,
  type EmbedBatchFn,
} from "../../src/storage/indexer.js";

const RECORD = (id: string, body: string) => `---
id: ${id}
title: Record ${id}
---

${body}
`;

/** Deterministic per-text vector — a reuse hit must be byte-identical. */
const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

const gitAvailable = (() => {
  try {
    return spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
})();

function git(cwd: string, ...args: string[]): void {
  const proc = spawnSync("git", args, { cwd, encoding: "utf-8", windowsHide: true });
  if (proc.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr}`);
  }
}

describe("embed store", () => {
  let dir: string;
  let config: DocdogConfig;
  const cleanup: string[] = [];

  beforeEach(() => {
    resetGitProbeCache();
    dir = mkdtempSync(join(tmpdir(), "docdog-embed-"));
    cleanup.push(dir);
    mkdirSync(join(dir, "specs"), { recursive: true });
    config = {
      ...defaultConfig,
      project: { name: "embed-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
  });

  afterEach(() => {
    resetGitProbeCache();
    for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  function opts(root: string, overrides: Partial<CacheIndexerOptions> = {}): CacheIndexerOptions {
    return {
      config,
      projectRoot: root,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
      ...overrides,
    };
  }

  // ─── Path resolution ──────────────────────────────────────────────────────

  it("falls back to the project cache dir outside git", () => {
    const location = resolveEmbedStorePath(dir, config);
    expect(location.path).toBe(join(dir, ".docdog", "cache", EMBED_STORE_FILE));
    expect(location.source).toBe("project");
    expect(location.shared).toBe(false);
  });

  it("honours an absolute embed.cache_path override", () => {
    const explicit = join(dir, "elsewhere", "vectors.db");
    const location = resolveEmbedStorePath(dir, {
      ...config,
      embed: { ...config.embed, cache_path: explicit },
    });
    expect(location.path).toBe(explicit);
    expect(location.source).toBe("config");
    // Inside the project root, so not shared with anything.
    expect(location.shared).toBe(false);
  });

  it("resolves a relative embed.cache_path against the project root, and marks an outside path shared", () => {
    const relative = resolveEmbedStorePath(dir, {
      ...config,
      embed: { ...config.embed, cache_path: "vectors/store.db" },
    });
    expect(relative.path).toBe(join(dir, "vectors", "store.db"));

    const outside = resolveEmbedStorePath(dir, {
      ...config,
      embed: { ...config.embed, cache_path: "../shared-store.db" },
    });
    expect(outside.path).toBe(resolve(dir, "..", "shared-store.db"));
    expect(outside.shared).toBe(true);
  });

  it.runIf(gitAvailable)("resolves to the git common dir inside a repository", () => {
    git(dir, "init");
    const location = resolveEmbedStorePath(dir, config);
    expect(location.path).toBe(join(dir, ".git", "docdog", EMBED_STORE_FILE));
    expect(location.source).toBe("git");
    expect(location.shared).toBe(true);
  });

  it("prefers an explicit cache_path over git", () => {
    if (gitAvailable) git(dir, "init");
    const explicit = join(dir, "pinned.db");
    const location = resolveEmbedStorePath(dir, {
      ...config,
      embed: { ...config.embed, cache_path: explicit },
    });
    expect(location.path).toBe(explicit);
    expect(location.source).toBe("config");
  });

  // ─── Write semantics ──────────────────────────────────────────────────────

  it("is grow-only: the first writer of a key wins and a second write is a no-op", () => {
    const path = join(dir, "store.db");
    const store = openEmbedStore(dir, config, { filePath: path });
    try {
      const first = Buffer.from(new Float32Array([1, 2, 3]).buffer);
      const second = Buffer.from(new Float32Array([9, 9, 9]).buffer);

      store.put("hash-a", "model-x", first, "2026-07-14T00:00:00Z");
      store.put("hash-a", "model-x", second, "2026-07-14T00:00:01Z");

      expect(store.get("hash-a", "model-x")).toEqual(first);
      // A model switch misses cleanly rather than serving a stale vector.
      expect(store.get("hash-a", "model-y")).toBeNull();
      expect(
        (store.db.prepare(`SELECT COUNT(*) AS n FROM embed_cache`).get() as { n: number }).n,
      ).toBe(1);
    } finally {
      store.close();
    }
  });

  // ─── One-time adoption (§4) ───────────────────────────────────────────────

  it("adopts rows from a pre-029 embed_cache living inside index.db", () => {
    const legacyPath = join(dir, "index.db");
    const legacy = new Database(legacyPath);
    legacy.exec(`CREATE TABLE embed_cache (
      content_hash TEXT NOT NULL,
      model        TEXT NOT NULL,
      embedding    BLOB NOT NULL,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (content_hash, model)
    ) WITHOUT ROWID`);
    const vector = Buffer.from(new Float32Array([4, 5, 6]).buffer);
    legacy
      .prepare(`INSERT INTO embed_cache VALUES (?, ?, ?, ?)`)
      .run("legacy-hash", "model-x", vector, "2026-07-13T00:00:00Z");
    legacy.close();

    const storePath = join(dir, "embeddings.db");
    const store = openEmbedStore(dir, config, { filePath: storePath, adoptFrom: legacyPath });
    try {
      expect(store.adopted).toBe(1);
      expect(store.get("legacy-hash", "model-x")).toEqual(vector);
    } finally {
      store.close();
    }

    // Only on the open that creates the store — a warm store never re-adopts.
    const reopened = openEmbedStore(dir, config, { filePath: storePath, adoptFrom: legacyPath });
    try {
      expect(reopened.rebuilt).toBe(false);
      expect(reopened.adopted).toBe(0);
    } finally {
      reopened.close();
    }
  });

  it("adopts nothing when index.db has no embed_cache, and never throws on a junk file", () => {
    const junk = join(dir, "junk.db");
    writeFileSync(junk, "not a database at all");

    const store = openEmbedStore(dir, config, {
      filePath: join(dir, "embeddings.db"),
      adoptFrom: junk,
    });
    try {
      expect(store.adopted).toBe(0);
    } finally {
      store.close();
    }
  });

  // ─── Versioned file names (FRICTION-034) ──────────────────────────────────

  // The store versions independently of the cache (that independence is
  // PROPOSAL-029's point), but the drop-and-rebuild it USED to share with the
  // cache landed on a file the whole clone reads — so it deleted every
  // worktree's vectors, not just the disagreeing one, and two docdog versions
  // against one clone could ping-pong that indefinitely. The version lives in
  // the file NAME now, so vintages coexist.
  it("grandfathers version 1's bare name and suffixes every later one", () => {
    // Renaming v1's file would orphan every store in existence and charge
    // its owner the re-embed this scheme exists to avoid — paying the cost
    // once to install the mechanism for not paying it.
    expect(embedStoreFileName(1)).toBe(EMBED_STORE_FILE);
    expect(embedStoreFileName(2)).toBe("embeddings-v2.db");
    expect(embedStoreFileName()).toBe(embedStoreFileName(EMBED_SCHEMA_VERSION));
  });

  it("resolves the default paths through the versioned name", () => {
    expect(resolveEmbedStorePath(dir, config).path).toBe(
      join(dir, ".docdog", "cache", embedStoreFileName()),
    );
  });

  it("reads a version out of a store name and refuses to guess at any other", () => {
    expect(parseStoreFileName(EMBED_STORE_FILE)).toBe(1);
    expect(parseStoreFileName("embeddings-v2.db")).toBe(2);
    expect(parseStoreFileName("embeddings-v17.db")).toBe(17);
    // A user's own cache_path file is not a vintage of anything, and
    // guessing that it is would report someone else's database as
    // reclaimable.
    expect(parseStoreFileName("vectors.db")).toBeNull();
    expect(parseStoreFileName("embeddings-vX.db")).toBeNull();
    expect(parseStoreFileName("embeddings.db.bak")).toBeNull();
  });

  it("finds sibling vintages, excludes the current store, and ignores foreign files", () => {
    const home = join(dir, "store-dir");
    mkdirSync(home, { recursive: true });
    const current = join(home, EMBED_STORE_FILE);
    for (const name of [EMBED_STORE_FILE, "embeddings-v3.db", "embeddings-v2.db", "mine.db"]) {
      writeFileSync(join(home, name), "x");
    }

    const found = findOtherVintages(current);
    expect(found.map((v) => v.version)).toEqual([2, 3]); // sorted, current dropped
    expect(found.every((v) => v.bytes > 0)).toBe(true);
    expect(found.some((v) => v.path.endsWith("mine.db"))).toBe(false);
  });

  it("reports no vintages when the directory does not exist", () => {
    expect(findOtherVintages(join(dir, "nope", EMBED_STORE_FILE))).toEqual([]);
  });

  // ─── Version mismatch ─────────────────────────────────────────────────────

  // In-place rebuild survives for the one path where docdog does not own the
  // name — an explicit embed.cache_path — so it has to SAY what it cost.
  // Pinned here because the constant has never moved off 1: the first bump
  // should find a test that already states the price.
  it("drops every row on an EMBED_SCHEMA_VERSION mismatch", () => {
    const path = join(dir, "embeddings.db");
    const vector = Buffer.from(new Float32Array([1, 2, 3]).buffer);

    const first = openEmbedStore(dir, config, { filePath: path });
    first.put("hash-a", "model-x", vector, "2026-07-20T00:00:00Z");
    first.db
      .prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(String(EMBED_SCHEMA_VERSION + 1));
    first.close();

    const second = openEmbedStore(dir, config, { filePath: path });
    try {
      expect(second.rebuilt).toBe(true);
      expect(second.get("hash-a", "model-x")).toBeNull();
      // The disclosure, which is the part the old code could not give:
      // whose vectors these were, and how many.
      expect(second.priorVersion).toBe(EMBED_SCHEMA_VERSION + 1);
      expect(second.dropped).toBe(1);
      const version = second.db
        .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
        .get() as { value: string };
      expect(version.value).toBe(String(EMBED_SCHEMA_VERSION));
    } finally {
      second.close();
    }
  });

  // A downgrade is the same event seen from the other side, and the check is
  // `!==` rather than `<` on purpose — two docdog versions against one clone
  // is the documented dev loop (npm link vs source mode), so the older one
  // must not mistake a newer store for its own.
  it("rebuilds on a version lower than the current one too", () => {
    const path = join(dir, "embeddings.db");

    const first = openEmbedStore(dir, config, { filePath: path });
    first.put("hash-b", "model-x", Buffer.from(new Float32Array([4]).buffer), "2026-07-20T00:00:00Z");
    first.db.prepare(`UPDATE meta SET value = '0' WHERE key = 'schema_version'`).run();
    first.close();

    const second = openEmbedStore(dir, config, { filePath: path });
    try {
      expect(second.rebuilt).toBe(true);
      expect(second.get("hash-b", "model-x")).toBeNull();
    } finally {
      second.close();
    }
  });

  // ─── Recipe keying (FRICTION-033) ─────────────────────────────────────────

  // The key names the function that produced the vector, not just the model.
  // Before this, `content_hash` was taken over the FULL body while embedInput
  // truncated afterwards, so the cap was an input to the embedding function
  // and absent from its key: move the cap and unchanged records keep serving
  // vectors of the old prefix while edited ones get the new recipe, with no
  // version anywhere able to detect the mixture.
  it("keys stored vectors by the recipe, not the bare model name", async () => {
    const path = join(dir, "embeddings.db");
    writeFileSync(join(dir, "specs", "dd-001.md"), RECORD("DD-001", "Body."));

    const result = await runCacheIndexer(opts(dir, { embedStorePath: path }));
    expect(result.embedded).toBe(1);

    const store = openEmbedStore(dir, config, { filePath: path });
    try {
      const keys = store.db.prepare(`SELECT model FROM embed_cache`).all() as Array<{
        model: string;
      }>;
      expect(keys).toHaveLength(1);
      expect(keys[0].model).toBe(embedRecipe(config.embed.model));
      // The distinction that matters: the stored key is NOT the model alone.
      expect(keys[0].model).not.toBe(config.embed.model);
    } finally {
      store.close();
    }
  });

  it("changes the recipe when the cap moves, and only then", () => {
    const model = config.embed.model;
    expect(embedRecipe(model, MAX_EMBED_CHARS)).toBe(embedRecipe(model));
    expect(embedRecipe(model, 4000)).not.toBe(embedRecipe(model, MAX_EMBED_CHARS));
    // Both halves of the recipe are live: the model still separates keyspaces.
    expect(embedRecipe("other-model", 4000)).not.toBe(embedRecipe(model, 4000));
    expect(embedRecipe(model, 4000)).toContain("4000");
  });

  // dtype is the third input to the embedding function (FRICTION-018 item 3) and
  // enters the recipe the same way the cap did (FRICTION-033). The load-bearing
  // property: an UNSET dtype must yield exactly the pre-dtype key, or adding the
  // parameter would silently re-embed every existing store.
  it("adds dtype to the recipe without disturbing the unset key", () => {
    const model = config.embed.model;
    // Unset / null → byte-identical to the two-arg key that shipped with F-033.
    expect(embedRecipe(model, MAX_EMBED_CHARS, undefined)).toBe(embedRecipe(model, MAX_EMBED_CHARS));
    expect(embedRecipe(model, MAX_EMBED_CHARS, null)).toBe(embedRecipe(model, MAX_EMBED_CHARS));
    // A named dtype opens a distinct keyspace — fp32 and q8 vectors never collide.
    expect(embedRecipe(model, MAX_EMBED_CHARS, "q8")).not.toBe(embedRecipe(model, MAX_EMBED_CHARS));
    expect(embedRecipe(model, MAX_EMBED_CHARS, "q8")).toContain("q8");
    expect(embedRecipe(model, MAX_EMBED_CHARS, "q8")).not.toBe(
      embedRecipe(model, MAX_EMBED_CHARS, "q4"),
    );
    // Cap and dtype are independent axes of the same key.
    expect(embedRecipe(model, 4000, "q8")).not.toBe(embedRecipe(model, MAX_EMBED_CHARS, "q8"));
  });

  it("misses a vector stored under a superseded recipe rather than serving it", () => {
    const path = join(dir, "embeddings.db");
    const store = openEmbedStore(dir, config, { filePath: path });
    try {
      const stale = Buffer.from(new Float32Array([1, 2, 3]).buffer);
      store.put("hash-a", embedRecipe(config.embed.model, 4000), stale, "2026-07-20T00:00:00Z");

      // A miss, not a hit — the caller re-embeds under the current recipe
      // instead of mixing two vintages of vector in one corpus.
      expect(store.get("hash-a", embedRecipe(config.embed.model))).toBeNull();

      // And the old row survives, which is what makes reverting the cap free:
      // flip it back and this is a hit again, exactly as flipping the model
      // back already behaved. gc sweeps by content, so a superseded recipe's
      // rows leave only when their content does.
      expect(store.get("hash-a", embedRecipe(config.embed.model, 4000))).toEqual(stale);
    } finally {
      store.close();
    }
  });

  it("counts the rows a superseded recipe strands, current recipe excluded (FRICTION-035)", () => {
    const path = join(dir, "embeddings.db");
    const store = openEmbedStore(dir, config, { filePath: path });
    try {
      const vec = Buffer.from(new Float32Array([1, 2, 3]).buffer);
      const current = embedRecipe(config.embed.model);
      const oldCap = embedRecipe(config.embed.model, 4000);
      store.put("hash-a", oldCap, vec, "2026-07-20T00:00:00Z");
      store.put("hash-b", oldCap, vec, "2026-07-20T00:00:00Z");
      store.put("hash-c", current, vec, "2026-07-20T00:00:00Z");

      // Two old-recipe rows are unreachable under the current recipe; the
      // current row is not counted. This is the number status now discloses —
      // findUnusedRows cannot, because all three hashes could be live.
      expect(countSupersededRecipeRows(store.db, current)).toBe(2);
      // Symmetric: relative to the old recipe, only the current row is stranded.
      expect(countSupersededRecipeRows(store.db, oldCap)).toBe(1);
    } finally {
      store.close();
    }
  });

  // The transition cost, stated rather than discovered: a store written before
  // recipe keying holds bare model names, so its rows miss once and re-embed.
  // Paid one time, by design — the alternative (bumping EMBED_SCHEMA_VERSION)
  // drops the file outright and costs the same re-embed plus every row a
  // future recipe change would not have touched.
  it("re-embeds rows left by a pre-recipe store instead of reusing them", async () => {
    const path = join(dir, "embeddings.db");
    writeFileSync(join(dir, "specs", "dd-001.md"), RECORD("DD-001", "Body."));

    const seeded = openEmbedStore(dir, config, { filePath: path });
    const first = await runCacheIndexer(opts(dir, { embedStorePath: path }));
    const hash = (
      seeded.db.prepare(`SELECT content_hash FROM embed_cache LIMIT 1`).get() as {
        content_hash: string;
      }
    ).content_hash;
    // Re-file that vector the old way: keyed by model alone.
    seeded.db.prepare(`DELETE FROM embed_cache`).run();
    seeded.put(hash, config.embed.model, Buffer.from(new Float32Array([0]).buffer), "2026-07-20T00:00:00Z");
    seeded.close();
    expect(first.embedded).toBe(1);

    const second = await runCacheIndexer(opts(dir, { embedStorePath: path, full: true }));
    expect(second.embedReused).toBe(0);
    expect(second.embedded).toBe(1);
  });

  // ─── The payoff ───────────────────────────────────────────────────────────

  it("shares embeddings between two project roots pointed at one store", async () => {
    const shared = join(dir, "shared", "embeddings.db");
    const alpha = mkdtempSync(join(tmpdir(), "docdog-embed-a-"));
    const beta = mkdtempSync(join(tmpdir(), "docdog-embed-b-"));
    cleanup.push(alpha, beta);

    for (const root of [alpha, beta]) {
      mkdirSync(join(root, "specs"), { recursive: true });
      writeFileSync(join(root, "specs", "dd-001.md"), RECORD("DD-001", "Identical body."));
    }

    const first = await runCacheIndexer(opts(alpha, { embedStorePath: shared }));
    expect(first.embedded).toBe(1);
    expect(first.embedReused).toBe(0);

    // Byte-identical content in a different project root: same content
    // hash, so the vector is already there.
    const second = await runCacheIndexer(opts(beta, { embedStorePath: shared }));
    expect(second.embedded).toBe(0);
    expect(second.embedReused).toBe(1);
  });

  it("keys the same record identically whether it is checked out LF or CRLF", async () => {
    const shared = join(dir, "shared", "embeddings.db");
    const lf = mkdtempSync(join(tmpdir(), "docdog-embed-lf-"));
    const crlf = mkdtempSync(join(tmpdir(), "docdog-embed-crlf-"));
    cleanup.push(lf, crlf);

    const body = RECORD("DD-001", "Alpha body.\nSecond line.");
    mkdirSync(join(lf, "specs"), { recursive: true });
    writeFileSync(join(lf, "specs", "dd-001.md"), body);
    mkdirSync(join(crlf, "specs"), { recursive: true });
    writeFileSync(join(crlf, "specs", "dd-001.md"), body.replace(/\n/g, "\r\n"));

    const first = await runCacheIndexer(opts(lf, { embedStorePath: shared }));
    expect(first.embedded).toBe(1);

    const second = await runCacheIndexer(opts(crlf, { embedStorePath: shared }));
    expect(second.embedded).toBe(0);
    expect(second.embedReused).toBe(1);
  });

  it.runIf(gitAvailable)("re-embeds nothing in a fresh worktree of the same HEAD", async () => {
    git(dir, "init");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "Test");
    // Set on purpose, not tolerated: with autocrlf the worktree checkout below
    // writes CRLF where this tree has LF. Reuse must survive that, because it
    // is the configuration the feature was measured on (discovery canonicalizes
    // line endings before hashing — without it, every lookup here misses).
    git(dir, "config", "core.autocrlf", "true");
    writeFileSync(join(dir, "specs", "dd-001.md"), RECORD("DD-001", "Alpha body."));
    writeFileSync(join(dir, "specs", "dd-002.md"), RECORD("DD-002", "Bravo body."));
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "corpus");

    const trunk = await runCacheIndexer(opts(dir));
    expect(trunk.embedded).toBe(2);
    expect(trunk.embedStoreShared).toBe(true);
    expect(existsSync(trunk.embedStorePath)).toBe(true);

    const worktree = join(dir, "..", `${dir.split(/[\\/]/).pop()}-wt`);
    cleanup.push(resolve(worktree));
    git(dir, "worktree", "add", "--detach", worktree, "HEAD");

    // The worktree has its own (empty) cache, but the store is the clone's,
    // so a cold index of byte-identical content embeds nothing. This is the
    // 604s → 3s claim, in miniature.
    const fresh = await runCacheIndexer(opts(resolve(worktree)));
    expect(fresh.rebuilt).toBe(true);
    expect(fresh.embedded).toBe(0);
    expect(fresh.embedReused).toBe(2);
    expect(fresh.embedStorePath).toBe(trunk.embedStorePath);
  });
});
