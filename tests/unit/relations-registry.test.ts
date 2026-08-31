/**
 * Unit tests for the in-memory relationship registry (PROPOSAL-003 §4 / §8.1).
 * V3 shape: name / inverse_label / symmetric — the dd_edges_* routing
 * collection died with Arango (DD-070 §2).
 */
import { describe, it, expect } from "vitest";
import {
  RelationsRegistry,
  type RelationRoutingEntry,
} from "../../src/engine/relations-registry.js";

function entry(partial: Partial<RelationRoutingEntry> & { name: string }): RelationRoutingEntry {
  return {
    name: partial.name,
    inverse_label: "inverse",
    symmetric: false,
    ...partial,
  };
}

describe("RelationsRegistry.lookup", () => {
  const registry = RelationsRegistry.fromEntries([
    entry({ name: "references", inverse_label: "referenced by" }),
    entry({ name: "supersedes", inverse_label: "revised by" }),
    entry({ name: "companion", inverse_label: "companion of", symmetric: true }),
  ]);

  it("returns resolution info for known types with known=true", () => {
    const result = registry.lookup("supersedes");
    expect(result.known).toBe(true);
    expect(result.inverse_label).toBe("revised by");
  });

  it("resolves unknown types verbatim with known=false", () => {
    const result = registry.lookup("owns");
    expect(result.known).toBe(false);
    expect(result.inverse_label).toBe("owns");
    expect(result.symmetric).toBe(false);
  });

  it("has() and size() reflect loaded entries", () => {
    expect(registry.has("references")).toBe(true);
    expect(registry.has("nope")).toBe(false);
    expect(registry.size()).toBe(3);
  });
});

describe("RelationsRegistry.effectiveType", () => {
  const registry = RelationsRegistry.fromEntries([
    entry({ name: "supersedes", inverse_label: "revised by" }),
    entry({ name: "companion", inverse_label: "companion of", symmetric: true }),
  ]);

  const edge = { _from: "DD-001", _to: "DD-002", type: "supersedes" };

  it("returns forward type and OUTBOUND when queried from _from", () => {
    const result = registry.effectiveType(edge, "DD-001");
    expect(result.effective_type).toBe("supersedes");
    expect(result.direction).toBe("OUTBOUND");
  });

  it("returns inverse_label and INBOUND when queried from _to (asymmetric)", () => {
    const result = registry.effectiveType(edge, "DD-002");
    expect(result.effective_type).toBe("revised by");
    expect(result.direction).toBe("INBOUND");
  });

  it("symmetric types keep the same label in both directions", () => {
    const symEdge = { _from: "N-1", _to: "N-2", type: "companion" };
    expect(registry.effectiveType(symEdge, "N-1").effective_type).toBe("companion");
    expect(registry.effectiveType(symEdge, "N-2").effective_type).toBe("companion");
  });

  it("unknown types fall through to the raw type value on INBOUND", () => {
    const unknownEdge = { _from: "a/1", _to: "b/2", type: "owns" };
    expect(registry.effectiveType(unknownEdge, "b/2").effective_type).toBe("owns");
  });
});
