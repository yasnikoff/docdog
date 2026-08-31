/**
 * Cache traversal — P-023 §7 step 4. Pure SQLite against a temp corpus
 * built by the real cache indexer; no Docker, no ArangoDB, no ONNX.
 *
 * Fixture graph (edges born only in relationships: frontmatter):
 *
 *   DD-001 ──references──▶ DD-002 ──supersedes──▶ DD-003 ──references──▶ DD-001   (cycle)
 *                          DD-002 ──references──▶ DD-404   (dangling, no file)
 *                          DD-002 ──references──▶ DD-005   (scope: personal)
 *                          DD-005 ──references──▶ DD-006
 *
 * Also exercises the session-4 registry decision (option b): inverse
 * labels resolve through concepts rows indexed from disk, not Arango.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { traverse } from "../../src/storage/traverse.js";
import { loadRegistryFromCache } from "../../src/storage/relations.js";

const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": `---
id: DD-001
title: First decision
relationships:
  - references: DD-002
    context: builds on it
    role: amends
---

# First decision

Body one.
`,
  "specs/decisions/dd-002.md": `---
id: DD-002
title: Second decision
relationships:
  - supersedes: DD-003
  - references: DD-404
  - references: DD-005
---

# Second decision

Body two.
`,
  "specs/decisions/dd-003.md": `---
id: DD-003
title: Third decision
relationships:
  - references: DD-001
---

# Third decision

Body three.
`,
  "specs/decisions/dd-005.md": `---
id: DD-005
title: Personal decision
scope: personal
relationships:
  - references: DD-006
---

# Personal decision

Body five.
`,
  "specs/decisions/dd-006.md": `---
id: DD-006
title: Sixth decision
---

# Sixth decision

Body six.
`,
  ".docdog/concepts/relation-supersedes.md": `---
id: CONCEPT-RELATION-SUPERSEDES
title: "Relation: supersedes"
collection: concepts
concept_kind: relation
name: supersedes
edge_collection: dd_edges_temporal
inverse_label: revised by
symmetric: false
---

A replaces B.
`,
  ".docdog/concepts/relation-companion.md": `---
id: CONCEPT-RELATION-COMPANION
title: "Relation: companion"
collection: concepts
concept_kind: relation
name: companion
edge_collection: dd_edges_crosscutting
inverse_label: companion
symmetric: true
---

A and B belong together.
`,
  ".docdog/concepts/collection-decisions.md": `---
id: CONCEPT-COLLECTION-DECISIONS
title: "Collection: decisions"
collection: concepts
concept_kind: collection
name: decisions
---

Not a relation — the registry loader must skip this row.
`,
};

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map(() => [1, 2, 3]);

describe("storage cache traverse", () => {
  let dir: string;
  let cachePath: string;
  let db: Database.Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-cache-traverse-"));
    cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    const config: DocdogConfig = {
      ...defaultConfig,
      project: { name: "cache-traverse-test" },
      scan_paths: ["specs/", ".docdog/concepts/"],
      vertex_collections: ["decisions", "concepts"],
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

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("walks outbound depth 1 with full edge and vertex shapes", () => {
    const results = traverse(db, { vertexId: "DD-001", direction: "outbound" });
    expect(results).toHaveLength(1);

    const [r] = results;
    expect(r.depth).toBe(1);
    expect(r.edge).toEqual({
      _from: "DD-001",
      _to: "DD-002",
      type: "references",
      role: "amends",
      context: "builds on it",
    });
    expect(r.vertex.id).toBe("DD-002");
    expect(r.vertex._id).toBe("DD-002"); // compatibility alias
    expect(r.vertex.title).toBe("Second decision");
    expect(r.vertex.collection).toBe("decisions");
    expect(r.vertex.source_file).toBe("specs/decisions/dd-002.md");
    expect(r.vertex.scope).toBe("shared"); // absent frontmatter scope defaults
  });

  it("defaults to depth 1, any direction", () => {
    const results = traverse(db, { vertexId: "DD-003" });
    const summary = results.map((r) => `${r.edge.type}:${r.vertex.id}`).sort();
    // Outbound references→DD-001 plus inbound supersedes from DD-002.
    expect(summary).toEqual(["references:DD-001", "supersedes:DD-002"]);
    expect(results.every((r) => r.depth === 1)).toBe(true);
  });

  it("walks outbound depth 2, skipping dangling targets", () => {
    const results = traverse(db, { vertexId: "DD-001", direction: "outbound", depth: 2 });
    expect(results.map((r) => [r.vertex.id, r.depth])).toEqual([
      ["DD-002", 1],
      ["DD-003", 2], // DD-404 dangles between these — neither emitted nor expanded
      ["DD-005", 2],
    ]);
  });

  it("walks inbound by reversing edge direction", () => {
    const results = traverse(db, { vertexId: "DD-002", direction: "inbound" });
    expect(results).toHaveLength(1);
    expect(results[0].vertex.id).toBe("DD-001");
    expect(results[0].edge._from).toBe("DD-001");
    expect(results[0].edge._to).toBe("DD-002");
  });

  it("terminates on cycles, reporting each edge of the neighborhood exactly once", () => {
    const depth3 = traverse(db, { vertexId: "DD-001", direction: "outbound", depth: 3 });
    const rows = depth3.map((r) => [r.vertex.id, r.depth]);
    expect(rows).toEqual([
      ["DD-002", 1],
      ["DD-003", 2],
      ["DD-005", 2],
      ["DD-001", 3], // the cycle edge DD-003→DD-001 is real information
      ["DD-006", 3],
    ]);

    // Deeper walks find nothing new — the neighborhood is exhausted.
    const depth4 = traverse(db, { vertexId: "DD-001", direction: "outbound", depth: 4 });
    expect(depth4).toHaveLength(depth3.length);

    // Every edge appears exactly once.
    const edgeKeys = depth3.map((r) => `${r.edge._from}→${r.edge._to}:${r.edge.type}`);
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length);
  });

  it("filters returned vertices by scope but still traverses through them (DD-058)", () => {
    const results = traverse(db, {
      vertexId: "DD-002",
      direction: "outbound",
      depth: 2,
      scope: "shared",
    });
    expect(results.map((r) => [r.vertex.id, r.depth])).toEqual([
      ["DD-003", 1], // DD-005 is personal: filtered from output...
      ["DD-001", 2],
      ["DD-006", 2], // ...but traversed through, or DD-006 would be unreachable
    ]);
  });

  it("returns nothing for an unknown start vertex", () => {
    expect(traverse(db, { vertexId: "DD-999" })).toEqual([]);
  });

  describe("relations registry from cache (session-4 option b)", () => {
    it("loads relation concepts and skips collection concepts", () => {
      const registry = loadRegistryFromCache(db);
      expect(registry.has("supersedes")).toBe(true);
      expect(registry.has("companion")).toBe(true);
      expect(registry.has("decisions")).toBe(false); // concept_kind: collection
      expect(registry.size()).toBe(2);

      const supersedes = registry.lookup("supersedes");
      expect(supersedes.inverse_label).toBe("revised by");
      expect(supersedes.symmetric).toBe(false);

      expect(registry.lookup("companion").symmetric).toBe(true);
      expect(registry.lookup("frobnicates").known).toBe(false);
    });

    it("resolves inverse labels on inbound traversal edges", () => {
      const registry = loadRegistryFromCache(db);
      const results = traverse(db, { vertexId: "DD-003" });

      const inbound = results.find((r) => r.vertex.id === "DD-002")!;
      expect(registry.effectiveType(inbound.edge, "DD-003")).toEqual({
        effective_type: "revised by",
        direction: "INBOUND",
      });

      const outbound = results.find((r) => r.vertex.id === "DD-001")!;
      expect(registry.effectiveType(outbound.edge, "DD-003")).toEqual({
        effective_type: "references",
        direction: "OUTBOUND",
      });

      // Symmetric types keep their own name on inbound edges.
      expect(
        registry.effectiveType({ _from: "A", _to: "B", type: "companion" }, "B"),
      ).toEqual({ effective_type: "companion", direction: "INBOUND" });

      // Unknown types fall back to themselves.
      expect(
        registry.effectiveType({ _from: "A", _to: "B", type: "frobnicates" }, "B"),
      ).toEqual({ effective_type: "frobnicates", direction: "INBOUND" });
    });
  });
});
