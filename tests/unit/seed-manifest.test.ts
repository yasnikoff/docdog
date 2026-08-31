/**
 * PROPOSAL-041 — the seed manifest and the four-way classification.
 *
 * The classification is a pure function over (what docdog ships, what the
 * repo holds, what was recorded), so most of this file needs no repo at all.
 * The collector and `docdog update`'s end-to-end behavior are exercised in
 * `seed-update.test.ts`.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifySeed,
  classifySeeds,
  emptySeedManifest,
  readSeedManifest,
  recordSeed,
  seedHash,
  writeSeedManifest,
  type SeedManifest,
} from "../../src/engine/seed-manifest.js";

const V = "0.2.1";

function manifestWith(path: string, content: string): SeedManifest {
  const m = emptySeedManifest();
  recordSeed(m, path, content, V);
  return m;
}

describe("seedHash", () => {
  it("is EOL-agnostic — a CRLF checkout is not an edit", () => {
    expect(seedHash("a\r\nb\r\n")).toBe(seedHash("a\nb\n"));
  });

  it("still distinguishes actual content", () => {
    expect(seedHash("a\n")).not.toBe(seedHash("b\n"));
  });
});

describe("classifySeed — the four outcomes", () => {
  const shipped = "shipped v2\n";

  it("absent + shipped → add", () => {
    const c = classifySeed({ path: "x.md", shipped, current: null }, undefined);
    expect(c?.outcome).toBe("add");
  });

  it("absent + shipped + a manifest entry → add (init's repair semantics)", () => {
    const m = manifestWith("x.md", "shipped v1\n");
    const c = classifySeed({ path: "x.md", shipped, current: null }, m.entries["x.md"]);
    expect(c?.outcome).toBe("add");
    expect(c?.seededVersion).toBe(V);
  });

  it("present + hash matches + shipped moved → update", () => {
    const m = manifestWith("x.md", "shipped v1\n");
    const c = classifySeed({ path: "x.md", shipped, current: "shipped v1\n" }, m.entries["x.md"]);
    expect(c?.outcome).toBe("update");
  });

  it("present + hash matches + shipped is the same → unchanged", () => {
    const m = manifestWith("x.md", shipped);
    const c = classifySeed({ path: "x.md", shipped, current: shipped }, m.entries["x.md"]);
    expect(c?.outcome).toBe("unchanged");
  });

  it("present + hash differs → diverged, and it is never written", () => {
    const m = manifestWith("x.md", "shipped v1\n");
    const c = classifySeed({ path: "x.md", shipped, current: "MY EDIT\n" }, m.entries["x.md"]);
    expect(c?.outcome).toBe("diverged");
    expect(c?.seededVersion).toBe(V);
  });

  it("present with no manifest entry → untracked, i.e. the user's", () => {
    const c = classifySeed({ path: "x.md", shipped, current: "anything\n" }, undefined);
    expect(c?.outcome).toBe("untracked");
    expect(c?.seededVersion).toBeNull();
  });

  it("no longer shipped but still on disk → orphan, entry or not", () => {
    expect(classifySeed({ path: "x.md", shipped: null, current: "old\n" }, undefined)?.outcome).toBe(
      "orphan",
    );
    const m = manifestWith("x.md", "old\n");
    expect(
      classifySeed({ path: "x.md", shipped: null, current: "old\n" }, m.entries["x.md"])?.outcome,
    ).toBe("orphan");
  });

  it("no longer shipped and gone → nothing to say", () => {
    expect(classifySeed({ path: "x.md", shipped: null, current: null }, undefined)).toBeNull();
  });

  it("a CRLF worktree does not report every seeded file as modified", () => {
    const m = manifestWith("x.md", "line one\nline two\n");
    const c = classifySeed(
      { path: "x.md", shipped: "line one\nline two\n", current: "line one\r\nline two\r\n" },
      m.entries["x.md"],
    );
    expect(c?.outcome).toBe("unchanged");
  });

  it("normalizes backslash paths to manifest keys", () => {
    const m = manifestWith(".docdog/skills/search.md", "s\n");
    const c = classifySeed(
      { path: ".docdog\\skills\\search.md", shipped: "s\n", current: "s\n" },
      m.entries[".docdog/skills/search.md"],
    );
    expect(c?.path).toBe(".docdog/skills/search.md");
    expect(c?.outcome).toBe("unchanged");
  });
});

describe("classifySeeds", () => {
  it("drops the states with nothing to say and keeps the rest", () => {
    const m = manifestWith("a.md", "a1\n");
    const out = classifySeeds(
      [
        { path: "a.md", shipped: "a2\n", current: "a1\n" },
        { path: "b.md", shipped: "b\n", current: null },
        { path: "gone.md", shipped: null, current: null },
      ],
      m,
    );
    expect(out.map((c) => `${c.path}:${c.outcome}`)).toEqual(["a.md:update", "b.md:add"]);
  });
});

describe("manifest I/O", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-seed-manifest-"));
    mkdirSync(join(dir, ".docdog"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips, with sorted keys and a trailing newline", () => {
    const m = emptySeedManifest();
    recordSeed(m, "z.md", "z\n", V);
    recordSeed(m, "a.md", "a\n", V);
    writeSeedManifest(dir, m);

    const raw = readFileSync(join(dir, ".docdog", ".seeded.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.indexOf('"a.md"')).toBeLessThan(raw.indexOf('"z.md"'));

    const back = readSeedManifest(dir);
    expect(back.entries["a.md"].hash).toBe(seedHash("a\n"));
    expect(back.entries["a.md"].docdog).toBe(V);
  });

  it("a missing manifest reads as empty — every file is then the user's", () => {
    expect(readSeedManifest(dir).entries).toEqual({});
  });

  it("a malformed manifest reads as empty rather than throwing", () => {
    writeFileSync(join(dir, ".docdog", ".seeded.json"), "{ not json", "utf-8");
    expect(readSeedManifest(dir).entries).toEqual({});
  });
});
