/**
 * Retrieval eval, pointed at another project's corpus.
 *
 * Same five systems, same grep reimplementation, same metrics as
 * run-retrieval-eval.ts — they share engine.ts, so the only variable between
 * a run here and a run there is the corpus. That is the whole point: docdog's
 * own numbers are measured on a small, agent-authored, self-describing
 * corpus, and the question an adopter actually has is what the numbers look
 * like on theirs.
 *
 * Two things differ from the self-corpus runner, both forced by the fact that
 * an adopting project freezes its query set BEFORE `docdog init` runs:
 *
 *   - **Golds are file paths, not record ids** — a project with no docdog ids
 *     yet can still name the file that answers a question. Path mode expands
 *     a gold to every record the file holds, so a split-parsed section counts
 *     as a hit on its source file.
 *   - **An unresolvable gold is reported, not thrown** — a gold file that no
 *     scan path reaches is a corpus-config gap, and scoring it as a retrieval
 *     miss is how OBS-013's Q22 spent a day looking like evidence for
 *     chunking. Those queries are excluded from every number and listed.
 *
 * Run:
 *   npx tsx tests/eval/run-external-eval.ts \
 *     --root <abs path to the project> \
 *     --queries <path to the frozen set, absolute or relative to --root> \
 *     --out <path to write the report> \
 *     [--label <name>]
 *
 * The report is written where you point it. It quotes gold paths and query
 * text verbatim, which for a private corpus is private content — keep it out
 * of this repo (DD-071) and publish only aggregates.
 *
 * Query-set shape: `queries:` is a list of records carrying an `id`, a
 * `category`, the question (`query` or `question`), the golds (`gold` or
 * `golds`), and optionally `retired: true` to skip a query whose target no
 * longer exists.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "../../src/config/loader.js";
import { openCacheRead } from "../../src/storage/cache.js";
import {
  buildReport,
  createEngine,
  printSummary,
  SYSTEMS,
  type EvalQuery,
  type QueryOutcome,
} from "./engine.js";

// ─── Arguments ──────────────────────────────────────────────────────────────

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const rootArg = flag("root");
const queriesArg = flag("queries");
const outArg = flag("out");
const label = flag("label") ?? "external";

if (!rootArg || !queriesArg || !outArg) {
  console.error(
    "usage: run-external-eval.ts --root <project> --queries <set.yaml> --out <report.md> [--label <name>]",
  );
  process.exit(2);
}

const projectRoot = resolve(rootArg);
const queriesPath = isAbsolute(queriesArg) ? queriesArg : join(projectRoot, queriesArg);
const outPath = resolve(outArg);

// ─── Query set ──────────────────────────────────────────────────────────────

interface RawQuery {
  id: string;
  category?: string;
  query?: string;
  question?: string;
  gold?: string[];
  golds?: string[];
  note?: string;
  notes?: string;
  retired?: boolean;
}

const raw = (parseYaml(readFileSync(queriesPath, "utf8")) as { queries: RawQuery[] }).queries;
const queries: EvalQuery[] = [];
let retired = 0;
for (const r of raw) {
  if (r.retired) {
    retired++;
    continue;
  }
  const text = r.query ?? r.question;
  const gold = r.gold ?? r.golds;
  if (!text || !gold || gold.length === 0) {
    throw new Error(`${r.id}: query set entry has no question or no gold`);
  }
  queries.push({
    id: r.id,
    query: text,
    gold,
    category: r.category ?? "uncategorized",
    note: r.note ?? r.notes,
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig(projectRoot);
const handle = openCacheRead(projectRoot);
const engine = createEngine({ projectRoot, config, db: handle.db, goldMode: "path" });

console.log(
  `External eval [${label}]: ${queries.length} queries` +
    (retired > 0 ? ` (${retired} retired, skipped)` : "") +
    ` over ${engine.recordCount} records in ${engine.grepFileCount} files ` +
    `(${(engine.grepBytes / 1048576).toFixed(1)} MB of markdown)\n`,
);

// Partition before scoring: a query whose gold reaches nothing indexed cannot
// fail informatively, so it is reported rather than counted.
const scored: EvalQuery[] = [];
const unresolved: Array<{ q: EvalQuery; entries: string[] }> = [];
for (const q of queries) {
  const gold = engine.resolveGold(q);
  if (gold.ids.size === 0) unresolved.push({ q, entries: gold.unresolved });
  else scored.push(q);
}
for (const u of unresolved) {
  console.log(`${u.q.id} SKIPPED — gold not indexed: ${u.entries.join(", ")}`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

const outcomes: QueryOutcome[] = [];
for (const q of scored) {
  const systems = await engine.run(q);
  outcomes.push({ q, systems });
  const marks = SYSTEMS.map(
    (s) => `${s}=${systems[s].goldRank === null ? "—" : systems[s].goldRank}`,
  ).join(" ");
  console.log(`${q.id} [${q.category}] ${marks}`);
}

handle.close();

// ─── Report ─────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const report = buildReport({
  title: `External retrieval eval — ${label} (${today})`,
  provenance: [
    `Corpus: ${engine.recordCount} records across ${engine.grepFileCount} files ` +
      `(${(engine.grepBytes / 1048576).toFixed(1)} MB of markdown under the config's scan paths) · ` +
      `embed: \`${config.embed.provider}/${config.embed.model}\``,
    `Query set: \`${queriesArg}\` — ${queries.length} live` +
      (retired > 0 ? `, ${retired} retired` : "") +
      `, ${outcomes.length} scored, ${unresolved.length} unscored · depth: top-10 · golds matched by file path`,
    `Generated by \`npx tsx tests/eval/run-external-eval.ts\` from docdog — see tests/eval/README.md for method.`,
  ],
  outcomes,
  unresolved,
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, report, "utf8");

printSummary(outcomes);
console.log(`\nReport written to ${outPath}`);
