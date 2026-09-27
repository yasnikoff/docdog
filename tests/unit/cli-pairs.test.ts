/**
 * `docdog pairs` driven through the command, not the storage functions — the
 * wiring is where a refusal loses its code, gains the stale-cache hint
 * (FRICTION-030), or an option is accepted and silently does nothing.
 * storage-pairs.test.ts covers what the storage layer computes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { cacheFilePath } from "../../src/storage/cache.js";
import { registerPairsCommand } from "../../src/cli/commands/pairs.js";

function relationConcept(name: string): string {
  return `---
id: CONCEPT-RELATION-${name.toUpperCase()}
title: "Relation: ${name}"
collection: concepts
concept_kind: relation
name: ${name}
inverse_label: ${name} by
symmetric: false
---

A ${name} B.
`;
}

const decision = (id: string, extra = ""): string => `---
id: ${id}
title: ${id} alpha decision
status: current
${extra}---

# ${id}

The alpha cache holds alpha entries.
`;

const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": decision("DD-001"),
  "specs/decisions/dd-002.md": decision("DD-002", "relationships:\n  - references: DD-001\n    context: Cites it.\n"),
  ".docdog/concepts/relation-references.md": relationConcept("references"),
  ".docdog/concepts/relation-amends.md": relationConcept("amends"),
  ".docdog/concepts/relation-supersedes.md": relationConcept("supersedes"),
};

const BASE_CONFIG = `project:
  name: cli-pairs
scan_paths:
  - specs/decisions/
  - .docdog/concepts/
vertex_collections:
  - decisions
  - concepts
default_collection: decisions
`;

const fakeEmbed: EmbedBatchFn = async (_config, texts) =>
  texts.map((t) => [(t.match(/alpha/g) ?? []).length, 0, 0.001]);

describe("docdog pairs, through the command", () => {
  const cwd = process.cwd();
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-cli-pairs-"));
    for (const [relPath, content] of Object.entries(FILES)) {
      mkdirSync(dirname(join(dir, relPath)), { recursive: true });
      writeFileSync(join(dir, relPath), content);
    }
    writeFileSync(join(dir, ".docdog/config.yaml"), BASE_CONFIG);
    const config: DocdogConfig = {
      ...defaultConfig,
      project: { name: "cli-pairs" },
      scan_paths: ["specs/decisions/", ".docdog/concepts/"],
      vertex_collections: ["decisions", "concepts"],
      default_collection: "decisions",
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cacheFilePath(dir),
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
  });

  afterAll(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    writeFileSync(join(dir, ".docdog/config.yaml"), BASE_CONFIG);
  });

  async function run(args: string[]): Promise<{ out: string; err: string; exitCode: number | undefined }> {
    process.chdir(dir);
    process.exitCode = undefined;
    const out: string[] = [];
    const err: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    const errSpy = vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
    try {
      const program = new Command();
      registerPairsCommand(program);
      await program.parseAsync(["node", "docdog", "pairs", ...args]);
      return { out: out.join("\n"), err: err.join("\n"), exitCode: process.exitCode as number | undefined };
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      process.chdir(cwd);
      process.exitCode = undefined;
    }
  }

  it("the scan prints all three edge sets", async () => {
    const r = await run([]);
    expect(r.exitCode).toBeUndefined();
    expect(r.out).toContain("DD-001 (current) ~ DD-002 (current)");
    expect(r.out).toContain("settle: supersedes, amends; show: all; close: supersedes, amends");
  });

  it("show narrows what is listed and nothing else", async () => {
    writeFileSync(join(dir, ".docdog/config.yaml"), `${BASE_CONFIG}pairs:\n  edges:\n    show: [amends]\n`);
    const r = await run([]);
    expect(r.out).toContain("DD-001 (current) ~ DD-002 (current)");
    expect(r.out).not.toContain("declared: DD-002 references DD-001");
  });

  it("an unregistered relation in config is refused with its own code and the config hint", async () => {
    writeFileSync(join(dir, ".docdog/config.yaml"), `${BASE_CONFIG}pairs:\n  edges:\n    close: [replaces]\n`);
    for (const args of [[], ["--defects"]]) {
      const r = await run(args);
      expect(r.exitCode).toBe(1);
      expect(r.err).toContain("Error [UNKNOWN_RELATION]: pairs.edges.close");
      expect(r.err).toContain("pairs.edges in .docdog/config.yaml");
      expect(r.err).not.toContain("docdog index");
    }
  });

  it("the applier refuses it too, rather than never reporting a defect closed", async () => {
    writeFileSync(join(dir, ".docdog/config.yaml"), `${BASE_CONFIG}pairs:\n  edges:\n    close: [replaces]\n`);
    writeFileSync(join(dir, "pairs.yaml"), "version: 1\npairs: []\n");
    const r = await run(["--accept-from", "pairs.yaml", "--dry-run"]);
    expect(r.exitCode).toBe(1);
    expect(r.err).toContain("Error [UNKNOWN_RELATION]");
  });

  it("a misplaced key under pairs is refused before anything runs", async () => {
    writeFileSync(join(dir, ".docdog/config.yaml"), `${BASE_CONFIG}pairs:\n  settle: [amends]\n`);
    const r = await run([]);
    expect(r.exitCode).toBe(1);
    expect(r.err).toContain("Error [INVALID_CONFIG]: pairs.settle is not a key");
  });

  it("--defects refuses scan options instead of ignoring them", async () => {
    for (const args of [["--limit", "3"], ["--id", "DD-001"], ["--format", "review"], ["--threshold", "0.5"]]) {
      const r = await run(["--defects", ...args]);
      expect(r.exitCode).toBe(1);
      expect(r.err).toContain(`takes no ${args[0]}`);
    }
  });

  it("--defects --json carries the closing set under settings, where the scan's JSON has it", async () => {
    // The scan's --json computes passages, which needs the real embedder this
    // suite never loads; NominateResult.settings.closeTypes is its half.
    const defects = JSON.parse((await run(["--defects", "--json"])).out);
    expect(defects.settings.closeTypes).toEqual(["supersedes", "amends"]);
    expect(defects.defects).toEqual([]);
  });

  it("an unknown --format is refused before the cache is opened", async () => {
    const empty = mkdtempSync(join(tmpdir(), "docdog-cli-pairs-empty-"));
    try {
      mkdirSync(join(empty, ".docdog"));
      writeFileSync(join(empty, ".docdog/config.yaml"), BASE_CONFIG);
      process.chdir(empty);
      const program = new Command();
      registerPairsCommand(program);
      const err: string[] = [];
      const errSpy = vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
      try {
        await program.parseAsync(["node", "docdog", "pairs", "--format", "csv"]);
      } finally {
        errSpy.mockRestore();
        process.chdir(cwd);
      }
      expect(process.exitCode).toBe(1);
      expect(err.join("\n")).toContain('unknown --format "csv"');
    } finally {
      process.exitCode = undefined;
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("an applier error keeps its own code", async () => {
    writeFileSync(join(dir, "pairs.yaml"), "version: 9\npairs: []\n");
    const r = await run(["--accept-from", "pairs.yaml", "--dry-run"]);
    expect(r.exitCode).toBe(1);
    expect(r.err).toMatch(/Error \[(UNKNOWN_VERSION|MALFORMED_FILE)\]/);
  });
});
