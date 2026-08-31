/**
 * Cache indexer — P-023 §7 step 3. Pure SQLite against a temp corpus;
 * no Docker, no ArangoDB, no ONNX (the embedder is injected).
 */
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import { META_KEYS } from "../../src/storage/schema.js";
import { EMBED_SCHEMA_VERSION, openEmbedStore } from "../../src/storage/embed-store.js";
import type { DocdogConfig } from "../../src/types/config.js";
import {
  formatSkipSummary,
  reindexCacheFile,
  runCacheIndexer,
  type CacheIndexerOptions,
  type EmbedBatchFn,
} from "../../src/storage/indexer.js";

const DD_001 = `---
id: DD-001
title: First decision
description: the first
relationships:
  - references: DD-002
    context: builds on it
    role: amends
---

# First decision

Alpha bravo charlie disposable cache decision body.
`;

const DD_002 = `---
id: DD-002
title: Second decision
---

# Second decision

Delta echo foxtrot embedded storage body.
`;

describe("storage cache indexer", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let embedCalls: string[][];
  let warnings: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => {
    embedCalls.push(texts);
    return texts.map((t) => [t.length, 1, 2]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-cache-indexer-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    config = {
      ...defaultConfig,
      project: { name: "cache-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["decisions", "notes"],
      default_collection: "notes",
    };
    embedCalls = [];
    warnings = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: (m) => warnings.push(m),
    };
  }

  function run(extra: Partial<CacheIndexerOptions> = {}) {
    return runCacheIndexer({ ...opts(), ...extra });
  }

  /** Fresh read-only connection for assertions (the indexer closes its own). */
  function inspect(): Database.Database {
    return new Database(cachePath, { readonly: true });
  }

  it("populates files, vertices, edges, chunks, and fts from disk", async () => {
    const stats = await run();
    expect(stats.filesSeen).toBe(2);
    expect(stats.filesChanged).toBe(2);
    expect(stats.verticesUpserted).toBe(2);
    expect(stats.edges).toBe(1);
    expect(stats.embedded).toBe(2);
    expect(stats.embedReused).toBe(0);

    const db = inspect();
    try {
      const vertex = db
        .prepare(`SELECT collection, status, title, description, file_path, body_text FROM vertices WHERE id = 'DD-001'`)
        .get() as Record<string, string>;
      expect(vertex.collection).toBe("decisions"); // inferred from directory
      expect(vertex.status).toBe("current");
      expect(vertex.title).toBe("First decision");
      expect(vertex.description).toBe("the first");
      expect(vertex.file_path).toBe("specs/decisions/dd-001.md");
      expect(vertex.body_text).toContain("Alpha bravo charlie");

      const edge = db.prepare(`SELECT * FROM edges WHERE from_id = 'DD-001'`).get() as Record<string, string>;
      expect(edge.to_id).toBe("DD-002");
      expect(edge.type).toBe("references");
      expect(edge.context).toBe("builds on it");
      expect(JSON.parse(edge.extra_json)).toEqual({ role: "amends" });

      const chunk = db
        .prepare(`SELECT ord, heading_path, text, embedding FROM chunks WHERE vertex_id = 'DD-002'`)
        .get() as { ord: number; heading_path: string; text: string; embedding: Buffer };
      expect(chunk.ord).toBe(0);
      expect(chunk.heading_path).toBe("Second decision");
      const vector = Array.from(
        new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.length / 4),
      );
      expect(vector).toEqual([chunk.text.length, 1, 2]);

      const hits = db
        .prepare(`SELECT vertex_id FROM fts WHERE fts MATCH ? ORDER BY rank`)
        .all("alpha bravo") as Array<{ vertex_id: string }>;
      expect(hits.map((h) => h.vertex_id)).toEqual(["DD-001"]);

      const files = db.prepare(`SELECT path, file_hash FROM files ORDER BY path`).all() as Array<{
        path: string;
        file_hash: string;
      }>;
      expect(files.map((f) => f.path)).toEqual([
        "specs/decisions/dd-001.md",
        "specs/decisions/dd-002.md",
      ]);
      expect(files[0].file_hash).toMatch(/^sha256:/);
    } finally {
      db.close();
    }
  });

  it("skips unchanged files and never re-embeds on a no-change run", async () => {
    await run();
    const callsBefore = embedCalls.length;

    const stats = await run();
    expect(stats.filesChanged).toBe(0);
    expect(stats.embedded).toBe(0);
    expect(embedCalls.length).toBe(callsBefore);
  });

  it("reuses cached embeddings by content hash when an edit is reverted (DD-051)", async () => {
    await run();

    const path = join(dir, "specs", "decisions", "dd-002.md");
    writeFileSync(path, DD_002.replace("Delta echo foxtrot", "Golf hotel india"));
    const edited = await run();
    expect(edited.filesChanged).toBe(1);
    expect(edited.embedded).toBe(1);

    writeFileSync(path, DD_002);
    const reverted = await run();
    expect(reverted.filesChanged).toBe(1);
    expect(reverted.embedded).toBe(0);
    expect(reverted.embedReused).toBe(1);
  });

  it("updates edges on a frontmatter-only edit without re-embedding", async () => {
    await run();

    writeFileSync(
      join(dir, "specs", "decisions", "dd-002.md"),
      DD_002.replace(
        "title: Second decision",
        "title: Second decision\nrelationships:\n  - supersedes: DD-001\n",
      ),
    );
    const stats = await run();
    expect(stats.filesChanged).toBe(1);
    expect(stats.embedded).toBe(0);
    expect(stats.embedReused).toBe(1); // body unchanged → content-hash hit

    const db = inspect();
    try {
      const edge = db.prepare(`SELECT to_id, type FROM edges WHERE from_id = 'DD-002'`).get() as {
        to_id: string;
        type: string;
      };
      expect(edge).toEqual({ to_id: "DD-001", type: "supersedes" });
    } finally {
      db.close();
    }
  });

  it("sweeps a deleted file's rows; inbound edges from other files dangle", async () => {
    await run();

    unlinkSync(join(dir, "specs", "decisions", "dd-002.md"));
    const stats = await run();
    expect(stats.verticesRemoved).toBe(1);

    const db = inspect();
    try {
      expect(db.prepare(`SELECT id FROM vertices WHERE id = 'DD-002'`).get()).toBeUndefined();
      expect(db.prepare(`SELECT * FROM chunks WHERE vertex_id = 'DD-002'`).get()).toBeUndefined();
      expect(db.prepare(`SELECT * FROM fts WHERE vertex_id = 'DD-002'`).get()).toBeUndefined();
      expect(db.prepare(`SELECT * FROM files WHERE path = 'specs/decisions/dd-002.md'`).get()).toBeUndefined();
      // DD-001's frontmatter still claims the edge — it dangles honestly.
      const dangling = db.prepare(`SELECT to_id FROM edges WHERE from_id = 'DD-001'`).get() as {
        to_id: string;
      };
      expect(dangling.to_id).toBe("DD-002");
    } finally {
      db.close();
    }
  });

  it("keeps a record's id across a file rename without duplicate-id warnings", async () => {
    await run();

    renameSync(
      join(dir, "specs", "decisions", "dd-002.md"),
      join(dir, "specs", "decisions", "dd-002-renamed.md"),
    );
    await run();

    const db = inspect();
    try {
      const rows = db.prepare(`SELECT id, file_path FROM vertices ORDER BY id`).all() as Array<{
        id: string;
        file_path: string;
      }>;
      expect(rows).toEqual([
        { id: "DD-001", file_path: "specs/decisions/dd-001.md" },
        { id: "DD-002", file_path: "specs/decisions/dd-002-renamed.md" },
      ]);
    } finally {
      db.close();
    }
    expect(warnings.filter((w) => w.includes("claimed"))).toEqual([]);
  });

  it("reindexes a single file without touching the rest of the corpus", async () => {
    await run();

    writeFileSync(
      join(dir, "specs", "decisions", "dd-001.md"),
      DD_001.replace("Alpha bravo charlie", "Juliet kilo lima"),
    );
    writeFileSync(
      join(dir, "specs", "decisions", "dd-002.md"),
      DD_002.replace("Delta echo foxtrot", "Mike november oscar"),
    );

    const stats = await reindexCacheFile(opts(), "specs/decisions/dd-001.md");
    expect(stats.filesSeen).toBe(1);
    expect(stats.filesChanged).toBe(1);

    const db = inspect();
    try {
      const dd1 = db.prepare(`SELECT body_text FROM vertices WHERE id = 'DD-001'`).get() as {
        body_text: string;
      };
      const dd2 = db.prepare(`SELECT body_text FROM vertices WHERE id = 'DD-002'`).get() as {
        body_text: string;
      };
      expect(dd1.body_text).toContain("Juliet kilo lima");
      expect(dd2.body_text).toContain("Delta echo foxtrot"); // stale until its own reindex
    } finally {
      db.close();
    }
  });

  it("reports cumulative graph totals alongside the per-run counts (FRICTION-029)", async () => {
    const full = await run();
    // On a full build the two agree — everything was reindexed this run.
    expect(full.edges).toBe(1);
    expect(full.totalEdges).toBe(1);
    expect(full.totalVertices).toBe(2);

    // Reindex DD-002 alone (it declares no outbound edges). The per-run
    // edge count is 0, but the graph still holds DD-001→DD-002: exactly the
    // "did I lose edges?" shape the friction reported. The totals must stay
    // whole while the per-run figure shrinks to what this run touched.
    writeFileSync(
      join(dir, "specs", "decisions", "dd-002.md"),
      DD_002.replace("Delta echo foxtrot", "Sierra tango uniform"),
    );
    const scoped = await reindexCacheFile(opts(), "specs/decisions/dd-002.md");
    expect(scoped.edges).toBe(0); // per-run: DD-002 has no outbound edges
    expect(scoped.totalEdges).toBe(1); // cumulative: DD-001→DD-002 survives
    expect(scoped.totalVertices).toBe(2);
  });

  it("sweeps a deleted file when the single-file path is invoked on it", async () => {
    await run();

    unlinkSync(join(dir, "specs", "decisions", "dd-002.md"));
    await reindexCacheFile(opts(), "specs/decisions/dd-002.md");

    const db = inspect();
    try {
      expect(db.prepare(`SELECT id FROM vertices WHERE id = 'DD-002'`).get()).toBeUndefined();
      expect(db.prepare(`SELECT id FROM vertices WHERE id = 'DD-001'`).get()).toBeDefined();
    } finally {
      db.close();
    }
  });

  // A scan_paths entry that points at nothing is skipped in silence, so
  // the entry reads as a home for records and is not one — this repo
  // carried `.docdog/observations/` in its config while every OBS record
  // lived under specs/, and no run ever said so.
  it("warns once when scan_paths entries point at nothing on disk", async () => {
    config.scan_paths = ["specs/", ".docdog/observations/", "docs/nowhere.md"];
    const stats = await run();

    // The paths that DO exist still index — a half-configured project is
    // reported, not refused.
    expect(stats.filesSeen).toBe(2);

    const missing = warnings.filter((w) => w.includes("point at nothing on disk"));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain(".docdog/observations/");
    expect(missing[0]).toContain("docs/nowhere.md");
    expect(missing[0]).toContain("NOT indexed");
  });

  it("stays silent when every scan path exists", async () => {
    await run();
    expect(warnings.filter((w) => w.includes("point at nothing on disk"))).toEqual([]);
  });

  it("skips sections with unknown collections and warns", async () => {
    writeFileSync(
      join(dir, "specs", "decisions", "bogus.md"),
      `---\ncollection: bogus\ntitle: Bogus record\n---\n\nBody.\n`,
    );
    await run();

    expect(warnings.some((w) => w.includes(`unknown collection "bogus"`))).toBe(true);
    const db = inspect();
    try {
      const count = db.prepare(`SELECT COUNT(*) AS n FROM vertices`).get() as { n: number };
      expect(count.n).toBe(2);
    } finally {
      db.close();
    }
  });

  it("counts skipped sections in the summary stats (FRICTION-032)", async () => {
    // The mid-stream warning above scrolls past; the summary is the line a
    // user actually reads, and a skip means their content is not in the
    // graph. Two files, two distinct unknown collections, so the report
    // has to aggregate rather than echo the last one it saw.
    writeFileSync(
      join(dir, "specs", "decisions", "bogus.md"),
      `---\nid: X-1\ncollection: bogus\ntitle: Bogus\n---\n\nBody.\n`,
    );
    writeFileSync(
      join(dir, "specs", "decisions", "adr.md"),
      `---\nid: X-2\ncollection: adr\ntitle: Also unregistered\n---\n\nBody.\n`,
    );

    const stats = await run();

    expect(stats.skippedSections).toBe(2);
    expect(stats.skippedCollections).toEqual(["adr", "bogus"]);
    expect(stats.verticesUpserted).toBe(2); // only the two real records

    const summary = formatSkipSummary(stats);
    expect(summary.join("\n")).toContain("2 section(s) SKIPPED");
    expect(summary.join("\n")).toContain(`"adr", "bogus"`);
    expect(summary.join("\n")).toContain("vertex_collections");
  });

  it("reports no skips when every collection is registered (FRICTION-032)", async () => {
    // The quiet case must stay quiet, or the loud case stops reading as loud.
    const stats = await run();
    expect(stats.skippedSections).toBe(0);
    expect(stats.skippedCollections).toEqual([]);
    expect(formatSkipSummary(stats)).toEqual([]);
  });

  it("counts nothing as skipped under --create-collections (FRICTION-032)", async () => {
    writeFileSync(
      join(dir, "specs", "decisions", "bogus.md"),
      `---\nid: X-1\ncollection: bogus\ntitle: Bogus\n---\n\nBody.\n`,
    );

    const stats = await run({ createCollections: true });

    expect(stats.skippedSections).toBe(0);
    expect(stats.verticesUpserted).toBe(3);
    expect(formatSkipSummary(stats)).toEqual([]);
  });

  it("resolves duplicate ids across live files last-writer-wins with a warning", async () => {
    writeFileSync(
      join(dir, "specs", "decisions", "dd-002-duplicate.md"),
      DD_002.replace("Delta echo foxtrot", "Papa quebec romeo"),
    );
    await run();

    expect(warnings.some((w) => w.includes(`"DD-002"`) && w.includes("claimed"))).toBe(true);
    const db = inspect();
    try {
      const rows = db.prepare(`SELECT file_path FROM vertices WHERE id = 'DD-002'`).all();
      expect(rows).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("re-embeds everything when the embed model changes", async () => {
    await run();

    config = { ...config, embed: { ...config.embed, model: "some/other-model" } };
    const stats = await run();
    expect(stats.filesChanged).toBe(2); // model change forces a full pass
    expect(stats.embedded).toBe(2);
    expect(stats.embedReused).toBe(0); // (content_hash, model) keying misses cleanly
  });

  // FRICTION-034: dropping a store written by another docdog is not the
  // cheap event dropping index.db is — the file is read by every worktree
  // of the clone, so the re-embed is charged once per tree and only the
  // tree that triggered it is in a position to know why.
  it("says so when it drops a store written by another docdog", async () => {
    const storePath = join(dir, "shared-embeddings.db");
    const seeded = openEmbedStore(dir, config, { filePath: storePath });
    seeded.put("hash-x", "recipe-x", Buffer.from(new Float32Array([1]).buffer), "2026-08-01T00:00:00Z");
    seeded.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(EMBED_SCHEMA_VERSION + 1));
    seeded.close();

    await run({ embedStorePath: storePath });

    const line = warnings.find((w) => w.includes("written by another docdog"));
    expect(line).toBeDefined();
    expect(line).toContain("dropped 1 vector(s)");
    expect(line).toContain(`v${EMBED_SCHEMA_VERSION + 1} → v${EMBED_SCHEMA_VERSION}`);
    expect(line).toContain("costs time, never data");
  });

  // FRICTION-046: the guard compared the bare model while the embed store
  // keyed on the recipe, so `embed.dtype: q8` invalidated nothing —
  // unchanged files were skipped before the store's key was ever
  // consulted, and the cache went quietly mixed at two quantizations.
  it("re-embeds everything when only embed.dtype changes", async () => {
    await run();

    config = { ...config, embed: { ...config.embed, dtype: "q8" } };
    const stats = await run();
    expect(stats.filesChanged).toBe(2);
    expect(stats.embedded).toBe(2);
    expect(stats.embedReused).toBe(0); // the q8 keyspace is empty
  });

  // A rebuild is not a re-embed: the store keeps a row per recipe it has
  // seen, so going back reindexes and re-embeds nothing. That is the
  // README's promise, and it is a property of the STORE — the fix above
  // does not spend it.
  it("reuses the fp32 vectors when dtype switches back", async () => {
    await run();
    config = { ...config, embed: { ...config.embed, dtype: "q8" } };
    await run();

    config = { ...config, embed: { ...config.embed, dtype: null } };
    const stats = await run();
    expect(stats.filesChanged).toBe(2);
    expect(stats.embedded).toBe(0);
    expect(stats.embedReused).toBe(2);
  });

  it("names which recipe input moved", async () => {
    const logs: string[] = [];
    await run();
    config = { ...config, embed: { ...config.embed, dtype: "q8" } };
    await run({ log: (m) => logs.push(m) });

    const line = logs.find((l) => l.includes("embed recipe changed"));
    expect(line).toBeDefined();
    expect(line).toContain("dtype none → q8");
    expect(line).not.toContain("model ");
  });

  // The upgrade path: a cache written before this fix carries embed_model
  // and no embed_recipe. Treating that gap as "unchanged" would leave an
  // already-mixed project mixed forever, so the absent value is read as
  // what such a cache implies rather than as agreement.
  it("heals a pre-recipe cache that was already running a dtype", async () => {
    config = { ...config, embed: { ...config.embed, dtype: "q8" } };
    await run();

    // Rewind to what the old indexer would have left behind.
    const db = new Database(cachePath);
    db.prepare(`DELETE FROM meta WHERE key = ?`).run(META_KEYS.embedRecipe);
    db.close();

    const stats = await run();
    expect(stats.filesChanged).toBe(2);
    expect(stats.embedReused).toBe(2); // the q8 rows are still in the store
  });

  it("preserves the embed cache across a --full rebuild", async () => {
    await run();
    const stats = await run({ full: true });
    expect(stats.filesChanged).toBe(2);
    expect(stats.embedded).toBe(0);
    expect(stats.embedReused).toBe(2);
  });

  // FRICTION-019: a frontmatter block that doesn't parse used to vanish in
  // silence — the file indexed as a body-only vertex and its declared id,
  // description and relationships were dropped with no warning at all.
  it("warns when frontmatter exists but is not valid YAML, and still indexes the body", async () => {
    writeFileSync(
      join(dir, "specs", "decisions", "dd-003.md"),
      // Unquoted prose with two colons in one list entry: YAML reads the
      // first as an implicit key and then refuses the second ("nested
      // mappings are not allowed in compact mappings"). This is the shape
      // that actually broke 8 files in the orchestrator corpus — note that
      // a SINGLE colon parses fine, into a garbage map, which no warning
      // can catch (see FRICTION-019).
      `---
id: DD-003
description: the third
triggers:
  - Registry grows past 5 game types (today: 2): revisit the design
---

# Third decision

Golf hotel india body text.
`,
    );

    const stats = await run();
    expect(stats.filesSeen).toBe(3);

    const warning = warnings.find((w) => w.includes("dd-003.md"));
    expect(warning).toBeDefined();
    expect(warning).toContain("frontmatter is not valid YAML");
    expect(warning).toContain("id, description and relationships were ignored");

    const db = inspect();
    try {
      // The fallback itself is fine and stays: the prose is still searchable.
      // What must not happen is the fallback happening quietly.
      const vertex = db
        .prepare(`SELECT id, body_text FROM vertices WHERE file_path = 'specs/decisions/dd-003.md'`)
        .get() as { id: string; body_text: string };
      expect(vertex.id).toBe("default:specs/decisions/dd-003.md");
      expect(vertex.body_text).toContain("Golf hotel india");
      expect(db.prepare(`SELECT id FROM vertices WHERE id = 'DD-003'`).get()).toBeUndefined();
    } finally {
      db.close();
    }
  });

  // FRICTION-023: under a split scan path, a file whose headings match
  // nothing produced no vertex, no body, no FTS row — and said nothing.
  it("warns when a parser matches no sections and the file is therefore not indexed", async () => {
    mkdirSync(join(dir, "upstream"), { recursive: true });
    writeFileSync(
      join(dir, "upstream", "index.md"),
      `# Navigation stub\n\nNo split headings here at all.\n`,
    );
    config.scan_paths = [
      "specs/",
      { path: "upstream/", parser: "split", split_on: "## CG-", collection: "notes" },
    ];

    await run();

    const warning = warnings.find((w) => w.includes("upstream/index.md"));
    expect(warning).toBeDefined();
    expect(warning).toContain("matched no sections");
    expect(warning).toContain("file not indexed");

    const db = inspect();
    try {
      const rows = db
        .prepare(`SELECT id FROM vertices WHERE file_path = 'upstream/index.md'`)
        .all();
      expect(rows).toEqual([]);
    } finally {
      db.close();
    }
  });

  // FRICTION-021: the dirty check hashed content only, so editing the scan
  // entry that governs a file (parser, split_on, collection) never re-parsed
  // it — the config change simply never landed.
  it("reindexes a file when its scan-path config changes, even though the bytes did not", async () => {
    mkdirSync(join(dir, "upstream"), { recursive: true });
    writeFileSync(
      join(dir, "upstream", "guidelines.md"),
      `# Guidelines\n\n## CG-001: First rule\n\nBody of the first rule.\n\n## CG-002: Second rule\n\nBody of the second rule.\n`,
    );
    config.scan_paths = ["specs/", { path: "upstream/", collection: "notes" }];

    // Default parser: one whole-file vertex.
    const first = await run();
    expect(first.filesSeen).toBe(3);

    // Now ask for split parsing of the same, byte-identical file.
    config.scan_paths = [
      "specs/",
      { path: "upstream/", parser: "split", split_on: "## CG-", collection: "notes" },
    ];
    const second = await run();
    expect(second.filesChanged).toBe(1);

    const db = inspect();
    try {
      const ids = (
        db
          .prepare(`SELECT id FROM vertices WHERE file_path = 'upstream/guidelines.md' ORDER BY id`)
          .all() as Array<{ id: string }>
      ).map((r) => r.id);
      expect(ids).toEqual(["CG-001", "CG-002"]);
    } finally {
      db.close();
    }
  });

  // FRICTION-022: `--full` wiped every derived row globally while `--path`
  // narrowed what got rebuilt, so combining the two silently gutted the
  // cache down to one subtree — under a summary line reporting success.
  it("scopes a --full rebuild to --path instead of wiping the whole cache", async () => {
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });
    writeFileSync(
      join(dir, "specs", "notes", "note-001.md"),
      `---\nid: NOTE-001\ntitle: A note\n---\n\n# A note\n\nJuliett kilo lima.\n`,
    );

    await run();
    expect((await run()).filesChanged).toBe(0); // steady state

    // Rebuild only the notes subtree from scratch.
    await run({ full: true, paths: ["specs/notes/"] });

    const db = inspect();
    try {
      const ids = (
        db.prepare(`SELECT id FROM vertices ORDER BY id`).all() as Array<{ id: string }>
      ).map((r) => r.id);
      // The decisions outside the scoped path must survive untouched.
      expect(ids).toEqual(["DD-001", "DD-002", "NOTE-001"]);

      const edge = db.prepare(`SELECT to_id FROM edges WHERE from_id = 'DD-001'`).get() as
        | { to_id: string }
        | undefined;
      expect(edge?.to_id).toBe("DD-002");
    } finally {
      db.close();
    }
  });

  it("still wipes the whole cache on an unscoped --full rebuild", async () => {
    await run();

    // A record that has left the corpus entirely: the file is gone, so a
    // full rebuild must not carry its rows forward.
    unlinkSync(join(dir, "specs", "decisions", "dd-002.md"));
    await run({ full: true });

    const db = inspect();
    try {
      const ids = (
        db.prepare(`SELECT id FROM vertices ORDER BY id`).all() as Array<{ id: string }>
      ).map((r) => r.id);
      expect(ids).toEqual(["DD-001"]);
    } finally {
      db.close();
    }
  });
});
