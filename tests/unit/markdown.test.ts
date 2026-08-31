/**
 * Unit tests for src/markdown/ — the remark/unified wrapper.
 * Fixtures live under tests/fixtures/markdown/.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parse,
  bodyAfterFrontmatter,
  findHeadings,
  findLinks,
  findTaskListItems,
  sectionsByHeading,
  firstHeading,
} from "../../src/markdown/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "markdown");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("markdown wrapper — parse + frontmatter", () => {
  it("parses vanilla DD record frontmatter and body", () => {
    const doc = parse(read("vanilla-dd-record.md"));
    expect(doc.frontmatter.id).toBe("DD-001");
    expect(doc.frontmatter.title).toBe("My Decision");
    expect(doc.frontmatter.collection).toBe("decisions");
    expect(doc.frontmatterEndOffset).toBeGreaterThan(0);

    const body = bodyAfterFrontmatter(doc);
    expect(body.startsWith("# My Decision")).toBe(true);
    expect(body).toContain("vanilla single-section");
  });

  it("returns empty frontmatter for file without one", () => {
    const doc = parse(read("no-frontmatter.md"));
    expect(doc.frontmatter).toEqual({});
    expect(doc.frontmatterEndOffset).toBe(0);
    expect(bodyAfterFrontmatter(doc)).toBe(doc.raw);
  });

  it("recovers from malformed frontmatter: empty object, body preserved", () => {
    const doc = parse(read("malformed-frontmatter.md"));
    expect(doc.frontmatter).toEqual({});
    // The fm fence is still recognized, so body comes after it.
    const body = bodyAfterFrontmatter(doc);
    expect(body).toContain("# Still Has A Body");
  });

  it("reports the parse failure instead of recovering silently (FRICTION-019)", () => {
    const doc = parse(read("malformed-frontmatter.md"));
    // Recovery stays — the body must still index. What changed is that the
    // failure now has a way out of here, so the indexer can warn about it.
    expect(doc.frontmatterError).toBeTruthy();
    expect(doc.frontmatterError).not.toContain("\n"); // first line only, no YAML code frame
  });

  it("reports no error for well-formed or absent frontmatter", () => {
    expect(parse(read("vanilla-dd-record.md")).frontmatterError).toBeNull();
    expect(parse(read("no-frontmatter.md")).frontmatterError).toBeNull();
  });

  it("reports frontmatter that parses to a non-map", () => {
    const doc = parse(`---\n- just\n- a list\n---\n\n# Body\n`);
    expect(doc.frontmatter).toEqual({});
    expect(doc.frontmatterError).toContain("does not parse to a map");
  });
});

describe("markdown wrapper — headings + links", () => {
  it("extracts first heading from no-frontmatter file", () => {
    const doc = parse(read("no-frontmatter.md"));
    const h = firstHeading(doc);
    expect(h).not.toBeNull();
    expect(h!.depth).toBe(1);
    expect(h!.text).toBe("Heading Title");
  });

  it("lists all headings with depth and offsets", () => {
    const doc = parse(read("architecture-split.md"));
    const headings = findHeadings(doc);
    expect(headings.map(h => [h.depth, h.text])).toEqual([
      [1, "Architecture Decisions"],
      [2, "DD-ARCH-01: First Decision"],
      [2, "DD-ARCH-02: Second Decision"],
      [2, "DD-ARCH-03: Third Decision"],
    ]);
    // Offsets must be monotonic and point into the source.
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i].startOffset).toBeGreaterThan(headings[i - 1].startOffset);
    }
  });

  it("extracts inline links", () => {
    const doc = parse(read("vanilla-dd-record.md"));
    const links = findLinks(doc);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com/spec");
    expect(links[0].text).toBe("link");
  });
});

describe("markdown wrapper — task list items (GFM)", () => {
  it("returns only checklist items, not plain bullets", () => {
    const doc = parse(read("gfm-tables-and-tasks.md"));
    const tasks = findTaskListItems(doc);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].checked).toBe(true);
    expect(tasks[0].text).toBe("already done");
    expect(tasks[1].checked).toBe(false);
    expect(tasks[1].text).toBe("still pending");
    expect(tasks[2].checked).toBe(false);
    expect(tasks[2].text).toContain("issue 42");
    // Plain bullet must not appear.
    expect(tasks.some(t => t.text === "plain item")).toBe(false);
  });
});

describe("markdown wrapper — sectionsByHeading", () => {
  it("slices architecture decisions by ## DD-ARCH- prefix", () => {
    const doc = parse(read("architecture-split.md"));
    const sections = sectionsByHeading(doc, h => h.depth === 2 && h.text.startsWith("DD-ARCH-"));
    expect(sections).toHaveLength(3);

    expect(sections[0].heading.text).toBe("DD-ARCH-01: First Decision");
    expect(sections[0].body).toContain("**Status:** current");
    expect(sections[0].body).toContain("Body of the first decision");
    // Must not bleed into DD-ARCH-02.
    expect(sections[0].body).not.toContain("Body of the second");

    expect(sections[1].heading.text).toBe("DD-ARCH-02: Second Decision");
    expect(sections[1].body).toContain("checklist item a");

    expect(sections[2].body).toContain("Body with no inline metadata");
  });

  it("is append-safe: pre-existing sections keep byte-identical bodies", () => {
    const before = read("backport-append-safe.md");
    const after = before + `\n## BACKPORT-041\n\n- **Task:** TASK-052\n\nNew body.\n`;

    const s1 = sectionsByHeading(
      parse(before),
      h => h.depth === 2 && h.text.startsWith("BACKPORT-"),
    );
    const s2 = sectionsByHeading(
      parse(after),
      h => h.depth === 2 && h.text.startsWith("BACKPORT-"),
    );

    expect(s1).toHaveLength(2);
    expect(s2).toHaveLength(3);
    expect(s2[0].body).toBe(s1[0].body);
    expect(s2[1].body).toBe(s1[1].body);
    expect(s2[2].heading.text).toBe("BACKPORT-041");
  });

  it("returns empty when no heading matches predicate", () => {
    const doc = parse(read("vanilla-dd-record.md"));
    const sections = sectionsByHeading(doc, h => h.text.startsWith("DD-ARCH-"));
    expect(sections).toHaveLength(0);
  });
});
