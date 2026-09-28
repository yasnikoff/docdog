/**
 * `pairs.within_file` — FRICTION-062 (issue #3).
 *
 * A multi-record file's records were written together, and an edge its head
 * states is stated for the whole entry. `pairs` used to settle only on a
 * direct edge, so on the reporter's corpus 289 sibling-section pairs and 412
 * section ~ row pairs (the row amended by the section's own entry) were
 * offered as strangers — 26% of what remained. The default now settles both;
 * `offer` restores the old behaviour. The boundary pinned hardest is that an
 * edge never lifts to a whole FILE: an entry that amends one row of a
 * many-row file must not settle its sections against the other rows.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { PairsError, nominatePairs, resolvePairEdges, type NominateOptions } from "../../src/storage/pairs.js";
import { describeSettings } from "../../src/storage/pairs-accept.js";

function relationConcept(name: string): string {
  return `---
id: CONCEPT-RELATION-${name.toUpperCase()}
title: "Relation: ${name}"
collection: concepts
concept_kind: relation
name: ${name}
inverse_label: ${name} by
symmetric: false
---

A ${name} B.
`;
}

// One record per entry head plus one per `## N.` section; the head amends the
// rows its frontmatter names, each section is part_of the head.
const LOG_SCRIPT = `export default function (input) {
  const slug = input.repoRelPath.split("/").pop().replace(/\\.md$/, "");
  const [, fm, body] = input.raw.replace(/\\r\\n/g, "\\n").match(/^---\\n([\\s\\S]*?)\\n---\\n([\\s\\S]*)$/);
  const amends = (fm.match(/amends: \\[(.*)\\]/) || [, ""])[1].split(",").map((s) => s.trim()).filter(Boolean);
  const parts = body.split(/^## (?=\\d+\\.)/m);
  const head = { sectionKey: slug, id: slug, title: slug, content: parts[0].trim() || slug,
    frontmatter: { id: slug, relationships: amends.map((r) => ({ amends: r })) }, collection: null };
  const secs = parts.slice(1).map((p) => {
    const id = slug + "§" + p.match(/^(\\d+)\\./)[1];
    return { sectionKey: id, id, title: id, content: p, frontmatter: { id, relationships: [{ part_of: slug }] }, collection: null };
  });
  return [head, ...secs];
}
`;

// One record per \`- D-n.\` row.
const ROWS_SCRIPT = `export default function (input) {
  const out = [];
  for (const line of input.raw.split("\\n")) {
    const m = line.match(/^- (D-\\d+)\\.\\s*(.*)$/);
    if (m) out.push({ sectionKey: m[1], id: m[1], title: m[2], content: line, frontmatter: { id: m[1] }, collection: null });
  }
  return out;
}
`;

const FILES: Record<string, string> = {
  ".docdog/scripts/logsec.js": LOG_SCRIPT,
  ".docdog/scripts/rows.js": ROWS_SCRIPT,
  "spec/log/2026-01-01-entry.md": `---
title: entry
amends: [D-1]
---
alpha preamble
## 1. first
alpha alpha one
## 2. second
alpha alpha two
`,
  "spec/decisions.md": `- D-1. alpha alpha the amended row
- D-2. alpha alpha a row the entry never names
`,
  ".docdog/concepts/relation-amends.md": relationConcept("amends"),
  ".docdog/concepts/relation-part-of.md": relationConcept("part_of"),
  ".docdog/concepts/relation-supersedes.md": relationConcept("supersedes"),
};

// Everything that says alpha is identical: similarity is not what is under test.
const fakeEmbed: EmbedBatchFn = async (_config, texts) =>
  texts.map((t) => [(t.match(/alpha/g) ?? []).length > 0 ? 1 : 0, 0, 0.001]);

describe("pairs.within_file (FRICTION-062)", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-pairs-file-"));
    cachePath = join(dir, "cache.db");
    for (const [rel, content] of Object.entries(FILES)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    config = {
      ...defaultConfig,
      project: { name: "pairs-within-file" },
      scan_paths: [
        { path: "spec/log/", parser: "script", script: "logsec", collection: "log" },
        { path: "spec/decisions.md", parser: "script", script: "rows", collection: "decisions" },
        ".docdog/concepts/",
      ],
      vertex_collections: ["log", "decisions", "concepts"],
      default_collection: "log",
    } as DocdogConfig;
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embedStorePath: join(dir, "embeddings.db"),
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function nominate(extra: NominateOptions = {}) {
    const db = new Database(cachePath, { readonly: true });
    try {
      return nominatePairs(db, config, { collections: ["log", "decisions"], threshold: 0.9, ...extra });
    } finally {
      db.close();
    }
  }
  const key = (x: string, y: string) => (x < y ? `${x}~${y}` : `${y}~${x}`);
  const keys = (r: ReturnType<typeof nominate>) => r.candidates.map((c) => key(c.a.id, c.b.id)).sort();
  const expected = (pairs: Array<[string, string]>) => pairs.map(([x, y]) => key(x, y)).sort();

  const E = "2026-01-01-entry";

  it("offers every pair when only a direct edge settles", () => {
    const r = nominate({ withinFile: "offer" });
    expect(r.settledWithinFile).toBe(0);
    expect(keys(r)).toEqual(
      expected([
        [E, `${E}§1`], [E, `${E}§2`], [`${E}§1`, `${E}§2`], // one entry
        ["D-1", "D-2"], // one rows file
        ["D-1", `${E}§1`], ["D-1", `${E}§2`], // the amended row, beside the entry's sections
        ["D-2", E], ["D-2", `${E}§1`], ["D-2", `${E}§2`], // a row the entry never names
      ]),
    );
    expect(r.settled).toBe(1); // entry amends D-1, directly
  });

  it("by default settles one file's records, and an entry's edge for its sections", () => {
    const r = nominate();
    expect(r.settings.withinFile).toBe("settle");
    // Only the row the entry never names is still a question.
    expect(keys(r)).toEqual(expected([["D-2", E], ["D-2", `${E}§1`], ["D-2", `${E}§2`]]));
    expect(r.settled).toBe(1);
    expect(r.settledWithinFile).toBe(6);
  });

  it("never lifts an edge to the whole file it points into", () => {
    // D-1 and D-2 share a file; the entry amends D-1. If files were the unit,
    // the entry would count as accounting for D-2 as well. It must not.
    expect(keys(nominate())).toContain(key("D-2", `${E}§1`));
  });

  it("is config, printed on every run, and refuses a value it does not know", () => {
    const withinFile = (within_file: unknown) =>
      resolvePairEdges({ ...config, pairs: { within_file } } as unknown as DocdogConfig).withinFile;
    expect(resolvePairEdges(config).withinFile).toBe("settle");
    expect(withinFile("offer")).toBe("offer");
    expect(() => withinFile("maybe")).toThrow(PairsError);
    expect(describeSettings(nominate())).toContain("within a file: settle (pairs.within_file)");
    expect(describeSettings(nominate({ withinFile: "offer" }))).toContain("within a file: offer");
  });
});
