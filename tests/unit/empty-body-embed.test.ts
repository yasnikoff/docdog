/**
 * FRICTION-060 — an empty body gets no vector.
 *
 * The model's answer to "nothing" is one fixed vector, so every empty-bodied
 * record used to share it and `docdog pairs` ranked every pair of them at
 * cosine 1.000 above all real candidates (issue #2: 18 records, 153 pairs).
 * Pinned here: the refusal at embed time, the repair of a vector an older
 * docdog stored (an unchanged file is skipped before the refusal can see it),
 * and that the index run says how many such records there are.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import {
  checkEmbedHealth,
  formatEmbedHealthWarnings,
  formatEmptyBodies,
  hasEmbeddableBody,
} from "../../src/storage/embed-health.js";

function file(id: string, body: string): string {
  return ["---", `id: ${id}`, `title: Record ${id}`, "collection: notes", "---", body].join("\n");
}

describe("hasEmbeddableBody", () => {
  it("is false for empty and whitespace-only content, true otherwise", () => {
    expect(hasEmbeddableBody("")).toBe(false);
    expect(hasEmbeddableBody(" \n\t\r\n ")).toBe(false);
    expect(hasEmbeddableBody("x")).toBe(true);
  });
});

describe("empty bodies at index time", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let logs: string[];
  let embedded: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => {
    embedded.push(...texts);
    return texts.map((t) => [t.length, 1, 2]);
  };

  function opts(embed: EmbedBatchFn = fakeEmbed): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embedStorePath: join(dir, "embeddings.db"),
      embed,
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
    };
  }

  const vectorOf = (id: string): Buffer | null => {
    const db = new Database(cachePath, { readonly: true });
    try {
      return (db.prepare(`SELECT embedding FROM chunks WHERE vertex_id = ?`).get(id) as { embedding: Buffer | null })
        .embedding;
    } finally {
      db.close();
    }
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-emptybody-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "full.md"), file("FULL-1", "\nA real body.\n"));
    writeFileSync(join(dir, "specs", "empty-a.md"), file("EMPTY-A", "\n\n"));
    writeFileSync(join(dir, "specs", "empty-b.md"), file("EMPTY-B", "   \n"));
    config = {
      ...defaultConfig,
      project: { name: "empty-body-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
    logs = [];
    embedded = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("embeds the real body and never hands the embedder an empty one", async () => {
    const stats = await runCacheIndexer(opts());
    expect(embedded.every((t) => t.trim() !== "")).toBe(true);
    expect(stats.embedded).toBe(1);
    expect(vectorOf("FULL-1")).not.toBeNull();
    expect(vectorOf("EMPTY-A")).toBeNull();
    expect(vectorOf("EMPTY-B")).toBeNull();
  });

  it("names the empty records in the index output", async () => {
    await runCacheIndexer(opts());
    const line = logs.find((l) => l.includes("empty body"));
    expect(line).toContain("2 record(s) have an empty body");
    expect(line).toContain("EMPTY-A");
    expect(line).toContain("EMPTY-B");
  });

  it("clears a vector an older docdog stored, on an incremental run that skips the file", async () => {
    await runCacheIndexer(opts());
    // Simulate a cache written before the fix: the empty record holds a vector.
    const db = new Database(cachePath);
    db.prepare(`UPDATE chunks SET embedding = ? WHERE vertex_id = 'EMPTY-A'`).run(
      Buffer.from(new Float32Array([0, 1, 2]).buffer),
    );
    db.close();
    logs = [];

    const stats = await runCacheIndexer(opts());
    expect(stats.filesChanged).toBe(0);
    expect(vectorOf("EMPTY-A")).toBeNull();
    expect(logs.some((l) => l.includes("cleared 1 vector(s) stored for an empty body"))).toBe(true);
  });

  it("gives a record a vector once its body is written", async () => {
    await runCacheIndexer(opts());
    writeFileSync(join(dir, "specs", "empty-a.md"), file("EMPTY-A", "\nNow it says something.\n"));
    await runCacheIndexer(opts());
    expect(vectorOf("EMPTY-A")).not.toBeNull();
  });
});

describe("empty bodies in the report", () => {
  it("lists them in status and warns once, collapsed", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE vertices (id TEXT PRIMARY KEY, file_path TEXT, body_text TEXT)`);
    const add = db.prepare(`INSERT INTO vertices VALUES (?, ?, ?)`);
    for (let i = 0; i < 5; i++) add.run(`E-${i}`, `specs/e-${i}.md`, "\n");
    add.run("OK", "specs/ok.md", "text");
    const report = checkEmbedHealth(db);
    db.close();

    expect(report.emptyBodies.map((r) => r.id)).toEqual(["E-0", "E-1", "E-2", "E-3", "E-4"]);
    const warnings = formatEmbedHealthWarnings(report);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5 record(s) have an empty body");
    expect(warnings[0]).toContain("+2 more");
    expect(formatEmptyBodies(report).join("\n")).toContain("E-4 — specs/e-4.md");
  });
});
