/**
 * `docdog pairs` — PROPOSAL-049. Nominate, emit, validate, apply, remember.
 * Pure SQLite against a temp corpus built by the real indexer, with a fake
 * embedder whose vectors are chosen so similarity is known by construction.
 *
 * The properties under test are the proposal's acceptance list: settling
 * edges and the ledger shape the candidate set; every refusal is per row and
 * named; an applied relation lands as one edge; a defect stays open until a
 * settling edge appears; an edit to either body re-offers the pair pre-filled.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { parse as parseYaml } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type CacheIndexerOptions, type EmbedBatchFn } from "../../src/storage/indexer.js";
import {
  PairsError,
  attachPassages,
  checkPairEdges,
  nominatePairs,
  openDefects,
  resolvePairEdges,
  splitBlocks,
  type NominateOptions,
} from "../../src/storage/pairs.js";
import {
  PairsAcceptError,
  acceptPairsFromFile,
  collapse,
  describeSettings,
  offeredPairs,
  parsePairsReview,
  renderPairsReview,
} from "../../src/storage/pairs-accept.js";
import {
  PAIR_VERDICTS_FILE,
  canonicalVerdict,
  loadPairVerdicts,
  mergePairVerdicts,
  parsePairVerdicts,
  renderPairVerdicts,
  type PairVerdict,
} from "../../src/storage/pair-verdicts.js";

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

// Vectors are [alpha count, beta count, epsilon] — "alpha" records are near
// each other and far from "beta" ones. Concepts say neither word.
const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": `---
id: DD-001
title: Older alpha decision
status: current
---

# Older alpha decision

The alpha cache defaults to
seven days of retention.

A second alpha paragraph, long enough to stand as a block on its own without being merged forward into the next one by the splitter, which wants two hundred characters.
`,
  "specs/decisions/dd-002.md": `---
id: DD-002
title: Newer alpha decision
status: current
---

# Newer alpha decision

The alpha cache now defaults to thirty days of retention, changing DD-001.
`,
  "specs/decisions/dd-003.md": `---
id: DD-003
title: Beta decision
status: current
---

# Beta decision

Everything here is beta beta beta.
`,
  "specs/decisions/dd-004.md": `---
id: DD-004
title: Superseded alpha decision
status: superseded
---

# Superseded alpha decision

An alpha record the lifecycle has already retired.
`,
  "specs/decisions/dd-005.md": `---
id: DD-005
title: Alpha amendment
status: current
relationships:
  - amends: DD-001
    context: Changes its retention.
---

# Alpha amendment

The alpha retention changed, and says so.
`,
  "specs/decisions/dd-006.md": `---
id: DD-006
title: Alpha reference
status: current
relationships:
  - references: DD-002
    context: Cites it.
---

# Alpha reference

Another alpha record that only cites its neighbour.
`,
  // No frontmatter id: the cache knows it as `default:<path>`, as it knows a skill.
  "specs/skills/gamma.md": `# Gamma skill

Nothing but gamma here.
`,
  ".docdog/concepts/relation-references.md": relationConcept("references"),
  ".docdog/concepts/relation-amends.md": relationConcept("amends"),
  ".docdog/concepts/relation-supersedes.md": relationConcept("supersedes"),
};

const fakeEmbed: EmbedBatchFn = async (_config, texts) =>
  texts.map((t) => [(t.match(/alpha/g) ?? []).length, (t.match(/beta/g) ?? []).length, 0.001]);

describe("docdog pairs (PROPOSAL-049)", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-pairs-"));
    cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    config = {
      ...defaultConfig,
      project: { name: "pairs-test" },
      scan_paths: ["specs/decisions/", "specs/skills/", ".docdog/concepts/"],
      vertex_collections: ["decisions", "skills", "concepts"],
      default_collection: "decisions",
    };
    await runCacheIndexer(opts());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function opts(): CacheIndexerOptions {
    return {
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    };
  }

  function nominate(extra: NominateOptions = {}) {
    const db = new Database(cachePath, { readonly: true });
    try {
      return nominatePairs(db, config, {
        collections: ["decisions"],
        threshold: 0.9,
        verdicts: loadPairVerdicts(dir),
        ...extra,
      });
    } finally {
      db.close();
    }
  }

  function keys(result: ReturnType<typeof nominate>): string[] {
    return result.candidates.map((c) => `${c.a.id}~${c.b.id}`);
  }

  async function emit(extra: NominateOptions = {}, fill?: (row: Record<string, unknown>) => void): Promise<string> {
    const db = new Database(cachePath, { readonly: true });
    let text: string;
    try {
      const result = nominatePairs(db, config, {
        collections: ["decisions"],
        threshold: 0.9,
        verdicts: loadPairVerdicts(dir),
        ...extra,
      });
      const { offered } = offeredPairs(result, false);
      await attachPassages(db, config, offered, { embed: fakeEmbed });
      text = renderPairsReview(result, offered, { relationTypes: ["amends", "references"] });
    } finally {
      db.close();
    }
    const path = join(dir, "pairs.yaml");
    if (fill) {
      const doc = parseYaml(text) as { version: number; pairs: Array<Record<string, unknown>> };
      for (const row of doc.pairs) fill(row);
      writeFileSync(path, JSON.stringify(doc));
    } else {
      writeFileSync(path, text);
    }
    return path;
  }

  function edges(): string[] {
    const db = new Database(cachePath, { readonly: true });
    try {
      return (
        db.prepare(`SELECT from_id, type, to_id FROM edges ORDER BY from_id, to_id`).all() as Array<{
          from_id: string;
          type: string;
          to_id: string;
        }>
      ).map((e) => `${e.from_id} ${e.type} ${e.to_id}`);
    } finally {
      db.close();
    }
  }

  // ─── nomination ────────────────────────────────────────────────────────────

  it("nominates live similar pairs, minus settling edges, and prints what it excluded", () => {
    const result = nominate();
    expect(keys(result)).toEqual(["DD-001~DD-002", "DD-001~DD-006", "DD-002~DD-005", "DD-002~DD-006", "DD-005~DD-006"]);
    // DD-004 is superseded: the default exclusion, narrowed to what the corpus uses.
    expect(result.settings.excludeStatus).toEqual(["superseded"]);
    // DD-001 ~ DD-005 is joined by `amends`, a settling edge.
    expect(result.settled).toBe(1);
    expect(result.settings.settleTypes).toEqual(["supersedes", "amends"]);
    expect(result.settings.showTypes).toBeNull();
  });

  it("shows a non-settling edge to the judge instead of treating it as an answer", () => {
    const pair = nominate().candidates.find((c) => c.a.id === "DD-002" && c.b.id === "DD-006")!;
    expect(pair.declared).toEqual([{ from: "DD-006", to: "DD-002", type: "references" }]);
  });

  it("settling types are a visible default the caller overrides", () => {
    const result = nominate({ settleTypes: ["amends", "references"] });
    expect(keys(result)).not.toContain("DD-002~DD-006");
    expect(result.settled).toBe(2);
  });

  it("the listed edges are their own set: hiding one from the judge does not settle the pair", () => {
    const result = nominate({ showTypes: ["supersedes"] });
    const pair = result.candidates.find((c) => c.a.id === "DD-002" && c.b.id === "DD-006")!;
    expect(pair.declared).toEqual([]);
    expect(result.settled).toBe(1);
  });

  it("each step's edges resolve from pairs.edges, and close follows settle unless set", () => {
    const withEdges = (edges: unknown): DocdogConfig =>
      ({ ...config, pairs: { edges } }) as unknown as DocdogConfig;
    expect(resolvePairEdges(config)).toMatchObject({
      settle: ["supersedes", "amends"],
      show: null,
      close: ["supersedes", "amends"],
      typed: { settle: false, show: false, close: false },
    });
    expect(resolvePairEdges(withEdges({ settle: ["amends"] }))).toMatchObject({
      settle: ["amends"],
      show: null,
      close: ["amends"],
      typed: { settle: true, show: false, close: true },
    });
    expect(resolvePairEdges(withEdges({ settle: [], show: [], close: ["supersedes"] }))).toMatchObject({
      settle: [],
      show: [],
      close: ["supersedes"],
    });
    expect(resolvePairEdges(withEdges({ show: "all" })).show).toBeNull();
    for (const bad of [["amends"], { settle: "amends" }, { skip: ["amends"] }, { close: [""] }, { show: "some" }]) {
      expect(() => resolvePairEdges(withEdges(bad))).toThrow(PairsError);
    }
    // One level up: an `edges:` level left out, or the pre-split key, is
    // refused rather than run on the defaults.
    for (const pairs of [{ settle: ["amends"] }, { settling_types: ["amends"] }, ["amends"], "amends"]) {
      expect(() => resolvePairEdges({ ...config, pairs } as unknown as DocdogConfig)).toThrow(/pairs/);
    }
  });

  it("the printed settings name all three edge sets, close included", () => {
    const line = describeSettings(nominate({ settleTypes: [], showTypes: ["references"] }));
    expect(line).toContain("settle: (none)");
    expect(line).toContain("show: references");
    // close follows settle, so an empty settle is a ledger no edge can close —
    // exactly what must not go unsaid.
    expect(line).toContain("close: (none)");
    expect(describeSettings(nominate({ closeTypes: ["supersedes"] }))).toContain("close: supersedes");
  });

  it("the applier refuses an unregistered closing type as the scan does", async () => {
    const path = await emit({ id: "DD-001" });
    const edges = resolvePairEdges({ ...config, pairs: { edges: { close: ["replaces"] } } });
    await expect(acceptPairsFromFile(opts(), path, { edges })).rejects.toThrow(
      /pairs\.edges\.close .*replaces/,
    );
  });

  it("a configured relation type nothing registers is refused, naming the step", () => {
    const known = new Set(["supersedes", "amends", "references"]);
    const steps = resolvePairEdges({ ...config, pairs: { edges: { close: ["supersedes", "replaces"] } } });
    expect(() => checkPairEdges(steps, known)).toThrow(/pairs\.edges\.close .*replaces/);
    expect(() => checkPairEdges(resolvePairEdges(config), known)).not.toThrow();
  });

  it("a DEFAULT naming an unregistered type is narrowed, not refused — nobody typed it", () => {
    // An adopter's project registers supersedes and not amends.
    const known = new Set(["supersedes", "references"]);
    const steps = checkPairEdges(resolvePairEdges(config), known);
    expect(steps.settle).toEqual(["supersedes"]);
    expect(steps.close).toEqual(["supersedes"]);
    // close defaulting to a TYPED settle is typed too: refused, not narrowed.
    const typedSettle = resolvePairEdges({ ...config, pairs: { edges: { settle: ["amends"] } } });
    expect(() => checkPairEdges(typedSettle, known)).toThrow(/pairs\.edges\.settle .*amends/);
  });

  it("an allowlist replaces the default exclusion", () => {
    const result = nominate({ status: ["superseded", "current"] });
    expect(keys(result)).toContain("DD-001~DD-004");
    expect(result.settings.excludeStatus).toEqual([]);
  });

  it("--id restricts to pairs containing that record", () => {
    expect(keys(nominate({ id: "DD-002" }))).toEqual(["DD-001~DD-002", "DD-002~DD-005", "DD-002~DD-006"]);
  });

  it("the threshold cuts on cosine", () => {
    expect(nominate({ threshold: 0.9 }).candidates.every((c) => c.cosine >= 0.9)).toBe(true);
    expect(keys(nominate({ collections: undefined, threshold: -1 }))).toContain("DD-001~DD-003");
  });

  // ─── passages ──────────────────────────────────────────────────────────────

  it("splits at blank lines, keeps fenced code whole, and merges headings forward", () => {
    const body = "# Title\n\nshort\n\n```\ncode\n\nstill code\n```\n\n" + "x".repeat(250);
    const blocks = splitBlocks(body);
    expect(blocks.some((b) => b.includes("code\n\nstill code"))).toBe(true);
    expect(blocks.some((b) => b === "# Title")).toBe(false);
  });

  it("every emitted row carries passages for both sides, and the document parses back", async () => {
    const path = await emit();
    const doc = parseYaml(readFileSync(path, "utf-8")) as { pairs: Array<{ passages: { a: string; b: string } }> };
    expect(doc.pairs.length).toBeGreaterThan(0);
    for (const row of doc.pairs) {
      expect(row.passages.a).toMatch(/alpha/);
      expect(row.passages.b).toMatch(/alpha/);
    }
    expect(parsePairsReview(readFileSync(path, "utf-8")).length).toBe(doc.pairs.length);
  });

  // ─── accept ────────────────────────────────────────────────────────────────

  it("applies a relation as one edge and records the verdict", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-002") return;
      row.relation = "amends";
      row.direction = "b->a";
      row.defect = "stale";
      row.evidence = { a: "defaults to seven days", b: "now defaults to thirty days" };
      row.note = "Changes the retention default.";
    });
    const report = await acceptPairsFromFile(opts(), path, { edges: resolvePairEdges(config) });
    expect(report.outcomes.map((o) => o.refusal)).toEqual([null]);
    expect(report.edgesApplied).toBe(1);
    expect(edges()).toContain("DD-002 amends DD-001");
    const ledger = loadPairVerdicts(dir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ a: "DD-001", b: "DD-002", relation: "amends", direction: "b->a", defect: "stale" });
    // The row's own edge is settling, so its defect closes on write — reported.
    expect(report.outcomes[0].closesOwnDefect).toBe(true);
  });

  it("refuses each bad row by name and keeps going", async () => {
    const path = await emit({ id: "DD-002" }, (row) => {
      if (row.b === "DD-002") {
        // DD-001 ~ DD-002: a quote that is not in the file.
        row.relation = "references";
        row.direction = "b->a";
        row.evidence = { a: "defaults to eight days", b: "now defaults to thirty days" };
      } else if (row.b === "DD-005") {
        row.relation = "contradicts";
        row.direction = "a->b";
        row.evidence = { a: "alpha", b: "alpha" };
      } else if (row.b === "DD-006") {
        row.relation = "none";
        row.defect = "none";
      }
    });
    const report = await acceptPairsFromFile(opts(), path);
    const byPair = Object.fromEntries(report.outcomes.map((o) => [`${o.row.a}~${o.row.b}`, o]));
    expect(byPair["DD-001~DD-002"].refusal).toBe("evidence_not_found");
    expect(byPair["DD-001~DD-002"].detail).toMatch(/a \(DD-001/);
    expect(byPair["DD-002~DD-005"].refusal).toBe("unregistered_relation");
    expect(byPair["DD-002~DD-006"].applied).toBe(true);
    expect(report.edgesApplied).toBe(0);
    expect(loadPairVerdicts(dir).map((v) => `${v.a}~${v.b}`)).toEqual(["DD-002~DD-006"]);
  });

  it("refuses a row whose body changed after the file was emitted, even before reindexing", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-002") return;
      row.relation = "none";
      row.defect = "none";
    });
    const file = join(dir, "specs/decisions/dd-002.md");
    writeFileSync(file, readFileSync(file, "utf-8") + "\nOne more alpha line.\n");
    const report = await acceptPairsFromFile(opts(), path);
    expect(report.outcomes[0].refusal).toBe("stale_hash");
    expect(report.outcomes[0].detail).toMatch(/DD-002 changed/);
    expect(loadPairVerdicts(dir)).toEqual([]);
  });

  it("requires evidence whenever a relation or a defect is claimed, and a direction with a relation", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b === "DD-002") row.defect = "contradiction";
      if (row.b === "DD-006") {
        row.relation = "references";
        row.evidence = { a: "alpha", b: "alpha" };
      }
    });
    const report = await acceptPairsFromFile(opts(), path);
    const refusals = report.outcomes.map((o) => o.refusal).sort();
    expect(refusals).toEqual(["missing_direction", "missing_evidence"]);
  });

  it("resolves a record with no frontmatter id the way the indexer names it", async () => {
    const id = "default:specs/skills/gamma.md";
    const path = await emit({ id, collections: undefined, threshold: -1 }, (row) => {
      if (row.a !== "DD-001" && row.b !== "DD-001") return;
      row.relation = "none";
      row.defect = "duplicate";
      row.evidence = row.a === id ? { a: "Nothing but gamma", b: "seven days" } : { a: "seven days", b: "Nothing but gamma" };
    });
    const report = await acceptPairsFromFile(opts(), path);
    expect(report.outcomes.map((o) => o.refusal)).toEqual([null]);
  });

  it("a verbatim quote may be rewrapped, never reworded", () => {
    expect(collapse("The alpha cache defaults to\nseven days")).toBe("The alpha cache defaults to seven days");
  });

  it("dry run validates and writes nothing", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-002") return;
      row.relation = "amends";
      row.direction = "b->a";
      row.evidence = { a: "seven days", b: "thirty days" };
      row.note = "x";
    });
    const before = edges();
    const report = await acceptPairsFromFile(opts(), path, { dryRun: true });
    expect(report.outcomes[0].applied).toBe(true);
    expect(edges()).toEqual(before);
    expect(loadPairVerdicts(dir)).toEqual([]);
  });

  it("a malformed file is refused whole, before anything is read", () => {
    expect(() => parsePairsReview("version: 1\npairs:\n  - a: DD-001\n    b: DD-002\n    defct: stale\n")).toThrow(
      PairsAcceptError,
    );
  });

  // ─── ledger ────────────────────────────────────────────────────────────────

  it("a judged pair is suppressed while both bodies are unchanged, and re-offered pre-filled when either moves", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-002") return;
      row.relation = "none";
      row.defect = "none";
      row.note = "Consistent.";
    });
    await acceptPairsFromFile(opts(), path);

    const judged = nominate({ id: "DD-001" });
    const mark = judged.candidates.find((c) => c.b.id === "DD-002")!.judged!;
    expect(mark.stale).toBe(false);
    expect(offeredPairs(judged, false).offered.map((c) => c.b.id)).not.toContain("DD-002");
    expect(offeredPairs(judged, false).suppressed).toBe(1);

    const file = join(dir, "specs/decisions/dd-001.md");
    writeFileSync(file, readFileSync(file, "utf-8") + "\nAn edit to alpha.\n");
    await runCacheIndexer(opts());

    const again = nominate({ id: "DD-001" });
    const row = again.candidates.find((c) => c.b.id === "DD-002")!;
    expect(row.judged!.stale).toBe(true);
    const text = renderPairsReview(again, offeredPairs(again, false).offered);
    expect(text).toMatch(/previously judged, and a body has changed since/);
    expect(text).toMatch(/note: "Consistent\."/);
  });

  it("an open defect stays listed until a closing edge joins the pair", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-006") return;
      row.relation = "references";
      row.direction = "b->a";
      row.defect = "stale";
      row.evidence = { a: "seven days", b: "cites its neighbour" };
      row.note = "DD-001's retention is stale against DD-006's context.";
    });
    const report = await acceptPairsFromFile(opts(), path, { edges: resolvePairEdges(config) });
    expect(report.outcomes[0].closesOwnDefect).toBe(false);

    const open = (close: string[] = ["supersedes", "amends"]): number => {
      const db = new Database(cachePath, { readonly: true });
      try {
        return openDefects(db, loadPairVerdicts(dir), close).length;
      } finally {
        db.close();
      }
    };
    expect(open()).toBe(1);

    const file = join(dir, "specs/decisions/dd-006.md");
    writeFileSync(
      file,
      readFileSync(file, "utf-8").replace(
        "relationships:\n",
        "relationships:\n  - amends: DD-001\n    context: Fixes it.\n",
      ),
    );
    await runCacheIndexer(opts());
    expect(open()).toBe(0);
    // The closing set is its own knob: an `amends` does not close what only
    // a `supersedes` is configured to close.
    expect(open(["supersedes"])).toBe(1);
  });

  it("stores rows canonically, so the same verdict written either way round is one row", () => {
    const v: PairVerdict = {
      a: "DD-002",
      b: "DD-001",
      hash_a: "h2",
      hash_b: "h1",
      relation: "amends",
      direction: "a->b",
      defect: "stale",
      evidence: { a: "from two", b: "from one" },
      note: "",
    };
    const c = canonicalVerdict(v);
    expect(c).toMatchObject({ a: "DD-001", b: "DD-002", hash_a: "h1", direction: "b->a", evidence: { a: "from one" } });
    const merged = mergePairVerdicts([c], [v]);
    expect(merged).toMatchObject({ added: 0, refreshed: 0 });
    expect(parsePairVerdicts(renderPairVerdicts(merged.rows))).toEqual(merged.rows);
  });

  it("the ledger refuses what the review file would: a repeated pair, a self-pair, non-string evidence", () => {
    const row = (a: string, b: string, evidence = "{ a: x, b: y }"): string =>
      `  - a: ${a}\n    b: ${b}\n    hash_a: h1\n    hash_b: h2\n    relation: none\n    defect: stale\n    evidence: ${evidence}\n`;
    const ledger = (...rows: string[]): string => `version: 1\nverdicts:\n${rows.join("")}`;
    expect(parsePairVerdicts(ledger(row("DD-001", "DD-002")))).toHaveLength(1);
    expect(() => parsePairVerdicts(ledger(row("DD-001", "DD-002"), row("DD-002", "DD-001")))).toThrow(
      /row 2: repeats the pair .* from row 1/,
    );
    expect(() => parsePairVerdicts(ledger(row("DD-001", "DD-001")))).toThrow(/same record/);
    expect(() => parsePairVerdicts(ledger(row("DD-001", "DD-002", "{ a: 3, b: y }")))).toThrow(/evidence\.a/);
    expect(() => parsePairVerdicts(ledger(row("DD-001", "DD-002", "[x, y]")))).toThrow(/"evidence" must be a map/);
  });

  it("the ledger lives at a fixed tracked path beside the corpus", async () => {
    const path = await emit({ id: "DD-001" }, (row) => {
      if (row.b !== "DD-002") return;
      row.relation = "none";
    });
    const report = await acceptPairsFromFile(opts(), path);
    expect(report.verdictsFile).toBe(PAIR_VERDICTS_FILE);
    expect(readFileSync(join(dir, PAIR_VERDICTS_FILE), "utf-8")).toMatch(/^# Similar-pair verdicts/);
  });
});
