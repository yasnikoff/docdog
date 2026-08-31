/**
 * Unit tests for extractRelationships — PROPOSAL-003 §1 parsing rules.
 */
import { describe, it, expect } from "vitest";
import { extractRelationships } from "../../src/engine/relationships/extract.js";

describe("extractRelationships", () => {
  it("returns empty on missing field", () => {
    const result = extractRelationships({});
    expect(result.tuples).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("parses a simple type-keyed list", () => {
    const result = extractRelationships({
      relationships: [
        { references: "FRICTION-006" },
        { constrains: "EJ-017" },
      ],
    });
    expect(result.warnings).toEqual([]);
    expect(result.tuples).toEqual([
      { type: "references", target_id: "FRICTION-006", context: null, anchor_text: null, role: null },
      { type: "constrains", target_id: "EJ-017", context: null, anchor_text: null, role: null },
    ]);
  });

  it("picks up context, anchor_text, and role metadata", () => {
    const result = extractRelationships({
      relationships: [
        {
          implements: "OQ-32",
          context: "DB-first write path",
          anchor_text: "PROPOSAL quote",
          role: "primary",
        },
      ],
    });
    expect(result.tuples).toHaveLength(1);
    const t = result.tuples[0];
    expect(t.type).toBe("implements");
    expect(t.target_id).toBe("OQ-32");
    expect(t.context).toBe("DB-first write path");
    expect(t.anchor_text).toBe("PROPOSAL quote");
    expect(t.role).toBe("primary");
  });

  it("tolerates unknown metadata keys (forward-compat)", () => {
    const result = extractRelationships({
      relationships: [{ references: "X-1", note: "ignored", priority: 9 }],
    });
    expect(result.warnings).toEqual([]);
    expect(result.tuples).toHaveLength(1);
    expect(result.tuples[0].type).toBe("references");
  });

  it("warns when relationships is not a list", () => {
    const result = extractRelationships({ relationships: "oops" });
    expect(result.tuples).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe("relationships_not_a_list");
  });

  it("warns on non-map entries", () => {
    const result = extractRelationships({ relationships: ["just-a-string", { references: "X" }] });
    expect(result.tuples).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe("entry_not_a_map");
    expect(result.warnings[0].index).toBe(0);
  });

  it("warns when target is not a non-empty string", () => {
    const result = extractRelationships({
      relationships: [{ references: null }, { references: "" }, { references: 42 }],
    });
    expect(result.tuples).toEqual([]);
    expect(result.warnings).toHaveLength(3);
    for (const w of result.warnings) expect(w.kind).toBe("target_not_a_string");
  });

  it("warns on empty maps", () => {
    const result = extractRelationships({ relationships: [{}, { references: "OK" }] });
    expect(result.tuples).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe("entry_empty");
  });

  it("preserves ordering across multiple entries", () => {
    const result = extractRelationships({
      relationships: [
        { references: "A" },
        { references: "B", context: "second" },
        { implements: "C" },
      ],
    });
    expect(result.tuples.map((t) => t.target_id)).toEqual(["A", "B", "C"]);
    expect(result.tuples[1].context).toBe("second");
  });

  it("picks the first non-metadata key as the type", () => {
    const result = extractRelationships({
      relationships: [{ context: "leading metadata", references: "X" }],
    });
    expect(result.tuples).toHaveLength(1);
    expect(result.tuples[0].type).toBe("references");
    expect(result.tuples[0].target_id).toBe("X");
    expect(result.tuples[0].context).toBe("leading metadata");
  });

  // FRICTION-028: the type/target shape used to parse as a well-formed edge
  // to a record named after the type, dropping every real edge, silently.
  describe("the type/target shape (FRICTION-028)", () => {
    it("refuses `type:`/`target:` instead of minting a phantom edge", () => {
      const result = extractRelationships({
        relationships: [{ type: "relates_to", target: "DD-070", context: "why" }],
      });
      expect(result.tuples).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].kind).toBe("entry_uses_type_target_shape");
      expect(result.warnings[0].index).toBe(0);
      // The message must show the correct shape — this warning's whole job is
      // to be the last time the author makes this mistake.
      expect(result.warnings[0].message).toContain("- <relation_type>: <TARGET-ID>");
    });

    it("catches either key alone", () => {
      const onlyType = extractRelationships({ relationships: [{ type: "relates_to" }] });
      expect(onlyType.tuples).toEqual([]);
      expect(onlyType.warnings[0].kind).toBe("entry_uses_type_target_shape");

      const onlyTarget = extractRelationships({
        relationships: [{ references: "DD-070", target: "DD-071" }],
      });
      expect(onlyTarget.tuples).toEqual([]);
      expect(onlyTarget.warnings[0].kind).toBe("entry_uses_type_target_shape");
    });

    it("skips only the malformed entry — good edges in the same block survive", () => {
      const result = extractRelationships({
        relationships: [
          { references: "DD-070" },
          { type: "relates_to", target: "DD-071" },
          { implements: "DD-072" },
        ],
      });
      expect(result.tuples.map((t) => t.target_id)).toEqual(["DD-070", "DD-072"]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].index).toBe(1);
    });

    it("still tolerates unknown non-forbidden sibling keys (forward-compat)", () => {
      const result = extractRelationships({
        relationships: [{ references: "DD-070", weight: 3 }],
      });
      expect(result.tuples).toHaveLength(1);
      expect(result.tuples[0].type).toBe("references");
      expect(result.warnings).toEqual([]);
    });
  });
});
