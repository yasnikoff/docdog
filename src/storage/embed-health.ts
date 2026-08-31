/**
 * Embed-coverage check — which records lose their tail to the embed cap.
 *
 * `embedInput` truncates at MAX_EMBED_CHARS before handing a record to the
 * embedder. The full body still reaches `vertices.body_text` and FTS, so a
 * long record stays findable by *keyword*; only its vector sees a prefix. The
 * tail is therefore findable only by someone who already guessed its words —
 * which is the one thing vector search exists to spare them.
 *
 * That degradation was invisible: no warning, no count, nothing in `status`.
 * Measured on this corpus when the question was finally asked, it was not
 * marginal — 45 of 302 records (15%) truncated, 16% of the corpus never
 * embedded, and concentrated on the hubs: DD-070 loses its Rationale,
 * Principle walk and Supersession pass; DP-002 cuts mid-sentence through the
 * obligations it imposes. These are argumentative records whose head is setup
 * and whose tail is the conclusion, so the cap keeps close to the worst
 * available prefix: the vector learns what a record is *about* and not what
 * it *says*.
 *
 * This module reports that and stops. It is DP-001 tier 1 — a length compared
 * to a constant, no judgment — and deliberately suggests nothing. The obvious
 * remedy is not available: `docdog split` turns *file* boundaries into
 * *record* boundaries, and a truncated record here is usually one long
 * argument with no record boundary inside it (DD-070 is one decision with ten
 * sections; it cannot become ten decisions). So the warning discloses a cost
 * rather than assigning blame for it.
 *
 * DO NOT "FIX" WHAT THIS REPORTS. All four repairs anyone has proposed were
 * built and measured against the 40 frozen queries with the real search(), and
 * all four lose to leaving it alone (0.874 hybrid MRR):
 *
 *   chunk it                      0.785  (OBS-016)
 *   summarize into the input      0.840  (OBS-017)
 *   raise the cap                 0.846  (OBS-019)
 *   chunk it but keep the context 0.838  (OBS-020, late chunking)
 *
 * Two of those settle the rest. Raising the cap is buildable — every record
 * fits nomic's 8,192-token context (max 6,694) — and embedding the whole body
 * makes each record match its own query LESS, on 12 of 12 measured pairs:
 * truncation is accidentally summarizing, since these records open with framing
 * and close with detail, so the prefix is near the best available summary.
 * And late chunking, the one design that repairs what chunking broke, only
 * gets close by smearing its spans into 92% copies of the whole-document vector
 * — i.e. by approximating what this file already does, at six times the vectors.
 *
 * The reason is singular and it is architectural, not a property of the cap:
 * search() returns RECORDS and scores one by the MAX over its vectors, so any
 * multi-vector layout buys fragment recall it cannot spend and pays a lottery
 * tax it cannot avoid. The whole-record centroid is not a compromise forced by
 * this constant. It is the shape of the problem. The tail stays findable by
 * keyword because FTS indexes the full body, which is why the cost is small.
 * What this module discloses is a measured, accepted trade.
 *
 * Bodies are loaded rather than measured with SQLite's `length()`, which
 * counts characters where `embedInput` compares UTF-16 code units — the two
 * disagree on astral content, and SQLite's is the *smaller*, so it would
 * under-report a truncation. Under-reporting is the failure this module
 * exists to end, and a corpus that fits in a cache fits in memory.
 */
import type Database from "better-sqlite3";

/**
 * Character budget for a single embedding input. nomic-embed materializes
 * an O(seq²) attention matrix, so a ~6.6k-token record demanded a 1.8 GB
 * buffer and blew ONNX's allocator. This cap (~2k tokens at this corpus's
 * ~4.3 chars/token) keeps the transient under ~200 MB.
 *
 * It was chosen as a resource guard, not a modelling choice — the full body
 * still lands in `vertices.body_text` and FTS; only the vector sees a prefix.
 * But it turns out to earn its keep on QUALITY too, which nobody designed:
 * raising it to embed every record whole is buildable (nothing here exceeds
 * nomic's 8,192-token context) and measurably worse — mean pooling over ~6k
 * tokens blurs the whole-record centroid that record-finding queries match
 * (OBS-019). ~2k tokens at this corpus's ~4.3 chars/token also happens to sit
 * just past nomic's 2,048-token TRAINED length, beyond which positions are
 * NTK-interpolated. Do not raise this expecting better retrieval.
 *
 * `checkEmbedHealth` reports what it costs rather than letting it accrue
 * silently. The `chunks` table's `ord`/`start_line`/`end_line` stay unused by
 * design: multi-chunk embedding is refused, not deferred (OBS-016) — including
 * its strongest form, late chunking, which is the best chunking measured here
 * and still loses (OBS-020).
 *
 * Changing this number is now mechanically safe: the embed store's key
 * carries the cap (`embedRecipe`, just below), so vectors built under
 * the old one stop matching instead of being served alongside new ones. That
 * used to be a sentence in CLAUDE.md asking whoever touched this constant to
 * remember to drop the store — a manual invariant in the one subsystem that
 * versions everything else mechanically (FRICTION-033).
 *
 * It lives here rather than beside `embedInput` so that `status` can report
 * against it without importing the indexer (and its embedder, and its
 * discovery pass) to read one number.
 */
export const MAX_EMBED_CHARS = 8000;

/**
 * The identity of the *function* that turned a body into a vector — what the
 * embed store files that vector under, alongside the hash of the body itself
 * (FRICTION-033).
 *
 * The store's key used to be `(content_hash, model)`, where `content_hash` is
 * taken over the FULL body and `embedInput` truncates afterwards. So the cap
 * was an input to the embedding function exactly as the model is, and it was
 * absent from the key: move it, and every unchanged record would keep
 * returning a vector built under the old cap while edited records got the new
 * one — a corpus of mixed vintages with no version anywhere that could detect
 * it. Search would stay confident throughout. That is the same shape as
 * FRICTION-019 and FRICTION-028: well-formed output, nothing reported.
 *
 * So the key names the whole recipe. **Anything that changes what `embedInput`
 * (storage/indexer.ts) emits must appear here** — OBS-017's prepend-the-
 * description design is the worked example, and it was two measurements from
 * shipping. `embedInput` carries a pointer back to this rule.
 *
 * Deliberately not a version counter: a recipe id is a *point in a keyspace*,
 * not a schema generation. Old rows do not need dropping (they are simply
 * unreachable), and flipping the cap back makes them hits again — the same
 * behaviour switching the model back already has, which is the argument that
 * this is the same kind of thing. Contrast a bump of EMBED_SCHEMA_VERSION,
 * which drops the whole store including every row the change does not affect
 * — the cost PROPOSAL-029 exists to stop paying.
 *
 * `dtype` (ONNX quantization, FRICTION-018 item 3) is the third such input and
 * enters the same way. An **unset** dtype yields exactly `model@cap` — byte-for
 * byte the pre-dtype key — so adding the parameter re-embeds nothing in the
 * common case; only a named quantization (`…#q8`) opens a distinct keyspace,
 * which is what lets a measurement embed the corpus at several dtypes into one
 * shared store without a single vector colliding (OBS-022).
 *
 * Lives here beside `MAX_EMBED_CHARS`, not beside `embedInput` where it is
 * applied, for the same reason the cap does: `status` computes the current
 * recipe to count the store's superseded stratum (FRICTION-035) and must not
 * import the indexer to do it. The recipe is a naming of its inputs (model,
 * cap, dtype), and this is where those inputs live.
 */
export function embedRecipe(
  model: string,
  cap: number = MAX_EMBED_CHARS,
  dtype?: string | null,
): string {
  return dtype ? `${model}@${cap}#${dtype}` : `${model}@${cap}`;
}

/**
 * Split a recipe string back into the three inputs that made it.
 *
 * Only ever applied to strings this module produced, so the parse is
 * total: the model may contain anything but `@`, the cap is what follows
 * it, and `#dtype` is optional. A string that does not parse is reported
 * as a model with no cap rather than throwing — it came out of a cache
 * file, which is disposable and may hold anything.
 */
export function parseRecipe(recipe: string): {
  model: string;
  cap: string | null;
  dtype: string | null;
} {
  const at = recipe.lastIndexOf("@");
  if (at === -1) return { model: recipe, cap: null, dtype: null };
  const model = recipe.slice(0, at);
  const rest = recipe.slice(at + 1);
  const hash = rest.indexOf("#");
  if (hash === -1) return { model, cap: rest, dtype: null };
  return { model, cap: rest.slice(0, hash), dtype: rest.slice(hash + 1) };
}

/**
 * Name which recipe input moved, for the line the indexer prints when it
 * decides on a full rebuild.
 *
 * The recipe strings alone would technically say it — `…@8000` next to
 * `…@8000#q8` — but a user reading a rebuild they did not ask for wants
 * the word `dtype`, not a diff they have to perform. Falls back to the
 * raw pair when nothing recognizable differs, which is the honest answer
 * for a cache file holding something this module did not write.
 */
export function describeRecipeChange(prior: string, next: string): string {
  const a = parseRecipe(prior);
  const b = parseRecipe(next);
  const parts: string[] = [];
  const show = (v: string | null) => v ?? "none";
  if (a.model !== b.model) parts.push(`model ${a.model} → ${b.model}`);
  if (a.cap !== b.cap) parts.push(`cap ${show(a.cap)} → ${show(b.cap)}`);
  if (a.dtype !== b.dtype) parts.push(`dtype ${show(a.dtype)} → ${show(b.dtype)}`);
  return parts.length > 0 ? parts.join(", ") : `${prior} → ${next}`;
}

export interface OversizedRecord {
  id: string;
  filePath: string;
  chars: number;
  /** Characters past the cap — present in FTS, absent from every vector. */
  unembedded: number;
  /** `unembedded` as a whole percent of the record, for display. */
  lostPct: number;
}

export interface EmbedHealthReport {
  cap: number;
  /** Worst first — a 67%-truncated record is a different problem from a 4% one. */
  oversized: OversizedRecord[];
  unembeddedChars: number;
  totalChars: number;
  /** Share of the corpus's characters no vector has ever seen. */
  unembeddedPct: number;
}

/** How many oversized records the warning and the status list name outright. */
const MAX_LISTED = 10;

export function checkEmbedHealth(
  db: Database.Database,
  cap: number = MAX_EMBED_CHARS,
): EmbedHealthReport {
  const rows = db.prepare(`SELECT id, file_path, body_text FROM vertices`).all() as Array<{
    id: string;
    file_path: string;
    body_text: string;
  }>;

  const oversized: OversizedRecord[] = [];
  let totalChars = 0;
  let unembeddedChars = 0;

  for (const row of rows) {
    const chars = row.body_text.length;
    totalChars += chars;
    if (chars <= cap) continue;
    const unembedded = chars - cap;
    unembeddedChars += unembedded;
    oversized.push({
      id: row.id,
      filePath: row.file_path,
      chars,
      unembedded,
      lostPct: Math.round((unembedded / chars) * 100),
    });
  }

  oversized.sort((a, b) => b.unembedded - a.unembedded);

  return {
    cap,
    oversized,
    unembeddedChars,
    totalChars,
    unembeddedPct: totalChars === 0 ? 0 : (unembeddedChars / totalChars) * 100,
  };
}

/** Render as index warning lines. Empty when every record fits. */
export function formatEmbedHealthWarnings(report: EmbedHealthReport): string[] {
  if (report.oversized.length === 0) return [];

  const shown = report.oversized
    .slice(0, 3)
    .map((r) => `${r.id} (${r.chars} chars, ${r.lostPct}% unembedded)`);
  const more = report.oversized.length - shown.length;

  return [
    `  Cache: ${report.oversized.length} record(s) exceed the ${report.cap}-char embed cap — ` +
      `only the first ${report.cap} chars of each reach the vector index, so ` +
      `${report.unembeddedPct.toFixed(1)}% of the corpus is findable by keyword but not by meaning: ` +
      `${shown.join("; ")}${more > 0 ? `; +${more} more` : ""}. ` +
      `Run "docdog status" to list them.`,
  ];
}

/**
 * Render as status lines. Bounded at MAX_LISTED with the remainder counted
 * out loud — a silent cap would read as "that is all of them", which is the
 * same class of quiet wrongness this check exists to surface. `--json`
 * carries the full list.
 */
export function formatEmbedHealth(report: EmbedHealthReport): string[] {
  if (report.oversized.length === 0) return [];

  const lines = [
    `  ${report.unembeddedPct.toFixed(1)}% of the corpus (${report.unembeddedChars} chars) reaches no vector.`,
    `  The tail of each record below is findable by keyword only — the ${report.cap}-char cap`,
    `  is where its embedding stops. Splitting helps only if the file holds several records.`,
  ];

  for (const r of report.oversized.slice(0, MAX_LISTED)) {
    lines.push(
      `    ${r.id}: ${r.chars} chars, ${r.unembedded} (${r.lostPct}%) past the cap — ${r.filePath}`,
    );
  }

  const more = report.oversized.length - MAX_LISTED;
  if (more > 0) {
    lines.push(`    +${more} more (worst first; "docdog status --json" lists all)`);
  }

  return lines;
}
