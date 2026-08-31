/**
 * `listRecords` — exhaustive predicate enumeration (FRICTION-036).
 *
 * Same temp-corpus harness as the search tests, with one addition that
 * carries the whole point: a corpus large enough for ranked retrieval to
 * *have* to leave records out. Below the candidate limit, search happens to
 * be exhaustive and the two look identical; the difference only becomes
 * visible on a corpus the size of a real one.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { listRecords, search, SearchError, type EmbedQueryFn } from "../../src/storage/search.js";

const fakeVector = (text: string): number[] => [/alpha/.test(text) ? 1 : 0, 0.001, 0.001];
const fakeEmbedBatch: EmbedBatchFn = async (_c, texts) => texts.map(fakeVector);
const fakeEmbedQuery: EmbedQueryFn = async (_c, text) => fakeVector(text);

const record = (
  id: string,
  fm: Record<string, string | number | boolean>,
  body = "body text",
): string => {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
  return `---\nid: ${id}\n${lines.join("\n")}\n---\n\n# ${id}\n\n${body}\n`;
};

describe("listRecords — enumeration search cannot express", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let db: Database.Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-list-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });

    writeFileSync(
      join(dir, "specs", "decisions", "dd-001.md"),
      record("DD-001", { title: "Alpha decision" }, "alpha body"),
    );
    writeFileSync(
      join(dir, "specs", "decisions", "dd-002.md"),
      // The empty string is deliberate and load-bearing — see the scope test
      // below. Every other assertion here is blind to it.
      // `severity:` with nothing after it is the second load-bearing oddity:
      // YAML reads it as null, and the presence tests below turn on whether a
      // declared-but-empty field counts as present (FRICTION-045).
      record("DD-002", { title: "Legacy", status: "superseded", scope: '""', severity: "" }),
    );
    // Written raw rather than through `record`, for the one field the helper
    // cannot express: a list. It rides on an existing record so the counts
    // every other test asserts stay put (FRICTION-049).
    writeFileSync(
      join(dir, "specs", "decisions", "dd-003.md"),
      `---
id: DD-003
title: Flagged
severity: blocks-work
is_outdated: true
tags: [retrieval, ranking]
---

# DD-003

body text
`,
    );

    // 30 open notes, none of which contains the word "alpha" — the cohort a
    // completeness survey asks for and a ranked query cannot promise.
    for (let i = 1; i <= 30; i++) {
      const id = `NOTE-${String(i).padStart(3, "0")}`;
      writeFileSync(
        join(dir, "specs", "notes", `${id.toLowerCase()}.md`),
        record(id, { title: `Open note ${i}`, status: "open" }),
      );
    }

    config = {
      ...defaultConfig,
      project: { name: "list-test" },
      scan_paths: ["specs/"],
      vertex_collections: ["decisions", "notes"],
      default_collection: "notes",
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbedBatch,
      log: () => {},
      warn: () => {},
    });
    db = new Database(cachePath, { readonly: true });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns every record when given no filter, ordered by collection then id", () => {
    const all = listRecords(db, config);
    expect(all).toHaveLength(33);
    expect(all.map((r) => r.collection)).toEqual([
      ...Array(3).fill("decisions"),
      ...Array(30).fill("notes"),
    ]);
    expect(all[0].id).toBe("DD-001");
    expect(all[3].id).toBe("NOTE-001");
    expect(all[32].id).toBe("NOTE-030");
  });

  /**
   * The reason the command exists. Search is bounded by its limit and by
   * query recall; list is bounded only by the predicate. A survey that
   * trusted search here would silently miss 20 of the 30 open notes.
   */
  it("finds records a ranked query leaves out — the completeness gap itself", async () => {
    const ranked = await search(db, config, { query: "alpha", status: ["open"], limit: 10 }, fakeEmbedQuery);
    const listed = listRecords(db, config, { status: ["open"] });

    expect(ranked).toHaveLength(10);
    expect(listed).toHaveLength(30);

    const rankedIds = new Set(ranked.map((r) => r.id));
    const missed = listed.filter((r) => !rankedIds.has(r.id));
    expect(missed.length).toBe(20);
  });

  it("filters by scope, and the default a record inherits is the one it is matched by", () => {
    // FRICTION-050 made this reachable: the filter and its DD-058 default
    // were implemented, and no read surface could populate them.
    //
    // DD-001 and DD-003 declare no scope; DD-002 declares the empty string.
    // All three are reported as `shared` by every result shape, so all three
    // must be returned by `--scope shared` — a roster or a listing that says
    // `shared` about a record the filter cannot return is the silent miss
    // this whole family of guards exists to prevent.
    const shared = listRecords(db, config, { collection: "decisions", scope: "shared" });
    expect(shared.map((r) => r.id)).toEqual(["DD-001", "DD-002", "DD-003"]);
    expect(shared.every((r) => r.scope === "shared")).toBe(true);
  });

  it("returns an honest empty for a scope nothing carries, rather than refusing it", () => {
    // The boundary with `--collection` and `--status`, which refuse an
    // unknown value. Scope is a free string with no enum and no registration
    // (DD-058), so there is no vocabulary to check a guess against and
    // nothing to call a typo — `docdog status` rosters the values instead.
    expect(listRecords(db, config, { scope: "personal" })).toEqual([]);
  });

  it("filters by status allowlist", () => {
    const results = listRecords(db, config, { status: ["superseded"] });
    expect(results.map((r) => r.id)).toEqual(["DD-002"]);
  });

  it("filters by status blocklist", () => {
    const results = listRecords(db, config, { collection: "decisions", excludeStatus: ["superseded"] });
    expect(results.map((r) => r.id)).toEqual(["DD-001", "DD-003"]);
  });

  it("filters by collection", () => {
    expect(listRecords(db, config, { collection: "decisions" })).toHaveLength(3);
  });

  it("filters on arbitrary frontmatter, including booleans (PROPOSAL-027 parity)", () => {
    expect(listRecords(db, config, { where: { severity: "blocks-work" } }).map((r) => r.id)).toEqual(
      ["DD-003"],
    );
    expect(listRecords(db, config, { where: { is_outdated: true } }).map((r) => r.id)).toEqual([
      "DD-003",
    ]);
  });

  it("combines filters conjunctively", () => {
    expect(listRecords(db, config, { collection: "notes", status: ["superseded"] })).toEqual([]);
  });

  it("is uncapped by default and capped only when asked", () => {
    expect(listRecords(db, config, { collection: "notes" })).toHaveLength(30);
    expect(listRecords(db, config, { collection: "notes", limit: 4 })).toHaveLength(4);
  });

  /**
   * FRICTION-045. `where` compares against a value, so a record lacking the
   * field never matches and absence was not a predicate at all — the state
   * every convention passes through while it is being rolled out was
   * unaskable, and the complement could not be subtracted by hand because
   * every present value is different.
   */
  it("asks which records carry a field and which do not (FRICTION-045)", () => {
    // DD-003 writes `severity: blocks-work`; DD-002 writes `severity:` with
    // nothing after it; the other 31 never mention it.
    expect(listRecords(db, config, { has: ["severity"] }).map((r) => r.id)).toEqual(["DD-003"]);

    const lacking = listRecords(db, config, { lacks: ["severity"] });
    expect(lacking).toHaveLength(32);
    expect(lacking.map((r) => r.id)).toContain("DD-002");
  });

  /**
   * The property the feature rests on, not a nicety: the whole use is working
   * a complement, so a record that fell in neither set would under-report
   * exactly the list you asked for. It is also why a field declared with no
   * value counts as absent — `json_extract` cannot separate an explicit null
   * from a missing path, and inventing a third bucket would break the sum.
   */
  it("has and lacks partition the corpus, empty declarations included", () => {
    const total = listRecords(db, config).length;
    for (const field of ["severity", "title", "tags", "never_written"]) {
      const present = listRecords(db, config, { has: [field] }).length;
      const absent = listRecords(db, config, { lacks: [field] }).length;
      expect(present + absent, `${field} does not partition`).toBe(total);
    }
  });

  it("answers honestly for a field the corpus has never carried, rather than refusing it", () => {
    // Where the analogy with `status` (FRICTION-038) breaks. An unknown
    // status is a typo because the vocabulary already exists; an unknown
    // *field* is the normal first state of a convention, and "every record
    // lacks upstream_issue" is the correct and useful answer on the day it is
    // invented — the query this friction was filed from. Refusing it would
    // make the filter useless exactly when it is needed.
    expect(listRecords(db, config, { has: ["upstream_issue"] })).toEqual([]);
    expect(listRecords(db, config, { lacks: ["upstream_issue"] })).toHaveLength(33);
  });

  it("reaches a list-valued field, which is the one thing where cannot do (FRICTION-049)", () => {
    // The container refusal is about comparison. Presence never compares, so
    // `tags` is answerable here — the only question about it this corpus can
    // now answer at all.
    expect(listRecords(db, config, { has: ["tags"] }).map((r) => r.id)).toEqual(["DD-003"]);
  });

  it("reads frontmatter, not the indexed column — the 'current' nobody wrote", () => {
    // `status` defaults to "current" at index time, so `--status current`
    // cannot separate the records that chose it from the records that said
    // nothing. This is that separation, and it needs no new column.
    const silent = listRecords(db, config, { lacks: ["status"] });
    expect(silent).toHaveLength(2);
    expect(silent.map((r) => r.id)).toEqual(["DD-001", "DD-003"]);
    expect(silent.every((r) => r.status === "current")).toBe(true);
  });

  it("refuses a field required to be both present and absent", () => {
    // Decidable from the argument alone, and the result would be an empty
    // set — the one answer a caller cannot tell apart from data.
    try {
      listRecords(db, config, { has: ["severity"], lacks: ["severity"] });
      expect.unreachable("expected FIELD_CONTRADICTION");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).code).toBe("FIELD_CONTRADICTION");
    }
  });

  it("refuses a presence filter naming something that is not a field", () => {
    try {
      listRecords(db, config, { lacks: ["a.b"] });
      expect.unreachable("expected FIELD_INVALID_KEY");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).code).toBe("FIELD_INVALID_KEY");
    }
  });

  it("refuses a reserved where key as a SearchError, so no surface offers a reindex (FRICTION-050)", () => {
    // The refusal FRICTION-050 is named for. It was right about the corpus
    // vocabulary and had no referent — there was no dedicated `scope`
    // parameter on any read surface — and it was a plain `Error`, so both
    // CLI commands rendered it through the generic branch and appended
    // `Cache missing or stale? Run "docdog index" first.` to a fact about
    // the argument. Both halves are fixed; the type is what pins the second.
    try {
      listRecords(db, config, { where: { scope: "shared" } });
      expect.unreachable("expected WHERE_RESERVED_KEY");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).code).toBe("WHERE_RESERVED_KEY");
      expect((err as SearchError).message).toContain('dedicated "scope" parameter');
    }
    // And the parameter it names is real, which is the whole friction.
    expect(listRecords(db, config, { scope: "shared" }).length).toBeGreaterThan(0);
  });

  it("refuses a list-valued where target rather than returning an empty list (FRICTION-049)", () => {
    // Same argument as the unknown collection one line down, one filter over:
    // an equality test against `["retrieval","ranking"]` can never match a
    // member, and an empty enumeration is a completeness claim.
    try {
      listRecords(db, config, { where: { tags: "retrieval" } });
      expect.unreachable("expected WHERE_NOT_SCALAR");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).code).toBe("WHERE_NOT_SCALAR");
      expect((err as SearchError).message).toMatch(/where\.tags \(array in 1 record\(s\)\)/);
    }
  });

  it("refuses an unknown collection rather than returning an empty list", () => {
    // A silent empty is worse here than in search: the command's promise is
    // completeness, so 'nothing matched' reads as 'nothing exists'.
    try {
      listRecords(db, config, { collection: "nonesuch" });
      expect.unreachable("expected UNKNOWN_COLLECTION");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).code).toBe("UNKNOWN_COLLECTION");
    }
  });

  it("carries identity and metadata but no body or preview", () => {
    const [first] = listRecords(db, config, { collection: "decisions" });
    expect(first).toEqual({
      id: "DD-001",
      collection: "decisions",
      title: "Alpha decision",
      description: null,
      status: "current",
      scope: "shared",
      source_file: "specs/decisions/dd-001.md",
    });
  });
});
