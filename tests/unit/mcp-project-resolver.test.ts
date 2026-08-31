/**
 * PROPOSAL-033 — per-call project resolution.
 *
 * The rules under test are the ones that keep a machine-scope server safe:
 * a bad explicit root fails instead of falling back, a rootless server
 * demands a root, and a valid root resolves by walk-up exactly as cwd does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectResolver, ProjectResolutionError } from "../../src/mcp/project-resolver.js";

let base: string;
let projectA: string;
let projectB: string;
let nested: string;
let notAProject: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "docdog-resolver-"));

  projectA = join(base, "alpha");
  mkdirSync(join(projectA, ".docdog"), { recursive: true });
  writeFileSync(join(projectA, ".docdog", "config.yaml"), "project:\n  name: alpha\n");

  projectB = join(base, "beta");
  mkdirSync(join(projectB, ".docdog"), { recursive: true });
  writeFileSync(join(projectB, ".docdog", "config.yaml"), "project:\n  name: beta\n");

  // A directory inside project A — walk-up should find A from here.
  nested = join(projectA, "specs", "notes");
  mkdirSync(nested, { recursive: true });

  notAProject = join(base, "plain");
  mkdirSync(notAProject, { recursive: true });
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("ProjectResolver — the default root", () => {
  it("uses the default project when the call names no root", () => {
    const r = new ProjectResolver(projectA);
    const resolved = r.resolve(undefined);
    expect(resolved.projectRoot).toBe(projectA);
    expect(resolved.config.project.name).toBe("alpha");
  });

  it("treats an empty-string root as absent", () => {
    const r = new ProjectResolver(projectA);
    expect(r.resolve("").projectRoot).toBe(projectA);
  });

  it("demands a root when the server has no default project", () => {
    const r = new ProjectResolver(null);
    try {
      r.resolve(undefined);
      expect.unreachable("expected ROOT_REQUIRED");
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectResolutionError);
      expect((err as ProjectResolutionError).code).toBe("ROOT_REQUIRED");
    }
  });

  it("still serves an explicit root when it has no default project", () => {
    const r = new ProjectResolver(null);
    expect(r.resolve(projectB).config.project.name).toBe("beta");
  });
});

describe("ProjectResolver — an explicit root", () => {
  it("selects a project other than the default", () => {
    const r = new ProjectResolver(projectA);
    expect(r.resolve(projectB).config.project.name).toBe("beta");
    // ...and the default is untouched by that call.
    expect(r.resolve(undefined).config.project.name).toBe("alpha");
  });

  it("walks up from a directory inside the project", () => {
    const r = new ProjectResolver(null);
    expect(r.resolve(nested).projectRoot).toBe(projectA);
  });

  it("is a HARD ERROR when it is not a docdog project — it never falls back to the default", () => {
    const r = new ProjectResolver(projectA);
    try {
      r.resolve(notAProject);
      expect.unreachable("expected ROOT_NOT_A_PROJECT, not a silent fallback to alpha");
    } catch (err) {
      expect((err as ProjectResolutionError).code).toBe("ROOT_NOT_A_PROJECT");
    }
  });

  it("rejects a path that does not exist", () => {
    const r = new ProjectResolver(projectA);
    try {
      r.resolve(join(base, "ghost"));
      expect.unreachable("expected ROOT_NOT_FOUND");
    } catch (err) {
      expect((err as ProjectResolutionError).code).toBe("ROOT_NOT_FOUND");
    }
  });

  it("rejects a relative path — it would silently re-couple to the server's cwd", () => {
    const r = new ProjectResolver(projectA);
    try {
      r.resolve("./alpha");
      expect.unreachable("expected ROOT_NOT_ABSOLUTE");
    } catch (err) {
      expect((err as ProjectResolutionError).code).toBe("ROOT_NOT_ABSOLUTE");
    }
  });

  it("rejects a non-string root", () => {
    const r = new ProjectResolver(projectA);
    try {
      r.resolve(42);
      expect.unreachable("expected ROOT_NOT_A_STRING");
    } catch (err) {
      expect((err as ProjectResolutionError).code).toBe("ROOT_NOT_A_STRING");
    }
  });
});

describe("ProjectResolver — config freshness", () => {
  /**
   * The resolver used to memoize the config per project root for the life of
   * the process. A `docdog serve` outlives the config it booted with, so a
   * newly declared collection or scan path stayed invisible until restart —
   * observed in the field on a real migration. Read per call instead.
   */
  it("sees a config edit made between two calls", () => {
    const proj = join(base, "edited");
    const cfg = join(proj, ".docdog", "config.yaml");
    mkdirSync(join(proj, ".docdog"), { recursive: true });
    writeFileSync(cfg, "project:\n  name: edited\nvertex_collections:\n  - notes\n");

    const r = new ProjectResolver(proj);
    expect(r.resolve(undefined).config.vertex_collections).toEqual(["notes"]);

    // The user declares a new collection while the server keeps running.
    writeFileSync(cfg, "project:\n  name: edited\nvertex_collections:\n  - notes\n  - todo\n");

    expect(r.resolve(undefined).config.vertex_collections).toEqual(["notes", "todo"]);
  });

  it("picks up a new scan path without a restart", () => {
    const proj = join(base, "scanned");
    const cfg = join(proj, ".docdog", "config.yaml");
    mkdirSync(join(proj, ".docdog"), { recursive: true });
    writeFileSync(cfg, "project:\n  name: scanned\nscan_paths:\n  - specs/\n");

    const r = new ProjectResolver(null);
    expect(r.resolve(proj).config.scan_paths).toEqual(["specs/"]);

    writeFileSync(cfg, "project:\n  name: scanned\nscan_paths:\n  - specs/\n  - docs/\n");

    expect(r.resolve(proj).config.scan_paths).toEqual(["specs/", "docs/"]);
  });

  it("hands each call its own config object, so a mutation cannot leak between calls", () => {
    const r = new ProjectResolver(projectA);
    const first = r.resolve(projectA);
    first.config.project.name = "mutated in flight";
    expect(r.resolve(projectA).config.project.name).toBe("alpha");
  });
});
