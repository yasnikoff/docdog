/**
 * Unit tests for the injectable-skills library (PROPOSAL-019).
 *
 * Exercises pure functions directly (prefix extraction, template
 * rendering) plus the cache-backed `specs` discovery round-trip — the
 * coverage ported from the v2 Docker integration suite (P-023 §7 step 6).
 *
 * The summary-selection tests went with the flat index they fed
 * (FRICTION-043): install now writes exactly one file, SKILL.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPrefix, renderTemplate, skillInstall } from "../../src/engine/skill-install.js";
import { defaultConfig } from "../../src/config/defaults.js";
import { runCacheIndexer } from "../../src/storage/indexer.js";
import { CACHE_DIR, CACHE_FILE } from "../../src/storage/cache.js";

describe("extractPrefix", () => {
  it.each([
    ["DP-01", "DP-"],
    ["FR-PROV-06", "FR-PROV-"],
    ["DD-ARCH-01", "DD-ARCH-"],
    ["TASK-052", "TASK-"],
    ["BACKPORT-039", "BACKPORT-"],
  ])("%s → %s", (id, expected) => {
    expect(extractPrefix(id)).toBe(expected);
  });

  it("applies the literal rule consistently to letter-digit tails", () => {
    // TASK-L0 has a letter before the final digit — the rule strips
    // the final digit run, leaving "TASK-L". Literal and consistent,
    // even if not the grouping a human might prefer.
    expect(extractPrefix("TASK-L0")).toBe("TASK-L");
  });

  it("returns null for ids with no trailing digits", () => {
    expect(extractPrefix("ABC")).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("replaces literal placeholders", () => {
    const out = renderTemplate("Hello {{name}}, version {{v}}.", {
      name: "World",
      v: "1.2.3",
    });
    expect(out).toBe("Hello World, version 1.2.3.");
  });

  it("throws on an unknown placeholder", () => {
    expect(() => renderTemplate("Text with {{missing}}.", { other: "x" })).toThrow(
      /Unknown placeholder.*missing/,
    );
  });

  it("replaces the same placeholder multiple times", () => {
    const out = renderTemplate("{{x}} and {{x}} again", { x: "foo" });
    expect(out).toBe("foo and foo again");
  });

  it("leaves strings without placeholders unchanged", () => {
    expect(renderTemplate("plain text", {})).toBe("plain text");
  });

  it("handles multi-line substitution values", () => {
    const out = renderTemplate("List:\n{{items}}\nend.", {
      items: "- a\n- b\n- c",
    });
    expect(out).toBe("List:\n- a\n- b\n- c\nend.");
  });
});

describe("skillInstall — argument validation", () => {
  const baseConfig = { ...defaultConfig, project: { name: "test" } };

  it("rejects an unknown skill name", async () => {
    await expect(
      skillInstall({
        config: baseConfig,
        name: "does-not-exist",
        targetDir: ".claude/skills/",
        force: false,
        dryRun: true,
      }),
    ).rejects.toThrow(/Unknown injectable skill/);
  });

  it("rejects an absolute target path", async () => {
    await expect(
      skillInstall({
        config: baseConfig,
        name: "specs",
        targetDir: process.platform === "win32" ? "C:\\tmp\\out" : "/tmp/out",
        force: false,
        dryRun: true,
      }),
    ).rejects.toThrow(/must be a relative path/);
  });
});

describe("skillInstall — specs discovery from the cache", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips: index corpus → install specs → one SKILL.md, no companion files", async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-skill-cache-"));
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(
      join(dir, "specs", "dd-001.md"),
      `---\nid: DD-001\ntitle: First\ndescription: the first decision\n---\n\nBody one.\n`,
    );
    // Id-less file: gets a section key as cache id; must stay out of the index.
    writeFileSync(join(dir, "specs", "scratch.md"), `---\ntitle: No id\n---\n\nBody.\n`);

    const config = {
      ...defaultConfig,
      project: { name: "skill-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: join(dir, CACHE_DIR, CACHE_FILE),
      embed: async (_c, texts) => texts.map(() => [1, 2, 3]),
      log: () => {},
      warn: () => {},
    });

    const result = await skillInstall({
      config,
      name: "specs",
      targetDir: ".claude/skills/",
      force: false,
      dryRun: false,
      baseDir: dir,
    });

    expect(result.outerWritten).toBe(true);
    expect(existsSync(result.outerPath)).toBe(true);

    // FRICTION-040: a skill is `<name>/SKILL.md`, and the directory name is
    // the name an agent invokes. A flat `.claude/skills/specs.md` is
    // discovered by nothing, silently.
    expect(result.installName).toBe("docdog-specs");
    expect(result.outerPath).toBe(join(dir, ".claude", "skills", "docdog-specs", "SKILL.md"));
    expect(existsSync(join(dir, ".claude", "skills", "specs.md"))).toBe(false);

    // FRICTION-043: SKILL.md is the only file an install writes. The flat
    // index was corpus state committed into a skill directory — stale on the
    // next spec write, and invisible to `docdog update`, whose authority is
    // the shipped template.
    expect(existsSync(join(dir, ".claude", "skills", "docdog-specs", "specs.index.md"))).toBe(
      false,
    );

    // PROPOSAL-044: navigate-specs was absorbed, so nothing points at a
    // sibling skill any more and the conventions are in this file.
    const outer = readFileSync(result.outerPath, "utf-8");
    expect(outer).not.toContain("docdog-navigate-specs");
    expect(outer).toContain("Relationship encoding");
    expect(outer).not.toContain("{{");

    // No timestamp, ever. A fresh one on every render makes the bytes differ
    // from what the seed manifest recorded, so `docdog update` would rewrite
    // every skill on every run and show a diff in which nothing changed.
    expect(outer).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(result.corpusAvailable).toBe(true);

    // The rendered prefix map carries no vertex counts: they are corpus
    // state, wrong on the next write, and no lookup needs them.
    expect(outer).toContain("`DD-` — found in: `notes`");
    expect(outer).not.toMatch(/`DD-`[^\n]*vert(ex|ices)/);

    // The count survives in the discovery data, which the CLI summary reports
    // at install time — a number in a transient report cannot go stale.
    expect(result.prefixes).toEqual([{ prefix: "DD-", collection: "notes", count: 1 }]);
  });

  it("renders without a cache, and says so in the file (PROPOSAL-044)", async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-skill-nocache-"));
    const result = await skillInstall({
      config: { ...defaultConfig, project: { name: "t" } },
      name: "specs",
      targetDir: ".claude/skills/",
      force: false,
      dryRun: false,
      baseDir: dir,
    });

    // It used to throw. It cannot any more: `docdog init` writes this same
    // file in this same state, before any corpus exists, so refusing here
    // would make an explicit install stricter than the automatic one.
    expect(result.outerWritten).toBe(true);
    expect(result.corpusAvailable).toBe(false);

    // Not silent, though — the roster names the two commands that fill it in,
    // so the gap is visible in the artifact rather than only in a console line
    // that scrolls away.
    const outer = readFileSync(result.outerPath, "utf-8");
    expect(outer).toContain("not read yet");
    expect(outer).toContain("docdog index");
    expect(outer).not.toContain("{{");
  });
});

describe("REGISTERED_INJECTABLE_SKILLS registry shape (PROPOSAL-044)", () => {
  it("registers the injectable set with distinct placeholder allowlists", async () => {
    const { REGISTERED_INJECTABLE_SKILLS } = await import(
      "../../src/engine/skill-install.js"
    );
    // Two, not three: PROPOSAL-044 merged navigate-specs into specs along
    // the seam the code already showed — a placeholder whose only job was to
    // point one file at the other.
    expect(Object.keys(REGISTERED_INJECTABLE_SKILLS).sort()).toEqual(["feedback", "specs"]);

    // PROPOSAL-043 ships no code, so this is the only thing pinning the
    // feedback skill's existence: a skill that stops being registered stops
    // being installable, silently.
    const feedback = REGISTERED_INJECTABLE_SKILLS["feedback"];
    expect(feedback.installName).toBe("docdog-feedback");
    expect([...feedback.allowedPlaceholders].sort()).toEqual(["docdog_version"]);

    // Every install name is prefixed: the directory name is the skill name,
    // so it is the only namespace a project-level skill has (FRICTION-040).
    for (const [key, profile] of Object.entries(REGISTERED_INJECTABLE_SKILLS)) {
      expect(profile.installName, `${key} must install under a docdog- name`).toMatch(
        /^docdog-/,
      );
    }

    const specs = REGISTERED_INJECTABLE_SKILLS["specs"];
    expect(specs.allowedPlaceholders).toContain("docdog_version");
    expect(specs.allowedPlaceholders).toContain("id_prefixes");
    expect(specs.allowedPlaceholders).toContain("file_conventions");
    // FRICTION-043: no index to point at any more.
    expect(specs.allowedPlaceholders).not.toContain("index_path");
    // PROPOSAL-044: no sibling to point at, and no timestamp anywhere.
    expect(specs.allowedPlaceholders).not.toContain("navigate_specs_path");
    for (const profile of Object.values(REGISTERED_INJECTABLE_SKILLS)) {
      expect(
        profile.allowedPlaceholders,
        "a generated_at would make every update rewrite every skill",
      ).not.toContain("generated_at");
    }
  });
});
