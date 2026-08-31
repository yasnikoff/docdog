/**
 * Cache search — P-023 §7 step 4. Pure SQLite against a temp corpus
 * built by the real cache indexer; no Docker, no ArangoDB, no ONNX
 * (both the document and query embedders are injected fakes).
 *
 * The fake embedder maps marker words to axis-aligned vectors so
 * cosine geometry is controllable: "cachetopic"/"QVEC_CACHE" → x-axis,
 * "graphtopic"/"QVEC_GRAPH" → y-axis. QVEC_* markers appear in queries
 * only, never in documents, so a QVEC query exercises the vector leg
 * with zero keyword overlap.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/config/defaults.js";
import type { DocdogConfig } from "../../src/types/config.js";
import { runCacheIndexer, type EmbedBatchFn } from "../../src/storage/indexer.js";
import { search, toFtsQuery, type EmbedQueryFn } from "../../src/storage/search.js";

const DD_001 = `---
id: DD-001
title: Cache design
description: How the disposable cache works
---

# Cache design

Alpha disposable cache design cachetopic body text.
`;

const DD_002 = `---
id: DD-002
title: Graph traversal
---

# Graph traversal

Bravo graph walk graphtopic body text for the traversal decision record.
`;

const DD_003 = `---
id: DD-003
title: Legacy decision
status: superseded
---

# Legacy decision

Bravo legacy decision body.
`;

const NOTE_001 = `---
title: Personal note
scope: personal
---

# Personal note

Bravo personal note body.
`;

const DD_004 = `---
id: DD-004
title: Flagged decision
severity: blocks-work
is_outdated: true
priority: 3
---

# Flagged decision

Bravo flagged decision body.
`;

/**
 * List-valued frontmatter (FRICTION-049). `tags` is a container in every
 * record that has it; `topics` is a container here and a scalar in DD-006,
 * which is the mixed case an equality filter answers *partially*.
 */
const DD_005 = `---
id: DD-005
title: Tagged decision
tags: [retrieval, ranking]
topics: [logging]
---

# Tagged decision

Charlie tagged decision body.
`;

const DD_006 = `---
id: DD-006
title: Single-topic decision
topics: logging
---

# Single-topic decision

Charlie single topic decision body.
`;

function fakeVector(text: string): number[] {
  return [
    /cachetopic|QVEC_CACHE/.test(text) ? 1 : 0,
    /graphtopic|QVEC_GRAPH/.test(text) ? 1 : 0,
    0.001, // never a zero vector
  ];
}

const fakeEmbedBatch: EmbedBatchFn = async (_config, texts) => texts.map(fakeVector);
const fakeEmbedQuery: EmbedQueryFn = async (_config, text) => fakeVector(text);

describe("storage cache search", () => {
  let dir: string;
  let cachePath: string;
  let config: DocdogConfig;
  let db: Database.Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-cache-search-"));
    cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "specs", "notes"), { recursive: true });
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), DD_001);
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), DD_002);
    writeFileSync(join(dir, "specs", "decisions", "dd-003.md"), DD_003);
    writeFileSync(join(dir, "specs", "decisions", "dd-004.md"), DD_004);
    writeFileSync(join(dir, "specs", "decisions", "dd-005.md"), DD_005);
    writeFileSync(join(dir, "specs", "decisions", "dd-006.md"), DD_006);
    writeFileSync(join(dir, "specs", "notes", "note-001.md"), NOTE_001);
    config = {
      ...defaultConfig,
      project: { name: "cache-search-test" },
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

  function run(options: Parameters<typeof search>[2]) {
    return search(db, config, options, fakeEmbedQuery);
  }

  it("ranks keyword matches by BM25 and surfaces keyword_bm25", async () => {
    const results = await run({ query: "alpha" });
    expect(results[0].id).toBe("DD-001");
    expect(results[0].relevance.keyword_bm25).toBeGreaterThan(0);
  });

  it("ranks by cosine similarity when the query has no keyword overlap", async () => {
    const results = await run({ query: "QVEC_CACHE" });
    expect(results[0].id).toBe("DD-001");
    expect(results[0].relevance.vector_search).toBeGreaterThan(0.9);
    expect(results[0].relevance.keyword_bm25).toBeUndefined();
  });

  it("fuses legs: a two-leg hit outranks a one-leg hit, both signals surface", async () => {
    // "graphtopic QVEC_GRAPH": DD-002 tops both legs.
    const both = await run({ query: "graphtopic QVEC_GRAPH" });
    expect(both[0].id).toBe("DD-002");
    expect(both[0].relevance.keyword_bm25).toBeGreaterThan(0);
    expect(both[0].relevance.vector_search).toBeGreaterThan(0.9);

    // "bravo QVEC_CACHE": DD-001 wins the vector leg outright (cosine
    // ≈ 1) but is absent from the keyword leg; every "bravo" doc is in
    // both. RRF must put a two-leg doc first and keep DD-001 present.
    const fusedResults = await run({ query: "bravo QVEC_CACHE" });
    const ids = fusedResults.map((r) => r.id);
    expect(ids).toContain("DD-001");
    expect(fusedResults[0].id).not.toBe("DD-001");
    expect(fusedResults[0].relevance.keyword_bm25).toBeGreaterThan(0);
    const dd001 = fusedResults.find((r) => r.id === "DD-001")!;
    expect(dd001.relevance.vector_search).toBeGreaterThan(0.9);
    expect(dd001.relevance.keyword_bm25).toBeUndefined();
  });

  it("filters by collection", async () => {
    const results = await run({ query: "bravo", collection: "notes" });
    expect(results).toHaveLength(1);
    expect(results[0].collection).toBe("notes");
    expect(results[0].scope).toBe("personal");
  });

  it("refuses an unknown collection instead of silently returning zero (FRICTION-030)", async () => {
    // The unfiltered query has hits, so an empty result under the filter
    // would be a lie, not an honest miss.
    const unfiltered = await run({ query: "bravo" });
    expect(unfiltered.length).toBeGreaterThan(0);

    await expect(run({ query: "bravo", collection: "guidelines" })).rejects.toMatchObject({
      code: "UNKNOWN_COLLECTION",
    });
    // The refusal names the collections that do exist, not a generic error.
    await expect(run({ query: "bravo", collection: "guidelines" })).rejects.toThrow(/decisions/);
  });

  it("accepts a declared-but-empty collection and returns an honest empty result (FRICTION-030)", async () => {
    // A collection the config declares but no record uses yet is a valid
    // filter — it must return empty, not error. `principles` is declared
    // here but has zero indexed records.
    const declaredEmpty = { ...config, vertex_collections: [...config.vertex_collections!, "principles"] };
    const results = await search(db, declaredEmpty, { query: "bravo", collection: "principles" }, fakeEmbedQuery);
    expect(results).toHaveLength(0);
  });

  it("filters by status allowlist and blocklist", async () => {
    const allowed = await run({ query: "bravo", status: ["current"] });
    expect(allowed.map((r) => r.id)).not.toContain("DD-003");
    expect(allowed.map((r) => r.id)).toContain("DD-002");

    const blocked = await run({ query: "bravo", excludeStatus: ["superseded"] });
    expect(blocked.map((r) => r.id)).not.toContain("DD-003");
    expect(blocked.map((r) => r.id)).toContain("DD-002");
  });

  it("filters by scope, defaulting absent frontmatter scope to shared", async () => {
    const personal = await run({ query: "bravo", scope: "personal" });
    expect(personal).toHaveLength(1);
    expect(personal[0].title).toBe("Personal note");

    // The vector leg is unthresholded (v2 parity: cosine over every
    // candidate, ranked), so weak-cosine docs may pad the page — assert
    // scope filtering, not exact membership.
    const shared = await run({ query: "bravo", scope: "shared" });
    const ids = shared.map((r) => r.id);
    expect(ids).toContain("DD-002");
    expect(ids).toContain("DD-003");
    expect(shared.every((r) => r.scope === "shared")).toBe(true);
  });

  it("honours limit", async () => {
    const results = await run({ query: "bravo", limit: 1 });
    expect(results).toHaveLength(1);
  });

  describe("where — generic frontmatter equality filters (PROPOSAL-027)", () => {
    it("filters by a string attribute", async () => {
      const results = await run({ query: "bravo", where: { severity: "blocks-work" } });
      expect(results.map((r) => r.id)).toEqual(["DD-004"]);
    });

    it("coerces booleans so `is_outdated: true` matches; absent fields never match", async () => {
      const hit = await run({ query: "bravo", where: { is_outdated: true } });
      expect(hit.map((r) => r.id)).toEqual(["DD-004"]);
      // No record carries `false`, and records lacking the field are
      // NULL — equality excludes both.
      const miss = await run({ query: "bravo", where: { is_outdated: false } });
      expect(miss).toHaveLength(0);
    });

    it("filters by a numeric attribute", async () => {
      const hit = await run({ query: "bravo", where: { priority: 3 } });
      expect(hit.map((r) => r.id)).toEqual(["DD-004"]);
      const miss = await run({ query: "bravo", where: { priority: 4 } });
      expect(miss).toHaveLength(0);
    });

    it("applies identically to the vector leg", async () => {
      // QVEC_CACHE appears in no document: the keyword leg returns
      // nothing, so any hit came through the filtered vector leg.
      const results = await run({ query: "QVEC_CACHE", where: { severity: "blocks-work" } });
      expect(results.map((r) => r.id)).toEqual(["DD-004"]);
      expect(results[0].relevance.vector_search).toBeDefined();
      expect(results[0].relevance.keyword_bm25).toBeUndefined();
    });

    it("composes with the collection filter", async () => {
      const hit = await run({ query: "bravo", collection: "decisions", where: { severity: "blocks-work" } });
      expect(hit.map((r) => r.id)).toEqual(["DD-004"]);
      const miss = await run({ query: "bravo", collection: "notes", where: { severity: "blocks-work" } });
      expect(miss).toHaveLength(0);
    });

    it("refuses keys with dedicated params — one syntax path per filter", async () => {
      await expect(run({ query: "bravo", where: { collection: "notes" } })).rejects.toThrow(/dedicated/);
      await expect(run({ query: "bravo", where: { status: "current" } })).rejects.toThrow(/excludeStatus/);
      await expect(run({ query: "bravo", where: { scope: "shared" } })).rejects.toThrow(/dedicated/);
    });

    it("refuses non-identifier keys and non-scalar values", async () => {
      await expect(run({ query: "bravo", where: { "nested.path": "x" } })).rejects.toThrow(/identifier/);
      await expect(
        run({ query: "bravo", where: { severity: { nested: true } as unknown as string } }),
      ).rejects.toThrow(/string, number, or boolean/);
    });

    describe("a list-valued target is refused, not silently emptied (FRICTION-049)", () => {
      /**
       * The other three guards read the argument; this one reads the corpus,
       * which is why it was the only malformed filter that produced output.
       * `No results found.` and exit 0 is also the right answer to a query
       * that legitimately matches nothing, so it is the one failure a caller
       * cannot tell apart from data.
       */
      it("names the field and how the corpus stores it", async () => {
        await expect(run({ query: "charlie", where: { tags: "retrieval" } })).rejects.toThrow(
          /where\.tags \(array in 1 record\(s\)\)/,
        );
      });

      it("says so when the field is a container in some records and a scalar in others", async () => {
        // The subtler half: `topics=logging` would have matched DD-006 and
        // missed DD-005 — a plausible number rather than a visible zero.
        const err = await run({ query: "charlie", where: { topics: "logging" } }).catch((e) => e);
        expect(err.code).toBe("WHERE_NOT_SCALAR");
        expect(err.message).toMatch(/where\.topics \(array in 1 record\(s\), text in 1 record\(s\)\)/);
        expect(err.message).toMatch(/some records and a scalar in others/);
      });

      it("reports every offending key in one refusal", async () => {
        const err = await run({
          query: "charlie",
          where: { tags: "retrieval", topics: "logging" },
        }).catch((e) => e);
        expect(err.message).toMatch(/where\.tags/);
        expect(err.message).toMatch(/where\.topics/);
      });

      it("still reports an argument-shape problem first", async () => {
        // `vertexFilters` runs before this check on purpose: a value nobody
        // could have meant is a fact about the call, and reporting the corpus
        // mismatch instead would answer a question the caller did not reach.
        await expect(
          run({ query: "charlie", where: { tags: { nested: true } as unknown as string } }),
        ).rejects.toThrow(/string, number, or boolean/);
      });

      it("leaves a field the corpus has never seen alone", async () => {
        // Absence is FRICTION-045's subject, not this one. A key no record
        // carries is a well-formed filter over an empty set, and it must keep
        // returning an honest zero rather than being swept up by this guard.
        const results = await run({ query: "charlie", where: { unheard_of: "x" } });
        expect(results).toHaveLength(0);
      });
    });
  });

  it("returns v2-shaped rows: _id alias, source_file, description, preview", async () => {
    const [top] = await run({ query: "alpha", limit: 1 });
    expect(top._id).toBe(top.id);
    expect(top.source_file).toBe("specs/decisions/dd-001.md");
    expect(top.description).toBe("How the disposable cache works");
    expect(top.status).toBe("current");
    expect(top.preview).toContain("Alpha disposable cache");
    expect(top.preview.endsWith("…")).toBe(false); // short body returned whole
  });

  it("truncates previews at a word boundary per config.search.preview_length", async () => {
    const shortPreview = { ...config, search: { preview_length: 50 } };
    const [top] = await search(db, shortPreview, { query: "graphtopic", limit: 1 }, fakeEmbedQuery);
    expect(top.id).toBe("DD-002");
    expect(top.preview.endsWith("…")).toBe(true);
    expect(top.preview.length).toBeLessThanOrEqual(51);
    expect(top.preview).not.toMatch(/\s…$/); // cut at a boundary, not mid-word
  });

  it("survives FTS5 operator syntax in queries", async () => {
    const results = await run({ query: 'cache AND ) NEAR( "unbalanced' });
    expect(results.map((r) => r.id)).toContain("DD-001"); // "cache" still matches
  });

  it("skips the keyword leg for punctuation-only queries instead of erroring", async () => {
    const results = await run({ query: "??? --" });
    expect(Array.isArray(results)).toBe(true); // vector leg still answers
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.relevance.keyword_bm25 === undefined)).toBe(true);
  });

  describe("toFtsQuery", () => {
    it("quotes tokens and OR-joins them", () => {
      expect(toFtsQuery("disk-canonical cache")).toBe(`"disk-canonical" OR "cache"`);
    });

    it("escapes embedded double quotes", () => {
      expect(toFtsQuery(`say "hello"`)).toBe(`"say" OR """hello"""`);
    });

    it("drops tokens with no letters or digits", () => {
      expect(toFtsQuery("cache ?? !!")).toBe(`"cache"`);
      expect(toFtsQuery("?? -- !!")).toBeNull();
      expect(toFtsQuery("   ")).toBeNull();
      expect(toFtsQuery("")).toBeNull();
    });
  });
});
