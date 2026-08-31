/**
 * Corpus-wide edge checks — FRICTION-028. End-to-end through the indexer, so
 * these cover the wiring and the path-scoped gate, not just the query.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";

const RELATION_CONCEPT = `---
id: CONCEPT-RELATION-REFERENCES
title: references
collection: concepts
concept_kind: relation
name: references
inverse_label: referenced by
symmetric: false
---

# references

The default relation.
`;

/** DD-001 -> DD-002, registered type, target exists. The clean baseline. */
const DD_001 = `---
id: DD-001
title: First
relationships:
  - references: DD-002
    context: builds on it
---

# First

Body.
`;

const DD_002 = `---
id: DD-002
title: Second
---

# Second

Body.
`;

describe("edge health post-pass (FRICTION-028)", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let warnings: string[];

  const fakeEmbed: EmbedBatchFn = async (_c, texts) => texts.map((t) => [t.length, 1, 2]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-edge-health-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "concepts"), { recursive: true });
    writeFileSync(join(dir, "specs", "concepts", "relation-references.md"), RELATION_CONCEPT);
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    config = {
      ...defaultConfig,
      project: { name: "edge-health-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["decisions", "notes", "concepts"],
      default_collection: "notes",
    };
    warnings = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

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

  const run = (extra: Partial<CacheIndexerOptions> = {}) =>
    runCacheIndexer({ ...opts(), ...extra });

  function write(name: string, body: string) {
    writeFileSync(join(dir, "specs", "decisions", name), body);
  }

  it("stays silent on a healthy corpus", async () => {
    const stats = await run();
    expect(stats.unknownTypeEdges).toBe(0);
    expect(stats.danglingEdges).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("warns on an unregistered relation type, naming the source record", async () => {
    write(
      "dd-003.md",
      `---
id: DD-003
title: Third
relationships:
  - refernces: DD-002
---

# Third
`,
    );

    const stats = await run();
    expect(stats.unknownTypeEdges).toBe(1);
    expect(stats.danglingEdges).toBe(0);

    const warning = warnings.find((w) => w.includes("not registered"));
    expect(warning).toBeDefined();
    expect(warning).toContain('"refernces"');
    expect(warning).toContain("DD-003");
  });

  it("warns on a target no record declares", async () => {
    write(
      "dd-004.md",
      `---
id: DD-004
title: Fourth
relationships:
  - references: DD-999
---

# Fourth
`,
    );

    const stats = await run();
    expect(stats.danglingEdges).toBe(1);
    expect(stats.unknownTypeEdges).toBe(0);

    const warning = warnings.find((w) => w.includes("no record declares"));
    expect(warning).toBeDefined();
    expect(warning).toContain("DD-004");
    expect(warning).toContain("DD-999");
  });

  // The bug as it actually happened: the extractor now refuses the entry, so
  // the phantom edge is never born AND the block's loss is announced twice —
  // once at the entry, once as the absence of the edges it should have made.
  it("refuses the type/target shape at index time", async () => {
    write(
      "dd-005.md",
      `---
id: DD-005
title: Fifth
relationships:
  - type: relates_to
    target: DD-002
    context: the shape that started it
---

# Fifth
`,
    );

    const stats = await run();
    expect(stats.edges).toBe(1); // DD-001's only — DD-005 contributed none
    expect(stats.danglingEdges).toBe(0); // no phantom edge to dangle
    expect(warnings.some((w) => w.includes("type/target shape"))).toBe(true);
  });

  // Without this gate every `docdog_relate` write — which reindexes one file —
  // would report defects from files it never touched.
  it("says nothing on a path-scoped run", async () => {
    write(
      "dd-006.md",
      `---
id: DD-006
title: Sixth
relationships:
  - bogus_type: DD-999
---

# Sixth
`,
    );

    await run();
    warnings.length = 0;

    const stats = await run({ paths: ["specs/decisions/dd-006.md"] });
    expect(stats.unknownTypeEdges).toBe(0);
    expect(stats.danglingEdges).toBe(0);
    expect(warnings).toEqual([]);
  });

  // A corpus with no relation concept records would otherwise warn on every
  // edge it has. No registry, no opinion.
  it("does not judge types when the registry is empty", async () => {
    rmSync(join(dir, "specs", "concepts"), { recursive: true, force: true });
    write(
      "dd-007.md",
      `---
id: DD-007
title: Seventh
relationships:
  - anything_at_all: DD-002
---

# Seventh
`,
    );

    const stats = await run();
    expect(stats.unknownTypeEdges).toBe(0);
    expect(warnings.filter((w) => w.includes("not registered"))).toEqual([]);
  });
});
