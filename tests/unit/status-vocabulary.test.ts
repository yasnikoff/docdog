/**
 * The status vocabulary and the filters that check against it (FRICTION-038).
 *
 * The harness is the real indexer over a temp corpus, because the whole point
 * is that the vocabulary is read from what is on disk: statuses the records
 * carry, plus statuses the `concepts` records declare. A hand-built database
 * could not tell the two halves apart, and the two halves are the design.
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
import { suggestEdges } from "../../src/storage/suggest.js";
import {
  formatStatusVocabulary,
  loadStatusVocabulary,
} from "../../src/storage/status-vocabulary.js";
import { splitCsvAll } from "../../src/cli/filters.js";

const fakeEmbed: EmbedBatchFn = async (_c, texts) => texts.map((t) => [t.length, 1, 2]);
const fakeEmbedQuery: EmbedQueryFn = async () => [1, 1, 2];

/** A collection concept carrying a `status_vocabulary:` block — the DP-002
 * record shape that has shipped as data-only since PROPOSAL-026, and that
 * this feature is the first thing in v3 `src/` to read. */
const CONCEPT = `---
id: CONCEPT-COLLECTION-DECISIONS
title: "Collection: decisions"
collection: concepts
status: current
concept_kind: collection
name: decisions
status_vocabulary:
  current:
    description: In force.
  superseded:
    description: Replaced.
  deprecated:
    description: On the way out, nothing declared yet.
---

# Collection: decisions
`;

const record = (id: string, status?: string, body = "body text"): string =>
  `---\nid: ${id}\ntitle: ${id}\n${status ? `status: ${status}\n` : ""}---\n\n# ${id}\n\n${body}\n`;

describe("status vocabulary (FRICTION-038)", () => {
  let dir: string;
  let config: DocdogConfig;
  let db: Database.Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "docdog-statusvocab-"));
    const cachePath = join(dir, "cache.db");
    mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
    mkdirSync(join(dir, "concepts"), { recursive: true });

    writeFileSync(join(dir, "concepts", "collection-decisions.md"), CONCEPT);
    // DD-001 omits `status:` entirely — the indexer materializes "current",
    // so the vocabulary has to see it there and not as a NULL.
    writeFileSync(join(dir, "specs", "decisions", "dd-001.md"), record("DD-001"));
    writeFileSync(join(dir, "specs", "decisions", "dd-002.md"), record("DD-002", "superseded"));
    // A status no concept declares. The registry is advisory (DISC-023); the
    // corpus is not, so this must validate on the strength of being in use.
    writeFileSync(join(dir, "specs", "decisions", "dd-003.md"), record("DD-003", "obsolete"));

    config = {
      ...defaultConfig,
      project: { name: "vocab-test" },
      scan_paths: ["specs/", "concepts/"],
      vertex_collections: ["decisions", "concepts"],
      default_collection: "decisions",
    };
    await runCacheIndexer({
      config,
      projectRoot: dir,
      cacheFilePath: cachePath,
      embed: fakeEmbed,
      log: () => {},
      warn: () => {},
    });
    db = new Database(cachePath, { readonly: true });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("loadStatusVocabulary", () => {
    it("unions what records carry with what concepts declare", () => {
      const vocab = loadStatusVocabulary(db);
      expect([...vocab.known].sort()).toEqual(["current", "deprecated", "obsolete", "superseded"]);
    });

    it("counts only what is in use, and materializes an absent status as current", () => {
      const vocab = loadStatusVocabulary(db);
      // The concept record is itself `status: current`, so two of them.
      expect(vocab.present).toContainEqual({ status: "current", count: 2 });
      expect(vocab.present.map((s) => s.status).sort()).toEqual([
        "current",
        "obsolete",
        "superseded",
      ]);
    });

    it("separates the declared-but-unused half — a vocabulary entry is not a typo", () => {
      expect(loadStatusVocabulary(db).declaredUnused).toEqual(["deprecated"]);
    });

    it("renders a roster for `docdog status`", () => {
      expect(formatStatusVocabulary(loadStatusVocabulary(db))).toEqual([
        "  current: 2",
        "  obsolete: 1",
        "  superseded: 1",
        "  declared, unused: deprecated",
      ]);
    });
  });

  describe("the allowlist fails closed, so the refusal has to say so", () => {
    it("refuses a status nothing carries and nothing declares", () => {
      try {
        listRecords(db, config, { status: ["nonesuch"] });
        expect.unreachable("expected UNKNOWN_STATUS");
      } catch (err) {
        expect(err).toBeInstanceOf(SearchError);
        const e = err as SearchError;
        expect(e.code).toBe("UNKNOWN_STATUS");
        expect(e.message).toContain('"nonesuch"');
        // The valid values, at the point of failure.
        expect(e.message).toContain("In use: current, obsolete, superseded");
        expect(e.message).toContain("Declared but unused: deprecated");
        expect(e.message).toContain("empty result");
      }
    });

    it("names every unknown value at once, so two typos cost one round trip", () => {
      try {
        listRecords(db, config, { status: ["opne", "shpped", "current"] });
        expect.unreachable("expected UNKNOWN_STATUS");
      } catch (err) {
        const msg = (err as SearchError).message;
        expect(msg).toContain('"opne"');
        expect(msg).toContain('"shpped"');
        expect(msg).toContain("2 value(s)");
      }
    });

    it("never guesses the near-miss — the alias map FRICTION-030 refused", () => {
      // One transposition from a status that exists. Refusing is the whole
      // behaviour; silently reading it as `current` is DP-001 tier 3.
      expect(() => listRecords(db, config, { status: ["currnet"] })).toThrow(/currnet/);
    });
  });

  describe("the blocklist fails open, which is the worse half", () => {
    it("refuses an exclusion naming nothing rather than returning the corpus", () => {
      // Before the fix this returned all four records, exit 0 — a larger
      // result set looks like a successful query, with no empty screen to
      // make anyone suspicious.
      expect(listRecords(db, config).length).toBe(4);
      try {
        listRecords(db, config, { excludeStatus: ["nonesuch"] });
        expect.unreachable("expected UNKNOWN_STATUS");
      } catch (err) {
        expect((err as SearchError).code).toBe("UNKNOWN_STATUS");
        expect((err as SearchError).message).toContain("whole corpus");
      }
    });
  });

  describe("what must still pass", () => {
    it("accepts a declared-but-unused status and returns an honest empty", () => {
      // FRICTION-030's carve-out, one column over: the tool cannot tell the
      // user their own vocabulary is wrong just because nobody has used it.
      expect(listRecords(db, config, { status: ["deprecated"] })).toEqual([]);
    });

    it("accepts a status in use that no concept declares", () => {
      expect(listRecords(db, config, { status: ["obsolete"] }).map((r) => r.id)).toEqual(["DD-003"]);
    });

    it("validates corpus-wide, not per collection", () => {
      // "are there any superseded concepts" is a question the tool can answer;
      // refusing it because that collection's concept omits the value would be
      // arguing instead of answering.
      expect(listRecords(db, config, { collection: "concepts", status: ["superseded"] })).toEqual(
        [],
      );
    });

    it("leaves an unfiltered call alone", () => {
      expect(() => listRecords(db, config, { status: [] })).not.toThrow();
    });
  });

  describe("the shell trap that started it", () => {
    it("names whitespace in a rejected value without splitting on it", () => {
      // PowerShell parses an unquoted `a,b,c` as an array expression and hands
      // the child one space-joined argv entry, so `splitCsv` finds no comma.
      try {
        listRecords(db, config, { excludeStatus: ["superseded obsolete current"] });
        expect.unreachable("expected UNKNOWN_STATUS");
      } catch (err) {
        const msg = (err as SearchError).message;
        expect(msg).toContain("contains whitespace");
        expect(msg).toContain("quote comma-separated values");
      }
    });
  });

  describe("every surface that takes the filter", () => {
    it("refuses in search, so the MCP tool refuses too", async () => {
      await expect(
        search(db, config, { query: "body", status: ["nonesuch"] }, fakeEmbedQuery),
      ).rejects.toMatchObject({ code: "UNKNOWN_STATUS" });
    });

    it("refuses in suggest-edges, where the filter's job is to prune a drain", () => {
      expect(() => suggestEdges(db, config, { excludeStatus: ["nonesuch"] })).toThrow(SearchError);
      expect(() => suggestEdges(db, config, { excludeStatus: ["superseded"] })).not.toThrow();
    });
  });
});

describe("splitCsvAll — repeating a list flag accumulates (FRICTION-038 fault 3)", () => {
  it("flattens every occurrence instead of keeping the last", () => {
    // `--exclude-status shipped --exclude-status superseded` used to exclude
    // superseded alone and hand back a plausible number.
    expect(splitCsvAll(["shipped", "superseded"])).toEqual(["shipped", "superseded"]);
  });

  it("treats the two spellings as the same filter", () => {
    expect(splitCsvAll(["a,b", "c"])).toEqual(splitCsvAll(["a", "b,c"]));
  });

  it("trims, drops empties, and dedupes", () => {
    expect(splitCsvAll([" a , b ", "b,,c"])).toEqual(["a", "b", "c"]);
  });

  it("reads no flag as no filter", () => {
    expect(splitCsvAll([])).toBeUndefined();
    expect(splitCsvAll(undefined)).toBeUndefined();
    expect(splitCsvAll([",", " "])).toBeUndefined();
  });
});
