/**
 * This repo's own copies of the files docdog seeds, checked against what
 * docdog would seed today (FRICTION-051).
 *
 * Docdog is its own first adopter, so every seeded file exists twice: once in
 * `templates/` as the shipped bytes, once under `.docdog/` as this project's
 * working copy. Nothing compared the two. The edit that shipped `docdog list`
 * added a whole section to `.docdog/skills/search.md` and never touched the
 * template, so for two releases every adopter's search skill still said "use
 * `limit` for more" and never mentioned the command built for completeness
 * questions — the exact retrieval mistake that edit exists to prevent.
 *
 * The drift ran the other way too, which is what makes a test worth having
 * rather than a habit: this repo's CLAUDE.md block was a release behind the
 * template, and six of its concept records had lost prose the template still
 * carried. Neither direction is visible to `docdog update` — the manifest
 * answers "did you edit this?", and both answers here are "yes".
 *
 * **The seed set is partitioned, and the partition is asserted.** Every member
 * is either mirrored (this repo must hold exactly the shipped bytes) or named
 * below with the reason it is not. A new group, or a new provider member,
 * fails until someone decides which side it is on — the PROPOSAL-026 device,
 * applied to the copies instead of to the shipped set.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { collectSeeds, type SeedGroup, type SeedItem } from "../../src/engine/seed-set.js";
import { loadConfig } from "../../src/config/loader.js";

const ROOT = process.cwd();
const SEEDS = collectSeeds({
  projectRoot: ROOT,
  config: loadConfig(ROOT),
  templatesRoot: join(ROOT, "templates"),
});

/** Hashes are LF-normalized for the reason `seedHash` is: `core.autocrlf`. */
const lf = (s: string): string => s.replace(/\r\n/g, "\n");

/**
 * Groups whose every member this repo must hold verbatim.
 *
 * The decision this encodes, stated rather than assumed: **this repo's skills
 * may not lead the template.** A skill is generic instruction, so a sharper
 * sentence discovered here belongs in the template, and the way to add one is
 * to edit `templates/skills/` and copy it down. Corpus-specific guidance has
 * two homes that are meant for it — `.claude/CLAUDE.md`, and the injectable
 * `specs` skill, which is rendered per corpus by design.
 */
const MIRRORED_GROUPS: SeedGroup[] = ["skills", "scripts", "provider"];

/**
 * Members of a mirrored group this repo deliberately holds differently.
 * Enumerated, so the exemption is a decision someone made and not a silence.
 */
const PROVIDER_EXCEPTIONS: Record<string, string> = {
  ".mcp.json#mcpServers.docdog":
    "runs `npx tsx src/cli/index.ts serve` — source mode, so the connected server " +
    "is current after an edit. The shipped entry pins the published package, which " +
    "would make the maintainer's own server permanently stale.",
  ".docdog/.gitignore#cache":
    "the disposable cache is ignored from the root `.gitignore` here, which predates " +
    "the per-project rule. The seed adds the rule where it is absent; it does not " +
    "require it to be in that particular file.",
  ".docdog/.gitignore#local":
    "same reason as the cache rule above — this repo keeps its docdog ignores in the " +
    "root `.gitignore`, where `.docdog/local/` sits beside `.docdog/cache/`. The seed " +
    "puts the rule where it is absent; it does not require a particular file.",
};

/** Groups that are not mirrored at all, each with the reason. */
const UNMIRRORED_GROUPS: Record<string, string> = {
  concepts:
    "this project extends its own vocabulary records with `examples:` and " +
    "`relationships:` naming records only this corpus has, so byte equality is the " +
    "wrong invariant. Provenance is checked instead — see below.",
  "skills-injectable":
    "rendered from the corpus, so there is nothing fixed to compare against, and " +
    "this repo installs them into an agent host rather than tracking them.",
  legacy:
    "shapes docdog no longer writes. Their whole purpose is to have no shipped side.",
};

const mirrored = (item: SeedItem): boolean =>
  MIRRORED_GROUPS.includes(item.group) && !(item.path in PROVIDER_EXCEPTIONS);

describe("the seed set is partitioned", () => {
  it("puts every group on one side or the other", () => {
    const groups = [...new Set(SEEDS.items.map((i) => i.group))].sort();
    const decided = [...MIRRORED_GROUPS, ...Object.keys(UNMIRRORED_GROUPS)].sort();
    expect(groups.filter((g) => !decided.includes(g))).toEqual([]);
  });

  it("names every exception in a mirrored group", () => {
    // A new provider seed lands here until someone says which side it is on.
    // The two exceptions are both provider members today; if a skill or script
    // ever needs one, this test is where that argument gets written down.
    const unexplained = SEEDS.items
      .filter((i) => MIRRORED_GROUPS.includes(i.group))
      .filter((i) => !mirrored(i))
      .map((i) => i.path)
      .filter((p) => !(p in PROVIDER_EXCEPTIONS));
    expect(unexplained).toEqual([]);
  });

  it("renders every member it needs for the comparison", () => {
    // An unavailable member has no shipped side, so a mirror check would
    // silently skip it. Only the injectable skills can be unavailable, and
    // they are not mirrored — but assert the reason rather than the outcome,
    // so a mirrored member that stops rendering fails instead of vanishing.
    const blind = SEEDS.unavailable.filter((u) => !(u.group in UNMIRRORED_GROUPS));
    expect(blind.map((u) => `${u.path}: ${u.reason}`)).toEqual([]);
  });
});

describe("mirrored seeds are byte-identical to what docdog ships", () => {
  const items = SEEDS.items.filter(mirrored);

  it("finds the members to check", () => {
    // Guards against the check passing because the filter matched nothing.
    expect(items.length).toBeGreaterThanOrEqual(8);
  });

  for (const item of items) {
    it(`${item.path} matches the template`, () => {
      expect(item.shipped, `${item.path} is no longer shipped`).not.toBeNull();
      expect(item.current, `${item.path} is missing from this repo`).not.toBeNull();
      expect(lf(item.current ?? ""), `${item.path} has drifted from templates/`).toBe(
        lf(item.shipped ?? ""),
      );
    });
  }
});

describe("concept records declare where they came from", () => {
  /**
   * `scope: shipped | user` is DP-002's provenance marker, and it is a
   * queryable claim — `--scope user` is how you ask what this project added
   * to the vocabulary. It was wrong in both directions here: nine records
   * this project invented claimed to be shipped, and the one record that is
   * shipped claimed to be the user's.
   *
   * This is the check byte equality cannot be, for the population where byte
   * equality is wrong: the seed set already knows exactly which concept files
   * docdog ships, so the marker never has to be maintained by hand.
   */
  const shippedNames = new Set(
    SEEDS.items.filter((i) => i.group === "concepts").map((i) => basename(i.path)),
  );

  it("ships the concepts this project's template asks for", () => {
    expect(shippedNames.size).toBeGreaterThan(20);
  });

  for (const file of readdirSync(join(ROOT, ".docdog", "concepts")).sort()) {
    if (!file.endsWith(".md")) continue;
    const expected = shippedNames.has(file) ? "shipped" : "user";
    it(`${file} declares scope: ${expected}`, () => {
      const raw = readFileSync(join(ROOT, ".docdog", "concepts", file), "utf-8");
      const declared = /^scope:\s*(\S+)\s*$/m.exec(raw)?.[1];
      expect(declared, `${file} declares no scope`).toBeDefined();
      expect(declared).toBe(expected);
    });
  }
});
