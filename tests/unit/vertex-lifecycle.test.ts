/**
 * Unit tests for PROPOSAL-015 — vertex lifecycle symmetry.
 *
 * Covers the getVertexCollections union and lifecycle source
 * classification. No DB, no filesystem. (The migration-0002 half of
 * this suite died with src/migrations/ — DD-070 §3: drop-and-rebuild,
 * never migrate.)
 */
import { describe, it, expect } from "vitest";
import {
  getVertexCollections,
  getVertexCollectionSource,
} from "../../src/config/collections.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { defaultConfig } from "../../src/config/defaults.js";

function make(overrides: Partial<DocdogConfig>): DocdogConfig {
  return {
    ...JSON.parse(JSON.stringify(defaultConfig)),
    project: { name: "t" },
    ...overrides,
  };
}

describe("getVertexCollections (PROPOSAL-015 union)", () => {
  it("returns template-shipped collections for a fresh structured project (system tier empty)", () => {
    const config = make({ template: "structured", vertex_collections: [] });
    const names = getVertexCollections(config);
    expect(names).toContain("decisions");
    expect(names).toContain("requirements");
    expect(names).toContain("notes");
    // dd_patches reservation removed with OQ-26's closure (RECON-001)
    expect(names).not.toContain("dd_patches");
    // workflow-only entries should not appear
    expect(names).not.toContain("features");
    expect(names).not.toContain("tasks");
  });

  it("unions user additions onto template shipped", () => {
    const config = make({
      template: "structured",
      vertex_collections: ["observations"],
    });
    const names = getVertexCollections(config);
    expect(names).toContain("observations");
    expect(names).toContain("decisions");
  });

  it("deduplicates when legacy config still lists shipped entries", () => {
    const config = make({
      template: "structured",
      vertex_collections: ["decisions", "observations"],
    });
    const names = getVertexCollections(config);
    const count = names.filter((n) => n === "decisions").length;
    expect(count).toBe(1);
    expect(names).toContain("observations");
  });

  it("pre-template config (no template, full list) still works", () => {
    const config = make({
      template: undefined,
      vertex_collections: ["decisions", "notes"],
    });
    const names = getVertexCollections(config);
    expect(names).toContain("decisions");
    expect(names).toContain("notes");
  });

  it("unknown template yields no shipped tier (only user)", () => {
    const config = make({
      template: "not-a-real-template",
      vertex_collections: ["my_custom"],
    });
    const names = getVertexCollections(config);
    expect(names).toContain("my_custom");
    expect(names).not.toContain("dd_patches");
    expect(names).not.toContain("decisions");
  });
});

describe("getVertexCollectionSource", () => {
  it("system tier is empty — a dd_* name not shipped or declared falls through to user", () => {
    // The dd_patches reservation was dropped (RECON-001); creation in
    // dd_* collections is still refused by the writes guard's prefix check.
    const config = make({ template: "structured", vertex_collections: [] });
    expect(getVertexCollectionSource("dd_patches", config)).toBe("user");
  });

  it("classifies template-shipped collections", () => {
    const config = make({ template: "structured", vertex_collections: [] });
    expect(getVertexCollectionSource("decisions", config)).toBe("shipped");
    expect(getVertexCollectionSource("notes", config)).toBe("shipped");
  });

  it("classifies user additions", () => {
    const config = make({
      template: "structured",
      vertex_collections: ["observations"],
    });
    expect(getVertexCollectionSource("observations", config)).toBe("user");
  });

  it("template change reclassifies the same name", () => {
    // `features` is shipped by the workflows template but not by structured
    const structured = make({ template: "structured", vertex_collections: ["features"] });
    expect(getVertexCollectionSource("features", structured)).toBe("user");

    const workflows = make({ template: "workflows", vertex_collections: [] });
    expect(getVertexCollectionSource("features", workflows)).toBe("shipped");
  });
});
