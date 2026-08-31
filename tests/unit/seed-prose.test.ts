/**
 * Seeded prose about docdog's own surface, pinned to the surface (FRICTION-042).
 *
 * `CLAUDE_MD_BLOCK_TEMPLATE` shipped 6 of the kernel 8 for two releases. It was
 * invisible because `init` only writes the block when it is absent, so nothing
 * ever compared shipped bytes to anything until `docdog update` existed — and
 * by then adopters whose blocks were *ahead* of the template were being offered
 * a downgrade.
 *
 * The general failure is "prose about the surface, duplicated across seeds,
 * corrected in only some of them" — the shape FEATURE-002 found in the corpus,
 * living in the templates. Duplication is fine; unpinned duplication is not.
 *
 * Two checks, doing different jobs:
 *   1. The two *surface summaries* must name every tool. They are the seeds
 *      whose job is to be exhaustive, so a new tool must land in both.
 *   2. No seed anywhere may name a `docdog_*` tool that does not exist. This
 *      catches renames and typos across every template, including skills that
 *      legitimately mention only the one or two tools they use.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { visibleTools } from "../../src/mcp/server.js";
import { CLAUDE_MD_BLOCK_TEMPLATE } from "../../src/engine/claude-md.js";
import { CLAUDE_PROVIDER_CONTENT, mcpServerEntry } from "../../src/engine/seed-set.js";
import { docdogVersion } from "../../src/engine/seed-manifest.js";

const TOOL_NAMES = visibleTools(false).map((t) => t.name);

/** Seeds whose job is to enumerate the whole MCP surface. */
const SURFACE_SUMMARIES: Array<[string, string]> = [
  ["CLAUDE_MD_BLOCK_TEMPLATE", CLAUDE_MD_BLOCK_TEMPLATE],
  ["CLAUDE_PROVIDER_CONTENT", CLAUDE_PROVIDER_CONTENT],
];

const TEMPLATES_DIR = join(process.cwd(), "templates");

function everyTemplateFile(dir: string, acc: Array<[string, string]> = []): Array<[string, string]> {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) everyTemplateFile(abs, acc);
    else if (abs.endsWith(".md") || abs.endsWith(".js")) acc.push([abs, readFileSync(abs, "utf-8")]);
  }
  return acc;
}

describe("seeded prose names the real MCP surface", () => {
  it("knows the kernel 8", () => {
    expect(TOOL_NAMES.sort()).toEqual([
      "docdog_create",
      "docdog_get",
      "docdog_index",
      "docdog_relate",
      "docdog_search",
      "docdog_status",
      "docdog_traverse",
      "docdog_update",
    ]);
  });

  for (const [label, content] of SURFACE_SUMMARIES) {
    it(`${label} names every tool`, () => {
      const missing = TOOL_NAMES.filter((name) => !content.includes(name));
      expect(missing, `${label} omits ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("names no tool that does not exist, in any seed", () => {
    const sources: Array<[string, string]> = [...SURFACE_SUMMARIES, ...everyTemplateFile(TEMPLATES_DIR)];
    const offenders: string[] = [];
    for (const [label, raw] of sources) {
      // `{{docdog_version}}` is a template placeholder, not a tool.
      const content = raw.replace(/\{\{[^}]*\}\}/g, "");
      for (const match of content.matchAll(/docdog_[a-z_]+/g)) {
        if (!TOOL_NAMES.includes(match[0])) offenders.push(`${label}: ${match[0]}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("the MCP wiring docdog writes", () => {
  it("pins the version (FRICTION-044)", () => {
    const entry = mcpServerEntry();
    expect(entry.args).toEqual(["-y", `@yasnikoff/docdog@${docdogVersion()}`, "serve"]);
  });

  it("is never the bare spec npx can strand", () => {
    // An unpinned spec resolves once and npx caches a caret range its own
    // resolution satisfies, so the adopter can sit on it indefinitely.
    expect(mcpServerEntry("9.9.9").args).not.toContain("@yasnikoff/docdog");
  });
});

describe("seeded prose describes v3 config", () => {
  it("does not resurrect the Arango-era vocabulary", () => {
    // The v2 words for `.docdog/config.yaml`: there is no connection to
    // configure (the cache is embedded SQLite) and no scopes (DD-070 §3).
    for (const [label, content] of SURFACE_SUMMARIES) {
      expect(content, `${label} still describes config as v2 did`).not.toMatch(
        /config\.yaml[^\n]*\b(connection|scopes)\b/,
      );
    }
  });
});
