/**
 * `docdog renumber` + contested ids — PROPOSAL-031. Pure SQLite over a
 * temp corpus with an injected fake embedder; no Docker, no ONNX.
 *
 * The contract under test is the certainty split: the id, its inbound
 * edges and (opt-in) the file name are rewritten exactly, and everything
 * the command cannot prove — prose, slash-lists, unpatchable sources — is
 * reported rather than guessed at. Each case asserts both halves: the
 * markdown on disk (canonical) and the reindexed cache row (derived).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { readContestedIds, renumberRecord } from "../../src/storage/renumber.js";
import { collectStatus } from "../../src/storage/status.js";
import { getVertexById } from "../../src/storage/vertices.js";
import { WriteError } from "../../src/storage/writes.js";

/** The provisional record being promoted (DISC-027's task-namespaced shape). */
const PROVISIONAL = `---
id: DD-T168-01
title: Cache design
collection: decisions
---

# DD-T168-01: Cache design

DD-T168-01 supersedes nothing. It builds on DD-002.
`;

/** A citer: an exact inbound edge, plus the old id in the edge's context prose. */
const DD_002 = `---
id: DD-002
title: Second decision
collection: decisions
relationships:
  - references: DD-T168-01
    context: "DD-T168-01 is the cache design this leans on"
---

# DD-002

Body mentioning DD-T168-01 once.
`;

/** A slash-list naming the old id alongside a sibling — never rewritable (OQ-46). */
const NOTE_001 = `---
id: NOTE-001
title: A note
collection: notes
---

# A note

The pair DD-T168-01/02 landed together, and DD-T168-01 shipped first.
`;

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

describe("renumber (PROPOSAL-031)", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let warnings: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-renumber-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });
    writeFileSync(join(dir, "specs", "decisions", "dd-t168-01-cache-design.md"), PROVISIONAL);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    writeFileSync(join(dir, "specs", "notes", "note-001.md"), NOTE_001);
    config = {
      ...defaultConfig,
      project: { name: "renumber-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["decisions", "notes"],
      default_collection: "notes",
    };
    warnings = [];
    await runCacheIndexer(opts());
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

  function inspect(): Database.Database {
    return new Database(cachePath, { readonly: true });
  }

  function read(...rel: string[]): string {
    return readFileSync(join(dir, ...rel), "utf-8");
  }

  // ─── the exact half ───────────────────────────────────────────────────────

  it("rewrites the id and every inbound edge, and the cache follows", async () => {
    const result = await renumberRecord(opts(), "DD-T168-01", "DD-072");

    expect(read("specs", "decisions", "dd-t168-01-cache-design.md")).toContain("id: DD-072");
    expect(read("specs", "decisions", "dd-002.md")).toContain("- references: DD-072");
    expect(result.plan.edges).toEqual([
      { fromId: "DD-002", type: "references", file: "specs/decisions/dd-002.md" },
    ]);

    const db = inspect();
    try {
      expect(getVertexById(db, "DD-072")?.title).toBe("Cache design");
      expect(getVertexById(db, "DD-T168-01")).toBeNull();
      const edges = db.prepare(`SELECT from_id, to_id FROM edges`).all();
      expect(edges).toEqual([{ from_id: "DD-002", to_id: "DD-072" }]);
    } finally {
      db.close();
    }
  });

  it("touches only the target token of an edge — context, quoting and key order survive", async () => {
    await renumberRecord(opts(), "DD-T168-01", "DD-072");

    const citer = read("specs", "decisions", "dd-002.md");
    // The context is prose about the old id, not a target: exact rewriting
    // leaves it, and the prose report is what surfaces it.
    expect(citer).toContain('context: "DD-T168-01 is the cache design this leans on"');
    expect(citer).toContain("relationships:\n  - references: DD-072\n");
  });

  it("reports prose mentions — including the frontmatter context — and rewrites none by default", async () => {
    const { plan } = await renumberRecord(opts(), "DD-T168-01", "DD-072");

    expect(plan.proseRewrites).toBe(0);
    const rewritable = plan.mentions.filter((m) => !m.ambiguous);
    const files = rewritable.map((m) => `${m.file}:${m.line}`);

    // Its own body (the heading and the sentence under it), the citer's
    // context string and body, and the note's bare mention.
    expect(files).toContain("specs/decisions/dd-t168-01-cache-design.md:7"); // its own heading
    expect(files).toContain("specs/decisions/dd-002.md:7"); // the context string
    expect(files).toContain("specs/notes/note-001.md:9");
    expect(read("specs", "notes", "note-001.md")).toContain("DD-T168-01 shipped first");
  });

  it("rewrites unambiguous prose under --prose and never a slash-list (OQ-46)", async () => {
    const { plan } = await renumberRecord(opts(), "DD-T168-01", "DD-072", { prose: true });

    expect(plan.proseRewrites).toBeGreaterThan(0);
    const note = read("specs", "notes", "note-001.md");
    expect(note).toContain("DD-T168-01/02 landed together"); // the sibling list is untouched
    expect(note).toContain("DD-072 shipped first"); // the bare token is not

    // The slash-list is reported, so a human can finish the job — and it is
    // reported as the line will *look* once the rewrite lands, since a bare
    // mention on the same line has changed under it.
    const ambiguous = plan.mentions.filter((m) => m.ambiguous);
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].match).toBe("DD-T168-01/02");
    expect(ambiguous[0].file).toBe("specs/notes/note-001.md");
    expect(ambiguous[0].text).toBe("The pair DD-T168-01/02 landed together, and DD-072 shipped first.");

    // Frontmatter prose is prose: the context follows its record.
    expect(read("specs", "decisions", "dd-002.md")).toContain(
      'context: "DD-072 is the cache design this leans on"',
    );
  });

  it("renames the file when its name derives from the id, and sweeps the old path", async () => {
    const { plan } = await renumberRecord(opts(), "DD-T168-01", "DD-072", { renameFile: true });

    expect(plan.rename).toEqual({
      from: "specs/decisions/dd-t168-01-cache-design.md",
      to: "specs/decisions/dd-072-cache-design.md",
    });
    expect(existsSync(join(dir, "specs", "decisions", "dd-t168-01-cache-design.md"))).toBe(false);
    expect(existsSync(join(dir, "specs", "decisions", "dd-072-cache-design.md"))).toBe(true);

    const db = inspect();
    try {
      expect(getVertexById(db, "DD-072")?.source_file).toBe("specs/decisions/dd-072-cache-design.md");
      const files = db.prepare(`SELECT path FROM files ORDER BY path`).all() as Array<{ path: string }>;
      expect(files.map((f) => f.path)).not.toContain("specs/decisions/dd-t168-01-cache-design.md");
    } finally {
      db.close();
    }
  });

  it("leaves a file name it cannot derive, and says so", async () => {
    // A name that owes nothing to the id — renaming it would mean guessing at
    // a convention docdog does not own (DP-001), so it reports and stops.
    writeFileSync(
      join(dir, "specs", "notes", "scratch.md"),
      `---\nid: NOTE-009\ntitle: Scratch\ncollection: notes\n---\n\n# Scratch\n\nBody.\n`,
    );
    await runCacheIndexer(opts());

    const { plan } = await renumberRecord(opts(), "NOTE-009", "NOTE-010", { renameFile: true });

    expect(plan.rename).toBeNull();
    expect(plan.renameSkipped).toContain("does not begin with");
    expect(existsSync(join(dir, "specs", "notes", "scratch.md"))).toBe(true);
    expect(read("specs", "notes", "scratch.md")).toContain("id: NOTE-010");
  });

  it("--dry-run plans everything and writes nothing", async () => {
    const before = read("specs", "decisions", "dd-002.md");

    const { plan, filesWritten } = await renumberRecord(opts(), "DD-T168-01", "DD-072", {
      prose: true,
      renameFile: true,
      dryRun: true,
    });

    expect(filesWritten).toEqual([]);
    expect(plan.edges).toHaveLength(1);
    expect(plan.rename).not.toBeNull();
    expect(plan.proseRewrites).toBeGreaterThan(0);
    expect(read("specs", "decisions", "dd-002.md")).toBe(before);
    expect(read("specs", "decisions", "dd-t168-01-cache-design.md")).toContain("id: DD-T168-01");
  });

  // ─── guards ───────────────────────────────────────────────────────────────

  it("refuses an unknown old id", async () => {
    await expect(renumberRecord(opts(), "DD-999", "DD-072")).rejects.toMatchObject({
      name: "WriteError",
      code: "NOT_FOUND",
    });
  });

  it("refuses a new id that already exists — the ID_CONFLICT guard create uses", async () => {
    await expect(renumberRecord(opts(), "DD-T168-01", "DD-002")).rejects.toMatchObject({
      name: "WriteError",
      code: "ID_CONFLICT",
    });
  });

  it("refuses a no-op rename", async () => {
    await expect(renumberRecord(opts(), "DD-002", "DD-002")).rejects.toBeInstanceOf(WriteError);
  });

  it("refuses a record in a multi-record file — it has no frontmatter id to rewrite", async () => {
    writeFileSync(join(dir, "archive.md"), "## DD-100: Archived\n\nOld body.\n");
    config = {
      ...config,
      scan_paths: [
        "specs/",
        { path: "archive.md", parser: "split", split_on: "## DD-", collection: "decisions" },
      ],
    };
    await runCacheIndexer(opts());

    await expect(renumberRecord(opts(), "DD-100", "DD-074")).rejects.toMatchObject({
      code: "UNSUPPORTED_PARSER",
    });
  });

  // ─── contested ids ────────────────────────────────────────────────────────

  describe("contested ids", () => {
    beforeEach(async () => {
      // A second file claims DD-002 — a merge nobody checked, or two writers racing.
      writeFileSync(
        join(dir, "specs", "notes", "dd-002-rival.md"),
        `---\nid: DD-002\ntitle: Rival claim\ncollection: notes\n---\n\n# Rival\n\nA different record with the same id.\n`,
      );
      await runCacheIndexer({ ...opts(), full: true });
    });

    it("persists the duplicate the indexer already detected, and status reports it", async () => {
      const db = inspect();
      let contested;
      try {
        contested = readContestedIds(db);
      } finally {
        db.close();
      }

      expect(contested).toHaveLength(1);
      expect(contested[0].id).toBe("DD-002");
      expect([contested[0].winner, ...contested[0].losers].sort()).toEqual([
        "specs/decisions/dd-002.md",
        "specs/notes/dd-002-rival.md",
      ]);
      // The loser is exactly the file the cache did not index.
      const db2 = inspect();
      try {
        expect(getVertexById(db2, "DD-002")?.source_file).toBe(contested[0].winner);
      } finally {
        db2.close();
      }
      expect(warnings.some((w) => w.includes("contested id"))).toBe(true);
    });

    it("clears itself once the duplicate is resolved", async () => {
      // Renumber the losing file — it has no cache row of its own (the winner
      // took the id), so --file is the only way to name it (PROPOSAL-031 §2).
      const db = inspect();
      const { winner, losers } = readContestedIds(db)[0];
      db.close();
      const loser = losers[0];

      const { plan } = await renumberRecord(opts(), "DD-002", "DD-075", { file: loser });

      expect(plan.ownsId).toBe(false);
      expect(plan.recordFile).toBe(loser);
      // Inbound edges to DD-002 resolve to the record that kept the id — the
      // rename leaves them alone and reports them rather than guessing which
      // citer meant which record (DP-001 Tier 3).
      expect(plan.edges).toEqual([]);

      await runCacheIndexer(opts());

      const after = inspect();
      try {
        expect(readContestedIds(after)).toEqual([]);
        // Both records are now queryable — which is the whole point: before
        // this, the loser existed on disk and nowhere else.
        expect(getVertexById(after, "DD-075")?.source_file).toBe(loser);
        expect(getVertexById(after, "DD-002")?.source_file).toBe(winner);
      } finally {
        after.close();
      }
    });

    it("refuses --file when that file does not claim the old id", async () => {
      await expect(
        renumberRecord(opts(), "DD-002", "DD-075", { file: "specs/notes/note-001.md" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("surfaces contested ids through the status report (no ninth MCP tool)", async () => {
      // collectStatus resolves the cache from projectRoot, so index there too.
      await runCacheIndexer({ config, projectRoot: dir, embed: fakeEmbed, log: () => {}, warn: () => {} });

      const report = collectStatus(dir, config);
      expect(report.contested).toHaveLength(1);
      expect(report.contested[0].id).toBe("DD-002");
      expect(report.contested[0].losers).toHaveLength(1);
    });
  });
});
