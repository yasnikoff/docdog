/**
 * The server's own vintage (PROPOSAL-037).
 *
 * Four states, and the two that matter are the ones each signal alone gets
 * wrong: a source edit is invisible to a version compare, and a package
 * update is invisible to an mtime compare (npm preserves publish mtimes on
 * extract, so newer code can carry older timestamps than the running
 * server's boot). The fifth test is the CLI's silence — `docdog status` has
 * no session to describe, which is PROPOSAL-032's stated reason for the
 * parity exception.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessVintage, formatAge, formatVintage, type BootStamp } from "../../src/engine/vintage.js";
import { handleStatus } from "../../src/mcp/tools/status.js";
import { defaultConfig } from "../../src/config/defaults.js";

let pkgRoot: string;
let codeRoot: string;

const writePkg = (version: string) =>
  writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ version }), "utf-8");

/** A file under the code root, stamped at an explicit mtime. */
const writeCode = (name: string, mtimeMs: number) => {
  const abs = join(codeRoot, name);
  writeFileSync(abs, "// code\n", "utf-8");
  utimesSync(abs, new Date(mtimeMs), new Date(mtimeMs));
};

const BOOT_AT = Date.UTC(2026, 7, 25, 9, 0, 0);

const bootStamp = (version: string): BootStamp => ({
  at: BOOT_AT,
  version,
  codeRoot,
  entry: join(codeRoot, "cli", "index.ts"),
});

beforeEach(() => {
  pkgRoot = mkdtempSync(join(tmpdir(), "docdog-vintage-"));
  codeRoot = join(pkgRoot, "src");
  mkdirSync(codeRoot, { recursive: true });
});

afterEach(() => {
  rmSync(pkgRoot, { recursive: true, force: true });
});

describe("assessVintage", () => {
  it("is current when neither signal moved", () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT - 60_000);
    const v = assessVintage(bootStamp("0.4.0"));
    expect(v.stale).toBe(false);
    expect(v.changedSinceBoot).toBe(0);
    expect(v.sourceMode).toBe(true);
  });

  it("catches a source edit the version compare cannot see", () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT + 120_000);
    const v = assessVintage(bootStamp("0.4.0"));
    expect(v.stale).toBe(true);
    expect(v.diskVersion).toBe("0.4.0"); // signal A is blind here
    expect(v.changedSinceBoot).toBe(1);
    expect(v.newestFile).toContain("a.ts");
  });

  it("catches a package update the mtime compare cannot see", () => {
    // npm preserves the tarball's mtimes: the new code is OLDER than boot.
    writePkg("0.4.1");
    writeCode("a.ts", BOOT_AT - 86_400_000);
    const v = assessVintage(bootStamp("0.4.0"));
    expect(v.stale).toBe(true);
    expect(v.changedSinceBoot).toBe(0); // signal B is blind here
    expect(v.diskVersion).toBe("0.4.1");
  });

  it("re-reads package.json from disk rather than trusting a module cache", () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT - 1000);
    expect(assessVintage(bootStamp("0.4.0")).diskVersion).toBe("0.4.0");
    writePkg("0.5.0");
    expect(assessVintage(bootStamp("0.4.0")).diskVersion).toBe("0.5.0");
  });

  it("ignores node_modules and .git under the code root", () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT - 1000);
    for (const dir of ["node_modules", ".git"]) {
      mkdirSync(join(codeRoot, dir), { recursive: true });
      const abs = join(codeRoot, dir, "fresh.js");
      writeFileSync(abs, "x", "utf-8");
      utimesSync(abs, new Date(BOOT_AT + 999_000), new Date(BOOT_AT + 999_000));
    }
    expect(assessVintage(bootStamp("0.4.0")).stale).toBe(false);
  });

  it("degrades rather than throws when there is no code root", () => {
    const v = assessVintage({ at: BOOT_AT, version: "0.4.0", codeRoot: null, entry: "?" });
    expect(v.stale).toBe(false);
    expect(v.diskVersion).toBe("unknown");
    expect(v.newestMtime).toBeNull();
  });

  it("an unreadable disk version never reports staleness on its own", () => {
    // No package.json at all: "unknown" must not be read as "different".
    writeCode("a.ts", BOOT_AT - 1000);
    expect(assessVintage(bootStamp("0.4.0")).stale).toBe(false);
  });
});

describe("formatVintage", () => {
  it("names both signals when both fired, and points at the CLI", () => {
    writePkg("0.4.1");
    writeCode("a.ts", BOOT_AT + 60_000);
    const lines = formatVintage(assessVintage(bootStamp("0.4.0")), BOOT_AT + 3_600_000);
    const text = lines.join("\n");
    expect(text).toContain("booted version 0.4.0, on disk 0.4.1");
    expect(text).toContain("1 file(s) under src/ changed since boot");
    expect(text).toContain("Restarting it is the host's action");
  });

  it("says nothing alarming when current", () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT - 1000);
    const text = formatVintage(assessVintage(bootStamp("0.4.0")), BOOT_AT + 60_000).join("\n");
    expect(text).toContain("· current");
    expect(text).not.toContain("STALE");
  });

  it("formats an age a reader can act on", () => {
    expect(formatAge(41_000)).toBe("41s");
    expect(formatAge(12 * 60_000)).toBe("12m");
    expect(formatAge(3 * 3_600_000 + 41 * 60_000)).toBe("3h 41m");
  });
});

describe("the Server block on docdog_status", () => {
  it("is absent when no boot stamp was passed — the CLI has no session", async () => {
    const res = await handleStatus({ ...defaultConfig, project: { name: "t" } }, pkgRoot, {});
    expect(JSON.stringify(res)).not.toContain("**Server:**");
  });

  it("is present on the no-cache path, because it describes the process", async () => {
    writePkg("0.4.0");
    writeCode("a.ts", BOOT_AT - 1000);
    const res = await handleStatus({ ...defaultConfig, project: { name: "t" } }, pkgRoot, {
      boot: bootStamp("0.4.0"),
    });
    const text = JSON.stringify(res);
    expect(text).toContain("No usable cache");
    expect(text).toContain("**Server:**");
  });
});
