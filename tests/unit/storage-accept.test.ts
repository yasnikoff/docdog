/**
 * The review → accept half of the suggest loop — PROPOSAL-028. Pure
 * SQLite against a temp corpus built by the real cache indexer; no
 * Docker, no ONNX.
 *
 * The properties under test are the ones the three hand-scripted drains
 * (OBS-003, OBS-011, the orchestrator's) each got wrong or paid for:
 * round-trip symmetry, one write + one reindex per source *file*,
 * idempotent re-run, malformed input touching nothing, and a bad row
 * skipping rather than killing the batch.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { suggestEdges } from "../../src/storage/suggest.js";
import {
  AcceptError,
  acceptEdgesFromFile,
  parseReviewDocument,
  renderReviewDocument,
  warningsFor,
} from "../../src/storage/accept.js";

const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": `---
id: DD-001
title: First decision
---

# First decision

Builds on DD-002, and supersedes DD-003. Also cites DD-ARCH-01.
`,
  "specs/decisions/dd-002.md": `---
id: DD-002
title: Second decision
status: current
---

# Second decision

Refines DD-003.
`,
  "specs/decisions/dd-003.md": `---
id: DD-003
title: Third decision
---

# Third decision

Nothing cited here.
`,
  // Valid YAML, so it indexes and keeps its id — but `relationships:` is a
  // scalar, so the frontmatter surgery cannot append to it.
  "specs/decisions/dd-004.md": `---
id: DD-004
title: Fourth decision
relationships: none yet
---

# Fourth decision

Mentions DD-002 in passing.
`,
  // Frontmatter that will not parse at all: indexed body-only per
  // FRICTION-019, so the declared id never reaches the cache.
  "specs/notes/broken.md": `---
id: NOTE-001
title: "unterminated
collection: notes
---

# A note whose frontmatter will not parse

It mentions DD-001 anyway.
`,
  "specs/big-arch.md": `# Upstream mirror

## DD-ARCH-01: Core abstraction

The core abstraction builds on DD-001.
`,
  ".docdog/concepts/relation-references.md": `---
id: CONCEPT-RELATION-REFERENCES
title: "Relation: references"
collection: concepts
concept_kind: relation
name: references
edge_collection: dd_edges_semantic
inverse_label: referenced by
symmetric: false
---

A references B.
`,
};

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

describe("suggest-edges accept loop (PROPOSAL-028)", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-accept-"));
    cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    config = {
      ...defaultConfig,
      project: { name: "accept-test" },
      scan_paths: [
        "specs/decisions/",
        "specs/notes/",
        ".docdog/concepts/",
        { path: "specs/big-arch.md", parser: "split", split_on: "## DD-ARCH-", collection: "decisions" },
      ],
      vertex_collections: ["decisions", "notes", "concepts"],
      default_collection: "notes",
    };
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
      warn: () => {},
    };
  }

  function inspect(): Database.Database {
    return new Database(cachePath, { readonly: true });
  }

  function edgesOf(fromId: string): Array<Record<string, string>> {
    const db = inspect();
    try {
      return db
        .prepare(`SELECT to_id, type, context FROM edges WHERE from_id = ? ORDER BY to_id`)
        .all(fromId) as Array<Record<string, string>>;
    } finally {
      db.close();
    }
  }

  function scan() {
    const db = inspect();
    try {
      return suggestEdges(db, config);
    } finally {
      db.close();
    }
  }

  function writeReview(text: string): string {
    const path = join(dir, "candidates.yaml");
    writeFileSync(path, text, "utf-8");
    return path;
  }

  /** A review file with contexts filled in, as an agent would leave it. */
  function reviewed(rows: Array<[string, string, string, string]>): string {
    const lines = ["version: 1", "edges:"];
    for (const [from, to, type, context] of rows) {
      lines.push(`  - from: ${from}`);
      lines.push(`    to: ${to}`);
      lines.push(`    type: ${type}`);
      lines.push(`    context: ${JSON.stringify(context)}`);
    }
    return lines.join("\n") + "\n";
  }

  // ─── the format ───────────────────────────────────────────────────────────

  describe("--format review", () => {
    it("emits a document the parser reads back — the round trip that makes the loop work", () => {
      const rendered = renderReviewDocument(scan(), { commandLine: "docdog suggest-edges --format review" });
      const edges = parseReviewDocument(rendered).accepts;

      expect(edges).toEqual(
        expect.arrayContaining([
          { from: "DD-001", to: "DD-002", type: "references", context: "", anchor_text: null },
          { from: "DD-001", to: "DD-003", type: "references", context: "", anchor_text: null },
          { from: "DD-002", to: "DD-003", type: "references", context: "", anchor_text: null },
        ]),
      );
      expect(rendered).toContain("version: 1");
      expect(rendered).toContain("# DD-001 — specs/decisions/dd-001.md");
    });

    it("omits non-recordable sources from the rows and says so in a footer", () => {
      const rendered = renderReviewDocument(scan());
      const edges = parseReviewDocument(rendered).accepts;

      // DD-ARCH-01 lives in a split file: relate cannot patch it, so it is
      // never offered as a row — but it is not silently dropped either.
      expect(edges.some((e) => e.from === "DD-ARCH-01")).toBe(false);
      expect(rendered).toContain("multi-record file");
      expect(rendered).toContain("DD-ARCH-01");
      // It remains a legal *target*: DD-001 cites it.
      expect(edges.some((e) => e.to === "DD-ARCH-01")).toBe(true);
    });

    it("emits a legal empty document when there is nothing to review", () => {
      expect(parseReviewDocument(renderReviewDocument([]))).toEqual({ accepts: [], rejects: [] });
    });
  });

  describe("parse guards", () => {
    it("refuses an unknown version rather than guessing", () => {
      expect(() => parseReviewDocument("version: 2\nedges: []\n")).toThrow(
        /Unsupported review-file version 2/,
      );
    });

    it("reports every bad row at once", () => {
      const err = catchAcceptError(() =>
        parseReviewDocument(
          ["version: 1", "edges:", "  - from: DD-001", "    to: DD-002", "  - contxt: typo"].join("\n"),
        ),
      );
      expect(err.code).toBe("INVALID_ROWS");
      expect(err.message).toContain('row 1: "type" is required');
      expect(err.message).toContain('row 2: unknown key "contxt"');
      expect(err.message).toContain('row 2: "from" is required');
    });

    it("refuses a relationship metadata key as a relation type", () => {
      expect(() =>
        parseReviewDocument(reviewed([["DD-001", "DD-002", "context", "nope"]])),
      ).toThrow(/reserved relationship metadata key/);
    });
  });

  // ─── the applier ──────────────────────────────────────────────────────────

  describe("--accept-from", () => {
    it("applies reviewed rows as forward edges with their contexts", async () => {
      const path = writeReview(
        reviewed([
          ["DD-001", "DD-002", "references", "builds on the second"],
          ["DD-001", "DD-003", "supersedes", "replaces the third outright"],
        ]),
      );

      const report = await acceptEdgesFromFile(opts(), path);

      expect(report.edgesRead).toBe(2);
      expect(report.edgesApplied).toBe(2);
      expect(report.filesWritten).toEqual(["specs/decisions/dd-001.md"]);

      const raw = readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8");
      expect(raw).toContain("relationships:\n  - references: DD-002\n    context: builds on the second");
      expect(raw).toContain("  - supersedes: DD-003\n    context: replaces the third outright");

      expect(edgesOf("DD-001")).toEqual([
        { to_id: "DD-002", type: "references", context: "builds on the second" },
        { to_id: "DD-003", type: "supersedes", context: "replaces the third outright" },
      ]);
    });

    it("writes and reindexes once per source file, not once per edge", async () => {
      const path = writeReview(
        reviewed([
          ["DD-001", "DD-002", "references", "one"],
          ["DD-002", "DD-003", "references", "two"],
          ["DD-001", "DD-003", "references", "three"],
        ]),
      );

      const reindexed: string[] = [];
      const options: CacheIndexerOptions = {
        ...opts(),
        log: (m) => reindexed.push(m),
      };
      const report = await acceptEdgesFromFile(options, path);

      expect(report.edgesApplied).toBe(3);
      // Three edges, two source files → two writes.
      expect(report.filesWritten).toEqual([
        "specs/decisions/dd-001.md",
        "specs/decisions/dd-002.md",
      ]);
      expect(edgesOf("DD-001")).toHaveLength(2);
      expect(edgesOf("DD-002")).toHaveLength(1);
    });

    it("is idempotent: re-running the same file applies nothing the second time", async () => {
      const path = writeReview(reviewed([["DD-001", "DD-002", "references", "builds on it"]]));

      await acceptEdgesFromFile(opts(), path);
      const before = readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8");

      const second = await acceptEdgesFromFile(opts(), path);

      expect(second.edgesApplied).toBe(0);
      expect(second.filesWritten).toEqual([]);
      expect(second.outcomes[0].skipReason).toBe("already_declared");
      expect(readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8")).toBe(before);
      expect(edgesOf("DD-001")).toHaveLength(1);
    });

    it("skips a row repeated inside one file rather than writing it twice", async () => {
      const path = writeReview(
        reviewed([
          ["DD-001", "DD-002", "references", "first mention"],
          ["DD-001", "DD-002", "references", "same edge again"],
        ]),
      );

      const report = await acceptEdgesFromFile(opts(), path);

      expect(report.edgesApplied).toBe(1);
      expect(report.outcomes[1].skipReason).toBe("duplicate_row");
      expect(edgesOf("DD-001")).toHaveLength(1);
    });

    it("refuses an empty context by default, and applies it under --allow-empty-context", async () => {
      const path = writeReview(reviewed([["DD-001", "DD-002", "references", ""]]));

      const refused = await acceptEdgesFromFile(opts(), path);
      expect(refused.edgesApplied).toBe(0);
      expect(refused.outcomes[0].skipReason).toBe("empty_context");
      expect(edgesOf("DD-001")).toHaveLength(0);

      const allowed = await acceptEdgesFromFile(opts(), path, { allowEmptyContext: true });
      expect(allowed.edgesApplied).toBe(1);
      expect(edgesOf("DD-001")).toEqual([{ to_id: "DD-002", type: "references", context: null }]);
    });

    it("skips bad rows without losing the good ones in the same batch", async () => {
      const path = writeReview(
        reviewed([
          ["DD-404", "DD-002", "references", "no such source"],
          ["DD-ARCH-01", "DD-002", "references", "split file — not patchable"],
          // A record whose `relationships:` is a scalar: it indexes fine, but
          // the frontmatter surgery refuses to append to a non-list.
          ["DD-004", "DD-002", "references", "relationships: is not a list"],
          // Frontmatter that will not parse is indexed body-only, so the id it
          // declares never reaches the cache — naming it as a source cannot
          // resolve, which is the honest answer (FRICTION-019).
          ["NOTE-001", "DD-002", "references", "frontmatter will not parse"],
          ["DD-001", "DD-002", "references", "this one is fine"],
        ]),
      );

      const report = await acceptEdgesFromFile(opts(), path);

      expect(report.outcomes.map((o) => o.skipReason)).toEqual([
        "source_not_found",
        "source_not_recordable",
        "source_unpatchable",
        "source_not_found",
        null,
      ]);
      expect(report.outcomes[2].detail).toMatch(/not a list/i);
      expect(report.edgesApplied).toBe(1);
      expect(edgesOf("DD-001")).toHaveLength(1);
      // The unpatchable source is untouched — a skip never half-writes.
      expect(readFileSync(join(dir, "specs/decisions/dd-004.md"), "utf-8")).toBe(
        FILES["specs/decisions/dd-004.md"],
      );
    });

    it("applies an unregistered type and a dangling target, and warns about both", async () => {
      const path = writeReview(
        reviewed([
          ["DD-001", "DD-002", "invented_type", "the registry is advisory"],
          ["DD-002", "DD-999", "references", "target does not exist yet"],
        ]),
      );

      const report = await acceptEdgesFromFile(opts(), path);
      const { unregisteredType, danglingTarget } = warningsFor(report.outcomes);

      expect(report.edgesApplied).toBe(2);
      expect(unregisteredType.map((o) => o.edge.type)).toEqual(["invented_type"]);
      expect(danglingTarget.map((o) => o.edge.toId)).toEqual(["DD-999"]);
      expect(edgesOf("DD-002")).toEqual([
        { to_id: "DD-999", type: "references", context: "target does not exist yet" },
      ]);
    });

    it("--dry-run reports exactly what it would do and writes nothing", async () => {
      const path = writeReview(reviewed([["DD-001", "DD-002", "references", "builds on it"]]));
      const target = join(dir, "specs/decisions/dd-001.md");
      const before = { raw: readFileSync(target, "utf-8"), mtime: statSync(target).mtimeMs };

      const report = await acceptEdgesFromFile(opts(), path, { dryRun: true });

      expect(report.dryRun).toBe(true);
      expect(report.edgesApplied).toBe(1);
      expect(report.filesWritten).toEqual([]);
      expect(readFileSync(target, "utf-8")).toBe(before.raw);
      expect(statSync(target).mtimeMs).toBe(before.mtime);
      expect(edgesOf("DD-001")).toHaveLength(0);
    });

    it("a malformed review file touches nothing", async () => {
      const path = writeReview("version: 1\nedges:\n  - from: DD-001\n    to: DD-002\n");
      const before = readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8");

      await expect(acceptEdgesFromFile(opts(), path)).rejects.toThrow(AcceptError);

      expect(readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8")).toBe(before);
      expect(edgesOf("DD-001")).toHaveLength(0);
    });

    it("drains the loop: scan → review → accept → re-scan finds those candidates gone", async () => {
      const rendered = renderReviewDocument(scan());
      // The agent's edit: keep DD-001 → DD-002, reject everything else.
      const kept = parseReviewDocument(rendered).accepts.filter(
        (e) => e.from === "DD-001" && e.to === "DD-002",
      );
      const path = writeReview(
        reviewed(kept.map((e) => [e.from, e.to, e.type, "reviewed and kept"])),
      );

      await acceptEdgesFromFile(opts(), path);

      const after = scan().flatMap((r) => r.suggestions.map((s) => `${r.source_id}->${s.target_id}`));
      expect(after).not.toContain("DD-001->DD-002");
      expect(after).toContain("DD-001->DD-003"); // rejected rows stay candidates
    });
  });
});

function catchAcceptError(fn: () => unknown): AcceptError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AcceptError) return err;
    throw err;
  }
  throw new Error("expected an AcceptError");
}
