/**
 * `docdog pairs` — PROPOSAL-049.
 *
 * Nominates similar record pairs that no settling edge joins, emits them as a
 * review file with the passages a judge needs, and validates the verdicts that
 * come back before applying them. Docdog never judges: no model is called,
 * no verdict inferred, and there is no `--accept-all` (DP-001 tier 3).
 *
 * The scan writes nothing. `--accept-from` is the only mode that touches a
 * file — edges into `relationships:`, verdicts into `.docdog/pair-verdicts.yaml`.
 *
 * `docdog pairs --id X`, run right after writing X, is the write-time use:
 * its author sees the candidates while the context is still in hand, which is
 * the moment OBS-029 says the edge went missing. `docdog_create` does not call
 * it on its own — deciding when to interrupt a write is not docdog's call.
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import type { DocdogConfig } from "../../types/config.js";
import { splitCsvAll, collectRepeatable } from "../filters.js";
import { PAIR_VERDICTS_FILE } from "../../storage/pair-verdicts.js";
import {
  DEFAULT_THRESHOLD,
  PAIR_EDGES_HINT,
  PairsError,
  resolvePairEdges,
  type PairEdgeSteps,
} from "../../storage/pairs.js";
import type { PairRefusal } from "../../storage/pairs-accept.js";

const REFUSAL_LABELS: Record<PairRefusal, string> = {
  record_not_found: "unknown record",
  duplicate_row: "pair judged twice in this file",
  invalid_defect: "invalid defect",
  reserved_relation: "reserved relation name",
  unregistered_relation: "unregistered relation",
  missing_direction: "relation without a direction",
  stale_hash: "body changed since emitted",
  missing_evidence: "evidence missing",
  evidence_not_found: "evidence not verbatim",
  already_declared: "already declared",
  empty_context: "empty note (--allow-empty-context to apply)",
  source_not_found: "unknown source id",
  source_not_recordable: "source is a multi-record file",
  source_unpatchable: "unpatchable source frontmatter",
  cross_visibility: "target will not be in a clone (--allow-cross-visibility to apply)",
};

export function registerPairsCommand(program: Command): void {
  program
    .command("pairs")
    .description(
      "Nominate similar record pairs no settling edge joins, as a review file for a judge outside docdog (report only, unless --accept-from is given)",
    )
    .option(
      "--collection <list>",
      "Only pair records in these collections (comma-separated, repeatable)",
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--status <list>",
      "Only pair records with one of these statuses — replaces the default exclusion (comma-separated, repeatable)",
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--exclude-status <list>",
      "Skip records with these statuses (default: superseded, deprecated, resolved, archived — whichever the corpus uses)",
      collectRepeatable,
      [] as string[],
    )
    .option("--threshold <cosine>", `Minimum record cosine (default: ${DEFAULT_THRESHOLD.toFixed(2)})`)
    .option("--limit <n>", "Offer at most this many pairs, highest cosine first")
    .option("--id <id>", "Only pairs containing this record — run it right after writing one")
    .option(
      "--show-rejected",
      `Include pairs a current verdict in ${PAIR_VERDICTS_FILE} covers (default: suppressed, and counted)`,
    )
    .option("--defects", "List recorded defects no closing edge (pairs.edges.close) joins yet")
    .option("--format <fmt>", "text | review (default: text)", "text")
    .option("--json", "Output raw JSON")
    .option("--accept-from <file>", "Validate and apply a filled review file (the only mode that writes)")
    .option("--dry-run", "With --accept-from: validate and report, write nothing")
    .option("--allow-empty-context", "With --accept-from: write edges whose note is empty")
    .option(
      "--allow-cross-visibility",
      "With --accept-from: write edges whose target will not be in a clone of this repository",
    )
    .action(async (opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      let edgeSteps: PairEdgeSteps;
      try {
        edgeSteps = resolvePairEdges(config);
      } catch (err) {
        if (!(err instanceof PairsError)) throw err;
        printError(err.code, err.message, PAIR_EDGES_HINT);
        process.exitCode = 1;
        return;
      }

      if (!opts.acceptFrom && (opts.dryRun || opts.allowEmptyContext || opts.allowCrossVisibility)) {
        printError(
          "PAIRS_ERROR",
          "--dry-run, --allow-empty-context and --allow-cross-visibility only apply with --accept-from.",
          "The scan itself never writes, so there is nothing to dry-run.",
        );
        process.exitCode = 1;
        return;
      }
      if (opts.acceptFrom && opts.showRejected) {
        printError(
          "PAIRS_ERROR",
          "--show-rejected applies to the scan, not to --accept-from.",
          "The applier applies exactly the rows in the file you hand it.",
        );
        process.exitCode = 1;
        return;
      }

      // --defects reads the ledger, not the scan: a scan option beside it
      // would be accepted and do nothing, which reads as "it applied".
      const scanOptions = [
        (opts.collection?.length ?? 0) > 0 && "--collection",
        (opts.status?.length ?? 0) > 0 && "--status",
        (opts.excludeStatus?.length ?? 0) > 0 && "--exclude-status",
        opts.threshold !== undefined && "--threshold",
        opts.limit !== undefined && "--limit",
        opts.id !== undefined && "--id",
        opts.showRejected && "--show-rejected",
        opts.format !== "text" && "--format",
        opts.acceptFrom !== undefined && "--accept-from",
      ].filter((f): f is string => typeof f === "string");
      if (opts.defects && scanOptions.length > 0) {
        printError(
          "PAIRS_ERROR",
          `--defects lists the whole ledger and takes no ${scanOptions.join(", ")}.`,
          "Run docdog pairs --defects on its own (--json is fine).",
        );
        process.exitCode = 1;
        return;
      }
      if (!opts.acceptFrom && opts.format !== "text" && opts.format !== "review") {
        printError("PAIRS_ERROR", `unknown --format "${opts.format}" — text or review`);
        process.exitCode = 1;
        return;
      }

      if (opts.acceptFrom) {
        await acceptFrom(projectRoot, config, edgeSteps, opts);
        return;
      }

      try {
        const { openCacheRead } = await import("../../storage/cache.js");
        const { loadPairVerdicts } = await import("../../storage/pair-verdicts.js");
        const { nominatePairs, attachPassages, openDefects, checkPairEdges } = await import(
          "../../storage/pairs.js"
        );
        const { renderPairsReview, describeSettings, offeredPairs } = await import(
          "../../storage/pairs-accept.js"
        );
        const { loadRegistryFromCache } = await import("../../storage/relations.js");

        const verdicts = loadPairVerdicts(projectRoot);
        const handle = openCacheRead(projectRoot);
        try {
          const relationTypes = loadRegistryFromCache(handle.db).names();
          edgeSteps = checkPairEdges(edgeSteps, new Set(relationTypes));
          if (opts.defects) {
            const open = openDefects(handle.db, verdicts, edgeSteps.close);
            if (opts.json) {
              console.log(JSON.stringify({ settings: { closeTypes: edgeSteps.close }, defects: open }, null, 2));
              return;
            }
            if (open.length === 0) {
              console.log(`No open defects in ${PAIR_VERDICTS_FILE}.`);
              return;
            }
            console.log(
              `\n${open.length} open defect${open.length === 1 ? "" : "s"} — ${
                edgeSteps.close.length > 0
                  ? `each closes when a ${edgeSteps.close.join(" or ")} edge joins its pair`
                  : "pairs.edges.close is empty, so none of them can close"
              } (pairs.edges.close):\n`,
            );
            for (const d of open) {
              const v = d.verdict;
              const mark = !d.present
                ? "  [a record is gone]"
                : d.stale
                  ? "  [a body changed since — the pair is being re-offered]"
                  : "";
              console.log(`  ${v.defect.padEnd(13)} ${v.a} ~ ${v.b}${mark}`);
              if (v.note) console.log(`                ${v.note}`);
            }
            console.log();
            return;
          }

          const threshold = opts.threshold === undefined ? undefined : Number(opts.threshold);
          const limit = opts.limit === undefined ? undefined : Number(opts.limit);
          if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
            printError("PAIRS_ERROR", `--limit must be a positive integer, got ${opts.limit}`);
            process.exitCode = 1;
            return;
          }
          const exclude = splitCsvAll(opts.excludeStatus);
          const result = nominatePairs(handle.db, config, {
            collections: splitCsvAll(opts.collection),
            status: splitCsvAll(opts.status),
            excludeStatus: exclude,
            threshold,
            id: opts.id,
            settleTypes: edgeSteps.settle,
            showTypes: edgeSteps.show,
            closeTypes: edgeSteps.close,
            withinFile: edgeSteps.withinFile,
            verdicts,
          });

          const showJudged = opts.showRejected === true;
          const { offered, suppressed } = offeredPairs(result, showJudged);
          const rows = limit === undefined ? offered : offered.slice(0, limit);
          const truncated = offered.length - rows.length;
          const open = openDefects(handle.db, verdicts, edgeSteps.close).length;

          if (opts.json || opts.format === "review") {
            await attachPassages(handle.db, config, rows, {
              // stderr: stdout belongs to the document being redirected.
              log: (m) => console.error(m),
            });
          }

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  settings: result.settings,
                  pool: result.pool,
                  settled: result.settled,
                  settledWithinFile: result.settledWithinFile,
                  suppressed,
                  truncated,
                  openDefects: open,
                  pairs: rows,
                },
                null,
                2,
              ),
            );
            return;
          }

          if (opts.format === "review") {
            process.stdout.write(
              renderPairsReview(result, rows, {
                commandLine: reviewCommandLine(opts),
                relationTypes,
                suppressed,
                truncated,
              }),
            );
            return;
          }

          console.log(
            `\n${result.pool} record${result.pool === 1 ? "" : "s"}, cosine >= ${result.settings.threshold}; ${describeSettings(result)}`,
          );
          if (rows.length === 0) {
            console.log("No candidate pairs.");
          } else {
            console.log(`\n${rows.length} candidate pair${rows.length === 1 ? "" : "s"}:\n`);
            for (const c of rows) {
              const mark = c.judged
                ? `  [judged${c.judged.stale ? ", stale" : ""}: ${c.judged.verdict.relation}/${c.judged.verdict.defect}]`
                : "";
              console.log(
                `  ${c.cosine.toFixed(3)}  ${c.a.id} (${c.a.status}) ~ ${c.b.id} (${c.b.status})${mark}`,
              );
              for (const e of c.declared) console.log(`           declared: ${e.from} ${e.type} ${e.to}`);
            }
            console.log(
              `\nNothing was written. To judge in bulk: docdog pairs --format review > pairs.yaml, fill one verdict per row, then docdog pairs --accept-from pairs.yaml.`,
            );
          }
          if (truncated > 0) console.log(`${truncated} more past --limit.`);
          if (result.settled > 0) {
            console.log(
              `${result.settled} pair${result.settled === 1 ? "" : "s"} over the threshold already joined by a settling edge.`,
            );
          }
          if (result.settledWithinFile > 0) {
            console.log(
              `${result.settledWithinFile} pair${result.settledWithinFile === 1 ? "" : "s"} over the threshold settled by their file's own structure — same file, or an edge on the record they are part_of (pairs.within_file: offer to see them).`,
            );
          }
          if (suppressed > 0) {
            console.log(
              `${suppressed} pair${suppressed === 1 ? "" : "s"} suppressed by ${PAIR_VERDICTS_FILE} — rerun with --show-rejected to see them.`,
            );
          }
          if (open > 0) {
            console.log(
              `${open} open defect${open === 1 ? "" : "s"} recorded, closed by ${edgeSteps.close.length > 0 ? edgeSteps.close.join(" or ") : "(none)"} — docdog pairs --defects lists them.`,
            );
          }
          console.log();
        } finally {
          handle.close();
        }
      } catch (err) {
        // Caller errors must not arrive wearing the stale-cache hint
        // (FRICTION-030): a typo'd status or a broken ledger is not fixed by
        // reindexing.
        const { SearchError } = await import("../../storage/search.js");
        const { PairVerdictsError } = await import("../../storage/pair-verdicts.js");
        if (err instanceof PairsError && (err.code === "UNKNOWN_RELATION" || err.code === "INVALID_CONFIG")) {
          printError(err.code, err.message, PAIR_EDGES_HINT);
          process.exitCode = 1;
          return;
        }
        if (err instanceof SearchError || err instanceof PairsError) {
          printError(err.code, err.message);
          process.exitCode = 1;
          return;
        }
        if (err instanceof PairVerdictsError) {
          printError(err.code, err.message, `Fix or delete ${PAIR_VERDICTS_FILE} and re-run.`);
          process.exitCode = 1;
          return;
        }
        printError(
          "PAIRS_ERROR",
          err instanceof Error ? err.message : String(err),
          'Cache missing or stale? Run "docdog index" first.',
        );
        process.exitCode = 1;
      }
    });
}

function reviewCommandLine(opts: Record<string, unknown>): string {
  const parts = ["docdog pairs --format review"];
  const csv = (flag: string, value: unknown): void => {
    const values = splitCsvAll(value as string[] | undefined);
    if (values) parts.push(`${flag} "${values.join(",")}"`);
  };
  csv("--collection", opts.collection);
  csv("--status", opts.status);
  csv("--exclude-status", opts.excludeStatus);
  if (opts.threshold !== undefined) parts.push(`--threshold ${String(opts.threshold)}`);
  if (opts.limit !== undefined) parts.push(`--limit ${String(opts.limit)}`);
  if (opts.id) parts.push(`--id ${String(opts.id)}`);
  if (opts.showRejected) parts.push("--show-rejected");
  return parts.join(" ");
}

async function acceptFrom(
  projectRoot: string,
  config: DocdogConfig,
  edgeSteps: PairEdgeSteps,
  opts: Record<string, string | boolean | undefined>,
): Promise<void> {
  try {
    const { acceptPairsFromFile } = await import("../../storage/pairs-accept.js");
    const report = await acceptPairsFromFile({ config, projectRoot }, opts.acceptFrom as string, {
      dryRun: opts.dryRun === true,
      allowEmptyContext: opts.allowEmptyContext === true,
      allowCrossVisibility: opts.allowCrossVisibility === true,
      edges: edgeSteps,
    });

    const applied = report.outcomes.filter((o) => o.applied);
    const refused = report.outcomes.filter((o) => !o.applied);
    const verb = report.dryRun ? "would apply" : "applied";

    console.log();
    if (report.dryRun) console.log("Dry run — nothing was written.\n");
    console.log(
      `${verb} ${applied.length} verdict${applied.length === 1 ? "" : "s"} of ${report.rowsRead} row${report.rowsRead === 1 ? "" : "s"} read (${report.deferred} left blank — deferred)`,
    );
    console.log(
      `  ${report.dryRun ? "would write" : "wrote"} ${report.edgesApplied} edge${report.edgesApplied === 1 ? "" : "s"}` +
        `; ${report.dryRun ? "would record" : "recorded"} ${report.verdictsAdded + report.verdictsRefreshed} verdict${report.verdictsAdded + report.verdictsRefreshed === 1 ? "" : "s"} in ${PAIR_VERDICTS_FILE} (${report.verdictsAdded} new, ${report.verdictsRefreshed} re-affirmed)`,
    );

    // Every refusal prints by name — a row that a judge filled and docdog
    // refused is the reviewer's to act on, never a count to skim past.
    if (refused.length > 0) {
      console.log(`refused ${refused.length}:`);
      for (const o of refused) {
        const label = o.refusal ? (REFUSAL_LABELS[o.refusal] ?? o.refusal) : "refused";
        const detail = o.detail ? ` — ${o.detail}` : "";
        console.log(`  row ${o.row.index}  ${o.row.a} ~ ${o.row.b}: ${label}${detail}`);
      }
    }

    const closing = applied.filter((o) => o.closesOwnDefect);
    if (closing.length > 0) {
      console.log(
        `${closing.length} verdict${closing.length === 1 ? "" : "s"} recorded a defect and the edge that closes it (pairs.edges.close) in one row — the banner on the stale side is still yours to write:`,
      );
      for (const o of closing) {
        console.log(`  ${o.row.a} ~ ${o.row.b}: ${o.verdict!.defect}, ${o.edge!.fromId} ${o.edge!.type} ${o.edge!.toId}`);
      }
    }
    console.log();
  } catch (err) {
    const { PairVerdictsError } = await import("../../storage/pair-verdicts.js");
    const { PairsAcceptError } = await import("../../storage/pairs-accept.js");
    if (err instanceof PairVerdictsError) {
      printError(err.code, err.message, `Fix or delete ${PAIR_VERDICTS_FILE} and re-run.`);
      process.exitCode = 1;
      return;
    }
    if (err instanceof PairsError) {
      printError(err.code, err.message, PAIR_EDGES_HINT);
      process.exitCode = 1;
      return;
    }
    printError(
      err instanceof PairsAcceptError ? err.code : "PAIRS_ACCEPT_ERROR",
      err instanceof Error ? err.message : String(err),
      'Emit a review file with "docdog pairs --format review > pairs.yaml", fill it, then re-run.',
    );
    process.exitCode = 1;
  }
}
