/**
 * `.docdog/local/` — the sanctioned destination for records that are indexed
 * and never committed (DISC-041).
 *
 * The design choice under test is that the directory is scanned WITHOUT a
 * `scan_paths` entry. Two facts force it: git cannot track an empty
 * directory, so an entry would point at nothing in every fresh clone and
 * `findMissingScanPaths` would warn about the normal case on every run; and
 * `docdog update` never edits an adopter's config, so an entry would reach
 * existing projects only by hand — the exact step this destination removes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import {
  LOCAL_DIR_REL,
  isLocalRecordPath,
  withLocalScanPath,
  findMissingScanPaths,
} from "../../src/engine/discovery.js";

const gitPresent = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
})();

function record(id: string): string {
  return [
    "---",
    `id: ${id}`,
    `title: Record ${id}`,
    "collection: notes",
    "---",
    "",
    `Body of ${id}.`,
    "",
  ].join("\n");
}

describe("withLocalScanPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-localscan-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("adds nothing when the directory does not exist", () => {
    expect(withLocalScanPath(dir, ["specs/"])).toEqual(["specs/"]);
  });

  it("adds the path once the directory exists", () => {
    mkdirSync(join(dir, ".docdog", "local"), { recursive: true });
    expect(withLocalScanPath(dir, ["specs/"])).toEqual(["specs/", `${LOCAL_DIR_REL}/`]);
  });

  it("adds nothing when a config entry already covers it", () => {
    // A project that declares the path explicitly must not be scanned twice.
    mkdirSync(join(dir, ".docdog", "local"), { recursive: true });
    expect(withLocalScanPath(dir, ["specs/", ".docdog/local/"])).toEqual([
      "specs/",
      ".docdog/local/",
    ]);
    expect(withLocalScanPath(dir, ["specs/", ".docdog/"])).toEqual(["specs/", ".docdog/"]);
  });

  it("never makes the path a missing-scan-path warning", () => {
    // The whole reason this is implicit. An absent directory must produce no
    // entry, so there is nothing for findMissingScanPaths to complain about.
    expect(findMissingScanPaths(dir, withLocalScanPath(dir, ["specs/"]))).toEqual(["specs/"]);
  });

  it("recognises a local path", () => {
    expect(isLocalRecordPath(".docdog/local/note.md")).toBe(true);
    expect(isLocalRecordPath(".docdog/locally/note.md")).toBe(false);
    expect(isLocalRecordPath("specs/note.md")).toBe(false);
  });
});

describe("local records end to end", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let logs: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-localrec-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001"));
    config = {
      ...defaultConfig,
      project: { name: "local-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
    logs = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const writeLocal = (name: string, id: string) => {
    mkdirSync(join(dir, ".docdog", "local"), { recursive: true });
    writeFileSync(join(dir, ".docdog", "local", name), record(id));
  };

  it("indexes a record nothing in scan_paths mentions", async () => {
    writeLocal("private.md", "PRIV-001");
    const stats = await runCacheIndexer(opts());
    expect(stats.localRecords).toBe(1);
    expect(stats.totalVertices).toBe(2);
  });

  it("says so, because an implicit scan path must not be silent", async () => {
    writeLocal("private.md", "PRIV-001");
    await runCacheIndexer(opts());
    const line = logs.find((l) => l.includes(LOCAL_DIR_REL));
    expect(line).toBeDefined();
    expect(line).toContain("indexed, never committed");
  });

  it("says nothing when there are none", async () => {
    const stats = await runCacheIndexer(opts());
    expect(stats.localRecords).toBe(0);
    expect(logs.find((l) => l.includes(LOCAL_DIR_REL))).toBeUndefined();
  });

  it("warns about no missing scan path when the directory is absent", async () => {
    await runCacheIndexer(opts());
    expect(logs.find((l) => l.includes("point at nothing on disk"))).toBeUndefined();
  });

  it("counts nothing on a path-scoped run, which sees a partial corpus", async () => {
    writeLocal("private.md", "PRIV-001");
    await runCacheIndexer(opts());

    logs = [];
    const stats = await runCacheIndexer({ ...opts(), paths: ["specs/"] });
    expect(stats.localRecords).toBe(0);
  });

  it.skipIf(!gitPresent)(
    "is out-of-clone, so the PROPOSAL-047 guard covers it with no extra wiring",
    async () => {
      // The two features compose: `local/` is gitignored, which is exactly the
      // condition the cross-visibility guard already tests for. A public
      // record pointing into it is a leak without anything new being taught.
      writeLocal("private.md", "PRIV-001");
      writeFileSync(
        join(dir, "specs", "public.md"),
        [
          "---",
          "id: PUB-001",
          "title: Public",
          "collection: notes",
          "relationships:",
          "  - references: PRIV-001",
          "    context: points into the local directory",
          "---",
          "",
          "Body.",
          "",
        ].join("\n"),
      );
      writeFileSync(join(dir, ".docdog", ".gitignore"), "local/\n");
      writeFileSync(join(dir, ".gitignore"), "cache.db\n");

      const git = (...args: string[]) => {
        try {
          execFileSync("git", args, { cwd: dir, stdio: "ignore", timeout: 20_000 });
        } catch {
          /* reported by the assertion below */
        }
      };
      git("init");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      git("add", "-A");
      git("commit", "-m", "init");

      const stats = await runCacheIndexer(opts());
      expect(stats.localRecords).toBe(1);
      expect(stats.crossVisibilityEdges).toBe(1);
    },
  );
});
