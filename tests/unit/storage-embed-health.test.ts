/**
 * Embed-coverage reporting.
 *
 * The behavior under test is a disclosure, so the assertions are mostly about
 * what the words say: a check that silently under-reports a truncation would
 * be worse than no check, because it would read as an all-clear.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  MAX_EMBED_CHARS,
  checkEmbedHealth,
  describeRecipeChange,
  embedRecipe,
  formatEmbedHealth,
  formatEmbedHealthWarnings,
  parseRecipe,
} from "../../src/storage/embed-health.js";

let db: Database.Database;

/** Just the columns checkEmbedHealth reads — it must not need the rest. */
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE vertices (id TEXT PRIMARY KEY, file_path TEXT, body_text TEXT)`);
});

afterEach(() => db.close());

function add(id: string, chars: number, filePath = `specs/${id}.md`) {
  db.prepare(`INSERT INTO vertices (id, file_path, body_text) VALUES (?, ?, ?)`).run(
    id,
    filePath,
    "x".repeat(chars),
  );
}

describe("checkEmbedHealth", () => {
  it("reports nothing when every record fits", () => {
    add("A", 100);
    add("B", MAX_EMBED_CHARS);
    const report = checkEmbedHealth(db);
    expect(report.oversized).toEqual([]);
    expect(report.unembeddedChars).toBe(0);
    expect(report.unembeddedPct).toBe(0);
  });

  it("treats the cap as inclusive — a record exactly at it is whole", () => {
    add("EXACT", MAX_EMBED_CHARS);
    add("OVER", MAX_EMBED_CHARS + 1);
    expect(checkEmbedHealth(db).oversized.map((r) => r.id)).toEqual(["OVER"]);
  });

  it("counts only the characters past the cap as unembedded", () => {
    add("A", MAX_EMBED_CHARS + 2000);
    const report = checkEmbedHealth(db);
    expect(report.oversized[0].chars).toBe(MAX_EMBED_CHARS + 2000);
    expect(report.oversized[0].unembedded).toBe(2000);
    expect(report.unembeddedChars).toBe(2000);
  });

  it("measures the corpus share against total chars, not record count", () => {
    add("SMALL", 1000);
    add("BIG", MAX_EMBED_CHARS + 1000);
    const report = checkEmbedHealth(db);
    expect(report.totalChars).toBe(1000 + MAX_EMBED_CHARS + 1000);
    expect(report.unembeddedPct).toBeCloseTo((1000 / (MAX_EMBED_CHARS + 2000)) * 100, 5);
  });

  it("orders worst first — a 67% loss is not the same problem as a 4% one", () => {
    add("MILD", MAX_EMBED_CHARS + 100);
    add("SEVERE", MAX_EMBED_CHARS + 16000);
    add("MID", MAX_EMBED_CHARS + 3000);
    expect(checkEmbedHealth(db).oversized.map((r) => r.id)).toEqual(["SEVERE", "MID", "MILD"]);
  });

  it("measures UTF-16 code units, matching what the embedder truncates on", () => {
    // An astral char is 1 SQLite character but 2 JS code units. Measuring with
    // SQLite's length() would call this record 1 short of the cap and report
    // it clean, while embedInput would in fact cut it.
    const astral = "\u{1F600}".repeat(MAX_EMBED_CHARS / 2 + 1);
    db.prepare(`INSERT INTO vertices (id, file_path, body_text) VALUES (?, ?, ?)`).run(
      "EMOJI",
      "specs/emoji.md",
      astral,
    );
    const sqliteLen = (
      db.prepare(`SELECT length(body_text) AS n FROM vertices WHERE id = 'EMOJI'`).get() as {
        n: number;
      }
    ).n;
    expect(sqliteLen).toBeLessThan(MAX_EMBED_CHARS);
    expect(checkEmbedHealth(db).oversized.map((r) => r.id)).toEqual(["EMOJI"]);
  });

  it("honors an injected cap so the constant is not baked into callers", () => {
    add("A", 500);
    expect(checkEmbedHealth(db, 100).oversized[0].unembedded).toBe(400);
  });

  it("does not divide by zero on an empty corpus", () => {
    expect(checkEmbedHealth(db).unembeddedPct).toBe(0);
  });
});

describe("formatEmbedHealthWarnings (index)", () => {
  it("says nothing when the corpus is clean", () => {
    add("A", 10);
    expect(formatEmbedHealthWarnings(checkEmbedHealth(db))).toEqual([]);
  });

  it("leads with the corpus share, not the record count", () => {
    add("SMALL", 1000);
    add("BIG", MAX_EMBED_CHARS + 1000);
    const [line] = formatEmbedHealthWarnings(checkEmbedHealth(db));
    expect(line).toContain("% of the corpus is findable by keyword but not by meaning");
  });

  it("names the cap, so the number is not a mystery", () => {
    add("A", MAX_EMBED_CHARS + 1);
    expect(formatEmbedHealthWarnings(checkEmbedHealth(db))[0]).toContain(String(MAX_EMBED_CHARS));
  });

  it("caps the examples but counts the remainder out loud", () => {
    for (let i = 0; i < 9; i++) add(`R${i}`, MAX_EMBED_CHARS + 1000 + i);
    const [line] = formatEmbedHealthWarnings(checkEmbedHealth(db));
    expect(line).toContain("+6 more");
    expect(line).toContain("9 record(s)");
  });

  it("points at status for the list rather than printing 45 lines", () => {
    add("A", MAX_EMBED_CHARS + 1);
    expect(formatEmbedHealthWarnings(checkEmbedHealth(db))[0]).toContain('"docdog status"');
  });
});

describe("formatEmbedHealth (status)", () => {
  it("says nothing when the corpus is clean", () => {
    add("A", 10);
    expect(formatEmbedHealth(checkEmbedHealth(db))).toEqual([]);
  });

  it("names each record with its file, so the reader can go look", () => {
    add("BIG", MAX_EMBED_CHARS + 500, "specs/notes/big.md");
    const text = formatEmbedHealth(checkEmbedHealth(db)).join("\n");
    expect(text).toContain("BIG");
    expect(text).toContain("specs/notes/big.md");
    expect(text).toContain("500");
  });

  it("bounds the list at 10 and counts what it dropped", () => {
    for (let i = 0; i < 45; i++) add(`R${i}`, MAX_EMBED_CHARS + 1000 + i);
    const lines = formatEmbedHealth(checkEmbedHealth(db));
    const listed = lines.filter((l) => /^ {4}R\d+:/.test(l));
    expect(listed).toHaveLength(10);
    expect(lines.join("\n")).toContain("+35 more");
  });

  it("does not suggest splitting a record that cannot be split", () => {
    add("A", MAX_EMBED_CHARS + 1);
    const text = formatEmbedHealth(checkEmbedHealth(db)).join("\n");
    // Splitting only helps a file holding several records; most truncated
    // records are one long argument. Saying so beats an unqualified "split it".
    expect(text).toContain("only if the file holds several records");
  });
});

// FRICTION-046: the indexer's rebuild line has to name the input that
// moved, because a user reading a rebuild they did not ask for wants the
// word "dtype", not a string diff they perform themselves.
describe("recipe round-trip", () => {
  it("parses every shape embedRecipe emits, model slashes included", () => {
    expect(parseRecipe(embedRecipe("nomic-ai/nomic-embed-text-v1"))).toEqual({
      model: "nomic-ai/nomic-embed-text-v1",
      cap: String(MAX_EMBED_CHARS),
      dtype: null,
    });
    expect(parseRecipe(embedRecipe("nomic-ai/m", 16000, "q8"))).toEqual({
      model: "nomic-ai/m",
      cap: "16000",
      dtype: "q8",
    });
  });

  it("names one moved input, and all three when all three move", () => {
    expect(describeRecipeChange(embedRecipe("m"), embedRecipe("m", MAX_EMBED_CHARS, "q8"))).toBe(
      "dtype none → q8",
    );
    expect(describeRecipeChange(embedRecipe("a", 8000, "q8"), embedRecipe("b", 16000))).toBe(
      "model a → b, cap 8000 → 16000, dtype q8 → none",
    );
  });

  it("falls back to the raw pair for a string it did not write", () => {
    // The prior value comes out of a cache file, which is disposable and
    // may hold anything; a parse failure must not read as "nothing moved".
    expect(describeRecipeChange("garbage", embedRecipe("m"))).toContain("garbage");
  });
});
