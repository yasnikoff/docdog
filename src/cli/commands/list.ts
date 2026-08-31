/**
 * `docdog list` — enumerate every record matching a predicate (FRICTION-036).
 *
 * The counterpart to `search`, not a variant of it: search answers "what is
 * most relevant to this text", list answers "what are all of these". Ranked
 * retrieval cannot answer the second question at any limit, because a record
 * can match the filter and still fall below a query's recall — which is why
 * every completeness survey until now ended in a filesystem grep.
 *
 * No query argument, so no embedder: this is the one read path that never
 * loads ONNX.
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import { splitCsvAll, collectRepeatable, parseWherePairs } from "../filters.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description(
      "List every record matching a filter (exhaustive and unranked — the completeness query search cannot express)",
    )
    .option(
      "--collection <name>",
      "Limit to a collection, named exactly as this corpus defines it (an unknown name is refused, not silently emptied — see 'docdog status')",
    )
    .option(
      "--scope <name>",
      "Limit to a visibility scope (DD-058). A record declaring none counts as shared, so --scope shared includes them. Free string, so an unused value returns an honest empty rather than a refusal — 'docdog status' rosters the scopes in use",
    )
    .option(
      "--status <list>",
      'Allowlist: statuses to include, comma-separated and repeatable (e.g. --status "open,current"). A value no record carries and no collection concept declares is refused, not silently emptied — "docdog status" lists them',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--exclude-status <list>",
      'Blocklist: statuses to exclude, comma-separated and repeatable (e.g. --exclude-status "superseded,shipped"). Refused the same way — an exclusion naming nothing would return the whole corpus',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--where <key=value>",
      "Equality filter on a top-level frontmatter field (repeatable). Values parse as YAML scalars: --where severity=blocks-work. A field the corpus stores as a list is refused, not silently emptied",
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
    .option("--limit <n>", "Cap the output (default: every match)")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      const { openCacheRead } = await import("../../storage/cache.js");
      const { listRecords, SearchError } = await import("../../storage/search.js");
      try {
        const handle = openCacheRead(projectRoot);
        let results;
        try {
          results = listRecords(handle.db, config, {
            collection: opts.collection,
            scope: opts.scope,
            status: splitCsvAll(opts.status),
            excludeStatus: splitCsvAll(opts.excludeStatus),
            where: parseWherePairs(opts.where),
            has: splitCsvAll(opts.has),
            lacks: splitCsvAll(opts.lacks),
            limit: opts.limit === undefined ? undefined : parseInt(opts.limit, 10),
          });
        } finally {
          handle.close();
        }

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log("No records match.");
          return;
        }

        for (const r of results) {
          console.log(`${r.id}\t[${r.collection}]\t${r.status}\t${r.title}`);
        }
        // The count is the point of the command — a list you have to pipe
        // through `wc -l` to size hasn't finished answering the question.
        console.log(
          `\n${results.length} record(s)${opts.limit !== undefined ? " (capped by --limit)" : ""}.`,
        );
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
        printError("LIST_ERROR", String(err), 'Cache missing or stale? Run "docdog index" first.');
        process.exitCode = 1;
        return;
      }
    });
}
