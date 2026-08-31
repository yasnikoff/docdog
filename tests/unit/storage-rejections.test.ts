/**
 * The reject half of the suggest loop — PROPOSAL-046, closing FRICTION-025.
 *
 * The properties under test are the ones the friction measured rather than
 * the ones the code obviously has. A rejection has to survive an *accept*
 * on the same source (or a drain invalidates its own judgments as it runs);
 * it has to expire when the body it was judged against moves (or it becomes
 * a permanent blindfold); and the two together are only possible because
 * `vertices.content_hash` covers the body and excludes frontmatter — a fact
 * about `engine/discovery.ts` that nothing else in this feature restates, so
 * it is pinned here.
 *
 * The suppression itself is the part DP-001 constrains, so what is asserted
 * is not only that a candidate disappears but that its disappearance stays
 * countable and one flag away.
 */
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import {
  runCacheIndexer,
  type CacheIndexerOptions,
  type EmbedBatchFn,
} from "../../src/storage/indexer.js";
import {
  suggestEdges,
  offeredSuggestions,
  suppressedCount,
  orphanRejections,
  type SuggestionsForSource,
} from "../../src/storage/suggest.js";
import {
  acceptEdgesFromFile,
  parseReviewDocument,
  renderReviewDocument,
} from "../../src/storage/accept.js";
import {
  loadRejections,
  mergeRejections,
  parseRejections,
  renderRejections,
  rejectionsPath,
  RejectionsError,
  REJECTIONS_FILE,
  type Rejection,
} from "../../src/storage/rejections.js";

const FILES: Record<string, string> = {
  "specs/decisions/dd-001.md": `---
id: DD-001
title: First decision
---

# First decision

Builds on DD-002, and supersedes DD-003.
`,
  "specs/decisions/dd-002.md": `---
id: DD-002
title: Second decision
---

# Second decision

Refines DD-003.
`,
  "specs/decisions/dd-003.md": `---
id: DD-003
title: Third decision
---

# Third decision

Nothing cited here.
`,
};

const fakeEmbed: EmbedBatchFn = async (_config, texts) => texts.map((t) => [t.length, 1, 2]);

// ─── the ledger file, on its own ────────────────────────────────────────────

describe("the reject ledger (PROPOSAL-046)", () => {
  const rows: Rejection[] = [
    {
      from: "DD-001",
      to: "DD-003",
      reason: "supersession lineage, already declared on the other side",
      source_hash: "sha256:aaaa",
    },
    { from: "DD-001", to: "DD-002", reason: "example id in a YAML snippet", source_hash: "sha256:bbbb" },
  ];

  it("round-trips through its own renderer", () => {
    expect(parseRejections(renderRejections(rows))).toEqual([
      // Sorted, so the file's diff shows the row that changed rather than a
      // reshuffle — this is a tracked file whose history is the audit trail.
      rows[1],
      rows[0],
    ]);
  });

  it("reads an empty or absent ledger as an empty ledger, not an error", () => {
    expect(parseRejections("")).toEqual([]);
    expect(parseRejections(renderRejections([]))).toEqual([]);
  });

  it("refuses a version it does not know rather than guessing at the rows", () => {
    expect(() => parseRejections("version: 99\nrejections: []\n")).toThrow(RejectionsError);
  });

  it("refuses a reasonless row — the reason is the artifact", () => {
    // The whole point of the ledger is that a rejection carries why. A row
    // without one is the amnesia this feature exists to end, written down.
    expect(() =>
      parseRejections(`version: 1\nrejections:\n  - from: A-1\n    to: B-2\n    reason: ""\n    source_hash: sha256:x\n`),
    ).toThrow(/reason.*required/);
  });

  it("refuses a row with no source hash — nothing could ever expire it", () => {
    expect(() =>
      parseRejections(`version: 1\nrejections:\n  - from: A-1\n    to: B-2\n    reason: why\n`),
    ).toThrow(/source_hash/);
  });

  it("names every bad row at once, so a hand-edited ledger is fixed in one pass", () => {
    let message = "";
    try {
      parseRejections(
        `version: 1\nrejections:\n  - from: A-1\n    to: B-2\n  - from: C-3\n    resaon: typo\n`,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("row 1");
    expect(message).toContain("row 2");
    expect(message).toContain("resaon");
  });

  it("merges last-writer-wins per pair, and counts added apart from refreshed", () => {
    const merged = mergeRejections(rows, [
      // same pair, new hash — the shape of re-affirming a stale rejection
      { ...rows[0], source_hash: "sha256:cccc" },
      // byte-identical — neither added nor refreshed
      rows[1],
      { from: "DD-002", to: "DD-003", reason: "range endpoint", source_hash: "sha256:dddd" },
    ]);
    expect(merged.added).toBe(1);
    expect(merged.refreshed).toBe(1);
    expect(merged.rows).toHaveLength(3);
    expect(merged.rows.find((r) => r.to === "DD-003" && r.from === "DD-001")?.source_hash).toBe(
      "sha256:cccc",
    );
  });
});

// ─── the loop, against a real cache ─────────────────────────────────────────

describe("rejecting a candidate durably", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-reject-"));
    cachePath = join(dir, "cache.db");
    for (const [relPath, content] of Object.entries(FILES)) {
      const absPath = join(dir, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
    }
    config = {
      ...defaultConfig,
      project: { name: "reject-test" },
      scan_paths: ["specs/decisions/"],
      vertex_collections: ["decisions"],
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

  function scan(rejections: Rejection[] = loadRejections(dir)): SuggestionsForSource[] {
    const db = new Database(cachePath, { readonly: true });
    try {
      return suggestEdges(db, config, { rejections });
    } finally {
      db.close();
    }
  }

  function pairs(results: SuggestionsForSource[]): string[] {
    return results.flatMap((r) => r.suggestions.map((s) => `${r.source_id}->${s.target_id}`));
  }

  function contentHash(id: string): string {
    const db = new Database(cachePath, { readonly: true });
    try {
      return (db.prepare(`SELECT content_hash FROM vertices WHERE id = ?`).get(id) as {
        content_hash: string;
      }).content_hash;
    } finally {
      db.close();
    }
  }

  /** A reviewed file as an agent would leave it: some rows contextualized,
   * some rejected with a reason, the rest deleted. */
  function writeReview(rows: string[]): string {
    const path = join(dir, "candidates.yaml");
    writeFileSync(path, ["version: 1", "edges:", ...rows].join("\n") + "\n", "utf-8");
    return path;
  }

  const reject = (from: string, to: string, reason: string): string[] => [
    `  - from: ${from}`,
    `    to: ${to}`,
    `    type: references`,
    `    reject: ${JSON.stringify(reason)}`,
  ];
  const accept = (from: string, to: string, context: string): string[] => [
    `  - from: ${from}`,
    `    to: ${to}`,
    `    type: references`,
    `    context: ${JSON.stringify(context)}`,
  ];

  it("records a rejection keyed to the source body it was judged against", async () => {
    const report = await acceptEdgesFromFile(
      opts(),
      writeReview(reject("DD-001", "DD-003", "supersession lineage, declared the other way")),
    );

    expect(report.rejectionsRead).toBe(1);
    expect(report.rejectionsAdded).toBe(1);
    expect(report.rejectionsFile).toBe(REJECTIONS_FILE);
    expect(loadRejections(dir)).toEqual([
      {
        from: "DD-001",
        to: "DD-003",
        reason: "supersession lineage, declared the other way",
        source_hash: contentHash("DD-001"),
      },
    ]);
  });

  it("suppresses the candidate on the next scan, countably and reversibly", async () => {
    await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));

    const scanned = scan();
    // The scan itself still returns the row — marked, not removed. Dropping
    // it here would put the ledger's effect out of reach of every caller.
    expect(pairs(scanned)).toContain("DD-001->DD-003");
    expect(scanned.flatMap((r) => r.suggestions).find((s) => s.target_id === "DD-003")?.rejected)
      .toEqual({ reason: "roster endpoint", stale: false });

    // What the renderers show is what changes, and the count is what makes
    // that visible rather than silent (DP-001 tier 2).
    expect(pairs(offeredSuggestions(scanned))).not.toContain("DD-001->DD-003");
    expect(suppressedCount(scanned)).toBe(1);
    expect(pairs(offeredSuggestions(scanned, true))).toContain("DD-001->DD-003");

    // Reversal is deleting a line from a YAML file.
    rmSync(rejectionsPath(dir));
    expect(pairs(offeredSuggestions(scan()))).toContain("DD-001->DD-003");
  });

  it("survives an accept on the same source — frontmatter is outside the hash", async () => {
    // The load-bearing one. A drain rejects some of a source's candidates and
    // accepts others in the same pass; if appending to `relationships:` moved
    // the source hash, every drain would invalidate its own judgments as it
    // ran, and the feature would look like it worked exactly once.
    const before = contentHash("DD-001");
    await acceptEdgesFromFile(
      opts(),
      writeReview([
        ...reject("DD-001", "DD-003", "roster endpoint"),
        ...accept("DD-001", "DD-002", "DD-001 builds on DD-002"),
      ]),
    );

    // The accept really landed — the source file grew a relationships block —
    // and the hash did not move, which is the property the whole design rests
    // on. A hash over the file rather than the body would fail here.
    expect(readFileSync(join(dir, "specs/decisions/dd-001.md"), "utf-8")).toContain(
      "- references: DD-002",
    );
    expect(contentHash("DD-001")).toBe(before);
    expect(suppressedCount(scan())).toBe(1);
  });

  it("expires when the body moves, and hands the old reason back with the candidate", async () => {
    await acceptEdgesFromFile(
      opts(),
      writeReview(reject("DD-001", "DD-003", "anticipated next-free-number")),
    );
    expect(suppressedCount(scan())).toBe(1);

    writeFileSync(
      join(dir, "specs/decisions/dd-001.md"),
      FILES["specs/decisions/dd-001.md"].replace("First decision\n\nBuilds", "First decision\n\nRewritten. Builds"),
    );
    await runCacheIndexer(opts());

    const scanned = scan();
    expect(suppressedCount(scanned)).toBe(0);
    // Re-offered, but not from scratch: re-affirming is a glance because the
    // reason travels with the candidate. That is what makes a per-body key
    // affordable at all.
    const stale = scanned
      .flatMap((r) => r.suggestions)
      .find((s) => s.target_id === "DD-003")?.rejected;
    expect(stale).toEqual({ reason: "anticipated next-free-number", stale: true });
    expect(pairs(offeredSuggestions(scanned))).toContain("DD-001->DD-003");
  });

  it("re-affirms a stale rejection against the new body, counting it as refreshed", async () => {
    await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));
    writeFileSync(
      join(dir, "specs/decisions/dd-001.md"),
      FILES["specs/decisions/dd-001.md"].replace("# First", "# First (edited)"),
    );
    await runCacheIndexer(opts());

    const report = await acceptEdgesFromFile(
      opts(),
      writeReview(reject("DD-001", "DD-003", "roster endpoint")),
    );
    expect(report.rejectionsAdded).toBe(0);
    expect(report.rejectionsRefreshed).toBe(1);
    expect(loadRejections(dir)[0].source_hash).toBe(contentHash("DD-001"));
    expect(suppressedCount(scan())).toBe(1); // suppressed again, against the new body
  });

  it("skips a reject row whose source is not in the cache, rather than storing a rejection nothing can expire", async () => {
    const report = await acceptEdgesFromFile(
      opts(),
      writeReview(reject("DD-999", "DD-002", "source does not exist")),
    );
    expect(report.rejectionOutcomes).toEqual([
      {
        rejection: { from: "DD-999", to: "DD-002", reason: "source does not exist" },
        recorded: false,
        skipReason: "source_not_found",
      },
    ]);
    expect(existsSync(rejectionsPath(dir))).toBe(false);
  });

  it("writes no ledger under --dry-run, while still saying what it would write", async () => {
    const report = await acceptEdgesFromFile(
      opts(),
      writeReview(reject("DD-001", "DD-003", "roster endpoint")),
      { dryRun: true },
    );
    expect(report.rejectionsAdded).toBe(1);
    expect(existsSync(rejectionsPath(dir))).toBe(false);
  });

  it("reports ledger rows that match no candidate, and reaps none of them", async () => {
    await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));
    writeFileSync(
      join(dir, "specs/decisions/dd-001.md"),
      `---\nid: DD-001\ntitle: First decision\n---\n\n# First decision\n\nCites nobody now.\n`,
    );
    await runCacheIndexer(opts());

    const rejections = loadRejections(dir);
    expect(orphanRejections(scan(rejections), rejections)).toHaveLength(1);
    // Reported, never reaped: which of the four ways a row goes orphaned it
    // was is not in the data, and a dead row costs one line.
    expect(loadRejections(dir)).toHaveLength(1);
  });

  // ─── the review document ──────────────────────────────────────────────────

  describe("the review document carries both verdicts", () => {
    it("round-trips a rejection, which is what lets one file hold the whole judgment", () => {
      const doc = parseReviewDocument(
        ["version: 1", "edges:", ...reject("DD-001", "DD-003", "example id")].join("\n") + "\n",
      );
      expect(doc.rejects).toEqual([{ from: "DD-001", to: "DD-003", reason: "example id" }]);
      expect(doc.accepts).toEqual([]);
    });

    it("omits a live rejection and says how many, so the count survives the redirect into a file", async () => {
      await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));
      const rendered = renderReviewDocument(scan());

      expect(parseReviewDocument(rendered).accepts.some((e) => e.to === "DD-003" && e.from === "DD-001"))
        .toBe(false);
      expect(rendered).toContain(`suppressed by ${REJECTIONS_FILE}`);
    });

    it("pre-fills a stale rejection with its old reason, so re-affirming is leaving the row alone", async () => {
      await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));
      writeFileSync(
        join(dir, "specs/decisions/dd-001.md"),
        FILES["specs/decisions/dd-001.md"].replace("# First", "# First (edited)"),
      );
      await runCacheIndexer(opts());

      const rendered = renderReviewDocument(scan());
      expect(rendered).toContain(`reject: "roster endpoint"`);
      expect(parseReviewDocument(rendered).rejects).toContainEqual({
        from: "DD-001",
        to: "DD-003",
        reason: "roster endpoint",
      });
    });

    it("re-offers live rejections pre-filled under showRejected", async () => {
      await acceptEdgesFromFile(opts(), writeReview(reject("DD-001", "DD-003", "roster endpoint")));
      const rendered = renderReviewDocument(scan(), { showRejected: true });
      expect(parseReviewDocument(rendered).rejects).toContainEqual({
        from: "DD-001",
        to: "DD-003",
        reason: "roster endpoint",
      });
    });
  });

  // ─── row guards ───────────────────────────────────────────────────────────

  describe("row guards", () => {
    const parse = (rows: string[]) =>
      parseReviewDocument(["version: 1", "edges:", ...rows].join("\n") + "\n");

    it("refuses an empty reason, and there is no flag that would let one through", () => {
      expect(() =>
        parse(["  - from: DD-001", "    to: DD-003", "    reject: \"\""]),
      ).toThrow(/needs a reason/);
    });

    it("refuses a row carrying both a context and a reject — one row, one verdict", () => {
      expect(() =>
        parse([
          "  - from: DD-001",
          "    to: DD-003",
          "    type: references",
          '    context: "it builds on it"',
          '    reject: "no it does not"',
        ]),
      ).toThrow(/one row, one verdict/);
    });

    it("tolerates the empty context the emitter itself wrote beside a reject", () => {
      // `context: ""` carries no information, so refusing it would only make
      // the reviewer delete a line the tool put there.
      expect(
        parse([
          "  - from: DD-001",
          "    to: DD-003",
          "    type: references",
          '    context: ""',
          '    reject: "roster endpoint"',
        ]).rejects,
      ).toHaveLength(1);
    });

    it("does not require a type to reject — a rejection is keyed on the pair", () => {
      expect(parse(["  - from: DD-001", "    to: DD-003", '    reject: "example id"']).rejects)
        .toHaveLength(1);
    });

    it("refuses a misspelled reject key rather than silently accepting what was meant to be refused", () => {
      expect(() =>
        parse(["  - from: DD-001", "    to: DD-003", "    type: references", '    rejct: "oops"']),
      ).toThrow(/unknown key "rejct"/);
    });
  });
});
