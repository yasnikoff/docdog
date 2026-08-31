import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config/loader.js";

describe("config loader", () => {
  it("returns default config when no files exist", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.embed.provider).toBe("onnx");
    expect(config.search.preview_length).toBe(600);
    expect(config.git.enabled).toBe(true);
    expect(config.scan_paths).toEqual(["specs/"]);
  });

  it("applies environment variable overrides", () => {
    process.env.DOCDOG_PROJECT_NAME = "env-name";
    process.env.DOCDOG_EMBED_PROVIDER = "ollama";
    try {
      const config = loadConfig("/nonexistent/path");
      expect(config.project.name).toBe("env-name");
      expect(config.embed.provider).toBe("ollama");
    } finally {
      delete process.env.DOCDOG_PROJECT_NAME;
      delete process.env.DOCDOG_EMBED_PROVIDER;
    }
  });

  it("tolerates retired keys every existing project still carries", () => {
    // FRICTION-052. `ingest.sanitization` was written by `docdog init` into
    // every project docdog ever created, so removing it from the type must
    // not make those configs unloadable — the deep merge carries unknown
    // keys past the type, exactly as it does for the v2-era `arango:`.
    //
    // Runtime, not compile time: `tsconfig.json` excludes `tests`, so a
    // stale reference in a test is caught here or not at all.
    const dir = mkdtempSync(join(tmpdir(), "docdog-legacycfg-"));
    try {
      mkdirSync(join(dir, ".docdog"), { recursive: true });
      writeFileSync(
        join(dir, ".docdog", "config.yaml"),
        [
          "project:",
          "  name: legacy",
          "scan_paths:",
          "  - specs/",
          "default_collection: notes",
          "ingest:",
          "  sanitization:",
          "    mode: redact",
          "    systemDefaults: true",
          "    rules: []",
          "arango:",
          "  url: http://localhost:8529",
          "",
        ].join("\n"),
        "utf-8",
      );

      const config = loadConfig(dir);
      expect(config.project.name).toBe("legacy");
      expect(config.scan_paths).toEqual(["specs/"]);
      // The real keys still resolve from defaults alongside the dead ones.
      expect(config.embed.provider).toBe("onnx");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no longer knows what sanitization is", () => {
    // The claim FRICTION-052 was filed about is gone from the shape docdog
    // writes, not merely unread. A key docdog authors is a promise; this one
    // announced `mode: redact, systemDefaults: true` while the engine behind
    // it was imported by nothing but its own tests.
    const config = loadConfig("/nonexistent/path") as Record<string, unknown>;
    expect(config.ingest).toBeUndefined();
  });
});
