/**
 * PROPOSAL-025 — shipped relation vocabulary seeded at init.
 *
 * Covers seedConcepts copy semantics (per-template sets, idempotency,
 * repair-on-reinit), the scan-path coverage check, the template
 * wiring, and the end-to-end path: seeded files → cache indexer →
 * relations registry resolving the core types with correct inverse
 * labels. No Docker, no ONNX (embedder injected).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedConcepts } from "../../src/cli/commands/init.js";
import { scanPathsCoverConcepts } from "../../src/engine/scan-reach.js";
import { TEMPLATES, getTemplate } from "../../src/config/templates.js";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { loadRegistryFromCache } from "../../src/storage/relations.js";

const TEMPLATES_ROOT = join(process.cwd(), "templates");

const CORE_TYPES = [
  "references",
  "supersedes",
  "sourced_from",
  "discussed_in",
  "implements",
  "depends_on",
  "constrains",
  "part_of",
];
const WORKFLOWS_TYPES = ["follows_workflow", "reconciles", "blocks"];

describe("seedConcepts (PROPOSAL-025)", () => {
  let dir: string;
  let docdogDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-concept-seeds-"));
    docdogDir = join(dir, ".docdog");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seededFiles(): string[] {
    return readdirSync(join(docdogDir, "concepts")).sort();
  }

  it("minimal template seeds the core 8 relations plus its collection records", () => {
    const copied = seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("minimal"));
    expect(copied).toBe(10);
    const files = seededFiles();
    expect(files).toContain("relation-references.md");
    expect(files).toContain("relation-supersedes.md");
    expect(files).toContain("collection-concepts.md");
    expect(files).toContain("collection-notes.md");
    // workflows-tier types and other templates' collections are not seeded
    expect(files).not.toContain("relation-blocks.md");
    expect(files).not.toContain("relation-follows-workflow.md");
    expect(files).not.toContain("collection-decisions.md");
  });

  it("structured template seeds its collection records but no process types", () => {
    const copied = seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("structured"));
    expect(copied).toBe(18);
    const files = seededFiles();
    expect(files).toContain("collection-decisions.md");
    expect(files).toContain("collection-principles.md");
    expect(files).not.toContain("collection-tasks.md");
    expect(files).not.toContain("relation-blocks.md");
  });

  it("workflows template additionally seeds the process types and its collections", () => {
    const copied = seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("workflows"));
    expect(copied).toBe(26);
    const files = seededFiles();
    expect(files).toContain("relation-follows-workflow.md");
    expect(files).toContain("relation-reconciles.md");
    expect(files).toContain("relation-blocks.md");
    expect(files).toContain("collection-tasks.md");
    expect(files).toContain("collection-workflows.md");
    expect(files).toContain("collection-reconciliations.md");
  });

  it("re-running copies nothing and never overwrites an edited seed", () => {
    seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("minimal"));
    const target = join(docdogDir, "concepts", "relation-supersedes.md");
    writeFileSync(target, "edited by the user\n", "utf-8");

    const copied = seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("minimal"));
    expect(copied).toBe(0);
    expect(readFileSync(target, "utf-8")).toBe("edited by the user\n");
  });

  it("a deleted seed reappears on re-init (repair semantics)", () => {
    seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("minimal"));
    const target = join(docdogDir, "concepts", "relation-part-of.md");
    unlinkSync(target);

    const copied = seedConcepts(TEMPLATES_ROOT, docdogDir, getTemplate("minimal"));
    expect(copied).toBe(1);
    expect(seededFiles()).toContain("relation-part-of.md");
  });
});

describe("template wiring (PROPOSAL-025)", () => {
  it("every template ships the concepts collection and scans .docdog/concepts/", () => {
    for (const [name, tmpl] of Object.entries(TEMPLATES)) {
      expect(tmpl.collections, `${name} collections`).toContain("concepts");
      expect(tmpl.defaultScanPaths, `${name} defaultScanPaths`).toContain(".docdog/concepts/");
    }
  });

  it("every template-shipped collection has a seed record (PROPOSAL-026 invariant)", () => {
    for (const [name, tmpl] of Object.entries(TEMPLATES)) {
      for (const collection of tmpl.collections) {
        const seedPath = join(TEMPLATES_ROOT, "concepts", "collections", `collection-${collection}.md`);
        expect(existsSync(seedPath), `${name}/${collection} missing ${seedPath}`).toBe(true);
      }
    }
  });

  it("only the workflows template carries a conceptsDir", () => {
    expect(getTemplate("workflows").conceptsDir).toBe("workflows");
    expect(getTemplate("minimal").conceptsDir).toBeUndefined();
    expect(getTemplate("structured").conceptsDir).toBeUndefined();
  });
});

describe("scanPathsCoverConcepts", () => {
  it("accepts exact, parent, and root coverage in either slash style", () => {
    expect(scanPathsCoverConcepts([".docdog/concepts/"])).toBe(true);
    expect(scanPathsCoverConcepts([".docdog/concepts"])).toBe(true);
    expect(scanPathsCoverConcepts(["./.docdog/concepts/"])).toBe(true);
    expect(scanPathsCoverConcepts([".docdog/"])).toBe(true);
    expect(scanPathsCoverConcepts([".docdog\\concepts\\"])).toBe(true);
    expect(scanPathsCoverConcepts(["."])).toBe(true);
    expect(scanPathsCoverConcepts(["specs/", ".docdog/concepts/"])).toBe(true);
  });

  it("rejects lists that never reach the concepts directory", () => {
    expect(scanPathsCoverConcepts([])).toBe(false);
    expect(scanPathsCoverConcepts(["specs/"])).toBe(false);
    expect(scanPathsCoverConcepts([".docdog/workflows/"])).toBe(false);
    // prefix on the name level must not match (".docdog/conceptsfoo")
    expect(scanPathsCoverConcepts([".docdog/conceptsfoo/"])).toBe(false);
  });
});

describe("seeded vocabulary end-to-end: init → index → registry", () => {
  let dir: string;
  let cachePath: string;
  let warnings: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-seed-e2e-"));
    cachePath = join(dir, "cache.db");
    warnings = [];
    seedConcepts(TEMPLATES_ROOT, join(dir, ".docdog"), getTemplate("minimal"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a fresh minimal project resolves the whole core vocabulary without warnings", async () => {
    const config: DocdogConfig = {
      ...defaultConfig,
      project: { name: "seed-e2e" },
      template: "minimal",
      scan_paths: [".docdog/concepts/"],
      vertex_collections: [],
      default_collection: "notes",
    };
    const stats = await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: (m) => warnings.push(m),
    });
    expect(stats.verticesUpserted).toBe(10);
    expect(warnings).toEqual([]);

    const db = new Database(cachePath, { readonly: true });
    try {
      const registry = loadRegistryFromCache(db);
      // collection records are not relations — 8 entries exactly
      expect(registry.size()).toBe(8);
      for (const type of CORE_TYPES) {
        expect(registry.lookup(type).known, type).toBe(true);
      }
      expect(registry.lookup("supersedes").inverse_label).toBe("revised by");
      expect(registry.lookup("part_of").inverse_label).toBe("contains");
      // workflows-tier types stay unknown on a minimal project
      for (const type of WORKFLOWS_TYPES) {
        expect(registry.lookup(type).known, type).toBe(false);
      }
    } finally {
      db.close();
    }
  });
});
