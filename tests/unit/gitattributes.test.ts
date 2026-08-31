/**
 * The `.gitattributes` managed block — PROPOSAL-030 §4. The driver's scope
 * is derived from scan_paths so it cannot drift silently; these are the
 * mechanics of that derivation, the injection that preserves a user's own
 * rules, and the drift report `docdog index` prints.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  gitattributesDrift,
  gitattributesPatterns,
  injectGitattributesBlock,
  readManagedBlock,
  renderGitattributesBlock,
} from "../../src/engine/gitattributes.js";

describe("gitattributesPatterns", () => {
  it("expands directories to their markdown and leaves file paths alone", () => {
    expect(gitattributesPatterns(["specs/", ".docdog/", "CONTRIBUTING.md"])).toEqual([
      "specs/**/*.md",
      ".docdog/**/*.md",
      "CONTRIBUTING.md",
    ]);
  });

  it("reads the path out of an object scan-path entry", () => {
    expect(gitattributesPatterns([{ path: "specs/decisions", parser: "default" }])).toEqual([
      "specs/decisions/**/*.md",
    ]);
  });

  it("normalizes separators and drops duplicates", () => {
    expect(gitattributesPatterns(["./specs\\", "specs/", "specs"])).toEqual(["specs/**/*.md"]);
  });
});

describe("the managed block", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-attrs-"));
    path = join(dir, ".gitattributes");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is idempotent — regenerating on the same config changes no bytes", () => {
    const block = renderGitattributesBlock(["specs/", "CONTRIBUTING.md"]);
    injectGitattributesBlock(path, block);
    const first = readFileSync(path, "utf-8");
    injectGitattributesBlock(path, block);
    expect(readFileSync(path, "utf-8")).toBe(first);
  });

  it("preserves the user's own rules outside the markers", () => {
    writeFileSync(path, "*.png binary\n", "utf-8");
    injectGitattributesBlock(path, renderGitattributesBlock(["specs/"]));
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("*.png binary");
    expect(content).toContain("specs/**/*.md  merge=docdog");
  });

  it("replaces a stale block in place, not append a second one", () => {
    injectGitattributesBlock(path, renderGitattributesBlock(["specs/"]));
    injectGitattributesBlock(path, renderGitattributesBlock(["specs/", ".docdog/"]));
    const content = readFileSync(path, "utf-8");
    expect(content.match(/>>> docdog managed/g)).toHaveLength(1);
    expect(content).toContain(".docdog/**/*.md");
  });

  it("has no managed block before one is written", () => {
    expect(readManagedBlock(path)).toBeNull();
  });
});

describe("gitattributesDrift", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docdog-attrs-"));
    path = join(dir, ".gitattributes");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is absent — not drifted — when the driver was never installed", () => {
    expect(gitattributesDrift(path, ["specs/"]).kind).toBe("absent");
    writeFileSync(path, "*.png binary\n", "utf-8");
    expect(gitattributesDrift(path, ["specs/"]).kind).toBe("absent");
  });

  it("is ok when the block matches scan_paths", () => {
    injectGitattributesBlock(path, renderGitattributesBlock(["specs/", "CONTRIBUTING.md"]));
    expect(gitattributesDrift(path, ["specs/", "CONTRIBUTING.md"]).kind).toBe("ok");
  });

  it("names both halves of the drift when scan_paths moved on", () => {
    injectGitattributesBlock(path, renderGitattributesBlock(["specs/", "old/"]));
    const drift = gitattributesDrift(path, ["specs/", ".docdog/"]);
    expect(drift.kind).toBe("drifted");
    if (drift.kind !== "drifted") return;
    expect(drift.missing).toEqual([".docdog/**/*.md"]);
    expect(drift.extra).toEqual(["old/**/*.md"]);
  });
});
