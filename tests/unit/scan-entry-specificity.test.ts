/**
 * Which scan entry governs a file, and what a script parse depends on —
 * FRICTION-057, FRICTION-058, FRICTION-059.
 *
 * All three were found by running issue #1's recommended configuration
 * (a directory entry plus a `parser: script` entry for one file inside it)
 * against a throwaway project, so the fixture here is that configuration.
 * Driven through the real indexer and a real script on disk: 057 lived in
 * the interaction between discovery and the per-path reconcile, and 059 in
 * the incremental skip — neither is visible from a unit of either half.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig, ScanPathEntry } from "../../src/types/config.js";
import { openCache } from "../../src/storage/cache.js";
import {
  runCacheIndexer,
  reindexCacheFile,
  matchScanEntry,
  type CacheIndexerOptions,
  type EmbedBatchFn,
} from "../../src/storage/indexer.js";
import { assertNoConflictingScanEntries, governingScanEntry } from "../../src/engine/discovery.js";

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

/** A binding reference whose units are list items, the issue #1 shape. */
const DECISIONS = [
  "# Design decisions",
  "",
  "## Graph",
  "",
  "- D-GRAPH-1. Edges are typed.",
  "- D-GRAPH-2. Edges are directed.",
  "",
  "## Storage",
  "",
  "- D-STORE-1. Markdown is canonical.",
  "",
].join("\n");

const LOG = ["---", "id: LOG-001", "title: First log entry", "---", "", "Log body.", ""].join("\n");

/** One record per `- D-…` row; sets no collection, so the entry's applies. */
function rowsScript(marker = ""): string {
  return [
    "export default function (input) {",
    "  const out = [];",
    "  for (const line of input.raw.split('\\n')) {",
    "    const m = /^- (D-[A-Z]+-\\d+)\\.\\s*(.*)$/.exec(line);",
    "    if (!m) continue;",
    `    out.push({ sectionKey: m[1], id: m[1], title: m[2] + ${JSON.stringify(marker)},`,
    "      content: line, frontmatter: {}, collection: null });",
    "  }",
    "  return out;",
    "}",
    "",
  ].join("\n");
}

describe("scan entry specificity and script parse inputs", () => {
  let dir: string;
  let config: DocdogConfig;

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      embed: fakeEmbed,
      embedStorePath: join(dir, "embeddings.db"),
      log: () => {},
      warn: () => {},
    };
  }

  function rows(): Array<{ id: string; collection: string; title: string }> {
    const h = openCache(dir);
    try {
      return h.db
        .prepare(`SELECT id, collection, title FROM vertices ORDER BY id`)
        .all() as Array<{ id: string; collection: string; title: string }>;
    } finally {
      h.db.close();
    }
  }

  const ids = () => rows().map((r) => r.id);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-specificity-"));
    mkdirSync(join(dir, "spec"), { recursive: true });
    mkdirSync(join(dir, ".docdog", "scripts"), { recursive: true });
    writeFileSync(join(dir, "spec", "design-decisions.md"), DECISIONS);
    writeFileSync(join(dir, "spec", "log-001.md"), LOG);
    writeFileSync(join(dir, ".docdog", "scripts", "rows.js"), rowsScript());
    config = {
      ...defaultConfig,
      project: { name: "specificity-test" },
      scan_paths: [],
      vertex_collections: ["notes", "decisions"],
      default_collection: "notes",
    };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const scriptEntry: ScanPathEntry = {
    path: "spec/design-decisions.md",
    parser: "script",
    script: "rows",
    collection: "decisions",
  };
  const ROW_IDS = ["D-GRAPH-1", "D-GRAPH-2", "D-STORE-1", "LOG-001"];

  describe("FRICTION-057: the most specific entry governs a file", () => {
    it.each([
      ["directory entry first", () => ["spec/", scriptEntry]],
      ["file entry first", () => [scriptEntry, "spec/"]],
    ])("holds the file entry's parse on every run — %s", async (_label, entries) => {
      config.scan_paths = entries() as ScanPathEntry[];
      // The defect FLIPPED between the two parses on successive runs, so
      // one run proves nothing; four is the table FRICTION-057 measured.
      for (let run = 0; run < 4; run++) {
        await runCacheIndexer(opts());
        expect(ids()).toEqual(ROW_IDS);
      }
    });

    it("an incremental run after the first touches nothing", async () => {
      config.scan_paths = ["spec/", scriptEntry];
      await runCacheIndexer(opts());
      const second = await runCacheIndexer(opts());
      // The churn was the visible symptom: 1/3 then 3/1, every run.
      expect(second.verticesUpserted).toBe(0);
      expect(second.verticesRemoved).toBe(0);
    });

    it("`index --path spec/` parses with the configured entry, not the bare path", async () => {
      config.scan_paths = ["spec/", scriptEntry];
      await runCacheIndexer({ ...opts(), paths: ["spec/"] });
      expect(ids()).toEqual(ROW_IDS);
    });

    it("a single-file reindex agrees with a full index", async () => {
      config.scan_paths = ["spec/", scriptEntry];
      await runCacheIndexer(opts());
      await reindexCacheFile(opts(), "spec/design-decisions.md");
      expect(ids()).toEqual(ROW_IDS);
    });

    it("longest path wins, not list order; spellings of one path agree", () => {
      const entries: ScanPathEntry[] = [
        { path: "./spec/deep/", parser: "split" },
        "spec",
        { path: "spec\\deep\\x.md", parser: "table" },
      ];
      expect(governingScanEntry(entries, "spec/deep/x.md")?.parser).toBe("table");
      expect(governingScanEntry(entries, "spec/deep/y.md")?.parser).toBe("split");
      expect(governingScanEntry(entries, "spec/z.md")?.parser).toBe("default");
      expect(governingScanEntry(entries, "specs/z.md")).toBeNull();
      // One rule for the write tools and discovery.
      expect(matchScanEntry(entries, "spec/deep/x.md")?.parser).toBe("table");
    });

    it("refuses one path declared twice with different parser config, by name", async () => {
      config.scan_paths = [scriptEntry, { path: "./spec/design-decisions.md", parser: "default" }];
      await expect(runCacheIndexer(opts())).rejects.toThrow(/spec\/design-decisions\.md.*twice/);
    });

    it("an identical duplicate is harmless", () => {
      expect(() => assertNoConflictingScanEntries(["spec/", "spec"])).not.toThrow();
    });
  });

  describe("FRICTION-058: the script parser applies the entry's collection", () => {
    it("files the script's rows under the entry's collection", async () => {
      config.scan_paths = ["spec/", scriptEntry];
      await runCacheIndexer(opts());
      const byId = new Map(rows().map((r) => [r.id, r.collection]));
      expect(byId.get("D-GRAPH-1")).toBe("decisions");
      expect(byId.get("LOG-001")).toBe("notes");
    });

    it("a collection the script sets itself still wins", async () => {
      writeFileSync(
        join(dir, ".docdog", "scripts", "rows.js"),
        rowsScript().replace("collection: null", "collection: 'notes'"),
      );
      config.scan_paths = [scriptEntry];
      await runCacheIndexer(opts());
      expect(new Set(rows().map((r) => r.collection))).toEqual(new Set(["notes"]));
    });
  });

  describe("FRICTION-059: editing the script dirties the files it governs", () => {
    it("an incremental index re-parses the governed file after a script edit, no --full", async () => {
      // No overlapping entries: under FRICTION-057 the overlap re-parsed the
      // file on every run anyway, which would pass this test for the wrong reason.
      config.scan_paths = [scriptEntry, "spec/log-001.md"];
      await runCacheIndexer(opts());

      writeFileSync(join(dir, ".docdog", "scripts", "rows.js"), rowsScript(" (v2)"));
      const second = await runCacheIndexer(opts());

      // The invalidation, which is the friction: before the fix this was 0
      // and the old parse stood. Exactly one — the log entry is not governed
      // by the script and must not re-parse. The edited script's OUTPUT is
      // not asserted here: vitest's module loader, like tsx's, ignores the
      // `?v=` query the parser uses to reload a cached module, where plain
      // Node (the published CLI) honours it. A fresh process never needed it.
      expect(second.filesChanged).toBe(1);
    });

    it("a line-ending-only change to the script invalidates nothing", async () => {
      config.scan_paths = [scriptEntry];
      await runCacheIndexer(opts());
      writeFileSync(join(dir, ".docdog", "scripts", "rows.js"), rowsScript().replace(/\n/g, "\r\n"));
      const second = await runCacheIndexer(opts());
      expect(second.filesChanged).toBe(0);
    });
  });
});
