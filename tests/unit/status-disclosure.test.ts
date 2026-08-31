/**
 * Every read surface discloses `status` (FRICTION-053).
 *
 * `list` and `get` always did. `search` — the surface that RANKS records for
 * you — and `traverse` — the surface that WALKS to records you never named —
 * did not, on both the CLI and the MCP half. The corpus routed around it by
 * hand: 71 of 360 records opened their body with a written-out status banner,
 * which is a second copy of a frontmatter field, maintained by memory, free
 * to disagree with the field it copies.
 *
 * So this walks the surfaces rather than asserting one line, in the shape
 * FRICTION-050 established: the invariant is that EVERY read surface says
 * whether a record is live, and a fifth one should fail here.
 *
 * The two search surfaces are reached through exported formatters, because
 * they cannot otherwise run without loading the real ONNX embedder, which
 * this suite never does. The two traverse surfaces need no embedder and are
 * exercised end to end.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { cacheFilePath } from "../../src/storage/cache.js";
import { formatSearchHit } from "../../src/cli/commands/search.js";
import { formatHitHeader } from "../../src/mcp/tools/search.js";
import { registerTraverseCommand } from "../../src/cli/commands/traverse.js";
import { handleTraverse } from "../../src/mcp/tools/traverse.js";

const STALE = "superseded";

describe("search surfaces disclose status", () => {
  const hit = {
    id: "EJ-030",
    title: "Docdog is a memory layer",
    collection: "decisions",
    status: STALE,
    scope: "shared",
  };

  it("CLI search names it on the result line", () => {
    expect(formatSearchHit(hit, "vector=0.685, bm25=4.45")).toContain(STALE);
  });

  it("MCP search names it in the header", () => {
    expect(formatHitHeader(0, "[EJ-030]", hit)).toContain(STALE);
  });

  it("MCP search still suppresses scope at its DD-058 default", () => {
    // The asymmetry is deliberate, and is why status could not simply follow
    // scope's rule: 323 of 360 records inherit `shared` without writing it,
    // so printing it is noise. No status is inherited that way.
    expect(formatHitHeader(0, "[EJ-030]", hit)).not.toContain("scope:");
    expect(formatHitHeader(0, "[EJ-030]", { ...hit, scope: "user" })).toContain("scope:user");
  });

  it("names a live status too, rather than only flagging the exceptional", () => {
    // Always-on, matching `list` and `get`. A surface printing status only
    // when it is stale makes silence mean two things — "current" and "this
    // renderer predates the fix" — which is the ambiguity that let the
    // omission stand as long as it did.
    expect(formatSearchHit({ ...hit, status: "current" }, "x")).toContain("current");
    expect(formatHitHeader(0, "[X]", { ...hit, status: "current" })).toContain("current");
  });
});

describe("traverse surfaces disclose status", () => {
  let dir: string;
  let config: DocdogConfig;
  const cwd = process.cwd();

  const fakeEmbed: EmbedBatchFn = async (_c, texts) => texts.map((t) => [t.length, 1, 2]);

  const record = (id: string, status: string, rel?: string) => {
    const edge = rel ? `relationships:
  - references: ${rel}
    context: c
` : "";
    return `---
id: ${id}
title: Record ${id}
collection: notes
status: ${status}
${edge}---

Body of ${id}.
`;
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-statusdisc-"));
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(join(dir, "specs", "live.md"), record("LIVE-1", "current", "OLD-1"));
    writeFileSync(join(dir, "specs", "old.md"), record("OLD-1", STALE));
    config = {
      ...defaultConfig,
      project: { name: "status-disclosure" },
      scan_paths: ["specs/"],
      vertex_collections: ["notes"],
      default_collection: "notes",
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cacheFilePath(dir),
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
  });

  afterAll(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  async function runTraverse(args: string[]): Promise<string[]> {
    process.chdir(dir);
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    try {
      const program = new Command();
      registerTraverseCommand(program);
      await program.parseAsync(["node", "docdog", "traverse", ...args]);
    } finally {
      spy.mockRestore();
      process.chdir(cwd);
    }
    return out;
  }

  it("MCP traverse names the neighbour's status", async () => {
    const res = await handleTraverse(config, dir, { vertex_id: "LIVE-1", depth: 1 });
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("OLD-1");
    expect(text).toContain(STALE);
  });

  it("CLI traverse names it on the neighbour line", async () => {
    const line = (await runTraverse(["LIVE-1"])).find((l) => l.includes("OLD-1"));
    expect(line).toBeDefined();
    expect(line).toContain(STALE);
  });

  it("CLI traverse --json carries it, which it did not before", async () => {
    // The --json projection listed id/title/collection/source_file and dropped
    // status, so a machine consumer could not recover it at all — strictly
    // worse than the human surface, which at least printed the file path.
    const out = await runTraverse(["LIVE-1", "--json"]);
    const rows = JSON.parse(out.join("")) as Array<{ id: string; status: string }>;
    expect(rows.find((r) => r.id === "OLD-1")?.status).toBe(STALE);
  });
});
