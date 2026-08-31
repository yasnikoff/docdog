/**
 * PROPOSAL-041 — `docdog update` end to end over a temp repo.
 *
 * Covers the gap the command exists to close (a repo seeded before a skill
 * shipped receives it), the clobber it must not commit (an edited file is
 * reported, never overwritten), the two conservative defaults (no manifest
 * entry means the user's; an orphan is reported and left on disk), and
 * `--force`'s per-file shape.
 *
 * The seed set is assembled from a *fake* templates root, so the assertions
 * do not move every time this repo's own shipped skills change.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectSeeds, missingConfigKeys } from "../../src/engine/seed-set.js";
import {
  docdogVersion,
  emptySeedManifest,
  readSeedManifest,
  recordSeed,
  seedHash,
  writeSeedManifest,
  type SeedManifest,
} from "../../src/engine/seed-manifest.js";
import { applyUpdate, planUpdate } from "../../src/engine/seed-update.js";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";

const V = docdogVersion();

let repo: string;
let templatesRoot: string;

const config: DocdogConfig = {
  ...defaultConfig,
  project: { name: "temp" },
  template: "minimal",
  scan_paths: ["specs/"],
  vertex_collections: [],
} as unknown as DocdogConfig;

function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

function read(rel: string): string {
  return readFileSync(join(repo, rel), "utf-8");
}

/** Plan against the fake templates root and this repo's current manifest. */
function plan(manifest: SeedManifest, force?: string[]) {
  return planUpdate({ projectRoot: repo, config, templatesRoot, manifest, force });
}

function outcomeOf(p: ReturnType<typeof plan>, path: string): string | undefined {
  return p.all.find((e) => e.path === path)?.outcome;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "docdog-update-repo-"));
  templatesRoot = mkdtempSync(join(tmpdir(), "docdog-update-tmpl-"));

  // A shipped set with two common skills — one of which is the "shipped
  // after this repo was seeded" case — and one concept record.
  write(templatesRoot, "skills/_common/search.md", "# search v2\n");
  write(templatesRoot, "skills/_common/compose.md", "# compose\n");
  write(templatesRoot, "skills/minimal/ingest.md", "# ingest\n");
  write(templatesRoot, "concepts/_common/relation-references.md", "# references\n");
  write(templatesRoot, "concepts/collections/collection-notes.md", "# notes\n");
  write(templatesRoot, "concepts/collections/collection-concepts.md", "# concepts\n");

  mkdirSync(join(repo, ".docdog"), { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(templatesRoot, { recursive: true, force: true });
});

describe("the gap PROPOSAL-041 closes", () => {
  it("adds a skill that shipped after the repo was seeded", () => {
    // The repo has search.md exactly as docdog wrote it, and no compose.md —
    // the state neither `init` nor `templates refresh` could resolve.
    write(repo, ".docdog/skills/search.md", "# search v1\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, ".docdog/skills/search.md", "# search v1\n", V);

    const p = plan(manifest);
    expect(outcomeOf(p, ".docdog/skills/compose.md")).toBe("add");
    expect(outcomeOf(p, ".docdog/skills/search.md")).toBe("update");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/skills/compose.md")).toBe("# compose\n");
    expect(read(".docdog/skills/search.md")).toBe("# search v2\n");
    expect(manifest.entries[".docdog/skills/compose.md"].hash).toBe(seedHash("# compose\n"));
  });

  it("seeds vocabulary an adopter's init never saw", () => {
    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, ".docdog/concepts/relation-references.md")).toBe("add");
    expect(outcomeOf(p, ".docdog/concepts/collection-notes.md")).toBe("add");
    applyUpdate(repo, p, manifest, V);
    expect(existsSync(join(repo, ".docdog/concepts/relation-references.md"))).toBe(true);
  });
});

describe("the clobber it must not commit", () => {
  it("reports an edited seeded file and leaves the bytes alone", () => {
    write(repo, ".docdog/skills/search.md", "# search v1 — WITH MY EDITS\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, ".docdog/skills/search.md", "# search v1\n", V);

    const p = plan(manifest);
    expect(outcomeOf(p, ".docdog/skills/search.md")).toBe("diverged");
    expect(p.willWrite.map((e) => e.path)).not.toContain(".docdog/skills/search.md");
    expect(p.reported.map((e) => e.path)).toContain(".docdog/skills/search.md");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/skills/search.md")).toBe("# search v1 — WITH MY EDITS\n");
  });

  it("a file with no manifest entry is the user's, whatever it contains", () => {
    // Every file in every repo seeded before the manifest shipped is here.
    write(repo, ".docdog/skills/search.md", "# search v0\n");
    const manifest = emptySeedManifest();

    const p = plan(manifest);
    expect(outcomeOf(p, ".docdog/skills/search.md")).toBe("untracked");
    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/skills/search.md")).toBe("# search v0\n");
    expect(manifest.entries[".docdog/skills/search.md"]).toBeUndefined();
  });
});

describe("orphans", () => {
  it("reports the flat skill layout FRICTION-040 left behind, and never deletes it", () => {
    write(repo, ".claude/skills/specs.md", "old flat skill\n");
    write(repo, ".claude/skills/specs.index.md", "ID | notes | x | y\n");

    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, ".claude/skills/specs.md")).toBe("orphan");
    expect(outcomeOf(p, ".claude/skills/specs.index.md")).toBe("orphan");

    applyUpdate(repo, p, manifest, V);
    expect(existsSync(join(repo, ".claude/skills/specs.md"))).toBe(true);
  });

  it("says nothing about a legacy path that is not there", () => {
    const p = plan(emptySeedManifest());
    expect(p.all.some((e) => e.path === ".claude/skills/navigate-specs.md")).toBe(false);
  });
});

describe("--force", () => {
  it("takes the shipped version of exactly the file it names", () => {
    write(repo, ".docdog/skills/search.md", "# MY EDIT\n");
    write(repo, ".docdog/skills/ingest.md", "# MY OTHER EDIT\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, ".docdog/skills/search.md", "# search v1\n", V);
    recordSeed(manifest, ".docdog/skills/ingest.md", "# ingest\n", V);

    const p = plan(manifest, [".docdog/skills/search.md"]);
    applyUpdate(repo, p, manifest, V);

    expect(read(".docdog/skills/search.md")).toBe("# search v2\n");
    expect(read(".docdog/skills/ingest.md")).toBe("# MY OTHER EDIT\n");
  });

  it("names a path docdog does not seed as unmatched, rather than silently doing nothing", () => {
    const p = plan(emptySeedManifest(), ["src/index.ts"]);
    expect(p.unmatched).toEqual(["src/index.ts"]);
  });

  it("cannot resurrect an orphan", () => {
    write(repo, ".claude/skills/specs.md", "old\n");
    const p = plan(emptySeedManifest(), [".claude/skills/specs.md"]);
    expect(p.inert.map((e) => e.path)).toEqual([".claude/skills/specs.md"]);
    expect(p.willWrite.map((e) => e.path)).not.toContain(".claude/skills/specs.md");
  });
});

describe("idempotency and blocks", () => {
  it("a second update writes nothing", () => {
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    const second = plan(manifest);
    expect(second.willWrite).toHaveLength(0);
    expect(second.unchanged.length).toBeGreaterThan(0);
  });

  it("injects the CLAUDE.md block without touching the prose around it", () => {
    write(repo, "CLAUDE.md", "# My project\n\nMy own rules.\n");
    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, "CLAUDE.md#docdog")).toBe("add");
    applyUpdate(repo, p, manifest, V);
    const claude = read("CLAUDE.md");
    expect(claude).toContain("My own rules.");
    expect(claude).toContain("<!-- docdog:start -->");
  });

  it("leaves a CLAUDE.md block the user rewrote alone", () => {
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    const injected = read("CLAUDE.md");
    write(repo, "CLAUDE.md", injected.replace("## Context (docdog)", "## My heading"));

    const p = plan(manifest);
    expect(outcomeOf(p, "CLAUDE.md#docdog")).toBe("diverged");
    applyUpdate(repo, p, manifest, V);
    expect(read("CLAUDE.md")).toContain("## My heading");
  });

  it("adds the .mcp.json server entry and keeps other servers", () => {
    write(repo, ".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, ".mcp.json#mcpServers.docdog")).toBe("add");
    applyUpdate(repo, p, manifest, V);
    const mcp = JSON.parse(read(".mcp.json"));
    expect(mcp.mcpServers.other).toBeDefined();
    expect(mcp.mcpServers.docdog.args).toContain("serve");
  });

  it("key order in .mcp.json is not an edit", () => {
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    const doc = JSON.parse(read(".mcp.json"));
    // Rewrite the same entry with its keys in a different order.
    const entry = doc.mcpServers.docdog;
    doc.mcpServers.docdog = { args: entry.args, command: entry.command, type: entry.type };
    write(repo, ".mcp.json", `${JSON.stringify(doc, null, 2)}\n`);
    expect(outcomeOf(plan(manifest), ".mcp.json#mcpServers.docdog")).toBe("unchanged");
  });
});

describe("manifest bookkeeping", () => {
  it("prunes an entry whose file is gone and no longer shipped", () => {
    const manifest = emptySeedManifest();
    recordSeed(manifest, ".docdog/skills/retired.md", "# retired\n", V);
    applyUpdate(repo, plan(manifest), manifest, V);
    expect(manifest.entries[".docdog/skills/retired.md"]).toBeUndefined();
  });

  it("keeps an entry whose file is still on disk though no longer collected", () => {
    write(repo, ".docdog/skills/from-another-template.md", "# other\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, ".docdog/skills/from-another-template.md", "# other\n", V);
    applyUpdate(repo, plan(manifest), manifest, V);
    expect(manifest.entries[".docdog/skills/from-another-template.md"]).toBeDefined();
  });

  it("round-trips through disk", () => {
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    writeSeedManifest(repo, manifest);
    const reread = readSeedManifest(repo);
    expect(reread.entries[".docdog/skills/compose.md"].docdog).toBe(V);
    expect(plan(reread).willWrite).toHaveLength(0);
  });
});

describe("the seed set", () => {
  it("resolves {{config:*}} in skills so an unmodified skill compares equal", () => {
    write(templatesRoot, "skills/_common/named.md", "project: {{config:project.name}}\n");
    const item = collectSeeds({ projectRoot: repo, config, templatesRoot }).items.find(
      (i) => i.path === ".docdog/skills/named.md",
    );
    expect(item?.shipped).toBe("project: temp\n");
  });
});

describe("config.yaml is report-only", () => {
  it("names keys a fresh init writes that this config lacks, and writes nothing", () => {
    write(repo, ".docdog/config.yaml", "project:\n  name: temp\nscan_paths:\n  - specs/\n");
    const before = read(".docdog/config.yaml");
    expect(missingConfigKeys(repo)).toContain("embed");
    expect(missingConfigKeys(repo)).not.toContain("scan_paths");
    expect(read(".docdog/config.yaml")).toBe(before);
  });
});

describe("the .docdog/.gitignore cache rule", () => {
  const KEY = ".docdog/.gitignore#cache";

  it("restores the rule when the repo has no .gitignore at all", () => {
    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("add");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("cache/\nlocal/\n");
    expect(manifest.entries[KEY].hash).toBe(seedHash("cache/"));
  });

  it("restores a rule the user deleted, keeping their other ignores", () => {
    write(repo, ".docdog/.gitignore", "scratch/\n*.tmp\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, KEY, "cache/", V);

    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("add");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("scratch/\n*.tmp\ncache/\nlocal/\n");
  });

  it("is a sub-document seed: the user's own ignores are not a divergence", () => {
    write(repo, ".docdog/.gitignore", "cache/\nscratch/\nnotes.local.md\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, KEY, "cache/", V);

    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("unchanged");
    expect(p.willWrite.map((e) => e.path)).not.toContain(KEY);

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("cache/\nscratch/\nnotes.local.md\nlocal/\n");
  });

  it("finds the rule with no trailing newline and appends no duplicate", () => {
    write(repo, ".docdog/.gitignore", "scratch/\ncache/\n*.tmp");
    const manifest = emptySeedManifest();
    recordSeed(manifest, KEY, "cache/", V);

    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("unchanged");
    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("scratch/\ncache/\n*.tmp\nlocal/\n");
  });

  it("appends to a file that does not end in a newline without joining lines", () => {
    write(repo, ".docdog/.gitignore", "scratch/");
    const manifest = emptySeedManifest();
    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("add");
    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("scratch/\ncache/\nlocal/\n");
  });

  it("applying twice is idempotent", () => {
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    const after = read(".docdog/.gitignore");

    const second = plan(manifest);
    expect(outcomeOf(second, KEY)).toBe("unchanged");
    expect(second.willWrite.map((e) => e.path)).not.toContain(KEY);
    applyUpdate(repo, second, manifest, V);
    expect(read(".docdog/.gitignore")).toBe(after);
  });

  it("an unrecorded rule is the user's, and is reported rather than adopted", () => {
    // Every repo seeded before this seed existed lands here.
    write(repo, ".docdog/.gitignore", "cache/\n");
    const manifest = emptySeedManifest();

    const p = plan(manifest);
    expect(outcomeOf(p, KEY)).toBe("untracked");
    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("cache/\nlocal/\n");
    expect(manifest.entries[KEY]).toBeUndefined();
  });
});

describe("the .docdog/.gitignore local rule", () => {
  const CACHE = ".docdog/.gitignore#cache";
  const LOCAL = ".docdog/.gitignore#local";

  it("reaches a repo that predates it, without disturbing the cache rule", () => {
    // Every existing project lands here: `cache/` recorded, `local/` unheard
    // of. This is what makes the destination need no config edit from anyone.
    write(repo, ".docdog/.gitignore", "cache/\nscratch/\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, CACHE, "cache/", V);

    const p = plan(manifest);
    expect(outcomeOf(p, CACHE)).toBe("unchanged");
    expect(outcomeOf(p, LOCAL)).toBe("add");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("cache/\nscratch/\nlocal/\n");
  });

  it("is INDEPENDENT of the cache rule — deleting one leaves the other unchanged", () => {
    // The reason these are two sub-document seeds and not one seed with two
    // lines: a seed covering both would read a half-edited file as wholly
    // diverged, and --force would then rewrite a line the user meant to keep.
    write(repo, ".docdog/.gitignore", "local/\n");
    const manifest = emptySeedManifest();
    recordSeed(manifest, CACHE, "cache/", V);
    recordSeed(manifest, LOCAL, "local/", V);

    const p = plan(manifest);
    expect(outcomeOf(p, CACHE)).toBe("add");
    expect(outcomeOf(p, LOCAL)).toBe("unchanged");

    applyUpdate(repo, p, manifest, V);
    expect(read(".docdog/.gitignore")).toBe("local/\ncache/\n");
  });

  it("a rule the user wrote themselves is reported, never adopted", () => {
    write(repo, ".docdog/.gitignore", "local/\n");
    const manifest = emptySeedManifest();

    const p = plan(manifest);
    expect(outcomeOf(p, LOCAL)).toBe("untracked");
    applyUpdate(repo, p, manifest, V);
    expect(manifest.entries[LOCAL]).toBeUndefined();
  });

  it("is seeded even though the directory does not exist", () => {
    // Deliberate. The rule has to be in place BEFORE someone writes the first
    // thing they did not want published, not after.
    const manifest = emptySeedManifest();
    applyUpdate(repo, plan(manifest), manifest, V);
    expect(read(".docdog/.gitignore")).toContain("local/");
    expect(existsSync(join(repo, ".docdog", "local"))).toBe(false);
  });
});
