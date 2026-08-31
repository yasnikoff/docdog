/**
 * File-first write paths — P-023 §7 step 5 (write half). Pure SQLite
 * against a temp corpus; no Docker, no ArangoDB, no ONNX. Each case
 * verifies both halves of the contract: the markdown file carries the
 * change (disk canonical) and the reindexed cache row reflects it
 * (derived state).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import {
  createRecordFile,
  relateFileFirst,
  updateRecordFile,
  WriteError,
} from "../../src/storage/writes.js";

const DD_001 = `---
id: DD-001
title: First decision
relationships:
  - references: DD-002
    context: "builds on it"
---

# First decision

Alpha bravo charlie body.
`;

const DD_002 = `---
id: DD-002
title: Second decision
status: current
---

# Second decision

Delta echo foxtrot body.
`;

const RELATION_CONCEPT = `---
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
`;

const ARCHIVE = `## DD-100: Archived decision

Old body about golf hotel india.
`;

describe("storage file-first writes", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let embedCalls: string[][];
  let warnings: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => {
    embedCalls.push(texts);
    return texts.map((t) => [t.length, 1, 2]);
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-writes-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });
    mkdirSync(join(dir, ".docdog", "concepts"), { recursive: true });
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    writeFileSync(join(dir, ".docdog", "concepts", "relation-references.md"), RELATION_CONCEPT);
    writeFileSync(join(dir, "archive.md"), ARCHIVE);
    config = {
      ...defaultConfig,
      project: { name: "writes-test" },
      scan_paths: [
        "specs/",
        ".docdog/concepts/",
        { path: "archive.md", parser: "split", split_on: "## DD-", collection: "decisions" },
      ],
      vertex_collections: ["decisions", "notes", "concepts"],
      default_collection: "notes",
    };
    embedCalls = [];
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

  function readRecord(...rel: string[]): string {
    return readFileSync(join(dir, ...rel), "utf-8");
  }

  // ─── relate ───────────────────────────────────────────────────────────────

  describe("relateFileFirst", () => {
    it("patches the source frontmatter and derives the edge via reindex", async () => {
      const result = await relateFileFirst(opts(), {
        fromId: "DD-002",
        toId: "DD-001",
        type: "references",
        context: "second builds on first",
      });

      expect(result.filePath).toBe("specs/decisions/dd-002.md");
      expect(result.targetKnown).toBe(true);
      expect(result.typeKnown).toBe(true);
      expect(result.stats.embedded).toBe(0); // body unchanged → embed cache hit

      const raw = readRecord("specs", "decisions", "dd-002.md");
      expect(raw).toContain(
        "status: current\nrelationships:\n  - references: DD-001\n    context: second builds on first\n---",
      );

      const db = inspect();
      try {
        const edge = db
          .prepare(`SELECT to_id, type, context FROM edges WHERE from_id = 'DD-002'`)
          .get() as Record<string, string>;
        expect(edge).toEqual({
          to_id: "DD-001",
          type: "references",
          context: "second builds on first",
        });
      } finally {
        db.close();
      }
    });

    it("flags unknown types and unknown targets without refusing", async () => {
      const result = await relateFileFirst(opts(), {
        fromId: "DD-002",
        toId: "DD-999",
        type: "amends",
        context: "ctx",
      });
      expect(result.typeKnown).toBe(false);
      expect(result.targetKnown).toBe(false);

      // The edge row dangles honestly — exactly what the frontmatter says.
      const db = inspect();
      try {
        const edge = db.prepare(`SELECT to_id FROM edges WHERE from_id = 'DD-002'`).get() as {
          to_id: string;
        };
        expect(edge.to_id).toBe("DD-999");
      } finally {
        db.close();
      }
    });

    it("refuses a duplicate (type, target) pair", async () => {
      await expect(
        relateFileFirst(opts(), {
          fromId: "DD-001",
          toId: "DD-002",
          type: "references",
          context: "again",
        }),
      ).rejects.toMatchObject({ code: "DUPLICATE_EDGE" });
    });

    it("refuses an unknown source record", async () => {
      await expect(
        relateFileFirst(opts(), { fromId: "DD-404", toId: "DD-001", type: "references", context: "c" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses records that live in split-parsed (multi-record) files", async () => {
      await expect(
        relateFileFirst(opts(), { fromId: "DD-100", toId: "DD-001", type: "references", context: "c" }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_PARSER" });
    });

    it("requires an existing cache and points at docdog index", async () => {
      await expect(
        relateFileFirst(
          { ...opts(), cacheFilePath: join(dir, "nope.db") },
          { fromId: "DD-001", toId: "DD-002", type: "references", context: "c" },
        ),
      ).rejects.toThrowError(/docdog index/);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe("createRecordFile", () => {
    it("writes the file at the caller's path and indexes it, edges included", async () => {
      const result = await createRecordFile(opts(), {
        path: "specs/notes/friction-099-example.md",
        collection: "notes",
        id: "FRICTION-099",
        title: "Example friction",
        description: "one sentence",
        content: "# Example friction\n\nJuliet kilo lima body.",
        frontmatter: {
          severity: "cosmetic",
          relationships: [{ references: "DD-001", context: "hit while testing" }],
        },
      });

      expect(result.filePath).toBe("specs/notes/friction-099-example.md");
      expect(result.stats.verticesUpserted).toBe(1);
      expect(result.stats.edges).toBe(1);

      const raw = readRecord("specs", "notes", "friction-099-example.md");
      expect(raw).toBe(
        `---
id: FRICTION-099
title: Example friction
collection: notes
description: one sentence
severity: cosmetic
relationships:
  - references: DD-001
    context: hit while testing
---

# Example friction

Juliet kilo lima body.
`,
      );

      const db = inspect();
      try {
        const vertex = db
          .prepare(`SELECT collection, title, description, status FROM vertices WHERE id = 'FRICTION-099'`)
          .get() as Record<string, string>;
        expect(vertex.collection).toBe("notes");
        expect(vertex.description).toBe("one sentence");
        expect(vertex.status).toBe("current"); // read-time default, not written to disk
        const edge = db
          .prepare(`SELECT to_id FROM edges WHERE from_id = 'FRICTION-099'`)
          .get() as { to_id: string };
        expect(edge.to_id).toBe("DD-001");
      } finally {
        db.close();
      }
    });

    it("refuses an id that already exists", async () => {
      await expect(
        createRecordFile(opts(), {
          path: "specs/notes/dup.md",
          collection: "notes",
          id: "DD-001",
          title: "Dup",
          content: "x",
        }),
      ).rejects.toMatchObject({ code: "ID_CONFLICT" });
    });

    it("refuses invalid placements", async () => {
      const base = { collection: "notes", title: "T", content: "x" };
      await expect(
        createRecordFile(opts(), { ...base, path: "outside/note.md" }),
      ).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(
        createRecordFile(opts(), { ...base, path: "specs/notes/../../../evil.md" }),
      ).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(
        createRecordFile(opts(), { ...base, path: "specs/notes/not-markdown.txt" }),
      ).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(
        createRecordFile(opts(), { ...base, path: "archive.md" }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_PARSER" });
      await expect(
        createRecordFile(opts(), { ...base, path: "specs/decisions/dd-001.md" }),
      ).rejects.toMatchObject({ code: "FILE_EXISTS" });
    });

    it("refuses unknown and system collections", async () => {
      await expect(
        createRecordFile(opts(), { path: "specs/notes/a.md", collection: "bogus", title: "T", content: "x" }),
      ).rejects.toMatchObject({ code: "UNKNOWN_COLLECTION" });
      await expect(
        createRecordFile(opts(), { path: "specs/notes/a.md", collection: "dd_patches", title: "T", content: "x" }),
      ).rejects.toMatchObject({ code: "SYSTEM_COLLECTION" });
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe("updateRecordFile", () => {
    it("patches frontmatter fields without re-embedding", async () => {
      const before = embedCalls.length;
      const result = await updateRecordFile(opts(), {
        id: "DD-002",
        status: "superseded",
        description: "now superseded",
      });

      expect(result.updatedFields).toEqual(["description", "status"]);
      expect(embedCalls.length).toBe(before); // body unchanged → no embed call

      const raw = readRecord("specs", "decisions", "dd-002.md");
      expect(raw).toContain("status: superseded");
      expect(raw).toContain("description: now superseded");
      expect(raw).toContain("Delta echo foxtrot body.");

      const db = inspect();
      try {
        const vertex = db
          .prepare(`SELECT status, description FROM vertices WHERE id = 'DD-002'`)
          .get() as Record<string, string>;
        expect(vertex.status).toBe("superseded");
        expect(vertex.description).toBe("now superseded");
      } finally {
        db.close();
      }
    });

    it("replaces the body and re-embeds", async () => {
      const result = await updateRecordFile(opts(), {
        id: "DD-002",
        content: "# Second decision\n\nMike november oscar rewritten.",
      });
      expect(result.updatedFields).toEqual(["content"]);
      expect(result.stats?.embedded).toBe(1);

      const raw = readRecord("specs", "decisions", "dd-002.md");
      expect(raw.endsWith("---\n\n# Second decision\n\nMike november oscar rewritten.\n")).toBe(true);
      expect(raw).toContain("id: DD-002"); // frontmatter untouched

      const db = inspect();
      try {
        const vertex = db.prepare(`SELECT body_text FROM vertices WHERE id = 'DD-002'`).get() as {
          body_text: string;
        };
        expect(vertex.body_text).toContain("Mike november oscar");
      } finally {
        db.close();
      }
    });

    it("patches arbitrary frontmatter fields, arrays included (PROPOSAL-027)", async () => {
      const result = await updateRecordFile(opts(), {
        id: "DD-002",
        fields: { is_outdated: true, priority: 3, tags: ["stale", "sweep"] },
      });
      expect(result.updatedFields).toEqual(["is_outdated", "priority", "tags"]);

      const raw = readRecord("specs", "decisions", "dd-002.md");
      expect(raw).toContain("is_outdated: true");
      expect(raw).toContain("priority: 3");
      expect(raw).toContain("tags:\n  - stale\n  - sweep");

      const db = inspect();
      try {
        const row = db
          .prepare(`SELECT frontmatter_json FROM vertices WHERE id = 'DD-002'`)
          .get() as { frontmatter_json: string };
        const fm = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
        expect(fm.is_outdated).toBe(true);
        expect(fm.priority).toBe(3);
        expect(fm.tags).toEqual(["stale", "sweep"]);
      } finally {
        db.close();
      }
    });

    it("deletes a key with fields: null, idempotently", async () => {
      await updateRecordFile(opts(), { id: "DD-002", fields: { severity: "cosmetic" } });
      const removed = await updateRecordFile(opts(), { id: "DD-002", fields: { severity: null } });
      expect(removed.updatedFields).toEqual(["severity"]);
      expect(readRecord("specs", "decisions", "dd-002.md")).not.toContain("severity");

      // Deleting an absent key changes nothing and reports nothing.
      const again = await updateRecordFile(opts(), { id: "DD-002", fields: { severity: null } });
      expect(again.updatedFields).toEqual([]);
      expect(again.stats).toBeNull();
    });

    it("refuses reserved keys, dedicated-param keys, bad key shapes, nested values", async () => {
      for (const key of ["id", "collection", "relationships", "title", "description", "status", "scope"]) {
        await expect(
          updateRecordFile(opts(), { id: "DD-002", fields: { [key]: "x" } }),
        ).rejects.toMatchObject({ code: "RESERVED_FIELD" });
      }
      await expect(
        updateRecordFile(opts(), { id: "DD-002", fields: { "dotted.key": "x" } }),
      ).rejects.toMatchObject({ code: "INVALID_FIELD" });
      await expect(
        updateRecordFile(opts(), {
          id: "DD-002",
          fields: { meta: { nested: true } as unknown as string },
        }),
      ).rejects.toMatchObject({ code: "INVALID_FIELD" });
    });

    it("refuses atomically — a bad fields key aborts the whole patch before disk", async () => {
      const before = readRecord("specs", "decisions", "dd-002.md");
      await expect(
        updateRecordFile(opts(), {
          id: "DD-002",
          status: "superseded",
          fields: { ok: "yes", relationships: "no" },
        }),
      ).rejects.toMatchObject({ code: "RESERVED_FIELD" });
      expect(readRecord("specs", "decisions", "dd-002.md")).toBe(before);
    });

    it("is a no-op without fields and refuses unknown records", async () => {
      const before = readRecord("specs", "decisions", "dd-002.md");
      const result = await updateRecordFile(opts(), { id: "DD-002" });
      expect(result.updatedFields).toEqual([]);
      expect(result.stats).toBeNull();
      expect(readRecord("specs", "decisions", "dd-002.md")).toBe(before);

      await expect(updateRecordFile(opts(), { id: "DD-404", status: "x" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("refuses records in split-parsed files", async () => {
      await expect(
        updateRecordFile(opts(), { id: "DD-100", status: "superseded" }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_PARSER" });
    });
  });

  it("WriteError instances carry their name for MCP error rendering", async () => {
    try {
      await updateRecordFile(opts(), { id: "DD-404", status: "x" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(WriteError);
      expect((err as WriteError).name).toBe("WriteError");
    }
  });
});
