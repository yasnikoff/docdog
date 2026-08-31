/**
 * PROPOSAL-039 — the plan-file round trip for `docdog split`.
 * PROPOSAL-045 — the plan file as the *only* executor: `output: files |
 * records` in the header, `parent_id` optional, and `--on` / `--depth`
 * demoted from actors to pre-population selectors.
 *
 * The acceptance criteria, one describe block each: the outline and descent
 * diagnostic, the emitted plan, the validator (which is the whole point —
 * a boundary the tool did not emit must be a hard error), and apply.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildOutline,
  computeDescent,
  derivedChildId,
  describeNextSteps,
  parsePlanDocument,
  renderPlanDocument,
  validatePlan,
  SplitPlanError,
  SPLIT_PLAN_VERSION,
} from "../../src/engine/split-plan.js";
import {
  applyPlan,
  inspectFile,
  planForFile,
  selectBoundaries,
  describeSelector,
} from "../../src/engine/ingest.js";
import { parse as parseMarkdown } from "../../src/markdown/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "docdog-split-plan-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DOC = `---
id: DD-900
title: "A decision with parts"
collection: decisions
---

# DD-900: a decision with parts

Framing prose that belongs to the parent.

## Context

Why this came up.

### A nested heading

Detail under Context.

## Decision

What was decided.

\`\`\`md
## Not a heading

This lives inside a fence.
\`\`\`

## Consequences

What follows.
`;

/** A foreign document: no frontmatter, so no id, so `output: files` by
 * default — the bulk-ingest case `planForFile` used to refuse outright. */
const FOREIGN = `# Architecture Decisions

Cross-cutting decisions, one per section.

## DD-ARCH-01: Storage

Storage body.

## Rationale

A non-matching sibling.

## DD-ARCH-02: Execution

Execution body.

### FR-01: A requirement

A different cohort entirely.
`;

function write(name: string, content: string): string {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
  return path;
}

// ─── outline + descent ──────────────────────────────────────────────────────

describe("buildOutline", () => {
  it("numbers every heading and sizes the section it owns", () => {
    const outline = buildOutline(parseMarkdown(DOC));
    expect(outline.map(e => [e.n, e.depth, e.text])).toEqual([
      [1, 1, "DD-900: a decision with parts"],
      [2, 2, "Context"],
      [3, 3, "A nested heading"],
      [4, 2, "Decision"],
      [5, 2, "Consequences"],
    ]);
  });

  it("does not see heading-shaped lines inside a fenced code block", () => {
    const outline = buildOutline(parseMarkdown(DOC));
    expect(outline.some(e => e.text === "Not a heading")).toBe(false);
  });

  it("marks a section a leaf when no heading nests inside it", () => {
    const outline = buildOutline(parseMarkdown(DOC));
    expect(outline.find(e => e.text === "Context")!.leaf).toBe(false);
    expect(outline.find(e => e.text === "Decision")!.leaf).toBe(true);
  });
});

describe("computeDescent", () => {
  const cap = 100;

  it("stops at the shallowest depth where every piece clears the cap", () => {
    const raw = [
      "# Top",
      "x".repeat(20),
      "## One",
      "### One a",
      "z".repeat(80),
      "### One b",
      "w".repeat(80),
    ].join("\n\n");
    const d = computeDescent(buildOutline(parseMarkdown(raw)), raw.length, cap);
    expect(d.levels.find(l => l.depth === 2)!.overCap).toBeGreaterThan(0);
    expect(d.suggested).toBe(3);
  });

  it("reports null when no depth breaks the document into pieces that fit", () => {
    const raw = ["# Top", "x".repeat(500)].join("\n\n");
    const d = computeDescent(buildOutline(parseMarkdown(raw)), raw.length, cap);
    expect(d.suggested).toBeNull();
  });

  it("names over-cap sections with no subheading to descend into", () => {
    const raw = ["# Top", "a", "## Big", "x".repeat(500), "## Small", "b"].join("\n\n");
    const d = computeDescent(buildOutline(parseMarkdown(raw)), raw.length, cap);
    expect(d.overCapLeaves.map(e => e.text)).toEqual(["Big"]);
  });

  it("counts the preamble as a piece — a parent over the cap is not fixed by descending", () => {
    const raw = ["# Top", "x".repeat(500), "## One", "a", "## Two", "b"].join("\n\n");
    const d = computeDescent(buildOutline(parseMarkdown(raw)), raw.length, cap);
    expect(d.levels.find(l => l.depth === 2)!.overCap).toBe(1);
    expect(d.suggested).toBeNull();
  });
});

// ─── selectors (PROPOSAL-045 §1) ────────────────────────────────────────────
//
// A rule nominates boundaries and stops. These pin the nomination itself;
// the CLI wiring and the two-command error live in ingest.test.ts.

describe("selectBoundaries", () => {
  const outline = buildOutline(parseMarkdown(FOREIGN));

  it("returns null with no selector, so the renderer falls back to descent", () => {
    expect(selectBoundaries(outline, {})).toBeNull();
  });

  it("selects exactly the matching headings, in document order", () => {
    const s = selectBoundaries(outline, { on: ["## DD-"] })!;
    expect(s.entries.map(e => e.text)).toEqual(["DD-ARCH-01: Storage", "DD-ARCH-02: Execution"]);
  });

  // PROPOSAL-045 acceptance 2 — the predicate has been `matchesAnyPattern`
  // over an array since PROPOSAL-034; only the CLI passed one element.
  it("unions two cohorts across repeated patterns, still in document order", () => {
    const s = selectBoundaries(outline, { on: ["## DD-", "### FR-"] })!;
    expect(s.entries.map(e => e.text)).toEqual([
      "DD-ARCH-01: Storage",
      "DD-ARCH-02: Execution",
      "FR-01: A requirement",
    ]);
  });

  it("distinguishes depth — `## DD-` does not reach an H3", () => {
    const s = selectBoundaries(outline, { on: ["### FR-"] })!;
    expect(s.entries.map(e => e.text)).toEqual(["FR-01: A requirement"]);
  });

  it("takes every heading of a depth whatever its text", () => {
    const s = selectBoundaries(outline, { depth: 2 })!;
    expect(s.entries.map(e => e.text)).toEqual([
      "DD-ARCH-01: Storage",
      "Rationale",
      "DD-ARCH-02: Execution",
    ]);
  });

  it("returns an empty selection rather than null when nothing matches", () => {
    expect(selectBoundaries(outline, { on: ["## NOPE-"] })!.entries).toEqual([]);
  });

  it("describes a selector the way the header and the error text print it", () => {
    expect(describeSelector(["## DD-"], undefined)).toBe('"## DD-"');
    expect(describeSelector(["## DD-", "### FR-"], undefined)).toBe('"## DD-" / "### FR-"');
    expect(describeSelector(undefined, 3)).toBe("every H3 heading");
  });
});

// ─── emit ───────────────────────────────────────────────────────────────────

describe("renderPlanDocument", () => {
  // Sized so that H1 leaves one piece over the cap and H2 does not, which is
  // what makes descent land on the three H2 sections.
  function render(cap = 200) {
    const doc = parseMarkdown(DOC);
    const outline = buildOutline(doc);
    return renderPlanDocument({
      source: "specs/dd-900.md",
      parentId: "DD-900",
      output: "records",
      collection: "decisions",
      outline,
      descent: computeDescent(outline, DOC.length, cap),
    });
  }

  it("emits every heading with depth and char count, as comments", () => {
    const text = render();
    for (const heading of ["Context", "A nested heading", "Decision", "Consequences"]) {
      expect(text).toContain(heading);
    }
    // The outline is derivable from the source, so it is documentation and
    // not data — apply-plan recomputes it.
    const parsed = parseYaml(text) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "collection",
      "output",
      "parent_id",
      "sections",
      "source",
      "version",
    ]);
  });

  it("marks descent's depth as advisory rather than as a decision", () => {
    expect(render()).toContain("not a boundary decision");
  });

  it("pre-populates sections with empty descriptions, so an unreviewed plan is refused", () => {
    const plan = parsePlanDocument(render());
    expect(plan.sections.every(s => s.description === "")).toBe(true);
    expect(plan.sections.map(s => s.id)).toEqual(["DD-900-01", "DD-900-02", "DD-900-03"]);
  });

  it("round-trips: what it emits, it eats", () => {
    const plan = parsePlanDocument(render());
    expect(plan.version).toBe(SPLIT_PLAN_VERSION);
    expect(plan.source).toBe("specs/dd-900.md");
    expect(plan.output).toBe("records");
    expect(plan.parentId).toBe("DD-900");
    expect(plan.sections.map(s => s.at)).toEqual(["Context", "Decision", "Consequences"]);
  });

  it("emits an empty section list when no depth fits, rather than guessing one", () => {
    const raw = ["---", "id: X-1", "collection: notes", "---", "", "# Top", "x".repeat(500)].join("\n");
    const outline = buildOutline(parseMarkdown(raw));
    const text = renderPlanDocument({
      source: "x.md",
      parentId: "X-1",
      output: "records",
      collection: "notes",
      outline,
      descent: computeDescent(outline, raw.length, 100),
    });
    expect(parsePlanDocument(text).sections).toEqual([]);
  });

  // ── output: files ──

  function renderFiles(selection?: { on?: string[]; depth?: number }) {
    const outline = buildOutline(parseMarkdown(FOREIGN));
    return renderPlanDocument({
      source: "specs/architecture.md",
      parentId: null,
      output: "files",
      collection: "decisions",
      outline,
      descent: computeDescent(outline, FOREIGN.length),
      selection: selection ? selectBoundaries(outline, selection) ?? undefined : undefined,
    });
  }

  it("omits parent_id entirely under output: files", () => {
    const parsed = parseYaml(renderFiles()) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "collection",
      "output",
      "sections",
      "source",
      "version",
    ]);
    expect(parsePlanDocument(renderFiles()).parentId).toBeNull();
  });

  it("fills id and title from the heading text under output: files", () => {
    const plan = parsePlanDocument(renderFiles({ on: ["## DD-"] }));
    expect(plan.sections.map(s => [s.id, s.title])).toEqual([
      ["DD-ARCH-01", "Storage"],
      ["DD-ARCH-02", "Execution"],
    ]);
  });

  it("emits an empty id for a heading with no id shape — meaning no id key", () => {
    const plan = parsePlanDocument(renderFiles({ depth: 2 }));
    expect(plan.sections.map(s => [s.id, s.title])).toEqual([
      ["DD-ARCH-01", "Storage"],
      ["", "Rationale"],
      ["DD-ARCH-02", "Execution"],
    ]);
  });

  it("keeps the raw heading text as title under output: records, unchanged", () => {
    expect(parsePlanDocument(render()).sections.map(s => s.title)).toEqual([
      "Context",
      "Decision",
      "Consequences",
    ]);
  });

  it("prints what output: means either way — a visible default, not an inference", () => {
    expect(render()).toContain("output: records — each boundary becomes a child record");
    expect(renderFiles()).toContain("output: files — each boundary becomes a sibling file");
  });

  it("says which selector pre-populated the boundaries", () => {
    expect(renderFiles({ on: ["## DD-"] })).toContain('pre-populated by "## DD-"');
    expect(renderFiles({ on: ["## DD-"] })).toContain("A selector nominates; it does not decide");
  });

  // PROPOSAL-045 acceptance 1: a selector overrides descent's depth entirely.
  it("pre-populates the selector's boundaries instead of descent's depth", () => {
    const withSelector = parsePlanDocument(renderFiles({ on: ["### FR-"] }));
    expect(withSelector.sections.map(s => s.at)).toEqual(["FR-01: A requirement"]);
    const withoutSelector = parsePlanDocument(renderFiles());
    expect(withoutSelector.sections.map(s => s.at)).not.toEqual(["FR-01: A requirement"]);
  });
});

describe("derivedChildId", () => {
  it("zero-pads from the parent", () => {
    expect(derivedChildId("DD-070", 1)).toBe("DD-070-01");
    expect(derivedChildId("DD-070", 12)).toBe("DD-070-12");
  });
});

// ─── parse ──────────────────────────────────────────────────────────────────

describe("parsePlanDocument", () => {
  const good = `version: 2
source: a.md
output: records
parent_id: DD-900
collection: decisions
sections:
  - heading: 2
    at: Context
    id: DD-900-01
    title: Context
    description: Why this came up.
`;

  it("accepts a well-formed plan", () => {
    expect(parsePlanDocument(good).sections).toHaveLength(1);
  });

  it("refuses an unknown version rather than guessing what a row means", () => {
    expect(() => parsePlanDocument(good.replace("version: 2", "version: 99"))).toThrow(
      /Unsupported plan-file version/,
    );
  });

  // A version-1 plan has no `output:` at all, so the bump is what stops it
  // being read as though it did.
  it("refuses a version-1 plan outright rather than defaulting its output", () => {
    expect(() => parsePlanDocument(good.replace("version: 2", "version: 1"))).toThrow(
      /Unsupported plan-file version/,
    );
  });

  it("refuses a missing output — it decides whether the source survives", () => {
    expect(() => parsePlanDocument(good.replace("output: records\n", ""))).toThrow(
      /"output" is null/,
    );
  });

  it("refuses an unrecognized output rather than guessing", () => {
    expect(() => parsePlanDocument(good.replace("output: records", "output: recrods"))).toThrow(
      /"output" is "recrods"/,
    );
  });

  it("refuses a typo'd key — a typo that parses is the expensive kind", () => {
    expect(() => parsePlanDocument(good.replace("description:", "descriptoin:"))).toThrow(
      /unknown key "descriptoin"/,
    );
  });

  it("reports every problem at once, not one per run", () => {
    const bad = `version: 2
source: a.md
output: records
parent_id: DD-900
collection: decisions
sections:
  - heading: 0
    at: ""
    id: ""
    title: ""
    description: x
`;
    try {
      parsePlanDocument(bad);
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/4 problems/);
      expect(message).toMatch(/nothing was applied/);
    }
  });

  it("carries its error code", () => {
    try {
      parsePlanDocument("version: 2\noutput: records\n");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SplitPlanError);
      expect((err as SplitPlanError).code).toBe("INVALID_PLAN");
    }
  });

  // ── the two relaxations, scoped to files mode (PROPOSAL-045 §2) ──

  const filesPlan = (section: string) =>
    `version: 2\nsource: a.md\noutput: files\ncollection: decisions\nsections:\n${section}`;

  it("accepts an empty id under output: files — it means no id key", () => {
    const plan = parsePlanDocument(
      filesPlan(`  - heading: 2\n    at: Rationale\n    id: ""\n    title: Rationale\n    description: ""\n`),
    );
    expect(plan.sections[0].id).toBe("");
    expect(plan.parentId).toBeNull();
  });

  it("accepts an absent id key under output: files", () => {
    const plan = parsePlanDocument(
      filesPlan(`  - heading: 2\n    at: Rationale\n    title: Rationale\n`),
    );
    expect(plan.sections[0].id).toBe("");
    expect(plan.sections[0].description).toBe("");
  });

  it("still requires an id under output: records — part_of needs both ends", () => {
    expect(() => parsePlanDocument(good.replace("id: DD-900-01", 'id: ""'))).toThrow(
      /"id" is required under output: records/,
    );
  });

  it("refuses a missing parent_id under output: records", () => {
    expect(() => parsePlanDocument(good.replace("parent_id: DD-900\n", ""))).toThrow(
      /"parent_id" is required under output: records/,
    );
  });

  it("tolerates a leftover parent_id under output: files — flipping output is one edit", () => {
    const plan = parsePlanDocument(
      `version: 2\nsource: a.md\noutput: files\nparent_id: DD-900\ncollection: decisions\n` +
        `sections:\n  - heading: 2\n    at: Rationale\n    id: ""\n    title: Rationale\n`,
    );
    expect(plan.output).toBe("files");
    expect(plan.parentId).toBe("DD-900");
  });
});

// ─── validate ───────────────────────────────────────────────────────────────

describe("validatePlan", () => {
  const outline = buildOutline(parseMarkdown(DOC));

  function plan(sections: unknown[], header = "output: records\nparent_id: DD-900\n") {
    return parsePlanDocument(
      `version: 2\nsource: a.md\n${header}collection: decisions\nsections:\n` +
        (sections as string[]).join(""),
    );
  }

  const entry = (heading: number, at: string, id: string, description = "d") =>
    `  - heading: ${heading}\n    at: ${JSON.stringify(at)}\n    id: ${JSON.stringify(id)}\n    title: t\n    description: ${JSON.stringify(description)}\n`;

  it("accepts boundaries the tool emitted", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Context", "DD-900-01")]), outline, "DD-900"),
    ).not.toThrow();
  });

  it("refuses a boundary that is not a heading in the source", () => {
    expect(() =>
      validatePlan(plan([entry(99, "Invented", "DD-900-01")]), outline, "DD-900"),
    ).toThrow(/heading 99 is not in/);
  });

  it("refuses an `at:` that no longer matches its ordinal — a stale plan is caught, not applied", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Decision", "DD-900-01")]), outline, "DD-900"),
    ).toThrow(/but the plan says/);
  });

  // PROPOSAL-045 acceptance 10: the echo is verified on BOTH output modes.
  it("verifies the `at:` echo under output: files too", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Decision", "X-01")], "output: files\n"), outline, null),
    ).toThrow(/but the plan says/);
  });

  it("refuses an empty description unless told otherwise", () => {
    const p = plan([entry(2, "Context", "DD-900-01", "")]);
    expect(() => validatePlan(p, outline, "DD-900")).toThrow(/description is empty/);
    expect(() =>
      validatePlan(p, outline, "DD-900", { allowEmptyDescription: true }),
    ).not.toThrow();
  });

  // PROPOSAL-045 acceptance 6: relaxation 1, scoped to files mode. A
  // files-mode child is the artifact pattern mode writes today, which carries
  // no description at all, and nothing declares part_of it.
  it("accepts an empty description under output: files, with no override", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Context", "X-01", "")], "output: files\n"), outline, null),
    ).not.toThrow();
  });

  it("accepts several empty ids under output: files — they are not a collision", () => {
    expect(() =>
      validatePlan(
        plan([entry(2, "Context", "", ""), entry(4, "Decision", "", "")], "output: files\n"),
        outline,
        null,
      ),
    ).not.toThrow();
  });

  it("refuses boundaries out of source order", () => {
    expect(() =>
      validatePlan(
        plan([entry(4, "Decision", "DD-900-01"), entry(2, "Context", "DD-900-02")]),
        outline,
        "DD-900",
      ),
    ).toThrow(/must be in source order/);
  });

  it("refuses duplicate ids and ids colliding with the parent", () => {
    expect(() =>
      validatePlan(
        plan([entry(2, "Context", "DD-900-01"), entry(4, "Decision", "DD-900-01")]),
        outline,
        "DD-900",
      ),
    ).toThrow(/used by more than one section/);
    expect(() =>
      validatePlan(plan([entry(2, "Context", "DD-900")]), outline, "DD-900"),
    ).toThrow(/collides with the parent/);
  });

  it("refuses a parent_id that disagrees with the file, rather than guessing", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Context", "DD-900-01")]), outline, "DD-901"),
    ).toThrow(/refusing rather than guessing/);
  });

  it("refuses a parent with no id at all — part_of needs a target", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Context", "DD-900-01")]), outline, null),
    ).toThrow(/declares no id/);
  });

  // PROPOSAL-045 acceptance 7: the same source, with no id, applies under
  // files. That one line was what blocked the unified path from covering the
  // ingest case at all.
  it("accepts a source with no id at all under output: files", () => {
    expect(() =>
      validatePlan(plan([entry(2, "Context", "X-01", "")], "output: files\n"), outline, null),
    ).not.toThrow();
  });

  it("ignores a leftover parent_id under output: files, including id collisions with it", () => {
    expect(() =>
      validatePlan(
        plan([entry(2, "Context", "DD-900", "")], "output: files\nparent_id: DD-900\n"),
        outline,
        "DD-900",
      ),
    ).not.toThrow();
  });
});

// ─── apply ──────────────────────────────────────────────────────────────────

describe("applyPlan", () => {
  function setup(sections: string, source = DOC) {
    write("specs/dd-900.md", source);
    const planPath = write(
      "plan.yaml",
      `version: 2\nsource: specs/dd-900.md\noutput: records\nparent_id: DD-900\ncollection: decisions\nsections:\n${sections}`,
    );
    return planPath;
  }

  const THREE =
    `  - heading: 2\n    at: Context\n    id: DD-900-01\n    title: Context\n    description: Why it came up.\n` +
    `  - heading: 4\n    at: Decision\n    id: DD-900-02\n    title: Decision\n    description: What was decided.\n` +
    `  - heading: 5\n    at: Consequences\n    id: DD-900-03\n    title: Consequences\n    description: What follows.\n`;

  it("writes one child per boundary, each declaring part_of the parent", () => {
    const planPath = setup(THREE);
    const result = applyPlan({ planFile: planPath, projectRoot: dir });

    expect(result.output).toBe("records");
    expect(result.children.map(c => c.id)).toEqual(["DD-900-01", "DD-900-02", "DD-900-03"]);
    const child = readFileSync(result.children[0].path, "utf-8");
    expect(child).toContain("part_of: DD-900");
    expect(child).toContain("description: Why it came up.");
    expect(child).toContain("collection: decisions");
  });

  it("writes no edge into the parent — the roster is prose (DD-072)", () => {
    const planPath = setup(THREE);
    applyPlan({ planFile: planPath, projectRoot: dir });
    const parent = readFileSync(join(dir, "specs", "dd-900.md"), "utf-8");
    expect(parent).not.toContain("relationships:");
    expect(parent).not.toContain("part_of");
    expect(parent).toContain("## Sections");
    expect(parent).toContain("`DD-900-01`");
  });

  it("leaves the parent its frontmatter and its framing prose", () => {
    const planPath = setup(THREE);
    applyPlan({ planFile: planPath, projectRoot: dir });
    const parent = readFileSync(join(dir, "specs", "dd-900.md"), "utf-8");
    expect(parent).toContain("id: DD-900");
    expect(parent).toContain("Framing prose that belongs to the parent.");
    expect(parent).not.toContain("Why this came up.");
  });

  it("loses nothing: preamble plus every child body reconstructs the source", () => {
    const planPath = setup(THREE);
    const result = applyPlan({ planFile: planPath, projectRoot: dir });
    const bodies = result.children
      .map(c => readFileSync(c.path, "utf-8").split("\n---\n")[1])
      .join("");
    // The fenced block lived inside Decision; boundaries partition, so it is
    // in exactly one child and not lost between them.
    expect(bodies).toContain("This lives inside a fence.");
    expect(bodies).toContain("Detail under Context.");
    expect(bodies).toContain("What follows.");
  });

  it("merges a section into the one above it when its entry is deleted", () => {
    const planPath = setup(
      `  - heading: 2\n    at: Context\n    id: DD-900-01\n    title: Context\n    description: d\n`,
    );
    const result = applyPlan({ planFile: planPath, projectRoot: dir });
    expect(result.children).toHaveLength(1);
    const only = readFileSync(result.children[0].path, "utf-8");
    expect(only).toContain("What was decided.");
    expect(only).toContain("What follows.");
  });

  it("writes nothing at all when validation fails", () => {
    const planPath = setup(
      `  - heading: 99\n    at: Nope\n    id: DD-900-01\n    title: t\n    description: d\n`,
    );
    expect(() => applyPlan({ planFile: planPath, projectRoot: dir })).toThrow(SplitPlanError);
    expect(existsSync(join(dir, "specs", "dd-900"))).toBe(false);
    expect(readFileSync(join(dir, "specs", "dd-900.md"), "utf-8")).toBe(DOC);
  });

  it("refuses to overwrite an existing child without --force, before writing any of them", () => {
    const planPath = setup(THREE);
    write("specs/dd-900/dd-900-02-decision.md", "existing");
    expect(() => applyPlan({ planFile: planPath, projectRoot: dir })).toThrow(/already exists/);
    expect(existsSync(join(dir, "specs", "dd-900", "dd-900-01-context.md"))).toBe(false);
    expect(readFileSync(join(dir, "specs", "dd-900.md"), "utf-8")).toBe(DOC);
  });

  it("--dry-run reports and touches nothing", () => {
    const planPath = setup(THREE);
    const result = applyPlan({ planFile: planPath, projectRoot: dir, dryRun: true });
    expect(result.children).toHaveLength(3);
    expect(existsSync(join(dir, "specs", "dd-900"))).toBe(false);
    expect(readFileSync(join(dir, "specs", "dd-900.md"), "utf-8")).toBe(DOC);
  });

  it("reports a child still over the embed cap rather than cutting it further", () => {
    const big = DOC.replace("What was decided.", "x".repeat(9000));
    const planPath = setup(THREE, big);
    const result = applyPlan({ planFile: planPath, projectRoot: dir });
    expect(result.overCap.map(c => c.id)).toEqual(["DD-900-02"]);
  });

  // ── scan_paths coverage ──
  // The children land in `specs/dd-900/`. A directory entry recurses and
  // covers them; a file-level entry for the parent does not, and that case
  // fails silently without this report.
  const writeConfig = (scanPaths: string) =>
    write(".docdog/config.yaml", `project:\n  name: t\nscan_paths:\n${scanPaths}`);

  it("reports which scan_paths entry covers the children", () => {
    writeConfig("  - specs/\n");
    const result = applyPlan({ planFile: setup(THREE), projectRoot: dir });
    expect(result.coverage.coveredBy).toBe("specs/");
    expect(result.coverage.added).toBe(false);
  });

  it("reports the uncovered case — a file-level entry does not reach a subdirectory", () => {
    writeConfig("  - specs/dd-900.md\n");
    const result = applyPlan({ planFile: setup(THREE), projectRoot: dir });
    expect(result.coverage.coveredBy).toBeNull();
    expect(result.coverage.path).toBe("specs/dd-900");
  });

  it("--update-config adds the output dir and keeps the parent's own entry", () => {
    const configPath = writeConfig("  - specs/dd-900.md\n");
    const result = applyPlan({ planFile: setup(THREE), projectRoot: dir, updateConfig: true });

    expect(result.coverage.added).toBe(true);
    expect(result.coverage.removed).toBe(0);
    const scanPaths = (parseYaml(readFileSync(configPath, "utf-8")) as { scan_paths: string[] })
      .scan_paths;
    // Additive only: removing the parent's entry would un-index a live record
    // that every child now declares part_of (DISC-035).
    expect(scanPaths).toContain("specs/dd-900.md");
    expect(scanPaths).toContain("specs/dd-900/");
  });

  it("--update-config writes nothing when an entry already covers the children", () => {
    const configPath = writeConfig("  - specs/\n");
    const before = readFileSync(configPath, "utf-8");
    const result = applyPlan({ planFile: setup(THREE), projectRoot: dir, updateConfig: true });
    expect(result.coverage.added).toBe(false);
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("--dry-run never edits the config, even with --update-config", () => {
    const configPath = writeConfig("  - specs/dd-900.md\n");
    const before = readFileSync(configPath, "utf-8");
    const result = applyPlan({
      planFile: setup(THREE),
      projectRoot: dir,
      updateConfig: true,
      dryRun: true,
    });
    expect(result.coverage.added).toBe(false);
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("reports no config path at all when the project has no config file", () => {
    const result = applyPlan({ planFile: setup(THREE), projectRoot: dir });
    expect(result.coverage.configPath).toBeNull();
    expect(result.coverage.coveredBy).toBeNull();
  });
});

// ─── the file-level entry points ────────────────────────────────────────────

describe("inspectFile / planForFile", () => {
  it("inspect reports structure without writing", () => {
    const path = write("a.md", DOC);
    const { outline, descent, parentId, collection } = inspectFile(path);
    expect(outline).toHaveLength(5);
    expect(parentId).toBe("DD-900");
    expect(collection).toBe("decisions");
    expect(descent.cap).toBe(8000);
  });

  it("defaults to output: records when the source declares an id", () => {
    const path = write("a.md", DOC);
    expect(planForFile(path, dir)).toContain("output: records");
    expect(planForFile(path, dir)).toContain("parent_id: DD-900");
  });

  // PROPOSAL-045 §2: the default is the *visible* kind — printed, and
  // overridable — not an inference the reader has to reconstruct.
  it("defaults to output: files when the source declares no id", () => {
    const path = write("b.md", FOREIGN);
    const text = planForFile(path, dir, { collection: "decisions" });
    expect(text).toContain("output: files");
    expect(parsePlanDocument(text).output).toBe("files");
    expect(parsePlanDocument(text).parentId).toBeNull();
  });

  it("refuses output: records on a source with no id, and names the alternative", () => {
    const path = write("b.md", FOREIGN);
    expect(() => planForFile(path, dir, { collection: "d", output: "records" })).toThrow(
      /declares no id/,
    );
    expect(() => planForFile(path, dir, { collection: "d", output: "records" })).toThrow(
      /output: files/,
    );
  });

  it("planForFile takes the collection from frontmatter, and --collection overrides it", () => {
    const path = write("c.md", DOC);
    expect(planForFile(path, dir)).toContain("collection: decisions");
    expect(planForFile(path, dir, { collection: "notes" })).toContain("collection: notes");
  });

  it("refuses a source with no collection anywhere", () => {
    const path = write("d.md", FOREIGN);
    expect(() => planForFile(path, dir)).toThrow(/declares no collection/);
  });

  // PROPOSAL-045 acceptance 4, first half: a selector that matched nothing is
  // a failed *request*, not a fact about the document.
  it("refuses a selector that matches nothing rather than emitting an empty plan", () => {
    const path = write("e.md", FOREIGN);
    try {
      planForFile(path, dir, { collection: "decisions", on: ["## NOPE-"] });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SplitPlanError);
      expect((err as SplitPlanError).code).toBe("NO_MATCHES");
      expect((err as Error).message).toMatch(/No headings in .* match "## NOPE-"/);
    }
  });

  // Second half: no selector and no fitting depth is a fact, so it still
  // emits `sections: []` with the explanation in comments.
  it("still emits an empty section list when descent finds no depth and no selector was given", () => {
    const raw = `---\nid: X-1\ncollection: notes\n---\n\n# Top\n\n${"x".repeat(20000)}\n`;
    const path = write("f.md", raw);
    const text = planForFile(path, dir);
    expect(parsePlanDocument(text).sections).toEqual([]);
    expect(text).toContain("No heading depth breaks this document into pieces that all fit");
  });

  it("round-trips a selector-pre-populated plan through parse", () => {
    const path = write("g.md", FOREIGN);
    const plan = parsePlanDocument(
      planForFile(path, dir, { collection: "decisions", on: ["## DD-", "### FR-"] }),
    );
    expect(plan.output).toBe("files");
    expect(plan.sections.map(s => s.at)).toEqual([
      "DD-ARCH-01: Storage",
      "DD-ARCH-02: Execution",
      "FR-01: A requirement",
    ]);
  });
});

describe("describeNextSteps (the report's suggested commands must actually run)", () => {
  const emit = (lines: string[]) => lines.find(l => l.startsWith("Emit a plan:"))!;

  it("names --collection when the source declares none", () => {
    // The regression this seam exists for: a foreign document is exactly the
    // case with no `collection:`, and it is the case this whole path serves.
    const line = emit(describeNextSteps("foreign.md", { parentId: null, collection: null }));
    expect(line).toContain("--collection <name>");
    expect(line).toBe("Emit a plan:  docdog split foreign.md --format plan --collection <name> > plan.yaml");
  });

  it("omits --collection when the source declares one", () => {
    const line = emit(describeNextSteps("rec.md", { parentId: "TEST-001", collection: "notes" }));
    expect(line).not.toContain("--collection");
  });

  it("puts --collection before the redirect, not after", () => {
    // A flag after `>` is an argument to the shell, not to docdog.
    const line = emit(describeNextSteps("foreign.md", { parentId: null, collection: null }));
    expect(line.indexOf("--collection")).toBeLessThan(line.indexOf(">"));
  });

  it("explains why the flag is there", () => {
    const lines = describeNextSteps("foreign.md", { parentId: null, collection: null });
    expect(lines.some(l => l.includes("declares no collection"))).toBe(true);
  });

  it("states the default output mode from the source's id", () => {
    const none = describeNextSteps("foreign.md", { parentId: null, collection: "notes" });
    expect(none.some(l => l.includes("`output: files`"))).toBe(true);
    const some = describeNextSteps("rec.md", { parentId: "TEST-001", collection: "notes" });
    expect(some.some(l => l.includes("`output: records`") && l.includes("TEST-001"))).toBe(true);
  });
});
