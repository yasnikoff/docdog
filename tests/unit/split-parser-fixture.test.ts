/**
 * Golden-file parity test for splitParser against the shared
 * markdown fixture collection (tests/fixtures/markdown/). Exercises
 * the real file shapes the wrapper migration was most likely to
 * perturb.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitParser } from "../../src/engine/parsers/split.js";
import type { ParseInput } from "../../src/engine/parsers/types.js";
import { defaultConfig } from "../../src/config/defaults.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "markdown");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

function makeInput(name: string, parserConfig: Partial<ParseInput["parserConfig"]>): ParseInput {
  return {
    absPath: `/test/${name}`,
    repoRelPath: name,
    raw: read(name),
    parserConfig: { path: name, parser: "split", ...parserConfig },
    projectConfig: defaultConfig,
    projectRoot: "/test",
  };
}

describe("splitParser — golden-file fixtures", () => {
  it("architecture-split.md: three DD-ARCH sections with inline metadata", async () => {
    const result = await splitParser.parse(makeInput("architecture-split.md", {
      split_on: "## DD-",
      collection: "decisions",
    }));

    expect(result).toHaveLength(3);

    expect(result[0].id).toBe("DD-ARCH-01");
    expect(result[0].title).toBe("First Decision");
    expect(result[0].sectionKey).toBe("DD-ARCH-01");
    expect(result[0].frontmatter.status).toBe("current");
    expect(result[0].frontmatter.date).toBe("2026-03-24");
    expect(result[0].content).toContain("Body of the first decision");
    expect(result[0].content).not.toContain("**Status:**");
    // Section must not bleed into the next.
    expect(result[0].content).not.toContain("Body of the second");

    expect(result[1].id).toBe("DD-ARCH-02");
    expect(result[1].frontmatter.status).toBe("superseded");
    expect(result[1].content).toContain("checklist item a");
    expect(result[1].content).toContain("checklist item b");

    expect(result[2].id).toBe("DD-ARCH-03");
    expect(result[2].frontmatter.status).toBeUndefined();
    expect(result[2].content).toContain("Body with no inline metadata");
  });

  it("bracket-task-headings.md: ### [TASK-NNN] form", async () => {
    const result = await splitParser.parse(makeInput("bracket-task-headings.md", {
      split_on: "### [TASK-",
      collection: "decisions",
    }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("TASK-004");
    expect(result[0].title).toBe("Structured Logging Module");
    expect(result[1].id).toBe("TASK-029");
  });

  it("backport-append-safe.md: sectionKeys stable across append", async () => {
    const before = read("backport-append-safe.md");
    const after = before + `\n## BACKPORT-041\n\n- **Task:** TASK-052\n\nNew body.\n`;
    const mk = (raw: string): ParseInput => ({
      absPath: "/test/backport-append-safe.md",
      repoRelPath: "backport-append-safe.md",
      raw,
      parserConfig: {
        path: "backport-append-safe.md",
        parser: "split",
        split_on: "## BACKPORT-",
        collection: "notes",
      },
      projectConfig: defaultConfig,
      projectRoot: "/test",
    });

    const r1 = await splitParser.parse(mk(before));
    const r2 = await splitParser.parse(mk(after));

    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(3);
    expect(r2[0].sectionKey).toBe(r1[0].sectionKey);
    expect(r2[1].sectionKey).toBe(r1[1].sectionKey);
    expect(r2[0].content).toBe(r1[0].content);
    expect(r2[1].content).toBe(r1[1].content);
    expect(r2[2].sectionKey).toBe("BACKPORT-041");
  });
});
