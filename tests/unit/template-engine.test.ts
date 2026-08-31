import { describe, it, expect } from "vitest";
import { resolveTemplates, findTemplateVars } from "../../src/engine/template-engine.js";
import type { DocdogConfig } from "../../src/types/config.js";

const testConfig = {
  project: { name: "my-app" },
  infrastructure: { mongodb: "community" },
  api: { port: 6637, host: "localhost" },
  directAccess: { enabled: false },
  history: { snapshotRetention: 10 },
  export: { outputDir: "specs/", clean: false },
  ingest: {
    defaultTrust: "review",
    sources: {},
  },
} as DocdogConfig;

describe("resolveTemplates", () => {
  it("resolves config variables", () => {
    const input = "Files in {{config:export.outputDir}} are managed by docdog.";
    expect(resolveTemplates(input, testConfig)).toBe("Files in specs/ are managed by docdog.");
  });

  it("resolves nested config values", () => {
    const input = "Project: {{config:project.name}}, Port: {{config:api.port}}";
    expect(resolveTemplates(input, testConfig)).toBe("Project: my-app, Port: 6637");
  });

  it("leaves unresolved variables as-is", () => {
    const input = "{{config:nonexistent.path}} stays";
    expect(resolveTemplates(input, testConfig)).toBe("{{config:nonexistent.path}} stays");
  });

  it("handles multiple variables in one string", () => {
    const input = "{{config:project.name}} exports to {{config:export.outputDir}}";
    expect(resolveTemplates(input, testConfig)).toBe("my-app exports to specs/");
  });

  it("handles strings with no variables", () => {
    expect(resolveTemplates("no templates here", testConfig)).toBe("no templates here");
  });
});

describe("findTemplateVars", () => {
  it("finds all template variables", () => {
    const input = "{{config:project.name}} and {{config:export.outputDir}}";
    expect(findTemplateVars(input)).toEqual(["project.name", "export.outputDir"]);
  });

  it("returns empty for no variables", () => {
    expect(findTemplateVars("plain text")).toEqual([]);
  });
});
