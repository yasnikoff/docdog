/**
 * `docdog update` reports whether `scan_paths` reaches the concept records.
 *
 * `init` has warned about this since PROPOSAL-025; `update` writes the same
 * `concepts` group — the population with the worst blast radius — and said
 * nothing, so it could report `added .docdog/concepts/collection-foo.md`
 * about a record search, get and traverse cannot see. Same posture as
 * `split --apply-plan` (PROPOSAL-039): report the reach, never edit the
 * config.
 *
 * Fixture style copied from seed-update.test.ts — a *fake* templates root,
 * so these assertions do not move when this repo's own seeds change.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { conceptsIndexed, printReport, registerUpdateCommand } from "../../src/cli/commands/update.js";
import { docdogVersion, emptySeedManifest, recordSeed } from "../../src/engine/seed-manifest.js";
import { planUpdate, type UpdatePlan } from "../../src/engine/seed-update.js";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import type { MergeDriverOutcome } from "../../src/engine/merge-driver.js";

const V = docdogVersion();

let repo: string;
let templatesRoot: string;

function configWith(scanPaths: string[]): DocdogConfig {
  return {
    ...defaultConfig,
    project: { name: "temp" },
    template: "minimal",
    scan_paths: scanPaths,
    vertex_collections: [],
  } as unknown as DocdogConfig;
}

function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

function plan(config: DocdogConfig, manifest = emptySeedManifest()): UpdatePlan {
  return planUpdate({ projectRoot: repo, config, templatesRoot, manifest });
}

const NO_MERGE_DRIVER: MergeDriverOutcome = {
  git: false,
  registered: false,
  blockPresent: false,
  registeredNow: false,
};

/** Render the human report and hand back every line it printed. */
function render(p: UpdatePlan, config: DocdogConfig, dryRun = false): string {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  try {
    printReport({
      dryRun,
      version: V,
      willWrite: p.willWrite,
      reported: p.reported,
      unchangedCount: p.unchanged.length,
      unavailable: p.unavailable,
      configKeysAbsent: [],
      conceptsIndexed: conceptsIndexed(p, config),
      unmatched: [],
      inert: [],
      mergeDriver: NO_MERGE_DRIVER,
      update: null,
    });
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "docdog-reach-repo-"));
  templatesRoot = mkdtempSync(join(tmpdir(), "docdog-reach-tmpl-"));
  write(templatesRoot, "skills/_common/search.md", "# search\n");
  mkdirSync(join(repo, ".docdog"), { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(templatesRoot, { recursive: true, force: true });
});

/** Give the fake templates root a concepts population to seed. */
function shipConcepts(): void {
  write(templatesRoot, "concepts/_common/relation-references.md", "# references\n");
  write(templatesRoot, "concepts/collections/collection-notes.md", "# notes\n");
}

describe("docdog update reports whether scan_paths reaches the concepts", () => {
  it("warns when concepts are seeded and no scan path reaches them", () => {
    shipConcepts();
    const config = configWith(["specs/"]);
    const p = plan(config);

    // The writes really do happen — that is what makes the silence a bug.
    expect(p.willWrite.map((e) => e.path)).toContain(".docdog/concepts/collection-notes.md");
    expect(conceptsIndexed(p, config)).toBe(false);

    const out = render(p, config);
    expect(out).toContain('No scan path reaches ".docdog/concepts/"');
    // The consequence, not just the condition.
    expect(out).toContain("not indexed");
    expect(out).toContain("search, get and traverse cannot see");
    expect(out).toContain('Add ".docdog/concepts/" to scan_paths in .docdog/config.yaml');
  });

  it("says nothing when a covering parent is in scan_paths", () => {
    shipConcepts();
    const config = configWith([".docdog/"]);
    const p = plan(config);

    expect(conceptsIndexed(p, config)).toBe(true);
    expect(render(p, config)).not.toContain("No scan path reaches");
  });

  it("is null — and silent — when no concept record is present or pending", () => {
    // No concepts in the shipped set and none on disk: a project with no
    // concept records has nothing to say about where they would be indexed.
    const config = configWith(["specs/"]);
    const p = plan(config);

    expect(p.all.some((e) => e.item.group === "concepts")).toBe(false);
    expect(conceptsIndexed(p, config)).toBeNull();
    expect(render(p, config)).not.toContain("No scan path reaches");
  });

  it("counts a concept record already on disk as in play, even with nothing to write", () => {
    shipConcepts();
    const config = configWith(["specs/"]);
    const manifest = emptySeedManifest();
    write(repo, ".docdog/concepts/relation-references.md", "# references\n");
    write(repo, ".docdog/concepts/collection-notes.md", "# notes\n");
    recordSeed(manifest, ".docdog/concepts/relation-references.md", "# references\n", V);
    recordSeed(manifest, ".docdog/concepts/collection-notes.md", "# notes\n", V);

    const p = plan(config, manifest);
    expect(p.willWrite.some((e) => e.item.group === "concepts")).toBe(false);
    expect(conceptsIndexed(p, config)).toBe(false);
    expect(render(p, config)).toContain('No scan path reaches ".docdog/concepts/"');
  });

  it("reports it under --dry-run too — the warning is about state, not about the write", () => {
    shipConcepts();
    const config = configWith(["specs/"]);
    const p = plan(config);

    const out = render(p, config, true);
    expect(out).toContain("(dry run — nothing written)");
    expect(out).toContain('No scan path reaches ".docdog/concepts/"');
  });

  it("never touches .docdog/config.yaml", () => {
    shipConcepts();
    const config = configWith(["specs/"]);
    write(repo, ".docdog/config.yaml", "project:\n  name: temp\nscan_paths:\n  - specs/\n");
    const before = readFileSync(join(repo, ".docdog/config.yaml"), "utf-8");

    const p = plan(config);
    render(p, config);
    expect(readFileSync(join(repo, ".docdog/config.yaml"), "utf-8")).toBe(before);
  });
});

/**
 * The JSON half, through the real command — the only thing that can pin the
 * key name callers read. Runs against docdog's *own* shipped templates
 * (`findTemplatesRoot` is module-relative), which always carry concepts, so
 * the `null` case is unreachable here and lives in the plan-level tests
 * above. `--dry-run --offline` keeps it to reads: no writes, no socket.
 */
describe("the JSON view carries it", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(cwd);
  });

  async function runJson(scanPaths: string[]): Promise<Record<string, unknown>> {
    write(
      repo,
      ".docdog/config.yaml",
      `project:\n  name: temp\ntemplate: minimal\nscan_paths:\n${scanPaths
        .map((p) => `  - ${p}\n`)
        .join("")}`,
    );
    process.chdir(repo);
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
    try {
      const program = new Command();
      program.exitOverride();
      registerUpdateCommand(program);
      await program.parseAsync(["node", "docdog", "update", "--dry-run", "--offline", "--json"]);
    } finally {
      console.log = original;
    }
    return JSON.parse(lines.join("\n")) as Record<string, unknown>;
  }

  it("is false when scan_paths misses the concepts directory", async () => {
    const view = await runJson(["specs/"]);
    expect(view.conceptsIndexed).toBe(false);
    // Nothing was written — the config is still exactly what the test wrote.
    expect(readFileSync(join(repo, ".docdog/config.yaml"), "utf-8")).toContain("- specs/");
  });

  it("is true when a covering parent is listed", async () => {
    const view = await runJson(["specs/", ".docdog/"]);
    expect(view.conceptsIndexed).toBe(true);
  });
});
