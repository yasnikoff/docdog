/**
 * Per-record visibility and the cross-visibility edge guard — PROPOSAL-047.
 *
 * The unit half pins the four-state classification against a real git repo,
 * because every state is defined by what git says and a fake would be pinning
 * this file's idea of git rather than git. The integration half runs the
 * guard through `runCacheIndexer`, which is where the wiring and the
 * path-scoped gate live.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import {
  buildVisibilityIndex,
  isCrossVisibilityLeak,
  isOutsideProjectTree,
  type Visibility,
} from "../../src/storage/visibility.js";
import {
  relateFileFirst,
  relateManyFileFirst,
  WriteError,
  type RelateInput,
} from "../../src/storage/writes.js";
import {
  suggestEdges,
  offeredSuggestions,
  crossVisibilityCount,
  isOffered,
} from "../../src/storage/suggest.js";
import { renderReviewDocument } from "../../src/storage/accept.js";
import { openCacheRead } from "../../src/storage/cache.js";

/** Quietly run git; returns false when git is unavailable or refuses. */
function git(cwd: string, ...args: string[]): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore", timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

const gitPresent = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
})();

const RELATION_CONCEPT = `---
id: CONCEPT-RELATION-REFERENCES
title: references
collection: concepts
concept_kind: relation
name: references
inverse_label: referenced by
symmetric: false
---

# references

The default relation.
`;

function record(id: string, target?: string): string {
  const rel = target
    ? `relationships:\n  - references: ${target}\n    context: points at it\n`
    : "";
  return `---\nid: ${id}\ntitle: Record ${id}\ncollection: notes\n${rel}---\n\n# ${id}\n\nBody of ${id}.\n`;
}

// ─── The rule, in isolation ─────────────────────────────────────────────────

describe("isCrossVisibilityLeak", () => {
  const states: Visibility[] = ["in-clone", "out-of-clone", "undecided"];

  it("fires on in-clone -> out-of-clone and on nothing else", () => {
    const firing: string[] = [];
    for (const from of states) {
      for (const to of states) {
        if (isCrossVisibilityLeak(from, to)) firing.push(`${from} -> ${to}`);
      }
    }
    expect(firing).toEqual(["in-clone -> out-of-clone"]);
  });

  it("treats the reversed edge as the repair, not a second violation", () => {
    // The whole premise of naming a repair: recording the same relationship
    // on the less-visible side must itself be clean, or the advice is a loop.
    expect(isCrossVisibilityLeak("out-of-clone", "in-clone")).toBe(false);
  });

  it("never fires on an undecided endpoint", () => {
    for (const other of states) {
      expect(isCrossVisibilityLeak("undecided", other)).toBe(false);
      expect(isCrossVisibilityLeak(other, "undecided")).toBe(false);
    }
  });
});

// ─── The classification, against a real repository ──────────────────────────

describe.skipIf(!gitPresent)("buildVisibilityIndex", () => {
  let dir: string;
  let outside: string;

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), "docdog-vis-"));
    dir = join(base, "repo");
    outside = join(base, "outside");
    mkdirSync(join(dir, "specs"), { recursive: true });
    mkdirSync(outside, { recursive: true });

    writeFileSync(join(outside, "external.md"), record("EXT-001"));
    writeFileSync(join(dir, "specs", "tracked.md"), record("PUB-001"));
    writeFileSync(join(dir, "specs", "ignored.md"), record("PRIV-001"));
    writeFileSync(join(dir, "specs", "fresh.md"), record("NEW-001"));
    writeFileSync(join(dir, ".gitignore"), "specs/ignored.md\n");

    git(dir, "init");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    git(dir, "add", ".gitignore", "specs/tracked.md");
    git(dir, "commit", "-m", "init");
  });

  afterEach(() => {
    rmSync(join(dir, ".."), { recursive: true, force: true });
  });

  const classify = (...paths: string[]) => {
    const index = buildVisibilityIndex(dir, paths);
    expect(index.available).toBe(true);
    return paths.map((p) => index.of(p));
  };

  it("calls a tracked file in-clone", () => {
    expect(classify("specs/tracked.md")).toEqual(["in-clone"]);
  });

  it("calls an ignored file out-of-clone", () => {
    expect(classify("specs/ignored.md")).toEqual(["out-of-clone"]);
  });

  it("calls a file outside the working tree out-of-clone", () => {
    expect(classify("../outside/external.md")).toEqual(["out-of-clone"]);
  });

  it("calls an untracked, unignored file UNDECIDED rather than out-of-clone", () => {
    // The load-bearing row. A record written and not yet committed is work in
    // progress; classifying it as out-of-clone would fire the guard on every
    // new record until commit, which is how a warning gets turned off.
    expect(classify("specs/fresh.md")).toEqual(["undecided"]);
  });

  it("lets tracked win over ignored when a file is both", () => {
    // The DD-071 audit shape: a file matched by an ignore rule that was
    // committed anyway. It IS in the clone; the ignore rule is inert on it.
    writeFileSync(join(dir, "specs", "both.md"), record("BOTH-001"));
    writeFileSync(join(dir, ".gitignore"), "specs/ignored.md\nspecs/both.md\n");
    git(dir, "add", "-f", "specs/both.md");
    git(dir, "commit", "-m", "track an ignored path");

    expect(classify("specs/both.md")).toEqual(["in-clone"]);
  });

  it("classifies every state in one pass", () => {
    expect(
      classify("specs/tracked.md", "specs/ignored.md", "specs/fresh.md", "../outside/external.md"),
    ).toEqual(["in-clone", "out-of-clone", "undecided", "out-of-clone"]);
  });

  it("reports unavailable outside a git repository, and answers undecided", () => {
    const bare = mkdtempSync(join(tmpdir(), "docdog-nogit-"));
    try {
      const index = buildVisibilityIndex(bare, ["specs/anything.md"]);
      expect(index.available).toBe(false);
      expect(index.of("specs/anything.md")).toBe("undecided");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("answers undecided for a path it was not built with", () => {
    const index = buildVisibilityIndex(dir, ["specs/tracked.md"]);
    expect(index.of("specs/never-seen.md")).toBe("undecided");
  });
});

// ─── The guard, through the indexer ─────────────────────────────────────────

describe.skipIf(!gitPresent)("cross-visibility edge guard", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let warnings: string[];

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-visguard-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "relation-references.md"), RELATION_CONCEPT);
    writeFileSync(join(dir, ".gitignore"), "specs/private.md\n");

    config = {
      ...defaultConfig,
      project: { name: "vis-guard-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes", "concepts"],
      default_collection: "notes",
    };
    warnings = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: (m) => warnings.push(m),
    };
  }

  const run = (extra: Partial<CacheIndexerOptions> = {}) =>
    runCacheIndexer({ ...opts(), ...extra });

  /** Commit everything git is allowed to see. */
  function commitAll() {
    git(dir, "init");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "init");
  }

  const leakWarning = () => warnings.find((w) => w.includes("will not be in a clone"));

  it("warns when a tracked record points at an ignored one", async () => {
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "PRIV-001"));
    writeFileSync(join(dir, "specs", "private.md"), record("PRIV-001"));
    commitAll();

    const stats = await run();
    expect(stats.crossVisibilityEdges).toBe(1);

    const warning = leakWarning();
    expect(warning).toBeDefined();
    expect(warning).toContain("PUB-001");
    expect(warning).toContain("PRIV-001");
    expect(warning).toContain("specs/public.md -> specs/private.md");
    // The repair is the point; a bare refusal would leave the author stuck.
    expect(warning).toContain("Record the relationship on the other side");
  });

  it("stays silent on the reversed edge — that is the repair", async () => {
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001"));
    writeFileSync(join(dir, "specs", "private.md"), record("PRIV-001", "PUB-001"));
    commitAll();

    const stats = await run();
    expect(stats.crossVisibilityEdges).toBe(0);
    expect(leakWarning()).toBeUndefined();
  });

  it("stays silent when the target is merely uncommitted", async () => {
    // Same corpus shape as the leak case, one git fact different: the target
    // is untracked because nobody has committed it yet, not because it is
    // excluded. Firing here would make the guard unusable mid-session.
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "DRAFT-001"));
    commitAll();
    writeFileSync(join(dir, "specs", "draft.md"), record("DRAFT-001"));

    const stats = await run();
    expect(stats.crossVisibilityEdges).toBe(0);
    expect(leakWarning()).toBeUndefined();
  });

  it("warns once the same target becomes deliberately excluded", async () => {
    // The pair to the test above, on one corpus: the ONLY thing that changes
    // is the ignore rule, so the verdict is provably derived from git rather
    // than from anything about the record.
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "DRAFT-001"));
    writeFileSync(join(dir, "specs", "draft.md"), record("DRAFT-001"));
    commitAll();
    expect((await run()).crossVisibilityEdges).toBe(0);

    warnings = [];
    git(dir, "rm", "--cached", "specs/draft.md");
    writeFileSync(join(dir, ".gitignore"), "specs/private.md\nspecs/draft.md\n");

    expect((await run({ full: true })).crossVisibilityEdges).toBe(1);
    expect(leakWarning()).toContain("DRAFT-001");
  });

  it("counts an edge to a record outside the working tree", async () => {
    const external = join(dir, "..", `external-${Date.now()}`);
    mkdirSync(external, { recursive: true });
    try {
      writeFileSync(join(external, "ext.md"), record("EXT-001"));
      writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "EXT-001"));
      commitAll();

      config = { ...config, scan_paths: ["specs/", `../${external.split(/[\\/]/).pop()}/`] };
      const stats = await run();
      expect(stats.crossVisibilityEdges).toBe(1);
      expect(leakWarning()).toContain("EXT-001");
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("is silent outside a git repository rather than absent", async () => {
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "PRIV-001"));
    writeFileSync(join(dir, "specs", "private.md"), record("PRIV-001"));
    // No commitAll() — never a repository at all.

    const stats = await run();
    expect(stats.crossVisibilityEdges).toBe(0);
    expect(leakWarning()).toBeUndefined();
    // And the other checks still ran, so "silent" means this check only.
    expect(stats.danglingEdges).toBe(0);
  });

  it("does not run on a path-scoped run", async () => {
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "PRIV-001"));
    writeFileSync(join(dir, "specs", "private.md"), record("PRIV-001"));
    commitAll();
    await run();

    warnings = [];
    const stats = await run({ paths: ["specs/public.md"] });
    expect(stats.crossVisibilityEdges).toBe(0);
    expect(leakWarning()).toBeUndefined();
  });

  it("leaves a dangling target to the dangling check, not this one", async () => {
    // Both ends must resolve. An edge to an id no record declares is already
    // reported under its own name; counting it twice would read as two defects.
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001", "NOBODY-001"));
    commitAll();

    const stats = await run();
    expect(stats.danglingEdges).toBe(1);
    expect(stats.crossVisibilityEdges).toBe(0);
  });
});

// ─── The write refusal ──────────────────────────────────────────────────────

describe.skipIf(!gitPresent)("cross-visibility write refusal", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    };
  }

  const edge = (fromId: string, toId: string): RelateInput => ({
    fromId,
    toId,
    type: "references",
    context: "written by a test",
  });

  const publicBody = () => readFileSync(join(dir, "specs", "public.md"), "utf-8");

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-viswrite-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "relation-references.md"), RELATION_CONCEPT);
    writeFileSync(join(dir, "specs", "public.md"), record("PUB-001"));
    writeFileSync(join(dir, "specs", "public2.md"), record("PUB-002"));
    writeFileSync(join(dir, "specs", "private.md"), record("PRIV-001"));
    writeFileSync(join(dir, ".gitignore"), ["specs/private.md", "cache.db", ""].join("\n"));

    config = {
      ...defaultConfig,
      project: { name: "vis-write-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes", "concepts"],
      default_collection: "notes",
    };

    git(dir, "init");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "init");

    await runCacheIndexer(opts());
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("refuses the single-edge write and names the repair", async () => {
    const err = await relateFileFirst(opts(), edge("PUB-001", "PRIV-001")).catch((e) => e);

    expect(err).toBeInstanceOf(WriteError);
    expect((err as WriteError).code).toBe("CROSS_VISIBILITY");
    expect((err as WriteError).message).toContain("will not be in a clone");
    expect((err as WriteError).message).toContain("Record the relationship on PRIV-001 instead");
    // A refusal that half-writes is worse than no guard at all.
    expect(publicBody()).not.toContain("PRIV-001");
  });

  it("writes it under the per-call override", async () => {
    const result = await relateFileFirst(opts(), edge("PUB-001", "PRIV-001"), {
      allowCrossVisibility: true,
    });
    expect(result.filePath).toBe("specs/public.md");
    expect(publicBody()).toContain("PRIV-001");
  });

  it("permits the reversed edge — the repair must not be refused too", async () => {
    const result = await relateFileFirst(opts(), edge("PRIV-001", "PUB-001"));
    expect(result.filePath).toBe("specs/private.md");
    expect(readFileSync(join(dir, "specs", "private.md"), "utf-8")).toContain("PUB-001");
  });

  it("permits an edge between two tracked records", async () => {
    await expect(relateFileFirst(opts(), edge("PUB-001", "PUB-002"))).resolves.toBeTruthy();
  });

  it("does not fire when the target has no record at all", async () => {
    // A dangling edge is honest frontmatter with its own warning; there is no
    // file to classify, and inventing a verdict would refuse a legal write.
    const result = await relateFileFirst(opts(), edge("PUB-001", "NOBODY-001"));
    expect(result.targetKnown).toBe(false);
    expect(publicBody()).toContain("NOBODY-001");
  });

  it("skips the row in a batch instead of aborting the run", async () => {
    const result = await relateManyFileFirst(opts(), [
      edge("PUB-001", "PRIV-001"),
      edge("PUB-002", "PUB-001"),
    ]);

    const [leak, ok] = result.outcomes;
    expect(leak.applied).toBe(false);
    expect(leak.skipReason).toBe("cross_visibility");
    expect(leak.detail).toContain("record the relationship on PRIV-001 instead");
    // Guards never abort a drain: the good row in the same batch still lands.
    expect(ok.applied).toBe(true);
    expect(result.edgesApplied).toBe(1);
    expect(result.filesWritten).toEqual(["specs/public2.md"]);
    expect(publicBody()).not.toContain("PRIV-001");
  });

  it("applies the batch row under the override", async () => {
    const result = await relateManyFileFirst(opts(), [edge("PUB-001", "PRIV-001")], {
      allowCrossVisibility: true,
    });
    expect(result.outcomes[0].applied).toBe(true);
    expect(publicBody()).toContain("PRIV-001");
  });

  it("reports an already-declared leak as already_declared, not cross_visibility", async () => {
    // Ordering matters: this run is not creating the edge, so claiming it was
    // skipped for leaking would change what re-running an accept file means.
    // The standing defect belongs to the index-time check.
    await relateFileFirst(opts(), edge("PUB-001", "PRIV-001"), { allowCrossVisibility: true });

    const result = await relateManyFileFirst(opts(), [edge("PUB-001", "PRIV-001")]);
    expect(result.outcomes[0].skipReason).toBe("already_declared");
  });

  it("does not refuse outside a git repository", async () => {
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    const result = await relateFileFirst(opts(), edge("PUB-001", "PRIV-001"));
    expect(result.filePath).toBe("specs/public.md");
  });
});

// ─── The scanner mark ───────────────────────────────────────────────────────

describe.skipIf(!gitPresent)("cross-visibility candidate marking", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  /** A record whose BODY mentions another id without declaring an edge. */
  function mentioning(id: string, mentioned: string): string {
    return [
      "---",
      `id: ${id}`,
      `title: Record ${id}`,
      "collection: notes",
      "---",
      "",
      `# ${id}`,
      "",
      `See ${mentioned} for the reasoning.`,
      "",
    ].join("\n");
  }

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    };
  }

  /** Run the scan the way the CLI does, index and all. */
  function scan(withVisibility = true) {
    const handle = openCacheRead(dir, { filePath: cachePath });
    try {
      const paths = (
        handle.db.prepare(`SELECT DISTINCT file_path FROM vertices`).all() as Array<{
          file_path: string;
        }>
      ).map((r) => r.file_path);
      return suggestEdges(handle.db, config, {
        visibility: withVisibility ? buildVisibilityIndex(dir, paths) : undefined,
      });
    } finally {
      handle.close();
    }
  }

  const find = (results: ReturnType<typeof scan>, from: string, to: string) =>
    results.find((r) => r.source_id === from)?.suggestions.find((s) => s.target_id === to);

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-vismark-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "relation-references.md"), RELATION_CONCEPT);
    writeFileSync(join(dir, "specs", "public.md"), mentioning("PUB-001", "PRIV-001"));
    writeFileSync(join(dir, "specs", "public2.md"), mentioning("PUB-002", "PUB-001"));
    writeFileSync(join(dir, "specs", "private.md"), mentioning("PRIV-001", "PUB-002"));
    writeFileSync(join(dir, ".gitignore"), ["specs/private.md", "cache.db", ""].join("\n"));

    config = {
      ...defaultConfig,
      project: { name: "vis-mark-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes", "concepts"],
      default_collection: "notes",
    };

    git(dir, "init");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    git(dir, "add", "-A");
    git(dir, "commit", "-m", "init");

    await runCacheIndexer(opts());
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("marks a candidate whose target will not be in a clone", () => {
    const s = find(scan(), "PUB-001", "PRIV-001");
    expect(s?.cross_visibility).toEqual({ target_file: "specs/private.md" });
  });

  it("MARKS but never hides — the candidate is still offered by default", () => {
    // The FRICTION-025 line. A rejection suppresses because someone judged
    // the pair; this is a fact about two files and the reviewer may still
    // want the relationship, recorded the other way round.
    const results = scan();
    const s = find(results, "PUB-001", "PRIV-001");
    expect(isOffered(s!)).toBe(true);
    expect(find(offeredSuggestions(results, false), "PUB-001", "PRIV-001")).toBeDefined();
    expect(crossVisibilityCount(results)).toBe(1);
  });

  it("leaves the private-to-public candidate unmarked — that direction is the repair", () => {
    expect(find(scan(), "PRIV-001", "PUB-002")?.cross_visibility).toBeUndefined();
  });

  it("leaves a tracked-to-tracked candidate unmarked", () => {
    expect(find(scan(), "PUB-002", "PUB-001")?.cross_visibility).toBeUndefined();
  });

  it("marks nothing when no visibility index is supplied", () => {
    const results = scan(false);
    expect(crossVisibilityCount(results)).toBe(0);
    expect(find(results, "PUB-001", "PRIV-001")).toBeDefined();
  });

  it("warns in the review document without pre-writing a reject:", () => {
    // A filter and a rejection are different claims (PROPOSAL-046). The row
    // must stay writable, or the guard has silently made the judgment.
    const doc = renderReviewDocument(scan());
    expect(doc).toContain("specs/private.md, which will not be in a clone");
    expect(doc).toContain("record it on PRIV-001 instead");

    const rowBlock = doc.slice(doc.indexOf("to: PRIV-001"));
    expect(rowBlock.slice(0, 120)).toContain('context: ""');
    // The four-space form is the ROW field; the header legitimately
    // explains `reject:` as an option the reviewer may choose.
    expect(doc).not.toContain("    reject:");
  });
});

/**
 * The two-repository case — FRICTION-054.
 *
 * A corpus reached through an external `scan_paths` entry lives in another
 * repository, and git knows what a clone of ONE repository contains without
 * being able to say whether another is more or less visible. Calling every
 * such target out-of-clone inverted the rule on exactly the arrangement
 * DD-073 created: private record -> public record is less-visible ->
 * more-visible, which PROPOSAL-047 permits, and it was refused.
 *
 * The pin is the PAIR. Same sibling repository, same edge shape; the only
 * difference is whether the target is ignored where it lives.
 */
describe.skipIf(!gitPresent)("buildVisibilityIndex across repositories", () => {
  let base: string;
  let proj: string;
  let sibling: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "docdog-vis-repos-"));
    proj = join(base, "proj");
    sibling = join(base, "sibling");
    mkdirSync(join(proj, "specs"), { recursive: true });
    mkdirSync(sibling, { recursive: true });

    writeFileSync(join(proj, "specs", "own.md"), record("OWN-001"));
    writeFileSync(join(sibling, "open.md"), record("SIB-OPEN"));
    writeFileSync(join(sibling, "hidden.md"), record("SIB-HIDDEN"));
    writeFileSync(join(sibling, ".gitignore"), "hidden.md\n");

    for (const d of [proj, sibling]) {
      git(d, "init");
      git(d, "config", "user.email", "t@example.com");
      git(d, "config", "user.name", "t");
    }
    git(proj, "add", "specs/own.md");
    git(proj, "commit", "-m", "init");
    git(sibling, "add", ".gitignore", "open.md");
    git(sibling, "commit", "-m", "init");
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const classify = (...paths: string[]) => {
    const index = buildVisibilityIndex(proj, paths);
    expect(index.available).toBe(true);
    return paths.map((p) => index.of(p));
  };

  it("calls a file tracked in ANOTHER repository undecided, not out-of-clone", () => {
    expect(classify("../sibling/open.md")).toEqual(["undecided"]);
  });

  it("still calls a file its own repository ignores out-of-clone", () => {
    // The protection that must survive: excluded where it lives is
    // undistributable wherever you look at it from.
    expect(classify("../sibling/hidden.md")).toEqual(["out-of-clone"]);
  });

  it("does not fire the guard on an edge into a sibling repository", () => {
    const [from, to] = classify("specs/own.md", "../sibling/open.md");
    expect(isCrossVisibilityLeak(from, to)).toBe(false);
  });

  it("still fires on an edge into a record the sibling repository ignores", () => {
    const [from, to] = classify("specs/own.md", "../sibling/hidden.md");
    expect(isCrossVisibilityLeak(from, to)).toBe(true);
  });

  it("classifies both sibling states and its own in one pass", () => {
    expect(classify("specs/own.md", "../sibling/open.md", "../sibling/hidden.md")).toEqual([
      "in-clone",
      "undecided",
      "out-of-clone",
    ]);
  });

  it("survives a sibling directory that is not a repository at all", () => {
    // No clone of anything carries it, which is the one out-of-tree verdict
    // git can be certain about.
    mkdirSync(join(base, "plain"), { recursive: true });
    writeFileSync(join(base, "plain", "p.md"), record("PLAIN-001"));
    expect(classify("../plain/p.md")).toEqual(["out-of-clone"]);
  });
});

describe("isOutsideProjectTree", () => {
  it("is true only for a path that walks out of the project", () => {
    expect(isOutsideProjectTree("../other/x.md")).toBe(true);
    expect(isOutsideProjectTree("..")).toBe(true);
    expect(isOutsideProjectTree("specs/x.md")).toBe(false);
    expect(isOutsideProjectTree("CONTRIBUTING.md")).toBe(false);
  });

  it("is a fact about the path, not a visibility verdict", () => {
    // It answers "does this corpus span repositories", which is reported
    // once per project. Nothing here refuses a write.
    expect(isOutsideProjectTree("../sibling/open.md")).toBe(true);
    expect(isOutsideProjectTree("../sibling/hidden.md")).toBe(true);
  });
});
