/**
 * Frontmatter surgery — P-023 §7 step 5 (write half). Pure text
 * transforms: no SQLite, no disk. The round-trip cases run the patched
 * text back through the real parse + extract pipeline so the surgery
 * and the ingest side can never drift apart.
 */
import { describe, expect, it } from "vitest";
import {
  appendRelationship,
  composeRecordFile,
  FrontmatterPatchError,
  removeFrontmatterField,
  replaceBody,
  serializeRelationshipEntry,
  setFrontmatterField,
} from "../../src/storage/frontmatter.js";
import { parse as parseMarkdown } from "../../src/markdown/index.js";
import { extractRelationships } from "../../src/engine/relationships/extract.js";

const FILE_WITH_RELATIONSHIPS = `---
id: DD-001
title: First decision
relationships:
  - references: DD-002
    context: "builds on it"
---

# First decision

Body text.
`;

const FILE_WITHOUT_RELATIONSHIPS = `---
id: DD-003
title: Third decision
status: current
---

Body.
`;

/** Parse a patched file and return its extracted relationship tuples. */
function tuplesOf(raw: string) {
  const doc = parseMarkdown(raw);
  return extractRelationships(doc.frontmatter).tuples;
}

describe("serializeRelationshipEntry (defaults-elide, P-022 §4)", () => {
  it("keeps the common edge to two lines: type + context", () => {
    const lines = serializeRelationshipEntry({
      type: "references",
      target: "DD-034",
      context: "builds on it",
    });
    expect(lines).toEqual(["  - references: DD-034", "    context: builds on it"]);
  });

  it("elides null/empty optional fields, writes non-default ones", () => {
    expect(
      serializeRelationshipEntry({
        type: "supersedes",
        target: "DD-001",
        context: null,
        anchor_text: null,
        role: "",
      }),
    ).toEqual(["  - supersedes: DD-001"]);

    expect(
      serializeRelationshipEntry({
        type: "references",
        target: "DD-002",
        context: "x",
        anchor_text: "see DD-002",
        role: "amends",
      }),
    ).toEqual([
      "  - references: DD-002",
      "    context: x",
      "    anchor_text: see DD-002",
      "    role: amends",
    ]);
  });

  it("quotes values that need it and never wraps long lines", () => {
    const longContext =
      "the two-tier split collapses — everything canonical lives on disk and this line is far longer than eighty characters";
    const lines = serializeRelationshipEntry({
      type: "references",
      target: "DD-002",
      context: longContext,
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(longContext);

    const quoted = serializeRelationshipEntry({
      type: "references",
      target: "DD-002",
      context: "with: colon",
    });
    expect(quoted[1]).toBe(`    context: "with: colon"`);
  });

  it("refuses a type that collides with entry metadata keys", () => {
    expect(() =>
      serializeRelationshipEntry({ type: "context", target: "DD-001" }),
    ).toThrowError(FrontmatterPatchError);
  });
});

describe("appendRelationship", () => {
  it("appends to an existing block; existing lines survive byte-for-byte", () => {
    const patched = appendRelationship(FILE_WITH_RELATIONSHIPS, {
      type: "supersedes",
      target: "DD-000",
      context: "replaces it",
    });

    const original = FILE_WITH_RELATIONSHIPS.split("\n");
    const result = patched.split("\n");
    // Two inserted lines directly after the last existing entry line.
    expect(result.slice(0, 6)).toEqual(original.slice(0, 6));
    expect(result[6]).toBe("  - supersedes: DD-000");
    expect(result[7]).toBe("    context: replaces it");
    expect(result.slice(8)).toEqual(original.slice(6));

    expect(tuplesOf(patched)).toEqual([
      { type: "references", target_id: "DD-002", context: "builds on it", anchor_text: null, role: null },
      { type: "supersedes", target_id: "DD-000", context: "replaces it", anchor_text: null, role: null },
    ]);
  });

  it("creates the relationships key when absent, before the closing delimiter", () => {
    const patched = appendRelationship(FILE_WITHOUT_RELATIONSHIPS, {
      type: "references",
      target: "DD-001",
      context: "ctx",
    });
    expect(patched).toContain("status: current\nrelationships:\n  - references: DD-001\n    context: ctx\n---");
    expect(tuplesOf(patched)).toHaveLength(1);
  });

  it("creates a frontmatter block on a file that has none", () => {
    const patched = appendRelationship("# Just a heading\n\nBody.\n", {
      type: "references",
      target: "DD-001",
      context: "ctx",
    });
    expect(patched.startsWith("---\nrelationships:\n  - references: DD-001\n    context: ctx\n---\n")).toBe(true);
    expect(patched).toContain("# Just a heading");
    expect(tuplesOf(patched)).toHaveLength(1);
  });

  it("converts an empty flow list ([]) to a block list", () => {
    const raw = FILE_WITHOUT_RELATIONSHIPS.replace("status: current", "status: current\nrelationships: []");
    const patched = appendRelationship(raw, { type: "references", target: "DD-001", context: "c" });
    expect(patched).not.toContain("[]");
    expect(tuplesOf(patched)).toHaveLength(1);
  });

  it("appends after multi-line entries, not inside them", () => {
    const raw = `---
id: DD-010
relationships:
  - references: DD-011
    context: "first"
    anchor_text: some anchor
  - supersedes: DD-012
    context: "second"
---

Body.
`;
    const patched = appendRelationship(raw, { type: "implements", target: "DD-013", context: "third" });
    expect(tuplesOf(patched).map((t) => t.type)).toEqual(["references", "supersedes", "implements"]);
    const lines = patched.split("\n");
    expect(lines[lines.indexOf("    context: \"second\"") + 1]).toBe("  - implements: DD-013");
  });

  it("refuses when relationships is not a list", () => {
    const inline = FILE_WITHOUT_RELATIONSHIPS.replace("status: current", "relationships: DD-001");
    expect(() =>
      appendRelationship(inline, { type: "references", target: "DD-002", context: "c" }),
    ).toThrowError(FrontmatterPatchError);

    const map = FILE_WITHOUT_RELATIONSHIPS.replace("status: current", "relationships:\n  references: DD-001");
    expect(() =>
      appendRelationship(map, { type: "references", target: "DD-002", context: "c" }),
    ).toThrowError(FrontmatterPatchError);
  });

  it("refuses malformed frontmatter instead of corrupting it", () => {
    const bad = `---\ntitle: "unclosed\nrelationships:\n  - references: DD-001\n---\n\nBody.\n`;
    expect(() =>
      appendRelationship(bad, { type: "references", target: "DD-002", context: "c" }),
    ).toThrowError(FrontmatterPatchError);
  });

  it("preserves CRLF line endings", () => {
    const crlf = FILE_WITH_RELATIONSHIPS.replace(/\n/g, "\r\n");
    const patched = appendRelationship(crlf, { type: "supersedes", target: "DD-000", context: "c" });
    expect(patched).toContain("  - supersedes: DD-000\r\n");
    expect(patched.split("\r\n").length).toBe(patched.split("\n").length);
  });
});

describe("setFrontmatterField", () => {
  it("replaces an existing scalar field in place", () => {
    const patched = setFrontmatterField(FILE_WITHOUT_RELATIONSHIPS, "status", "superseded");
    expect(patched).toContain("status: superseded");
    expect(patched).not.toContain("status: current");
    // Only that line changed.
    expect(patched.split("\n").length).toBe(FILE_WITHOUT_RELATIONSHIPS.split("\n").length);
  });

  it("inserts a missing field before the closing delimiter", () => {
    const patched = setFrontmatterField(FILE_WITHOUT_RELATIONSHIPS, "description", "a summary");
    expect(patched).toContain("status: current\ndescription: a summary\n---");
  });

  it("replaces a multi-line block value wholesale", () => {
    const raw = `---
id: DD-020
description: >-
  folded first line
  folded second line
status: current
---

Body.
`;
    const patched = setFrontmatterField(raw, "description", "one line now");
    expect(patched).toContain("description: one line now\nstatus: current");
    expect(patched).not.toContain("folded");
    const doc = parseMarkdown(patched);
    expect(doc.frontmatter.description).toBe("one line now");
    expect(doc.frontmatter.status).toBe("current");
  });

  it("creates a frontmatter block on a file that has none", () => {
    const patched = setFrontmatterField("Body only.\n", "title", "New title");
    expect(patched.startsWith("---\ntitle: New title\n---\n")).toBe(true);
    expect(parseMarkdown(patched).frontmatter.title).toBe("New title");
  });

  it("writes non-string scalars and flat lists as native YAML (PROPOSAL-027)", () => {
    let patched = setFrontmatterField(FILE_WITHOUT_RELATIONSHIPS, "is_outdated", true);
    patched = setFrontmatterField(patched, "priority", 3);
    patched = setFrontmatterField(patched, "tags", ["stale", "sweep"]);
    expect(patched).toContain("is_outdated: true");
    expect(patched).toContain("priority: 3");
    expect(patched).toContain("tags:\n  - stale\n  - sweep");
    const fm = parseMarkdown(patched).frontmatter;
    expect(fm.is_outdated).toBe(true);
    expect(fm.priority).toBe(3);
    expect(fm.tags).toEqual(["stale", "sweep"]);
  });
});

describe("removeFrontmatterField (PROPOSAL-027)", () => {
  it("removes a scalar field, leaving every other line intact", () => {
    const removed = removeFrontmatterField(FILE_WITHOUT_RELATIONSHIPS, "status");
    expect(removed).not.toContain("status");
    expect(removed).toContain("id: DD-003");
    expect(removed).toContain("Body.");
    expect(removed.split("\n").length).toBe(FILE_WITHOUT_RELATIONSHIPS.split("\n").length - 1);
  });

  it("removes a multi-line block value wholesale", () => {
    const raw = `---
id: DD-020
tags:
  - stale
  - sweep
status: current
---

Body.
`;
    const removed = removeFrontmatterField(raw, "tags");
    expect(removed).not.toContain("tags");
    expect(removed).not.toContain("stale");
    expect(removed).toContain("id: DD-020\nstatus: current\n---");
  });

  it("is idempotent: absent key and missing frontmatter return the input unchanged", () => {
    expect(removeFrontmatterField(FILE_WITHOUT_RELATIONSHIPS, "severity")).toBe(
      FILE_WITHOUT_RELATIONSHIPS,
    );
    expect(removeFrontmatterField("Body only.\n", "severity")).toBe("Body only.\n");
  });

  it("refuses malformed frontmatter instead of corrupting it", () => {
    const malformed = `---\ntitle: [unclosed\n---\n\nBody.\n`;
    expect(() => removeFrontmatterField(malformed, "title")).toThrow(FrontmatterPatchError);
  });

  it("preserves CRLF line endings", () => {
    const crlf = FILE_WITHOUT_RELATIONSHIPS.replace(/\n/g, "\r\n");
    const removed = removeFrontmatterField(crlf, "status");
    expect(removed).not.toContain("status");
    expect(removed.split("\r\n").length).toBe(removed.split("\n").length);
  });
});

describe("replaceBody / composeRecordFile", () => {
  it("replaces the body and leaves the frontmatter block untouched", () => {
    const patched = replaceBody(FILE_WITH_RELATIONSHIPS, "New body.\n\nSecond paragraph.");
    const doc = parseMarkdown(patched);
    expect(doc.frontmatter.id).toBe("DD-001");
    expect(patched.endsWith("---\n\nNew body.\n\nSecond paragraph.\n")).toBe(true);
  });

  it("composes a fresh record file that parses back losslessly", () => {
    const raw = composeRecordFile(
      {
        id: "FRICTION-099",
        title: "A new note",
        collection: "notes",
        description: "one sentence",
        relationships: [{ references: "DD-070", context: "ctx" }],
      },
      "# A new note\n\nBody.",
    );
    const doc = parseMarkdown(raw);
    expect(doc.frontmatter.id).toBe("FRICTION-099");
    expect(doc.frontmatter.collection).toBe("notes");
    expect(tuplesOf(raw)).toEqual([
      { type: "references", target_id: "DD-070", context: "ctx", anchor_text: null, role: null },
    ]);
    expect(raw.endsWith("# A new note\n\nBody.\n")).toBe(true);
  });
});
