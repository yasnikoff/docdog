/**
 * Tests for the content-ops engine: the plan executor and stampFiles.
 * Exposed via the CLI as `docdog split` and `docdog add`.
 *
 * PROPOSAL-045 deleted `splitFile`. Everything the pattern-mode tests used to
 * pin is now pinned against `applyPlan` with `output: files` — and pinned
 * harder: the golden bytes in the first block were captured by running the
 * *old* `splitFile` on these exact fixtures, so criterion 5 ("reproduces
 * today's pattern-mode result byte-for-byte") is a comparison rather than a
 * claim.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  applyPlan,
  stampFiles,
  updateConfigAfterSplit,
  planForFile,
} from "../../src/engine/ingest.js";
import { SplitPlanError } from "../../src/engine/split-plan.js";
import { registerSplitCommand } from "../../src/cli/commands/split.js";

const TEST_DIR = join(process.cwd(), "tests", "fixtures", "ingest-test");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  process.exitCode = undefined;
});

// ─── applyPlan, output: files ──────────────────────────────────────────────
//
// The regression bar. Pattern mode's whole observable result — child
// filenames, frontmatter keys and their order, the `.index.md` written from
// the preamble, the deleted source, the absence of any edge — reproduced by
// the one executor.

const ARCH = `---
topics:
  - design
  - architecture
---

# Design Decisions: Architecture

> Cross-cutting architectural decisions.

## DD-ARCH-01: Core Abstraction Is Non-Negotiable

**Status:** current
**Date:** 2026-03-24
**Source:** context.md

All external concerns must sit behind interfaces/ports.

**Rationale:** Startup environment with frequently changing requirements.

## DD-ARCH-02: Execution Infrastructure Is Architect's Choice

**Status:** current
**Date:** 2026-03-24

The architect chooses the execution infrastructure.
`;

/** Write a source and a files-mode plan for it; return the plan's path. */
function filesPlan(
  name: string,
  source: string,
  sections: string,
  collection = "decisions",
): string {
  const src = join(TEST_DIR, `${name}.md`);
  writeFileSync(src, source, "utf-8");
  const planPath = join(TEST_DIR, `${name}.plan.yaml`);
  writeFileSync(
    planPath,
    `version: 2\nsource: ${name}.md\noutput: files\ncollection: ${collection}\nsections:\n${sections}`,
    "utf-8",
  );
  return planPath;
}

const ARCH_SECTIONS =
  `  - heading: 2\n    at: "DD-ARCH-01: Core Abstraction Is Non-Negotiable"\n` +
  `    id: DD-ARCH-01\n    title: Core Abstraction Is Non-Negotiable\n    description: ""\n` +
  `  - heading: 3\n    at: "DD-ARCH-02: Execution Infrastructure Is Architect's Choice"\n` +
  `    id: DD-ARCH-02\n    title: Execution Infrastructure Is Architect's Choice\n    description: ""\n`;

describe("applyPlan — output: files reproduces pattern mode byte-for-byte", () => {
  it("writes the same child files, frontmatter and .index.md, and deletes the source", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });

    expect(result.output).toBe("files");
    expect(result.parentId).toBeNull();
    expect(result.children.map(c => c.filename)).toEqual([
      "dd-arch-01-core-abstraction-is-non-negotiable.md",
      "dd-arch-02-execution-infrastructure-is-architect-s-choice.md",
    ]);

    const subdir = join(TEST_DIR, "architecture");
    // Golden bytes, captured from the pre-PROPOSAL-045 `splitFile`.
    expect(
      readFileSync(join(subdir, "dd-arch-01-core-abstraction-is-non-negotiable.md"), "utf-8"),
    ).toBe(
      "---\nid: DD-ARCH-01\ntitle: Core Abstraction Is Non-Negotiable\ncollection: decisions\n" +
        "status: current\ndate: 2026-03-24\n---\n\n# Core Abstraction Is Non-Negotiable\n\n" +
        "**Source:** context.md\n\nAll external concerns must sit behind interfaces/ports.\n\n" +
        "**Rationale:** Startup environment with frequently changing requirements.\n",
    );
    expect(
      readFileSync(
        join(subdir, "dd-arch-02-execution-infrastructure-is-architect-s-choice.md"),
        "utf-8",
      ),
    ).toBe(
      "---\nid: DD-ARCH-02\ntitle: Execution Infrastructure Is Architect's Choice\n" +
        "collection: decisions\nstatus: current\ndate: 2026-03-24\n---\n\n" +
        "# Execution Infrastructure Is Architect's Choice\n\n" +
        "The architect chooses the execution infrastructure.\n",
    );

    expect(readFileSync(join(TEST_DIR, "architecture.index.md"), "utf-8")).toBe(
      "---\ntopics:\n  - design\n  - architecture\n---\n\n# Design Decisions: Architecture\n\n" +
        "> Cross-cutting architectural decisions.\n\n" +
        "<!-- Sections split into ./architecture/ by docdog split -->\n",
    );

    // Source is retired, not rewritten in place — the `records` branch's move.
    expect(existsSync(join(TEST_DIR, "architecture.md"))).toBe(false);
    expect(result.indexFile).toBe(join(TEST_DIR, "architecture.index.md"));
  });

  it("mints no part_of and writes no relationships block at all (DD-072)", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });
    for (const child of result.children) {
      const text = readFileSync(child.path, "utf-8");
      expect(text).not.toContain("relationships:");
      expect(text).not.toContain("part_of");
    }
  });

  it("parses the [ID] Title bracket form into id + title slug", () => {
    const planPath = filesPlan(
      "tasks",
      `# Architecture Decisions\n\nPreamble.\n\n### [TASK-004] Structured Logging Module\n\n` +
        `First section body.\n\n### [TASK-029] Logging Three-Tier Refactor\n\nSecond section body.\n`,
      `  - heading: 2\n    at: "[TASK-004] Structured Logging Module"\n    id: TASK-004\n` +
        `    title: Structured Logging Module\n    description: ""\n` +
        `  - heading: 3\n    at: "[TASK-029] Logging Three-Tier Refactor"\n    id: TASK-029\n` +
        `    title: Logging Three-Tier Refactor\n    description: ""\n`,
    );
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });

    expect(result.children.map(c => c.filename)).toEqual([
      "task-004-structured-logging-module.md",
      "task-029-logging-three-tier-refactor.md",
    ]);
    expect(readFileSync(result.children[0].path, "utf-8")).toBe(
      "---\nid: TASK-004\ntitle: Structured Logging Module\ncollection: decisions\n---\n\n" +
        "# Structured Logging Module\n\nFirst section body.\n",
    );
    expect(readFileSync(join(TEST_DIR, "tasks.index.md"), "utf-8")).toBe(
      "# Architecture Decisions\n\nPreamble.\n\n<!-- Sections split into ./tasks/ by docdog split -->\n",
    );
  });

  it("writes no id key at all for a heading with no id shape", () => {
    const planPath = filesPlan(
      "mixed",
      `# Doc\n\nPreamble.\n\n## Design\n\nDesign body.\n\n### Nested\n\n` +
        `Nested body — belongs to Design, not its own section.\n\n## Rationale\n\nRationale body.\n`,
      `  - heading: 2\n    at: Design\n    id: ""\n    title: Design\n    description: ""\n` +
        `  - heading: 4\n    at: Rationale\n    id: ""\n    title: Rationale\n    description: ""\n`,
      "notes",
    );
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });

    expect(result.children.map(c => c.filename)).toEqual(["design.md", "rationale.md"]);
    expect(readFileSync(result.children[0].path, "utf-8")).toBe(
      "---\ntitle: Design\ncollection: notes\n---\n\n# Design\n\nDesign body.\n\n### Nested\n\n" +
        "Nested body — belongs to Design, not its own section.\n",
    );
  });

  it("carries a description into the child only when the reviewer wrote one", () => {
    const planPath = filesPlan(
      "described",
      `# Doc\n\nPre.\n\n## One\n\nBody one.\n`,
      `  - heading: 2\n    at: One\n    id: ""\n    title: One\n    description: What one is.\n`,
    );
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });
    expect(readFileSync(result.children[0].path, "utf-8")).toContain("description: What one is.");
  });

  it("respects a custom output directory, and still writes .index.md beside the source", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const custom = join(TEST_DIR, "custom-output");
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR, outputDir: custom });

    expect(result.outputDir).toBe(custom);
    expect(existsSync(join(custom, "dd-arch-01-core-abstraction-is-non-negotiable.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "architecture.index.md"))).toBe(true);
  });

  it("--dry-run computes the whole result and touches nothing", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR, dryRun: true });

    expect(result.children).toHaveLength(2);
    expect(existsSync(join(TEST_DIR, "architecture"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "architecture.index.md"))).toBe(false);
    expect(readFileSync(join(TEST_DIR, "architecture.md"), "utf-8")).toBe(ARCH);
  });
});

// ─── the three guards pattern mode was missing (PROPOSAL-045 §Problem 2) ────

describe("applyPlan — output: files inherits the guards pattern mode lacked", () => {
  // Criterion 8. `splitFile` wrote file-by-file with a `skipped` counter, so a
  // collision halfway left a half-written directory, an `.index.md`, and a
  // deleted source. Every write is now computed in memory first.
  it("writes nothing at all when a child would overwrite — no index, no deletion", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const subdir = join(TEST_DIR, "architecture");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(
      join(subdir, "dd-arch-02-execution-infrastructure-is-architect-s-choice.md"),
      "existing",
      "utf-8",
    );

    expect(() => applyPlan({ planFile: planPath, projectRoot: TEST_DIR })).toThrow(
      /already exists/,
    );

    // The first child would have been written under the old file-by-file loop.
    expect(existsSync(join(subdir, "dd-arch-01-core-abstraction-is-non-negotiable.md"))).toBe(false);
    expect(
      readFileSync(join(subdir, "dd-arch-02-execution-infrastructure-is-architect-s-choice.md"), "utf-8"),
    ).toBe("existing");
    expect(existsSync(join(TEST_DIR, "architecture.index.md"))).toBe(false);
    expect(readFileSync(join(TEST_DIR, "architecture.md"), "utf-8")).toBe(ARCH);
  });

  it("--force overwrites, and then writes everything", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const subdir = join(TEST_DIR, "architecture");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(
      join(subdir, "dd-arch-02-execution-infrastructure-is-architect-s-choice.md"),
      "existing",
      "utf-8",
    );

    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR, force: true });
    expect(result.children).toHaveLength(2);
    expect(existsSync(join(TEST_DIR, "architecture.md"))).toBe(false);
  });

  // Criterion 10, end to end: pattern mode re-derived boundaries at write time
  // and could not notice that the source had moved under it.
  it("refuses a plan whose `at:` no longer matches the source, and writes nothing", () => {
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    writeFileSync(
      join(TEST_DIR, "architecture.md"),
      ARCH.replace("## DD-ARCH-01: Core Abstraction Is Non-Negotiable", "## DD-ARCH-00: Renamed"),
      "utf-8",
    );

    expect(() => applyPlan({ planFile: planPath, projectRoot: TEST_DIR })).toThrow(
      /the source changed since the plan was emitted/,
    );
    expect(existsSync(join(TEST_DIR, "architecture"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "architecture.index.md"))).toBe(false);
  });

  // Criterion 9. Detection is unconditional on both modes because the failure
  // it catches — writes succeed, `docdog index` says nothing, the children are
  // simply not in the corpus — is silent on both.
  it("reports scan coverage even without --update-config", () => {
    mkdirSync(join(TEST_DIR, ".docdog"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".docdog", "config.yaml"),
      stringifyYaml({ scan_paths: ["architecture.md"] }),
      "utf-8",
    );
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });

    expect(result.coverage.coveredBy).toBeNull();
    expect(result.coverage.path).toBe("architecture");
    expect(result.coverage.added).toBe(false);
    expect(result.coverage.removed).toBe(0);
  });

  // The other coverage function, and the reason there are two: here the source
  // stops being a record, so its own entry must go with it.
  it("--update-config removes the retired source's entry and adds the output dir", () => {
    mkdirSync(join(TEST_DIR, ".docdog"), { recursive: true });
    const configPath = join(TEST_DIR, ".docdog", "config.yaml");
    writeFileSync(
      configPath,
      stringifyYaml({
        scan_paths: [
          { path: "architecture.md", parser: "split", split_on: "## DD-", collection: "decisions" },
        ],
      }),
      "utf-8",
    );
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR, updateConfig: true });

    expect(result.coverage.removed).toBe(1);
    expect(result.coverage.added).toBe(true);
    const scanPaths = (parseYaml(readFileSync(configPath, "utf-8")) as { scan_paths: unknown[] })
      .scan_paths;
    expect(scanPaths).toEqual(["architecture/"]);
  });

  it("--dry-run never edits the config, even with --update-config", () => {
    mkdirSync(join(TEST_DIR, ".docdog"), { recursive: true });
    const configPath = join(TEST_DIR, ".docdog", "config.yaml");
    writeFileSync(configPath, stringifyYaml({ scan_paths: ["architecture.md"] }), "utf-8");
    const before = readFileSync(configPath, "utf-8");
    const planPath = filesPlan("architecture", ARCH, ARCH_SECTIONS);

    applyPlan({ planFile: planPath, projectRoot: TEST_DIR, updateConfig: true, dryRun: true });
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  /**
   * The one deliberate behavioural change, recorded rather than hidden.
   *
   * `splitFile` ended each section at the next heading of the same-or-shallower
   * depth, so a non-matching sibling between two boundaries was **silently
   * dropped**. Boundaries in a plan **partition** the document, which is what
   * makes deleting an entry mean "merge this into the one above" — so the
   * sibling is absorbed instead. Nothing is lost either way the reviewer
   * arranges it, which is the property PROPOSAL-039 built the plan around.
   */
  it("absorbs a non-matching sibling instead of dropping it", () => {
    const withSibling = ARCH.replace(
      "## DD-ARCH-02:",
      "## Rationale Notes\n\nA non-matching H2 sibling.\n\n## DD-ARCH-02:",
    );
    const planPath = filesPlan(
      "architecture",
      withSibling,
      `  - heading: 2\n    at: "DD-ARCH-01: Core Abstraction Is Non-Negotiable"\n    id: DD-ARCH-01\n` +
        `    title: Core Abstraction Is Non-Negotiable\n    description: ""\n` +
        `  - heading: 4\n    at: "DD-ARCH-02: Execution Infrastructure Is Architect's Choice"\n` +
        `    id: DD-ARCH-02\n    title: Execution Infrastructure Is Architect's Choice\n    description: ""\n`,
    );
    const result = applyPlan({ planFile: planPath, projectRoot: TEST_DIR });
    expect(readFileSync(result.children[0].path, "utf-8")).toContain("A non-matching H2 sibling.");
  });
});

// ─── the CLI (PROPOSAL-045 §1, §4) ─────────────────────────────────────────

/** Run `docdog split …` against a fresh program, capturing every stream. */
async function runSplit(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}> {
  const program = new Command();
  program.exitOverride();
  registerSplitCommand(program);

  let stdout = "";
  let stderr = "";
  const realWrite = process.stdout.write.bind(process.stdout);
  const realError = console.error;
  const realLog = console.log;
  process.exitCode = undefined;

  process.stdout.write = ((chunk: string) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  console.error = (...parts: unknown[]) => {
    stderr += parts.join(" ") + "\n";
  };
  console.log = (...parts: unknown[]) => {
    stdout += parts.join(" ") + "\n";
  };

  try {
    await program.parseAsync(["node", "docdog", "split", ...args]);
  } finally {
    process.stdout.write = realWrite;
    console.error = realError;
    console.log = realLog;
  }

  const exitCode = process.exitCode as number | undefined;
  process.exitCode = undefined;
  return { stdout, stderr, exitCode };
}

const FOREIGN = `# Architecture Decisions

Cross-cutting decisions.

## DD-ARCH-01: Storage

Storage body.

## Rationale

A non-matching sibling.

## DD-ARCH-02: Execution

Execution body.

### FR-01: A requirement

A different cohort entirely.
`;

describe("docdog split — CLI", () => {
  function fixture(name: string, content: string): string {
    const p = join(TEST_DIR, name);
    writeFileSync(p, content, "utf-8");
    return p;
  }

  // Criterion 3.
  it("refuses --on without --format plan and names the two-command form", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout, stderr, exitCode } = await runSplit([file, "--on", "## DD-", "--collection", "decisions"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("they no longer split on their own");
    expect(stderr).toContain("--format plan");
    expect(stderr).toContain("--apply-plan plan.yaml");
    // Echoes the selector back, so the fix is a copy-paste.
    expect(stderr).toContain('--on "## DD-"');
    expect(stdout).toBe("");
    // Nothing was written: no output dir, no .index.md, source intact.
    expect(existsSync(join(TEST_DIR, "foreign"))).toBe(false);
    expect(existsSync(join(TEST_DIR, "foreign.index.md"))).toBe(false);
    expect(readFileSync(file, "utf-8")).toBe(FOREIGN);
  });

  it("refuses --depth without --format plan the same way", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stderr, exitCode } = await runSplit([file, "--depth", "2", "--collection", "decisions"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--depth 2");
    expect(existsSync(join(TEST_DIR, "foreign"))).toBe(false);
  });

  it("still refuses --on together with --depth", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stderr, exitCode } = await runSplit([
      file, "--format", "plan", "--on", "## DD-", "--depth", "2", "--collection", "d",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("alternative ways to select headings");
  });

  // Criterion 1 + 2, at the CLI: two --on flags used to silently take the last.
  it("unions repeated --on flags into one plan, in document order", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout, exitCode } = await runSplit([
      file, "--format", "plan", "--on", "## DD-", "--on", "### FR-", "--collection", "decisions",
    ]);

    expect(exitCode).toBeUndefined();
    const plan = parseYaml(stdout) as { output: string; sections: Array<{ at: string }> };
    expect(plan.output).toBe("files");
    expect(plan.sections.map(s => s.at)).toEqual([
      "DD-ARCH-01: Storage",
      "DD-ARCH-02: Execution",
      "FR-01: A requirement",
    ]);
  });

  it("emits only the plan on stdout, so it can be redirected", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout } = await runSplit([file, "--format", "plan", "--collection", "decisions"]);
    expect(() => parseYaml(stdout)).not.toThrow();
  });

  // Criterion 4. `No matches` used to exit 0, so a script or agent wrapping
  // this saw success.
  it("exits non-zero and writes no plan when a selector matches nothing", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout, stderr, exitCode } = await runSplit([
      file, "--format", "plan", "--on", "## NOPE-", "--collection", "decisions",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("NO_MATCHES");
  });

  it("exits 0 with an empty section list when no selector was given and no depth fits", async () => {
    const file = fixture("huge.md", `---\nid: X-1\ncollection: notes\n---\n\n# Top\n\n${"x".repeat(20000)}\n`);
    const { stdout, exitCode } = await runSplit([file, "--format", "plan"]);
    expect(exitCode).toBeUndefined();
    expect((parseYaml(stdout) as { sections: unknown[] }).sections).toEqual([]);
  });

  // Criterion 4's sibling in §4: the report exists to encourage looking before
  // splitting, and an agent that looked never learned `--on` existed.
  it("names every form in the no-selector report", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout, exitCode } = await runSplit([file]);
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain("--format plan");
    expect(stdout).toContain("--depth <n>");
    expect(stdout).toContain('--on "## DD-"');
    expect(stdout).toContain("--apply-plan plan.yaml");
    // A file with no id defaults to files mode, and the report says so.
    expect(stdout).toContain("output: files");
  });

  it("names the records default for a file that declares an id", async () => {
    const file = fixture("rec.md", `---\nid: DD-900\ncollection: decisions\n---\n\n# T\n\n## A\n\nx\n`);
    const { stdout } = await runSplit([file]);
    expect(stdout).toContain("output: records");
    expect(stdout).toContain("DD-900");
  });

  it("refuses an unknown --format", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stderr, exitCode } = await runSplit([file, "--format", "yaml"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('the only format is "plan"');
  });

  it("refuses a file argument alongside --apply-plan", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stderr, exitCode } = await runSplit([file, "--apply-plan", "plan.yaml"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("only one answer to which file is being split");
  });

  it("requires a file or a plan", async () => {
    const { stderr, exitCode } = await runSplit([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Give a file to split");
  });

  // The plan emitted by the CLI is the plan the executor eats — the round trip
  // end to end, which is what makes the ingest case one extra command.
  it("round-trips: emit with a selector, apply, get the files", async () => {
    const file = fixture("foreign.md", FOREIGN);
    const { stdout } = await runSplit([
      file, "--format", "plan", "--on", "## DD-", "--collection", "decisions",
    ]);
    const planPath = join(TEST_DIR, "p.yaml");
    // `source:` is repo-relative to the real project root, so apply from there.
    writeFileSync(planPath, stdout, "utf-8");
    const result = applyPlan({ planFile: planPath, projectRoot: process.cwd() });

    expect(result.children.map(c => c.filename)).toEqual([
      "dd-arch-01-storage.md",
      "dd-arch-02-execution.md",
    ]);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(TEST_DIR, "foreign.index.md"))).toBe(true);
  });
});

// ─── planForFile refusals that reach the CLI as exit codes ─────────────────

describe("planForFile error codes", () => {
  it("carries NO_MATCHES for a selector that matched nothing", () => {
    const file = join(TEST_DIR, "f.md");
    writeFileSync(file, FOREIGN, "utf-8");
    try {
      planForFile(file, TEST_DIR, { collection: "d", on: ["## NOPE-"] });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as SplitPlanError).code).toBe("NO_MATCHES");
    }
  });
});

// ─── updateConfigAfterSplit ─────────────────────────────────────────────────

describe("updateConfigAfterSplit", () => {
  it("removes the split parser entry for the source file and adds the new dir", () => {
    const configDir = join(TEST_DIR, ".docdog");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "config.yaml");

    writeFileSync(configPath, stringifyYaml({
      scan_paths: [
        {
          path: "specs/architecture.md",
          parser: "split",
          split_on: "## DD-",
          collection: "decisions",
        },
        "specs/other/",
      ],
    }));

    const result = updateConfigAfterSplit(
      configPath,
      join(TEST_DIR, "specs", "architecture.md"),
      join(TEST_DIR, "specs", "architecture"),
      TEST_DIR,
    );

    expect(result.removed).toBe(1);
    expect(result.added).toBe(true);

    const doc = parseYaml(readFileSync(configPath, "utf-8")) as { scan_paths: unknown[] };
    expect(doc.scan_paths).toHaveLength(2);
    expect(doc.scan_paths).not.toContainEqual(expect.objectContaining({ path: "specs/architecture.md" }));
    expect(doc.scan_paths).toContain("specs/architecture/");
  });

  it("skips adding when new dir is already covered by a broader entry", () => {
    const configDir = join(TEST_DIR, ".docdog");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "config.yaml");

    writeFileSync(configPath, stringifyYaml({
      scan_paths: [
        "specs/",
        {
          path: "specs/architecture.md",
          parser: "split",
          split_on: "## DD-",
          collection: "decisions",
        },
      ],
    }));

    const result = updateConfigAfterSplit(
      configPath,
      join(TEST_DIR, "specs", "architecture.md"),
      join(TEST_DIR, "specs", "architecture"),
      TEST_DIR,
    );

    expect(result.removed).toBe(1);
    expect(result.added).toBe(false); // specs/ already covers specs/architecture/
  });
});

// ─── stampFiles (docdog add) ───────────────────────────────────────────────

describe("stampFiles", () => {
  it("adds frontmatter to files without it", () => {
    const srcDir = join(TEST_DIR, "refinements");
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, "0068-layered-architecture.md"), `# Layered Architecture

**Date:** 2026-04-03
**Trigger:** AI agents consistently leak Pterodactyl details.

## Context

The Orchestrator architecture already defined layers.
`);

    const outputDir = join(TEST_DIR, "output");
    const result = stampFiles({
      source: srcDir,
      collection: "refinements",
      output: outputDir,
    });

    expect(result.stamped).toHaveLength(1);

    const content = readFileSync(join(outputDir, "0068-layered-architecture.md"), "utf-8");
    const { frontmatter, body } = parseFm(content);
    // FRICTION-005 / DP-001: ids are NEVER inferred from filenames.
    // The agent/user supplies them explicitly via --id or post-edit.
    expect(frontmatter.id).toBeUndefined();
    expect(frontmatter.title).toBe("Layered Architecture");
    expect(frontmatter.collection).toBe("refinements");
    expect(frontmatter.date).toBe("2026-04-03");
    // Date line stripped from body
    expect(body).not.toContain("**Date:**");
    expect(body).toContain("**Trigger:**");
  });

  // FRICTION-005: explicit --id stamps the value on a single file.
  it("stamps --id onto a single file", () => {
    const file = join(TEST_DIR, "single-with-id.md");
    writeFileSync(file, `# Explicit Id\n\nBody.\n`);

    const outputDir = join(TEST_DIR, "output-id");
    stampFiles({
      source: file,
      collection: "notes",
      id: "NOTE-042",
      output: outputDir,
    });

    const content = readFileSync(join(outputDir, "single-with-id.md"), "utf-8");
    const { frontmatter } = parseFm(content);
    expect(frontmatter.id).toBe("NOTE-042");
  });

  // FRICTION-005: --id + multiple files is refused — one id can't apply to many.
  it("refuses --id when the source matches more than one file", () => {
    const srcDir = join(TEST_DIR, "multi");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "a.md"), "# A\n");
    writeFileSync(join(srcDir, "b.md"), "# B\n");

    expect(() =>
      stampFiles({
        source: srcDir,
        collection: "notes",
        id: "SHARED-ID",
        output: join(TEST_DIR, "output-multi"),
      }),
    ).toThrow(/--id cannot be used with multiple files/);
  });

  // FRICTION-005: date-prefixed filenames must NOT produce a collision-inducing id.
  it("does not infer id from date-prefixed filenames", () => {
    const srcDir = join(TEST_DIR, "dated");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "2026-04-10-first.md"), "# First\n");
    writeFileSync(join(srcDir, "2026-04-11-second.md"), "# Second\n");

    const outputDir = join(TEST_DIR, "output-dated");
    stampFiles({ source: srcDir, collection: "notes", output: outputDir });

    const a = parseFm(readFileSync(join(outputDir, "2026-04-10-first.md"), "utf-8"));
    const b = parseFm(readFileSync(join(outputDir, "2026-04-11-second.md"), "utf-8"));
    expect(a.frontmatter.id).toBeUndefined();
    expect(b.frontmatter.id).toBeUndefined();
  });

  it("merges with existing frontmatter without overwriting", () => {
    const srcDir = join(TEST_DIR, "domain");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "resource-model.md"), `---
topics:
  - domain
---

# Resource Model

Content about the resource model.
`);

    const outputDir = join(TEST_DIR, "output");
    const result = stampFiles({
      source: srcDir,
      collection: "domain",
      output: outputDir,
    });

    expect(result.stamped).toHaveLength(1);
    const content = readFileSync(join(outputDir, "resource-model.md"), "utf-8");
    const { frontmatter } = parseFm(content);
    expect(frontmatter.collection).toBe("domain");
    expect(frontmatter.title).toBe("Resource Model");
    expect(frontmatter.topics).toEqual(["domain"]);
  });

  it("stamps a single file", () => {
    const file = join(TEST_DIR, "single.md");
    writeFileSync(file, `# Single File\n\nContent.\n`);

    const outputDir = join(TEST_DIR, "output");
    const result = stampFiles({
      source: file,
      collection: "notes",
      output: outputDir,
    });

    expect(result.stamped).toHaveLength(1);
  });

  it("preserves existing collection field", () => {
    const srcDir = join(TEST_DIR, "existing");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "test.md"), `---
collection: custom
title: Already Set
---

Body.
`);

    const outputDir = join(TEST_DIR, "output");
    stampFiles({
      source: srcDir,
      collection: "notes",
      output: outputDir,
    });

    const content = readFileSync(join(outputDir, "test.md"), "utf-8");
    const { frontmatter } = parseFm(content);
    expect(frontmatter.collection).toBe("custom");
    expect(frontmatter.title).toBe("Already Set");
  });
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function parseFm(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const yamlBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trimStart();
  return { frontmatter: (parseYaml(yamlBlock) as Record<string, unknown>) ?? {}, body };
}
