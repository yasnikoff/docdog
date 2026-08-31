/**
 * Suggest-edges scanner — PROPOSAL-024. Pure SQLite against a temp
 * corpus built by the real cache indexer; no Docker, no ONNX.
 *
 * Fixture:
 *   DD-001 (default-parsed) — declared edge to DD-003; body mentions
 *     DD-002 (twice), DD-003, itself, unknown DD-404, lookalike UTF-8,
 *     and split-section DD-ARCH-01.
 *   DD-002 (default-parsed) — clean body, no mentions.
 *   specs/notes/no-id.md — no frontmatter id (fallback vertex key);
 *     body mentions DD-001.
 *   DD-004 (default-parsed) — body writes its mentions as slash-lists.
 *   specs/big-arch.md (split-parsed) — DD-ARCH-01 mentions DD-001;
 *     DD-ARCH-02 mentions DD-ARCH-01. Multi-segment ids guard the v2
 *     regex bug (ARCH-01 must never be extracted from DD-ARCH-01).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { mentionedIds, suggestEdges } from "../../src/storage/suggest.js";

const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": `---
id: DD-001
title: First decision
relationships:
  - references: DD-003
    context: already declared
---

# First decision

Builds on DD-002 and, per DD-003, replaces the old approach. See
DD-002 again (dedupe check), DD-404 (no such record), and DD-001
itself. Files are UTF-8 encoded. Also relates to DD-ARCH-01.
`,
  "specs/decisions/dd-002.md": `---
id: DD-002
title: Second decision
---

# Second decision

A clean body with no id mentions at all.
`,
  "specs/decisions/dd-003.md": `---
id: DD-003
title: Third decision
---

# Third decision

Nothing cited here either.
`,
  "specs/decisions/dd-004.md": `---
id: DD-004
title: Fourth decision
---

# Fourth decision

Supersedes DD-002/003 in one breath, and the multi-segment form
DD-ARCH-01/02 expands the same way. Neither DD-404/405 nor the ratio
DD-002/9 names a record.
`,
  "specs/notes/no-id.md": `---
title: A note without an id
---

# Untitled note

This note cites DD-001 in prose.
`,
  "specs/big-arch.md": `# Upstream architecture mirror

Preamble text before the sections.

## DD-ARCH-01: Core abstraction

The core abstraction builds on DD-001.

## DD-ARCH-02: Second abstraction

Extends DD-ARCH-01 without declaring it.
`,
};

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map(() => [1, 2, 3]);

describe("storage suggest-edges scanner", () => {
  let dir: string;
  let db: Database.Database;
  let config: DocdogConfig;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-suggest-"));
    const cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    config = {
      ...defaultConfig,
      project: { name: "suggest-test" },
      scan_paths: [
        "specs/decisions/",
        "specs/notes/",
        { path: "specs/big-arch.md", parser: "split", split_on: "## DD-ARCH-", collection: "upstream" },
      ],
      vertex_collections: ["decisions", "notes", "upstream"],
      default_collection: null,
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
    db = new Database(cachePath, { readonly: true });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("suggests undeclared known-id mentions, deduped, with the visible references default", () => {
    const results = suggestEdges(db, config);
    const dd001 = results.find((r) => r.source_id === "DD-001");
    expect(dd001).toBeDefined();
    expect(dd001!.recordable).toBe(true);
    expect(dd001!.source_file.replace(/\\/g, "/")).toBe("specs/decisions/dd-001.md");
    expect(dd001!.suggestions).toEqual([
      { type: "references", target_id: "DD-002" },
      { type: "references", target_id: "DD-ARCH-01" },
    ]);
  });

  it("drops self-references, declared edges, unknown ids, and known-id lookalikes", () => {
    const all = suggestEdges(db, config).flatMap((r) =>
      r.suggestions.map((s) => `${r.source_id}->${s.target_id}`),
    );
    expect(all).not.toContain("DD-001->DD-001");
    expect(all).not.toContain("DD-001->DD-003"); // declared in frontmatter
    expect(all.some((s) => s.endsWith("->DD-404"))).toBe(false); // unknown id
    expect(all.some((s) => s.includes("UTF-8"))).toBe(false); // lookalike, not a record
  });

  it("reports clean sources not at all", () => {
    const results = suggestEdges(db, config);
    expect(results.find((r) => r.source_id === "DD-002")).toBeUndefined();
    expect(results.find((r) => r.source_id === "DD-003")).toBeUndefined();
  });

  it("includes sources without a frontmatter id (fallback vertex key)", () => {
    const results = suggestEdges(db, config);
    const noId = results.find((r) => r.source_file.replace(/\\/g, "/") === "specs/notes/no-id.md");
    expect(noId).toBeDefined();
    expect(noId!.recordable).toBe(true);
    expect(noId!.suggestions).toEqual([{ type: "references", target_id: "DD-001" }]);
  });

  it("matches multi-segment ids whole — never their numeric tail (v2 regex bug)", () => {
    const results = suggestEdges(db, config);
    const arch02 = results.find((r) => r.source_id === "DD-ARCH-02");
    expect(arch02).toBeDefined();
    expect(arch02!.suggestions).toEqual([{ type: "references", target_id: "DD-ARCH-01" }]);
    const allTargets = results.flatMap((r) => r.suggestions.map((s) => s.target_id));
    expect(allTargets).not.toContain("ARCH-01");
  });

  it("flags split-parsed sources as not recordable", () => {
    const results = suggestEdges(db, config);
    const arch01 = results.find((r) => r.source_id === "DD-ARCH-01");
    expect(arch01).toBeDefined();
    expect(arch01!.recordable).toBe(false);
    expect(arch01!.suggestions).toEqual([{ type: "references", target_id: "DD-001" }]);
  });

  it("filters by collection, id pattern, and path substring", () => {
    const byCollection = suggestEdges(db, config, { collections: ["decisions"] });
    expect(byCollection.map((r) => r.source_id)).toEqual(["DD-001", "DD-004"]);

    const byId = suggestEdges(db, config, { idPattern: "DD-ARCH-*" });
    expect(byId.map((r) => r.source_id).sort()).toEqual(["DD-ARCH-01", "DD-ARCH-02"]);

    const byPath = suggestEdges(db, config, { pathFilter: "notes" });
    expect(byPath).toHaveLength(1);
    expect(byPath[0].suggestions[0].target_id).toBe("DD-001");
  });

  it("returns empty for a filter that matches nothing", () => {
    expect(suggestEdges(db, config, { idPattern: "NOPE-*" })).toEqual([]);
  });

  it("expands slash-list mentions into every sibling they name", () => {
    const dd004 = suggestEdges(db, config).find((r) => r.source_id === "DD-004");
    expect(dd004).toBeDefined();
    // DD-404/405 is unknown and DD-002/9 expands to a non-record — the
    // known-id intersection drops the lot, as it does for any lookalike.
    expect(dd004!.suggestions).toEqual([
      { type: "references", target_id: "DD-002" },
      { type: "references", target_id: "DD-003" },
      { type: "references", target_id: "DD-ARCH-01" },
      { type: "references", target_id: "DD-ARCH-02" },
    ]);
  });
});

/**
 * FRICTION-025's mechanical half: `--status` / `--exclude-status`, mirroring
 * search's filter vocabulary. Its own tiny corpus so the status values are
 * explicit and the shared fixture's exact-set assertions stay untouched. Every
 * record cites another so a clean scan surfaces all three; the filters then
 * carve the source set.
 */
describe("suggest-edges status filter (FRICTION-025)", () => {
  let dir: string;
  let db: Database.Database;
  let config: DocdogConfig;

  const STATUS_FILES: Record<string, string> = {
    "specs/decisions/dd-010.md": `---
id: DD-010
title: Superseded source
status: superseded
---

# Superseded source

An old decision that still mentions DD-011.
`,
    "specs/decisions/dd-011.md": `---
id: DD-011
title: Current source
status: current
---

# Current source

Cites DD-010 in passing.
`,
    "specs/decisions/dd-012.md": `---
id: DD-012
title: Draft source
status: draft
---

# Draft source

Also cites DD-010, under a third status entirely.
`,
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-suggest-status-"));
    const cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(STATUS_FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    config = {
      ...defaultConfig,
      project: { name: "suggest-status-test" },
      scan_paths: ["specs/decisions/"],
      vertex_collections: ["decisions"],
      default_collection: null,
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
    db = new Database(cachePath, { readonly: true });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("scans every source when no status filter is given", () => {
    expect(suggestEdges(db, config).map((r) => r.source_id).sort()).toEqual([
      "DD-010",
      "DD-011",
      "DD-012",
    ]);
  });

  it("drops superseded sources with --exclude-status — the 117-of-138 prune, no judgment", () => {
    const results = suggestEdges(db, config, { excludeStatus: ["superseded"] });
    // Only the superseded record is gone; current and draft both survive an
    // exclude that names neither.
    expect(results.map((r) => r.source_id).sort()).toEqual(["DD-011", "DD-012"]);
  });

  it("keeps only allowlisted statuses with --status", () => {
    const results = suggestEdges(db, config, { status: ["current"] });
    expect(results.map((r) => r.source_id)).toEqual(["DD-011"]);
  });
});

describe("mention grammar", () => {
  it("reads a slash-list as siblings sharing the head's stem", () => {
    expect(mentionedIds("Closes OQ-18/19/21 today.")).toEqual(["OQ-18", "OQ-19", "OQ-21"]);
    expect(mentionedIds("PROPOSAL-025/026 shipped.")).toEqual(["PROPOSAL-025", "PROPOSAL-026"]);
    expect(mentionedIds("DD-ARCH-01/02")).toEqual(["DD-ARCH-01", "DD-ARCH-02"]);
    expect(mentionedIds("FRICTION-006/009/011/015")).toEqual([
      "FRICTION-006",
      "FRICTION-009",
      "FRICTION-011",
      "FRICTION-015",
    ]);
  });

  it("keeps the digits as written — the stem is repeated, not renumbered", () => {
    expect(mentionedIds("OQ-8/19")).toEqual(["OQ-8", "OQ-19"]);
  });

  it("only continues on digits riding immediately behind the id", () => {
    // A separator, a lowercase tail, or a space breaks the run — each id
    // is then matched on its own terms, and a bare number is nobody's.
    expect(mentionedIds("DD-070/PROPOSAL-024")).toEqual(["DD-070", "PROPOSAL-024"]);
    expect(mentionedIds("OQ-18/19/DD-070")).toEqual(["OQ-18", "OQ-19", "DD-070"]);
    expect(mentionedIds("see specs/decisions/dd-001.md")).toEqual([]);
    expect(mentionedIds("DD-070 §3, 2 of 3 done")).toEqual(["DD-070"]);
    expect(mentionedIds("DD-070/ and DD-071.")).toEqual(["DD-070", "DD-071"]);
  });

  it("does not read ids out of dates, versions, or prose numbers", () => {
    expect(mentionedIds("On 2026-07-14 we shipped over HTTP/2.")).toEqual([]);
    expect(mentionedIds("Files are UTF-8 encoded; hashes are SHA-256.")).toEqual([
      "UTF-8",
      "SHA-256",
    ]);
  });

  it("dedupes repeated mentions in reading order", () => {
    expect(mentionedIds("OQ-18/19, then OQ-19 again, then OQ-18.")).toEqual(["OQ-18", "OQ-19"]);
  });
});
