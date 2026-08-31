/**
 * Clone-wide liveness — DISC-032.
 *
 * The bug this replaces was not a wrong sweep but an unreachable one:
 * `shared` meant "git answered", so gc refused on every git repo,
 * including single-worktree ones. So the tests that matter are about
 * *reach*: one tree sweeps, several trees union, and a tree nobody has
 * indexed is reported rather than silently treated as empty.
 *
 * Real `git worktree add` rather than a fake — the parser reads git's
 * porcelain output, and a hand-rolled fixture would only prove the
 * fixture matches the parser.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { collectCloneLiveness } from "../../src/storage/clone-liveness.js";
import { gitWorktrees, resetGitProbeCache } from "../../src/storage/git.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";

const DD_001 = `---
id: DD-001
title: First decision
---

Alpha body one.
`;

const DD_002 = `---
id: DD-002
title: Second decision
---

Bravo body two.
`;

/** Quietly run git; returns false when git is unavailable or refuses. */
function git(cwd: string, ...args: string[]): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore", timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

describe("clone-wide liveness", () => {
  let dir: string;
  let config: DocdogConfig;

  const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

  beforeEach(() => {
    resetGitProbeCache();
    dir = mkdtempSync(join(tmpdir(), "docdog-clone-"));
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "dd-001.md"), DD_001);
    config = {
      ...defaultConfig,
      project: { name: "clone-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
  });

  afterEach(() => {
    resetGitProbeCache();
    rmSync(dir, { recursive: true, force: true });
  });

  function opts(root: string): CacheIndexerOptions {
    return {
      config,
      projectRoot: root,
      embedStorePath: join(dir, "shared-embeddings.db"),
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    };
  }

  /** Initialize a repo with one commit. Returns false if git is unusable. */
  function initRepo(): boolean {
    if (!git(dir, "init", "-b", "main")) return false;
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "Test");
    git(dir, "config", "commit.gpgsign", "false");
    return git(dir, "add", "-A") && git(dir, "commit", "-m", "initial");
  }

  it("treats a directory outside git as a single tree rather than none", async () => {
    // The tier-1 fallback (DD-050): no git, no worktree list, and gc must
    // still sweep. Reading "git could not answer" as "no trees" would
    // produce an empty union and evict the entire store.
    await runCacheIndexer(opts(dir));

    const liveness = collectCloneLiveness(dir);

    expect(liveness.trees).toHaveLength(1);
    expect(liveness.trees[0].current).toBe(true);
    expect(liveness.live.size).toBe(1);
    expect(liveness.blind).toEqual([]);
  });

  it("reports one tree for an ordinary single-worktree repo — the case gc used to refuse", async () => {
    if (!initRepo()) return; // no usable git here; the fallback test above covers it
    await runCacheIndexer(opts(dir));

    const liveness = collectCloneLiveness(dir);

    expect(liveness.trees).toHaveLength(1);
    expect(liveness.live.size).toBe(1);
    expect(liveness.blind).toEqual([]);
  });

  it("unions a linked worktree's hashes, so content only it holds stays live", async () => {
    if (!initRepo()) return;

    // A branch whose corpus differs from main: the record main never had is
    // exactly the row a single-tree sweep would wrongly evict.
    const wt = join(dir, "..", `${config.project.name}-wt-${process.pid}`);
    if (!git(dir, "worktree", "add", "-b", "side", wt)) return;

    try {
      writeFileSync(join(wt, "specs", "dd-002.md"), DD_002);
      await runCacheIndexer(opts(dir));
      await runCacheIndexer(opts(wt));

      const liveness = collectCloneLiveness(dir);

      expect(liveness.trees).toHaveLength(2);
      expect(liveness.trees.filter((t) => t.current)).toHaveLength(1);
      expect(liveness.blind).toEqual([]);
      // Main holds DD-001; the worktree holds DD-001 + DD-002. Two distinct
      // bodies across the clone, and the union sees both.
      expect(liveness.live.size).toBe(2);
    } finally {
      git(dir, "worktree", "remove", "--force", wt);
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it("names an unindexed sibling as a blind spot instead of counting it as empty", async () => {
    if (!initRepo()) return;

    const wt = join(dir, "..", `${config.project.name}-blind-${process.pid}`);
    if (!git(dir, "worktree", "add", "-b", "blind", wt)) return;

    try {
      await runCacheIndexer(opts(dir)); // this tree only — the sibling never indexes

      const liveness = collectCloneLiveness(dir);

      expect(liveness.trees).toHaveLength(2);
      expect(liveness.blind).toHaveLength(1);
      expect(liveness.blind[0].readable).toBe(false);
      expect(liveness.blind[0].hashes).toBeNull();
      expect(existsSync(join(wt, ".docdog", "cache", "index.db"))).toBe(false);
      // It contributes nothing — which is precisely why gc reports it by
      // name rather than pretending the union is complete.
      expect(liveness.live.size).toBe(1);
    } finally {
      git(dir, "worktree", "remove", "--force", wt);
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it("returns no worktrees outside a repository, which callers must read as unknown", () => {
    expect(gitWorktrees(dir)).toEqual([]);
  });
});
