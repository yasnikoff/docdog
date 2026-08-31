import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import { splitCsvAll, collectRepeatable, parseWherePairs } from "../filters.js";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search the graph (hybrid: BM25 keyword + vector)")
    .option("--collection <name>", "Limit to a collection, named exactly as this corpus defines it (an unknown name is refused, not silently emptied — see 'docdog status')")
    .option(
      "--scope <name>",
      "Limit to a visibility scope (DD-058). A record declaring none counts as shared, so --scope shared includes them. Free string, so an unused value returns an honest empty rather than a refusal — 'docdog status' rosters the scopes in use",
    )
    .option(
      "--status <list>",
      'Allowlist: statuses to include, comma-separated and repeatable (e.g. --status "accepted,current"). A value no record carries and no collection concept declares is refused, not silently emptied — "docdog status" lists them',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--exclude-status <list>",
      'Blocklist: statuses to exclude, comma-separated and repeatable (e.g. --exclude-status "proposed,draft"). Refused the same way',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--where <key=value>",
      "Equality filter on a top-level frontmatter field (repeatable). Values parse as YAML scalars: --where is_outdated=true --where severity=blocks-work. A field the corpus stores as a list is refused, not silently emptied",
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--has <list>",
      "Require these frontmatter fields to be present, comma-separated and repeatable (e.g. --has upstream_issue). A field the corpus stores as a list is fine here — presence never compares against the value",
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--lacks <list>",
      "Require these frontmatter fields to be absent — the complement of --has, and the only way to ask which records a convention has not reached yet. A field no record carries returns the whole corpus, which is the correct answer on the day the convention is invented, so it is not refused",
      collectRepeatable,
      [] as string[],
    )
    .option("--limit <n>", "Max results", "5")
    .option("--json", "Output raw JSON")
    .action(async (query: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      const { openCacheRead } = await import("../../storage/cache.js");
      const { search, SearchError } = await import("../../storage/search.js");
      try {
        const status = splitCsvAll(opts.status);
        const excludeStatus = splitCsvAll(opts.excludeStatus);
        const where = parseWherePairs(opts.where);

        const handle = openCacheRead(projectRoot);
        let results;
        try {
          results = await search(handle.db, config, {
            query,
            collection: opts.collection,
            scope: opts.scope,
            status,
            excludeStatus,
            where,
            has: splitCsvAll(opts.has),
            lacks: splitCsvAll(opts.lacks),
            limit: parseInt(opts.limit, 10),
          });
        } finally {
          handle.close();
        }

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        for (const r of results) {
          const signals: string[] = [];
          if (r.relevance.vector_search !== undefined) {
            signals.push(`vector=${r.relevance.vector_search.toFixed(3)}`);
          }
          if (r.relevance.keyword_bm25 !== undefined) {
            signals.push(`bm25=${r.relevance.keyword_bm25.toFixed(2)}`);
          }
          const rel = signals.length > 0 ? signals.join(", ") : "?";
          console.log(formatSearchHit(r, rel));
          console.log(`    ${r.source_file}`);
          if (r.preview) {
            console.log(`    ${r.preview.replace(/\n/g, " ")}`);
          }
        }
      } catch (err) {
        // A bad filter is a fact about the argument, not the cache — don't
        // misdirect the user to reindex (FRICTION-030). The `where` guards
        // threw plain Errors until FRICTION-050 and so fell to the branch
        // below, which appends exactly that misdirection.
        if (err instanceof SearchError) {
          printError(err.code, err.message);
          process.exitCode = 1;
          return;
        }
        printError("SEARCH_ERROR", String(err), 'Cache missing or stale? Run "docdog index" first.');
        process.exitCode = 1;
        return;
      }
    });
}

/**
 * One result line. Exported so a test can see it: the two search surfaces
 * are the only read surfaces that cannot be exercised without loading the
 * real ONNX embedder, and FRICTION-053 is precisely a field one of them
 * silently omitted. Same move as `WHERE_DEDICATED_PARAMS` (FRICTION-050) —
 * export the thing the invariant is about rather than assert on a literal.
 *
 * `status` is here because `list` and `get` have always shown it, and a
 * RANKED surface chooses records for you: the one field saying whether a
 * hit is still live must not be the field it withholds.
 */
export function formatSearchHit(
  r: { id: string; title: string; collection: string; status: string },
  relevance: string,
): string {
  return `
─── ${r.id} — ${r.title} [${r.collection}] ${r.status} (${relevance})`;
}
