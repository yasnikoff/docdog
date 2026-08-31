/**
 * The upgrade path (PROPOSAL-042).
 *
 * The two properties worth defending in a test are negative ones: the request
 * must describe nothing about its sender — DISC-039's consent asymmetry rests
 * entirely on that — and no failure may propagate, because the caller is in
 * the middle of file work that has to finish. Both are asserted here against
 * a stubbed `fetch` rather than the real registry, so the suite stays offline
 * and Docker-free.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PACKAGE_NAME,
  checkRegistry,
  describeInstall,
  formatUpdateLine,
  installShape,
  installWords,
  isNewer,
  performCheck,
  readUpdateCheck,
  registryUrl,
  updateCheckPath,
  upgradeInstruction,
  writeUpdateCheck,
  type UpdateCheck,
} from "../../src/engine/upgrade.js";

let root: string;
const NOW = new Date("2026-08-25T09:00:00.000Z");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docdog-upgrade-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("the registry request", () => {
  it("describes nothing about the sender", async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return { ok: true, json: async () => ({ version: "0.4.1" }) } as Response;
    });

    await checkRegistry("0.4.0", {}, NOW);

    expect(seen).toHaveLength(1);
    const { url, init } = seen[0];
    // The whole request: package name, and the dist-tag. No installed
    // version, no identifier, no query string at all.
    expect(url).toBe(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`);
    expect(url).not.toContain("0.4.0");
    expect(url).not.toContain("?");
    expect(init?.headers).toBeUndefined();
  });

  it("asks the configured mirror when npm names one", () => {
    expect(registryUrl({ npm_config_registry: "https://npm.internal.example/" })).toBe(
      "https://npm.internal.example",
    );
    expect(registryUrl({})).toBe("https://registry.npmjs.org");
  });
});

describe("every failure is a value", () => {
  const cases: Array<[string, () => void]> = [
    ["offline", () => vi.stubGlobal("fetch", async () => { throw new Error("ENOTFOUND"); })],
    ["a 404", () => vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }) as Response)],
    [
      "a body with no version",
      () => vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }) as Response),
    ],
    [
      "malformed JSON",
      () =>
        vi.stubGlobal("fetch", async () =>
          ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } }) as unknown as Response,
        ),
    ],
  ];

  for (const [label, stub] of cases) {
    it(`resolves rather than throws on ${label}`, async () => {
      stub();
      const check = await checkRegistry("0.4.0", {}, NOW);
      expect(check.latest).toBeNull();
      expect(check.error).toBeTruthy();
      expect(check.installed).toBe("0.4.0");
    });
  }
});

describe("the cached verdict", () => {
  it("round-trips through .docdog/cache/", () => {
    const check: UpdateCheck = {
      checked_at: NOW.toISOString(),
      installed: "0.4.0",
      latest: "0.4.1",
      registry: "https://registry.npmjs.org",
    };
    writeUpdateCheck(root, check);
    expect(updateCheckPath(root)).toContain(join(".docdog", "cache"));
    expect(readUpdateCheck(root)).toEqual(check);
  });

  it("reads a corrupt file as absent rather than crashing status", () => {
    mkdirSync(join(root, ".docdog", "cache"), { recursive: true });
    writeFileSync(updateCheckPath(root), "{ not json", "utf-8");
    expect(readUpdateCheck(root)).toBeNull();
  });

  it("is written as readable JSON", () => {
    writeUpdateCheck(root, {
      checked_at: NOW.toISOString(),
      installed: "0.4.0",
      latest: "0.4.0",
      registry: "https://registry.npmjs.org",
    });
    expect(readFileSync(updateCheckPath(root), "utf-8")).toContain('"installed": "0.4.0"');
  });
});

describe("isNewer", () => {
  it.each([
    ["0.4.1", "0.4.0", true],
    ["0.5.0", "0.4.9", true],
    ["1.0.0", "0.9.9", true],
    ["0.4.0", "0.4.0", false],
    ["0.3.9", "0.4.0", false],
  ])("%s vs %s → %s", (latest, installed, expected) => {
    expect(isNewer(latest, installed)).toBe(expected);
  });

  it("answers false when it cannot tell — 'unknown' must never read as 'behind'", () => {
    expect(isNewer("unknown", "0.4.0")).toBe(false);
    expect(isNewer("0.4.1", "unknown")).toBe(false);
  });
});

describe("install shape", () => {
  it.each([
    ["/home/u/.npm/_npx/ab12/node_modules/@yasnikoff/docdog/dist/cli/index.js", "npx"],
    ["/usr/lib/node_modules/@yasnikoff/docdog/dist/cli/index.js", "global"],
    ["/repo/src/cli/index.ts", "source"],
  ])("%s → %s", (entry, expected) => {
    expect(installShape(entry)).toBe(expected);
  });

  it("distinguishes the project's own dependency from a global one", () => {
    const entry = "/repo/node_modules/@yasnikoff/docdog/dist/cli/index.js";
    expect(installShape(entry, "/repo")).toBe("dependency");
    expect(installShape(entry, "/elsewhere")).toBe("global");
  });

  it("has nothing to tell a source checkout — including a linked one", () => {
    // npm link and a checkout are indistinguishable by path, which is the
    // configuration that hid FRICTION-044 from the maintainer.
    expect(upgradeInstruction("source")).toBeNull();
    expect(upgradeInstruction("global")).toContain("npm i -g");
    expect(upgradeInstruction("dependency")).toContain("npm i -D");
    expect(upgradeInstruction("npx")).toContain("docdog update");
  });
});

describe("formatUpdateLine", () => {
  const at = (iso: string, latest: string | null, error?: string): UpdateCheck => ({
    checked_at: iso,
    installed: "0.4.0",
    latest,
    registry: "https://registry.npmjs.org",
    ...(error ? { error } : {}),
  });

  it("says so when nothing has ever been checked", () => {
    expect(formatUpdateLine("0.4.0", null, NOW)).toContain("never checked");
  });

  it("names the newer version and the age of the answer", () => {
    const line = formatUpdateLine("0.4.0", at("2026-08-22T09:00:00.000Z", "0.4.1"), NOW);
    expect(line).toContain("0.4.1 available");
    expect(line).toContain("you are on 0.4.0");
    expect(line).toContain("3d ago");
  });

  it("reports currency with its age, because a stale 'current' is not the same claim", () => {
    expect(formatUpdateLine("0.4.0", at("2026-08-25T08:00:00.000Z", "0.4.0"), NOW)).toBe(
      "**Update:** current as of 1h ago.",
    );
  });

  it("reports a failed check as a failed check", () => {
    const line = formatUpdateLine("0.4.0", at("2026-08-25T08:30:00.000Z", null, "ENOTFOUND"), NOW);
    expect(line).toContain("could not reach");
    expect(line).toContain("ENOTFOUND");
  });
});

describe("describeInstall", () => {
  it("carries the version, the shape and the cached verdict, and opens no socket", async () => {
    // The environment block PROPOSAL-043's issue template requires. A report
    // that arrives without a version costs a round-trip to ask for one.
    vi.stubGlobal("fetch", async () => {
      throw new Error("describeInstall must never fetch");
    });
    const report = describeInstall(root, "/usr/lib/node_modules/@yasnikoff/docdog/dist/x.js");
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.shape).toBe("global");
    expect(report.check).toBeNull();

    writeUpdateCheck(root, {
      checked_at: NOW.toISOString(),
      installed: "0.4.0",
      latest: "0.4.1",
      registry: "https://registry.npmjs.org",
    });
    expect(describeInstall(root, "/repo/src/cli/index.ts").check?.latest).toBe("0.4.1");
  });

  it("has words for every shape", () => {
    for (const shape of ["npx", "global", "dependency", "source"] as const) {
      expect(installWords(shape).length).toBeGreaterThan(0);
    }
  });
});

describe("--check honours its modifiers", () => {
  const stubFetch = () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ version: "9.9.9" }) } as unknown as Response;
    });
    return calls;
  };

  it("--offline answers from the cached verdict and opens no socket", async () => {
    const calls = stubFetch();
    writeUpdateCheck(root, {
      checked_at: NOW.toISOString(),
      installed: "0.4.0",
      latest: "0.4.1",
      registry: "https://registry.npmjs.org",
    });
    const check = await performCheck({ projectRoot: root, installed: "0.4.0", offline: true });
    expect(calls).toEqual([]);
    expect(check?.latest).toBe("0.4.1");
  });

  it("--offline with nothing cached answers null rather than fetching anyway", async () => {
    const calls = stubFetch();
    expect(await performCheck({ projectRoot: root, installed: "0.4.0", offline: true })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("--dry-run asks but caches nothing, because the verdict is a write", async () => {
    stubFetch();
    const check = await performCheck({ projectRoot: root, installed: "0.4.0", dryRun: true });
    expect(check?.latest).toBe("9.9.9");
    expect(readUpdateCheck(root)).toBeNull();
  });

  it("a plain check asks and caches", async () => {
    stubFetch();
    await performCheck({ projectRoot: root, installed: "0.4.0" });
    expect(readUpdateCheck(root)?.latest).toBe("9.9.9");
  });
});
