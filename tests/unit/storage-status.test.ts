/**
 * Status report — the engine both `docdog_status` (MCP) and
 * `docdog status` (CLI) render (PROPOSAL-032).
 *
 * Runs the real cache indexer over a temp corpus with an injected fake
 * embedder, then asserts the report. No overrides for the cache or
 * embed-store paths: `collectStatus` resolves both from projectRoot, so
 * the test exercises the same resolution the surfaces do.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { openCacheRead } from "../../src/storage/cache.js";
import { MAX_EMBED_CHARS } from "../../src/storage/embed-health.js";
import { collectStatus, formatEmbedStore, formatScopes } from "../../src/storage/status.js";

const DD_001 = `---
id: DD-001
title: Cache design
relationships:
  - references: DD-002
    context: the record it leans on
---

# Cache design

Body text for the cache decision.
`;

const DD_002 = `---
id: DD-002
title: Graph traversal
---

# Graph traversal

Body text for the traversal decision.
`;

const NOTE_001 = `---
id: NOTE-001
title: A note
---

# A note

Body text for the note.
`;

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

describe("storage status report", () => {
  let dir: string;
  let config: DocdogConfig;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-status-"));
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    writeFileSync(join(dir, "specs", "notes", "note-001.md"), NOTE_001);
    config = {
      ...defaultConfig,
      project: { name: "status-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["decisions", "notes"],
      default_collection: "notes",
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Default paths on purpose — collectStatus resolves them from projectRoot. */
  function opts(): CacheIndexerOptions {
    return { config, projectRoot: dir, embed: fakeEmbed, log: () => {}, warn: () => {} };
  }

  it("reports collection counts, files, edges, and embedded chunks", async () => {
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.collections).toEqual([
      { collection: "decisions", count: 2 },
      { collection: "notes", count: 1 },
    ]);
    expect(report.files).toBe(3);
    expect(report.edges).toBe(1); // DD-001 references DD-002
    expect(report.embeddedChunks).toBe(3);
    expect(report.scanPaths).toEqual(["specs/"]);
    expect(report.cachePath).toContain("index.db");
    expect(report.cacheSizeMb).toBeGreaterThan(0);
  });

  it("rosters the statuses in use, so a filter's vocabulary is visible before it is typed", async () => {
    // FRICTION-038's other half: the collection counts above are what make
    // `--collection` guessable, and `--status` had no equivalent. All three
    // records here omit `status:`, which the indexer materializes as current.
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.statuses.present).toEqual([{ status: "current", count: 3 }]);
    // No concepts records in this corpus, so nothing is declared-but-unused —
    // the declared half is additive and a project without it validates fine.
    expect(report.statuses.declaredUnused).toEqual([]);
  });

  it("rosters the scopes in use, the one vocabulary nothing can refuse you (FRICTION-050)", async () => {
    // The same service the two rosters above perform, and the only one that
    // is load-bearing rather than convenient: scope is a free string with no
    // enum and no registration (DD-058), so `--scope` cannot refuse a wrong
    // guess. There is no learn-by-being-refused path, which leaves this.
    writeFileSync(
      join(dir, "specs", "notes", "note-002.md"),
      `---
id: NOTE-002
title: Private note
scope: personal
---

body
`,
    );
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    // The three records that declare nothing count as shared — the roster
    // reports the value the filter would match, not the frontmatter as
    // written, or it would advertise a scope `--scope` cannot return.
    expect(report.scopes).toEqual([
      { scope: "shared", count: 3 },
      { scope: "personal", count: 1 },
    ]);
    expect(formatScopes(report.scopes)).toEqual(["  shared: 3", "  personal: 1"]);
  });

  it("says nothing about scope when the corpus has one, since there is nothing to learn", async () => {
    // `shared: 3` on a corpus that declares no scopes is a line about a
    // filter with one possible value. `--json` still carries it.
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.scopes).toEqual([{ scope: "shared", count: 3 }]);
    expect(formatScopes(report.scopes)).toEqual([]);
  });

  it("names the installation, because a friction report pastes this as its environment", async () => {
    // PROPOSAL-043's issue template requires `docdog status --json` as the
    // environment block, and triage's first question is the version — which
    // this report carried on no surface at all until it carried this.
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.install.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(["npx", "global", "dependency", "source"]).toContain(report.install.shape);
    // Never fetched: an unchecked project reports null rather than reaching out.
    expect(report.install.check).toBeNull();
  });

  it("reports the embed store as created, with its vector count", async () => {
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.embedStore.exists).toBe(true);
    expect(report.embedStore.vectors).toBe(3);
    // A bare temp dir is not a git worktree, so the store stays project-local.
    expect(report.embedStore.shared).toBe(false);
    expect(formatEmbedStore(report.embedStore)).toContain("3 vector(s)");
    expect(formatEmbedStore(report.embedStore)).toContain("project-local");
  });

  it("throws when no cache has been built — an unindexed project is the caller's to report", () => {
    expect(() => collectStatus(dir, config)).toThrow();
  });

  it("reports a clean corpus as having no records past the embed cap", async () => {
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.embedHealth.oversized).toEqual([]);
    expect(report.embedHealth.unembeddedPct).toBe(0);
    expect(report.embedHealth.cap).toBe(MAX_EMBED_CHARS);
  });

  it("names an over-cap record end to end, from disk through the indexer to the report", async () => {
    // The truncation this reports is otherwise invisible: the record indexes
    // cleanly, searches fine by keyword, and only its *vector* is a prefix.
    // So the assertion that matters is that a whole real pass — parse, index,
    // embed, report — surfaces it at all.
    writeFileSync(
      join(dir, "specs", "notes", "long.md"),
      `---\nid: NOTE-LONG\ntitle: A long note\n---\n\n# A long note\n\n${"word ".repeat(3000)}`,
    );
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.embedHealth.oversized).toHaveLength(1);
    expect(report.embedHealth.oversized[0].id).toBe("NOTE-LONG");
    expect(report.embedHealth.oversized[0].unembedded).toBeGreaterThan(0);
    expect(report.embedHealth.oversized[0].filePath).toContain("long.md");
    expect(report.embedHealth.unembeddedPct).toBeGreaterThan(0);
  });

  it("keeps the over-cap record fully searchable by keyword — only the vector is a prefix", async () => {
    // The other half of the claim the warning makes. If the tail were absent
    // from FTS too, the wording ("findable by keyword but not by meaning")
    // would be a lie and the honest report would be far more alarming.
    const tail = "zzsentinelzz";
    writeFileSync(
      join(dir, "specs", "notes", "long.md"),
      `---\nid: NOTE-LONG\ntitle: A long note\n---\n\n# A long note\n\n${"word ".repeat(3000)}${tail}\n`,
    );
    await runCacheIndexer(opts());

    const handle = openCacheRead(dir);
    try {
      const hit = handle.db
        .prepare(`SELECT vertex_id FROM fts WHERE fts MATCH ?`)
        .get(tail) as { vertex_id: string } | undefined;
      expect(hit?.vertex_id).toBe("NOTE-LONG");
    } finally {
      handle.close();
    }
  });

  it("renders an uncreated embed store as a state, not a crash", () => {
    const line = formatEmbedStore({
      path: "/x/embeddings.db",
      shared: true,
      exists: false,
      vectors: null,
      sizeMb: null,
      unused: null,
      supersededRecipe: null,
    });
    expect(line).toBe("/x/embeddings.db (shared across worktrees, not created yet)");
  });

  it("reports no unused vectors on a store whose every row is still live", async () => {
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.embedStore.unused).toBe(0);
    // Silence is the point: a healthy store must not grow the line.
    expect(formatEmbedStore(report.embedStore)).not.toContain("unused");
    // Same silence for the recipe stratum: nothing is superseded until a
    // recipe changes (FRICTION-035).
    expect(report.embedStore.supersededRecipe).toBe(0);
    expect(formatEmbedStore(report.embedStore)).not.toContain("superseded recipe");
  });

  it("counts the rows a recipe change strands — unreachable, though their content is still live (FRICTION-035)", async () => {
    // The bug FRICTION-035 named: after a recipe change, "unused" (nothing
    // hashes to it) and "unreachable" (nothing can reach it) stop being the
    // same set. Flip the dtype between two indexes — same content, new recipe
    // key — so every record re-embeds and its old-recipe row is stranded.
    await runCacheIndexer(opts());

    // A dtype change is a recipe change but NOT a model change, so an
    // incremental pass would skip the unchanged files and never re-embed
    // (only `meta.embed_model` drift forces a full pass). A full reindex is
    // what production does after a recipe change, and what strands the old
    // rows — so drive it explicitly here.
    const withDtype: DocdogConfig = { ...config, embed: { ...config.embed, dtype: "q8" } };
    await runCacheIndexer({ ...opts(), config: withDtype, full: true });

    const report = collectStatus(dir, withDtype);

    // 3 rows under the old recipe + 3 under the new = 6; the old 3 are the
    // stranded stratum.
    expect(report.embedStore.vectors).toBe(6);
    expect(report.embedStore.supersededRecipe).toBe(3);
    // The whole point: their content is live, so "unused" cannot see them.
    expect(report.embedStore.unused).toBe(0);

    const line = formatEmbedStore(report.embedStore);
    expect(line).toContain("3 (50%) written under a superseded recipe");
    // Disclosure, not a call to action — it must not point at gc.
    expect(line).toContain("reverting stays free");
    expect(line).not.toContain('run "docdog gc"');
  });

  it("counts a vector orphaned by an edit — the growth OBS-021 measured", async () => {
    // The accumulation is driven by revision, not deletion: editing a record
    // mints a row under the new content hash and leaves the old one with no
    // owner. One edit, one orphan.
    await runCacheIndexer(opts());
    writeFileSync(
      join(dir, "specs", "notes", "note-001.md"),
      NOTE_001.replace("# ", "# Edited "),
    );
    await runCacheIndexer(opts());

    const report = collectStatus(dir, config);

    expect(report.embedStore.vectors).toBe(4);
    expect(report.embedStore.unused).toBe(1);
  });

  it("names gc as the remedy on a project-local store, where unused does mean evictable", async () => {
    const line = formatEmbedStore({
      path: "/x/embeddings.db",
      shared: false,
      exists: true,
      vectors: 100,
      sizeMb: 1.5,
      unused: 19,
      supersededRecipe: 0,
    });
    expect(line).toContain("19 (19%) unused by this working tree");
    expect(line).toContain('run "docdog gc"');
  });

  // This test used to assert that a shared store names a REFUSAL instead of
  // gc, and it kept asserting it after DISC-032 removed the refusal — gc was
  // changed, status was not, and the test pinned the stale half. Hence the
  // shape now: gc is the remedy on both stores, and what differs between them
  // is only how much of `unused` it will actually evict.
  it("still names gc on a shared store, qualified by the union it takes first", () => {
    const line = formatEmbedStore({
      path: "/x/embeddings.db",
      shared: true,
      exists: true,
      vectors: 100,
      sizeMb: 1.5,
      unused: 19,
      supersededRecipe: 0,
    });
    expect(line).toContain("19 (19%) unused by this working tree");
    expect(line).toContain('run "docdog gc"');
    // The caveat is load-bearing: this count is one tree's answer, and gc
    // evicts the complement of every tree's union — a subset of it.
    expect(line).toContain("unions every worktree");
  });

  it("prints unused and superseded-recipe as two independent lines — different sets, not summed", () => {
    const line = formatEmbedStore({
      path: "/x/embeddings.db",
      shared: false,
      exists: true,
      vectors: 100,
      sizeMb: 1.5,
      unused: 12,
      supersededRecipe: 40,
    });
    expect(line).toContain("12 (12%) unused by this working tree");
    expect(line).toContain("40 (40%) written under a superseded recipe");
  });
});
