/**
 * The union merge driver's `.git/config` half (FRICTION-041).
 *
 * The state under test is the broken one: `.gitattributes` claims
 * `merge=docdog` and git has no such driver, so every conflicting merge warns
 * per path. It is reachable two ways — `docdog update` writing the block
 * without the config (the reported bug), and a plain `git clone` of a repo
 * whose `.gitattributes` is tracked while `.git/config` is not (the case that
 * needs no docdog at all, and is probably the common one).
 *
 * Real git, on a real temp repository: the whole point is what `git config`
 * did, so a stub would test the mock.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MERGE_DRIVER_CONFIG,
  mergeDriverManualCommands,
  readMergeDriverState,
  reconcileMergeDriver,
  registerMergeDriver,
} from "../../src/engine/merge-driver.js";

const haveGit = (() => {
  try {
    return spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
})();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docdog-merge-driver-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!haveGit)("merge driver registration", () => {
  const gitInit = () => spawnSync("git", ["init"], { cwd: root, encoding: "utf-8" });

  it("reports an unregistered driver in a fresh repository", () => {
    gitInit();
    expect(readMergeDriverState(root)).toEqual({ git: true, registered: false });
  });

  it("registers both keys, not just the driver", () => {
    gitInit();
    expect(registerMergeDriver(root)).toBe(true);
    const state = readMergeDriverState(root);
    expect(state).toEqual({ git: true, registered: true });

    const read = (key: string) =>
      spawnSync("git", ["config", "--local", "--get", key], { cwd: root, encoding: "utf-8" }).stdout.trim();
    expect(read(MERGE_DRIVER_CONFIG.driver.key)).toBe(MERGE_DRIVER_CONFIG.driver.value);
    expect(read(MERGE_DRIVER_CONFIG.name.key)).toBe(MERGE_DRIVER_CONFIG.name.value);
  });

  it("half-registered reads as unregistered", () => {
    gitInit();
    // The state a hand-fix produces when only the driver line is pasted.
    spawnSync("git", ["config", "--local", MERGE_DRIVER_CONFIG.driver.key, MERGE_DRIVER_CONFIG.driver.value], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(readMergeDriverState(root).registered).toBe(false);
  });

  it("reconcile registers when the block claims a driver git does not have", () => {
    gitInit();
    const out = reconcileMergeDriver(root, true);
    expect(out).toEqual({ git: true, registered: true, blockPresent: true, registeredNow: true });
  });

  it("reconcile is idempotent — a second run writes nothing", () => {
    gitInit();
    reconcileMergeDriver(root, true);
    const second = reconcileMergeDriver(root, true);
    expect(second.registered).toBe(true);
    expect(second.registeredNow).toBe(false);
  });

  it("reconcile does not register when there is no block to honour", () => {
    gitInit();
    const out = reconcileMergeDriver(root, false);
    expect(out.registeredNow).toBe(false);
    expect(readMergeDriverState(root).registered).toBe(false);
  });
});

describe("merge driver outside git", () => {
  it("reports rather than throws when the directory is not a repository", () => {
    const out = reconcileMergeDriver(root, true);
    expect(out).toEqual({ git: false, registered: false, blockPresent: true, registeredNow: false });
  });

  it("hands the user the exact commands docdog would have run", () => {
    const cmds = mergeDriverManualCommands();
    expect(cmds).toHaveLength(2);
    expect(cmds[1]).toContain(MERGE_DRIVER_CONFIG.driver.value);
  });
});
