/**
 * Unit tests for indexer parsers: default, split, table.
 * Script parser tested separately (requires file I/O).
 */
import { describe, it, expect } from "vitest";
import { defaultParser } from "../../src/engine/parsers/default.js";
import { splitParser } from "../../src/engine/parsers/split.js";
import { tableParser } from "../../src/engine/parsers/table.js";
import type { ParseInput } from "../../src/engine/parsers/types.js";
import { defaultConfig } from "../../src/config/defaults.js";

function makeInput(raw: string, parserConfig: Partial<ParseInput["parserConfig"]> = {}): ParseInput {
  return {
    absPath: "/test/file.md",
    repoRelPath: "file.md",
    raw,
    parserConfig: { path: "file.md", parser: "default", ...parserConfig },
    projectConfig: defaultConfig,
    projectRoot: "/test",
  };
}

// ─── Default parser ─────────────────────────────────────────────────────────

describe("defaultParser", () => {
  it("returns one section per file with frontmatter", async () => {
    const raw = `---
id: DD-001
title: My Decision
collection: decisions
---

# My Decision

Content here.`;
    const result = await defaultParser.parse(makeInput(raw));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("DD-001");
    expect(result[0].title).toBe("My Decision");
    expect(result[0].collection).toBe("decisions");
    expect(result[0].content).toContain("Content here");
  });

  it("extracts title from first heading when frontmatter has none", async () => {
    const raw = `# Heading Title\n\nBody.`;
    const result = await defaultParser.parse(makeInput(raw));
    expect(result[0].title).toBe("Heading Title");
  });

  it("uses parser config collection as fallback", async () => {
    const raw = `# Note\n\nContent.`;
    const result = await defaultParser.parse(makeInput(raw, { collection: "notes" }));
    expect(result[0].collection).toBe("notes");
  });

  it("frontmatter collection overrides parser config", async () => {
    const raw = `---\ncollection: decisions\n---\n\n# X`;
    const result = await defaultParser.parse(makeInput(raw, { collection: "notes" }));
    expect(result[0].collection).toBe("decisions");
  });
});

// ─── Split parser ──────────────────────────────────────────────────────────

describe("splitParser", () => {
  it("splits on heading pattern and extracts IDs", async () => {
    const raw = `# Architecture Decisions

Preamble to discard.

## DD-ARCH-01: First Decision

**Status:** current
**Date:** 2026-03-24

Body of the first decision.

## DD-ARCH-02: Second Decision

Body of the second.`;

    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "## DD-",
      collection: "decisions",
    }));

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("DD-ARCH-01");
    expect(result[0].title).toBe("First Decision");
    expect(result[0].collection).toBe("decisions");
    expect(result[0].frontmatter.status).toBe("current");
    expect(result[0].frontmatter.date).toBe("2026-03-24");
    expect(result[0].content).not.toContain("**Status:**");
    expect(result[0].content).toContain("Body of the first decision");
    expect(result[0].sectionKey).toBe("DD-ARCH-01");

    expect(result[1].id).toBe("DD-ARCH-02");
    expect(result[1].title).toBe("Second Decision");
  });

  it("handles requirements with ### prefix", async () => {
    const raw = `## Functional Requirements

### FR-PROV-01: Provision a Server

Content 1.

### FR-PROV-02: Node Selection

Content 2.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "### FR-",
      collection: "requirements",
    }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("FR-PROV-01");
    expect(result[1].id).toBe("FR-PROV-02");
  });

  it("returns empty array when pattern not found", async () => {
    const raw = `# No matching headings here\n\nJust text.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "## DD-",
    }));
    expect(result).toHaveLength(0);
  });

  it("throws when split_on is missing", async () => {
    await expect(async () => {
      await splitParser.parse(makeInput("content", { parser: "split" }));
    }).rejects.toThrow(/split_on/);
  });

  it("splits two id cohorts from one file when split_on is a list (PROPOSAL-034)", async () => {
    // A requirements file carrying FR-* and NFR-* at the same depth: a single
    // split_on can only capture one cohort (FRICTION-023 gap 1). A list
    // captures both, in document order.
    const raw = `# Requirements

### FR-PROV-01: Provision a Server

FR body one.

### NFR-SCALE-03: Scale to N nodes

NFR body.

### FR-PROV-02: Node Selection

FR body two.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: ["### FR-", "### NFR-"],
      collection: "requirements",
    }));
    expect(result.map(r => r.id)).toEqual(["FR-PROV-01", "NFR-SCALE-03", "FR-PROV-02"]);
    expect(result[1].content).toContain("NFR body");
  });

  it("throws when split_on is an empty or blank list", async () => {
    await expect(async () => {
      await splitParser.parse(makeInput("content", { parser: "split", split_on: [] }));
    }).rejects.toThrow(/split_on/);
    await expect(async () => {
      await splitParser.parse(makeInput("content", { parser: "split", split_on: ["  "] }));
    }).rejects.toThrow(/split_on/);
  });

  it("indexes a zero-match file whole when fallback: whole-file is set (PROPOSAL-034)", async () => {
    // A prose file under a split scan path that matches no pattern: dropped by
    // default (FRICTION-023 gap 2), but kept as one vertex with fallback set,
    // so a split entry can cover a folder mixing id-bearing and prose files.
    const raw = `---\nid: EAPI-DOC\ntitle: External APIs\n---\n\n# External APIs\n\nVendor behaviour notes.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "### EAPI-",
      fallback: "whole-file",
      collection: "constraints",
    }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("EAPI-DOC");
    expect(result[0].collection).toBe("constraints");
    expect(result[0].content).toContain("Vendor behaviour notes");
  });

  it("fallback: whole-file only engages on zero matches", async () => {
    const raw = `# Constraints\n\n### EAPI-PTERO-01: Panel API\n\nBody.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "### EAPI-",
      fallback: "whole-file",
      collection: "constraints",
    }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("EAPI-PTERO-01");
  });

  it("produces stable sectionKeys when a new section is appended (append-safe)", async () => {
    // Append-safety matters for living specs that orchestrator skills
    // keep writing to (e.g. specs/BACKPORT.md, specs/architect-architecture.md).
    // sectionKey must be content-derived, not line-derived — otherwise every
    // append shifts every downstream vertex's _key and the indexer churns.
    const before = `# Backport Tracking\n\nPreamble.\n\n## BACKPORT-039\n\n- **Task:** TASK-043\n\nFirst body.\n\n## BACKPORT-040\n\n- **Task:** TASK-046\n\nSecond body.\n`;
    const after = before + `\n## BACKPORT-041\n\n- **Task:** TASK-052\n\nNew body.\n`;

    const r1 = await splitParser.parse(makeInput(before, {
      parser: "split",
      split_on: "## BACKPORT-",
      collection: "notes",
    }));
    const r2 = await splitParser.parse(makeInput(after, {
      parser: "split",
      split_on: "## BACKPORT-",
      collection: "notes",
    }));

    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(3);
    // Pre-existing sections keep their sectionKey and content verbatim.
    expect(r2[0].sectionKey).toBe(r1[0].sectionKey);
    expect(r2[1].sectionKey).toBe(r1[1].sectionKey);
    expect(r2[0].content).toBe(r1[0].content);
    expect(r2[1].content).toBe(r1[1].content);
    expect(r2[2].sectionKey).toBe("BACKPORT-041");
  });

  it("recognizes [ID] Title bracket form (orchestrator architect-architecture.md)", async () => {
    // specs/architect-architecture.md in the host project's orchestrator is
    // structured with `### [TASK-NNN] Title` headings — one section per
    // task that introduced architecture decisions. The split parser must
    // extract "TASK-NNN" as the id, not treat the whole heading as title.
    const raw = `# Architecture Decisions\n\n### [TASK-004] Structured Logging Module\n\nFirst body.\n\n### [TASK-029] Logging Refactor\n\nSecond body.\n`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "### [TASK-",
      collection: "decisions",
    }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("TASK-004");
    expect(result[0].title).toBe("Structured Logging Module");
    expect(result[0].sectionKey).toBe("TASK-004");
    expect(result[1].id).toBe("TASK-029");
  });

  it("discards preamble before first match", async () => {
    const raw = `---\ntopics:\n  - x\n---\n\n# Intro\n\nThis is preamble.\n\n## DD-01: Real section\n\nReal content.`;
    const result = await splitParser.parse(makeInput(raw, {
      parser: "split",
      split_on: "## DD-",
    }));
    expect(result).toHaveLength(1);
    expect(result[0].content).not.toContain("preamble");
    expect(result[0].content).toContain("Real content");
  });
});

// ─── Table parser ──────────────────────────────────────────────────────────

describe("tableParser", () => {
  it("parses a simple table into sections", async () => {
    const raw = `# Glossary

| Term | Definition |
|------|-----------|
| **Node** | A physical server. |
| **Pool** | A group of nodes. |
`;
    const result = await tableParser.parse(makeInput(raw, {
      parser: "table",
      collection: "terms",
    }));
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Node");
    expect(result[0].content).toBe("A physical server.");
    expect(result[0].collection).toBe("terms");
    expect(result[1].title).toBe("Pool");
  });

  it("groups by heading when group_by_heading is set", async () => {
    const raw = `# Glossary

## Infrastructure

| Term | Definition |
|------|-----------|
| **Node** | A server. |

## Game Servers

| Term | Definition |
|------|-----------|
| **Server** | A game instance. |
`;
    const result = await tableParser.parse(makeInput(raw, {
      parser: "table",
      collection: "terms",
      group_by_heading: true,
    }));
    expect(result).toHaveLength(2);
    expect(result[0].frontmatter.category).toBe("Infrastructure");
    expect(result[1].frontmatter.category).toBe("Game Servers");
  });

  it("handles tables without bold formatting on terms", async () => {
    const raw = `| Term | Definition |
|------|-----------|
| Node | A server. |
`;
    const result = await tableParser.parse(makeInput(raw, {
      parser: "table",
      collection: "terms",
    }));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Node");
  });

  it("returns empty array for file without tables", async () => {
    const raw = `# Just prose\n\nNo tables here.`;
    const result = await tableParser.parse(makeInput(raw, {
      parser: "table",
      collection: "terms",
    }));
    expect(result).toHaveLength(0);
  });
});
