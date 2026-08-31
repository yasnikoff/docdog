/**
 * PROPOSAL-044 — the injectable skills as seed-set members.
 *
 * The claim under test is narrow and load-bearing: docdog can compute what it
 * *would write now* for a per-corpus file, so the seed manifest's four
 * outcomes apply to these the way they apply to everything else. That is what
 * `collectSeeds` previously said was impossible ("no shipped bytes to compare
 * against"), and the difference between shipped and *fixed* is the whole fix.
 *
 * Unlike `seed-update.test.ts`, these run against the **real** templates root:
 * a fake one has no `templates/injectable-skills/`, which is exactly the case
 * `collectSeeds` skips, so a fake root could not exercise any of this.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerInitCommand } from "../../src/cli/commands/init.js";
import { loadConfig } from "../../src/config/loader.js";
import { readSeedManifest } from "../../src/engine/seed-manifest.js";
import { collectSeeds, findTemplatesRoot } from "../../src/engine/seed-set.js";
import { applyUpdate, planUpdate } from "../../src/engine/seed-update.js";
import { docdogVersion, emptySeedManifest } from "../../src/engine/seed-manifest.js";
import { defaultConfig } from "../../src/config/defaults.js";
import { runCacheIndexer } from "../../src/storage/indexer.js";
import { CACHE_DIR, CACHE_FILE } from "../../src/storage/cache.js";
import type { DocdogConfig } from "../../src/types/config.js";

const SPECS_SKILL = ".claude/skills/docdog-specs/SKILL.md";
const FEEDBACK_SKILL = ".claude/skills/docdog-feedback/SKILL.md";
const RETIRED_SKILL = ".claude/skills/docdog-navigate-specs/SKILL.md";

const templatesRoot = findTemplatesRoot() as string;

const config: DocdogConfig = {
  ...defaultConfig,
  project: { name: "injectable-seeds" },
  template: "minimal",
  scan_paths: ["specs/"],
  vertex_collections: ["notes"],
  default_collection: "notes",
} as unknown as DocdogConfig;

let repo: string;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), "docdog-injectable-"));
}

function write(rel: string, content: string): void {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

function record(id: string, title: string): string {
  return `---\nid: ${id}\ntitle: ${title}\ndescription: a record\n---\n\nBody.\n`;
}

/** Index whatever is under specs/ with a fake embedder. */
async function index(): Promise<void> {
  await runCacheIndexer({
    config,
    projectRoot: repo,
    cacheFilePath: join(repo, CACHE_DIR, CACHE_FILE),
    embed: async (_c, texts) => texts.map(() => [1, 2, 3]),
    log: () => {},
    warn: () => {},
  });
}

function collect() {
  return collectSeeds({ projectRoot: repo, config, templatesRoot });
}

function plan(manifest = emptySeedManifest()) {
  return { manifest, ...planUpdate({ projectRoot: repo, config, templatesRoot, manifest }) };
}

describe("injectable skills are seed-set members", () => {
  it("collects both skills with a rendered shipped side", async () => {
    repo = makeRepo();
    write("specs/dd-001.md", record("DD-001", "First"));
    await index();

    const { items, unavailable } = collect();
    expect(unavailable).toEqual([]);

    const specs = items.find((i) => i.path === SPECS_SKILL);
    const feedback = items.find((i) => i.path === FEEDBACK_SKILL);
    expect(specs, "docdog-specs must be in the seed set").toBeDefined();
    expect(feedback, "docdog-feedback must be in the seed set").toBeDefined();

    expect(specs!.group).toBe("skills-injectable");
    // The shipped side is the *rendered* file — the corpus map is in it, which
    // is the thing the old design assumed could not be compared.
    expect(specs!.shipped).toContain("`DD-` — found in: `notes`");
    expect(specs!.shipped).not.toContain("{{");
    expect(feedback!.shipped).not.toContain("{{");
  });

  it("renders identically twice — nothing in the output is a clock", async () => {
    repo = makeRepo();
    write("specs/dd-001.md", record("DD-001", "First"));
    await index();

    const first = collect().items.find((i) => i.path === SPECS_SKILL)!.shipped;
    const second = collect().items.find((i) => i.path === SPECS_SKILL)!.shipped;

    // This is the property `{{generated_at}}` destroyed. Without it every
    // `docdog update` would classify every skill as `update`, rewrite it, and
    // produce a diff in which nothing changed.
    expect(second).toBe(first);
    expect(first).toContain(docdogVersion());
  });

  it("an unedited skill is unchanged, then updates when the corpus grows", async () => {
    repo = makeRepo();
    write("specs/dd-001.md", record("DD-001", "First"));
    await index();

    // First run writes it and records the bytes.
    const p1 = plan();
    expect(p1.all.find((e) => e.path === SPECS_SKILL)?.outcome).toBe("add");
    applyUpdate(repo, p1, p1.manifest, docdogVersion());
    expect(readFileSync(join(repo, SPECS_SKILL), "utf-8")).toContain("`DD-`");

    // Nothing changed → nothing to do.
    expect(
      planUpdate({ projectRoot: repo, config, templatesRoot, manifest: p1.manifest }).all.find(
        (e) => e.path === SPECS_SKILL,
      )?.outcome,
    ).toBe("unchanged");

    // A new id prefix enters the corpus. THIS is the refresh FRICTION-043's
    // flat index never had: the roster goes stale on a spec write, and here
    // the ordinary upgrade path notices and fixes it.
    write("specs/fr-001.md", record("FR-001", "A requirement"));
    await index();

    const p2 = planUpdate({ projectRoot: repo, config, templatesRoot, manifest: p1.manifest });
    expect(p2.all.find((e) => e.path === SPECS_SKILL)?.outcome).toBe("update");
    applyUpdate(repo, p2, p1.manifest, docdogVersion());
    expect(readFileSync(join(repo, SPECS_SKILL), "utf-8")).toContain("`FR-`");
  });

  it("a skill the user edited is reported and never overwritten", async () => {
    repo = makeRepo();
    write("specs/dd-001.md", record("DD-001", "First"));
    await index();

    const p1 = plan();
    applyUpdate(repo, p1, p1.manifest, docdogVersion());

    const mine = `${readFileSync(join(repo, SPECS_SKILL), "utf-8")}\n\n## My own section\n`;
    writeFileSync(join(repo, SPECS_SKILL), mine, "utf-8");

    const p2 = planUpdate({ projectRoot: repo, config, templatesRoot, manifest: p1.manifest });
    expect(p2.all.find((e) => e.path === SPECS_SKILL)?.outcome).toBe("diverged");
    expect(p2.willWrite.some((e) => e.path === SPECS_SKILL)).toBe(false);

    applyUpdate(repo, p2, p1.manifest, docdogVersion());
    expect(readFileSync(join(repo, SPECS_SKILL), "utf-8")).toBe(mine);
  });

  it("the retired navigate-specs skill is an orphan, reported and left alone", async () => {
    repo = makeRepo();
    write("specs/dd-001.md", record("DD-001", "First"));
    await index();
    write(RETIRED_SKILL, "# an older docdog wrote this\n");

    const p = plan();
    expect(p.all.find((e) => e.path === RETIRED_SKILL)?.outcome).toBe("orphan");
    expect(p.willWrite.some((e) => e.path === RETIRED_SKILL)).toBe(false);

    applyUpdate(repo, p, p.manifest, docdogVersion());
    // Never deleted: removal is the user's call, files plus git are the archive.
    expect(readFileSync(join(repo, RETIRED_SKILL), "utf-8")).toContain("older docdog");
  });
});

describe("a corpus-backed skill with no cache", () => {
  it("is unavailable rather than orphaned, empty, or silently fine", () => {
    repo = makeRepo(); // no specs/, no index run

    const { items, unavailable } = collect();

    // Not in items — an empty roster must never reach the shipped side, or
    // `update` would overwrite a good file with a worse one.
    expect(items.some((i) => i.path === SPECS_SKILL)).toBe(false);

    const skipped = unavailable.find((u) => u.path === SPECS_SKILL);
    expect(skipped, "the skip must be named, not swallowed").toBeDefined();
    expect(skipped!.group).toBe("skills-injectable");
    expect(skipped!.reason).toContain("docdog index");

    // The skill that needs no corpus is unaffected: one member failing to
    // render must not take the population with it.
    expect(items.some((i) => i.path === FEEDBACK_SKILL)).toBe(true);
  });

  it("does not classify as orphan, which would invite deleting a good file", () => {
    repo = makeRepo();
    write(SPECS_SKILL, "# a skill written when there was a cache\n");

    const p = plan();
    // `shipped: null` would have said "docdog no longer ships this". It does;
    // it just could not render it this run, and the distinction is the whole
    // reason `unavailable` is a separate channel.
    expect(p.all.some((e) => e.path === SPECS_SKILL)).toBe(false);
    expect(p.unavailable.some((u) => u.path === SPECS_SKILL)).toBe(true);

    applyUpdate(repo, p, p.manifest, docdogVersion());
    expect(readFileSync(join(repo, SPECS_SKILL), "utf-8")).toContain("when there was a cache");
  });
});

/**
 * The reach half (PROPOSAL-044). Before this, `docdog init` installed no
 * injectable skill at all and the CLAUDE.md block it wrote pointed at a
 * different directory — so an adopter learned these existed only by reading
 * the README. Driven through the real command, because the claim is about
 * what `docdog init` does, not about what a helper could do.
 */
describe("docdog init installs the injectable skills", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(cwd);
  });

  async function runInit(): Promise<void> {
    process.chdir(repo);
    const original = console.log;
    console.log = () => {};
    try {
      const program = new Command();
      program.exitOverride();
      registerInitCommand(program);
      await program.parseAsync(["node", "docdog", "init", "--name", "temp"]);
    } finally {
      console.log = original;
    }
  }

  it("writes both skills, records them, and update then fills in the roster", async () => {
    repo = makeRepo();
    await runInit();

    const skill = readFileSync(join(repo, SPECS_SKILL), "utf-8");
    readFileSync(join(repo, FEEDBACK_SKILL), "utf-8"); // throws if absent

    // A fresh project has no cache, so the roster says so and names the two
    // commands that fill it in — rather than rendering an empty table that
    // reads like a fact about the corpus.
    expect(skill).toContain("not read yet");
    expect(skill).toContain("docdog index");
    expect(skill).not.toContain("{{");

    // Recorded, which is the whole point: without provenance `update` would
    // classify these `untracked` and never maintain them.
    const manifest = readSeedManifest(repo);
    expect(Object.keys(manifest.entries)).toContain(SPECS_SKILL);
    expect(Object.keys(manifest.entries)).toContain(FEEDBACK_SKILL);

    // Now index a corpus and let the ordinary upgrade path fill the roster in.
    const projectConfig = loadConfig(repo);
    write("specs/dd-001.md", record("DD-001", "First"));
    await runCacheIndexer({
      config: projectConfig,
      projectRoot: repo,
      cacheFilePath: join(repo, CACHE_DIR, CACHE_FILE),
      embed: async (_c, texts) => texts.map(() => [1, 2, 3]),
      log: () => {},
      warn: () => {},
    });

    const p = planUpdate({
      projectRoot: repo,
      config: projectConfig,
      templatesRoot,
      manifest,
    });
    expect(p.all.find((e) => e.path === SPECS_SKILL)?.outcome).toBe("update");
    // The generic skill has nothing to learn from a corpus, so it stays put.
    expect(p.all.find((e) => e.path === FEEDBACK_SKILL)?.outcome).toBe("unchanged");

    applyUpdate(repo, p, manifest, docdogVersion());
    const refreshed = readFileSync(join(repo, SPECS_SKILL), "utf-8");
    expect(refreshed).toContain("`DD-`");
    expect(refreshed).not.toContain("not read yet");
  });
});
