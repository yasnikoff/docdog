/**
 * `docdog suggest-edges` — PROPOSAL-024 (resurrects v2's
 * PROPOSAL-010 command over the v3 cache), plus PROPOSAL-028's accept
 * half.
 *
 * Two halves of one loop. The scan surfaces undeclared id mentions in
 * indexed body text and writes nothing; `--format review` emits them as a
 * reviewable YAML document; the agent writes a context on the rows it keeps
 * and a `reject:` reason on the ones it refuses; `--accept-from` applies that
 * same document — edges into the sources' frontmatter, rejections into
 * `.docdog/rejected-edges.yaml` (PROPOSAL-046).
 *
 * A recorded rejection suppresses its candidate on later scans, and the
 * suppression is *counted out loud on every run*. That line is what keeps
 * this on the right side of DP-001: storing an agent's judgment is tier 1,
 * and hiding candidates from the agent without saying so would not be.
 *
 * The report path stays write-free — `--accept-from` is the only mode that
 * touches a file, and it applies exactly the rows a human or agent left in
 * the file. There is no `--accept-all` and no `--reject-rest`: judgment lives
 * in the review file (DP-001), and nothing here may apply or refuse a
 * candidate nobody read.
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import type { DocdogConfig } from "../../types/config.js";
import type { RelateOutcome, RelateSkipReason } from "../../storage/writes.js";
import { splitCsvAll, collectRepeatable } from "../filters.js";
import { REJECTIONS_FILE } from "../../storage/rejections.js";

const SKIP_LABELS: Record<RelateSkipReason, string> = {
  already_declared: "already declared",
  duplicate_row: "duplicate row",
  empty_context: "empty context (--allow-empty-context to apply)",
  source_not_found: "unknown source id",
  source_not_recordable: "multi-record file",
  source_unpatchable: "unpatchable source frontmatter",
  cross_visibility: "target will not be in a clone (--allow-cross-visibility to apply)",
};

/** Skips the reviewer has to act on, so they print row by row. The other
 * reasons are expected in a normal drain and the counts say enough. */
const ACTIONABLE_SKIPS = new Set<RelateSkipReason>([
  "source_not_found",
  "source_unpatchable",
  // Printed row by row rather than counted: the reviewer judged this pair
  // worth an edge and it is being refused, so the choice between recording
  // it on the other side and waiving the guard is theirs to make per edge.
  "cross_visibility",
]);

export function registerSuggestEdgesCommand(program: Command): void {
  program
    .command("suggest-edges")
    .description(
      "Scan indexed bodies for mentions of other record ids with no declared edge (report only, unless --accept-from is given)",
    )
    .option(
      "--collection <list>",
      "Only scan sources in these collections (comma-separated, repeatable)",
      collectRepeatable,
      [] as string[],
    )
    .option("--id <pattern>", "Only scan sources whose id matches this pattern (e.g. 'DD-*')")
    .option("--path <substring>", "Only scan sources whose file path contains this substring")
    .option(
      "--status <list>",
      'Only scan sources with one of these statuses (comma-separated, repeatable). A value nothing carries and nothing declares is refused — "docdog status" lists them',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--exclude-status <list>",
      'Skip sources with any of these statuses, e.g. --exclude-status superseded (comma-separated, repeatable). Refused the same way — an exclusion naming nothing prunes nothing',
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--show-rejected",
      "Include candidates the reject ledger covers, each annotated with the reason it was refused (default: suppressed, and counted)",
    )
    .option("--format <fmt>", "text | yaml | review (default: text)", "text")
    .option("--json", "Output raw JSON")
    .option("--accept-from <file>", "Apply a reviewed candidate file (the only mode that writes)")
    .option("--dry-run", "With --accept-from: classify and report, write nothing")
    .option("--allow-empty-context", "With --accept-from: apply rows whose context is empty")
    .option(
      "--allow-cross-visibility",
      "With --accept-from: apply rows whose target will not be in a clone of this repository",
    )
    .action(async (opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      if (
        !opts.acceptFrom &&
        (opts.dryRun || opts.allowEmptyContext || opts.allowCrossVisibility)
      ) {
        printError(
          "SUGGEST_EDGES_ERROR",
          "--dry-run, --allow-empty-context and --allow-cross-visibility only apply with --accept-from.",
          "The scan itself never writes, so there is nothing to dry-run.",
        );
        process.exitCode = 1;
        return;
      }

      // The mirror guard. --show-rejected widens what the *scan* offers; the
      // applier applies the file it was handed, and a flag that cannot change
      // its behaviour is a mistaken command rather than a no-op to swallow.
      if (opts.acceptFrom && opts.showRejected) {
        printError(
          "SUGGEST_EDGES_ERROR",
          "--show-rejected applies to the scan, not to --accept-from.",
          "The applier applies exactly the rows in the file you hand it.",
        );
        process.exitCode = 1;
        return;
      }

      if (opts.acceptFrom) {
        await acceptFrom(projectRoot, config, opts);
        return;
      }

      try {
        const { openCacheRead } = await import("../../storage/cache.js");
        const {
          suggestEdges,
          offeredSuggestions,
          suppressedCount,
          orphanRejections,
          crossVisibilityCount,
        } = await import("../../storage/suggest.js");
        const { buildVisibilityIndex } = await import("../../storage/visibility.js");
        const { loadRejections } = await import("../../storage/rejections.js");

        const showRejected = opts.showRejected === true;
        const rejections = loadRejections(projectRoot);

        const handle = openCacheRead(projectRoot);
        let scanned;
        try {
          scanned = suggestEdges(handle.db, config, {
            collections: splitCsvAll(opts.collection),
            idPattern: opts.id,
            pathFilter: opts.path,
            status: splitCsvAll(opts.status),
            excludeStatus: splitCsvAll(opts.excludeStatus),
            rejections,
            // Built over every indexed file rather than over the scan's
            // results, because the scan is what we are about to run. Three
            // git calls for the corpus; none when git cannot answer.
            visibility: buildVisibilityIndex(
              projectRoot,
              (
                handle.db.prepare(`SELECT DISTINCT file_path FROM vertices`).all() as Array<{
                  file_path: string;
                }>
              ).map((r) => r.file_path),
            ),
          });
        } finally {
          handle.close();
        }

        // --json carries the *whole* scan, each suppressed row wearing its
        // `rejected` marker. The machine surface is where a consumer most
        // needs to see the ledger's effect; filtering it while calling the
        // suppression visible would be the contradiction.
        if (opts.json) {
          console.log(JSON.stringify(scanned, null, 2));
          return;
        }

        const results = offeredSuggestions(scanned, showRejected);
        const suppressed = showRejected ? 0 : suppressedCount(scanned);
        // Orphans are only knowable from a whole-corpus scan. Under any
        // filter, every row about a source outside it "matches no candidate"
        // and would be reported as dead — the report would be loudest exactly
        // when it is least true. Suppression counts stay correct under a
        // filter because they are per-candidate; this is not.
        const filtered =
          Boolean(opts.id) ||
          Boolean(opts.path) ||
          (splitCsvAll(opts.collection)?.length ?? 0) > 0 ||
          (splitCsvAll(opts.status)?.length ?? 0) > 0 ||
          (splitCsvAll(opts.excludeStatus)?.length ?? 0) > 0;
        const orphans = filtered ? [] : orphanRejections(scanned, rejections);

        // The review document is machine-read back by --accept-from, so it
        // owns stdout whole — no human header above it, nothing to strip
        // before `> candidates.yaml`. An empty result still emits a legal
        // (empty) document: applying it is a no-op, which is the honest
        // round trip. Its own header carries the suppression count, so the
        // number survives the redirect into a file.
        if (opts.format === "review") {
          const { renderReviewDocument } = await import("../../storage/accept.js");
          process.stdout.write(
            renderReviewDocument(scanned, {
              commandLine: reviewCommandLine(opts),
              showRejected,
            }),
          );
          return;
        }

        if (results.length === 0) {
          console.log("No undeclared edge suggestions found.");
          reportLedger(suppressed, orphans, showRejected);
          return;
        }

        const total = results.reduce((sum, r) => sum + r.suggestions.length, 0);
        console.log(
          `\n${total} undeclared mention${total === 1 ? "" : "s"} across ${results.length} record${results.length === 1 ? "" : "s"}:\n`,
        );

        if (opts.format === "yaml") {
          for (const r of results) {
            console.log(`# ${r.source_id} — ${r.source_file}`);
            if (!r.recordable) {
              console.log(
                `# NOTE: multi-record file (split/table/script-parsed) — relate/update refuse it; record the edge on a citing default-parsed record, or edit this file directly.`,
              );
            }
            console.log(`relationships:`);
            for (const s of r.suggestions) {
              // A rejected row must never look pasteable: it is commented out
              // and carries its reason. --show-rejected is the only way one
              // reaches this loop at all.
              if (s.rejected) console.log(`  # rejected: ${s.rejected.reason}`);
              if (s.cross_visibility) {
                console.log(
                  `  # ${s.target_id} lives in ${s.cross_visibility.target_file}, which will not be in a clone —`,
                );
                console.log(`  # pasting this here publishes its id; record it on ${s.target_id} instead.`);
              }
              console.log(`${s.rejected ? "  # " : "  "}- ${s.type}: ${s.target_id}`);
            }
            console.log();
          }
          reportLedger(suppressed, orphans, showRejected);
          return;
        }

        for (const r of results) {
          const flag = r.recordable ? "" : "  [not writable via relate — multi-record file]";
          console.log(`  ${r.source_id}  (${r.source_file})${flag}`);
          for (const s of r.suggestions) {
            const mark = s.rejected
              ? `  [rejected${s.rejected.stale ? ", stale — body changed since" : ""}: ${s.rejected.reason}]`
              : "";
            // Appended rather than replacing: a candidate can be both, and
            // the two say different things — one is a judgment about the
            // pair, the other a fact about the files.
            const vis = s.cross_visibility
              ? `  [${s.cross_visibility.target_file} will not be in a clone — record it on ${s.target_id} instead]`
              : "";
            console.log(`    - ${s.type}: ${s.target_id}${mark}${vis}`);
          }
          console.log();
        }
        console.log(
          `Review each suggestion — accept via docdog_relate (adds context), or in bulk: re-run with --format review > candidates.yaml, write a context: or a reject: <why> on each row, then --accept-from candidates.yaml. Nothing was written.`,
        );
        const leaking = crossVisibilityCount(results);
        if (leaking > 0) {
          console.log(
            `
${leaking} candidate${leaking === 1 ? "" : "s"} would write an edge to a record no clone will have. ` +
              `They are shown, not withheld — accepting one is refused unless you pass --allow-cross-visibility.`,
          );
        }
        reportLedger(suppressed, orphans, showRejected);
      } catch (err) {
        // A filter refusal (FRICTION-030, FRICTION-038) is a caller error and
        // must not arrive wearing the stale-cache hint, which would send a
        // reader to reindex over a typo.
        const { SearchError } = await import("../../storage/search.js");
        if (err instanceof SearchError) {
          printError(err.code, err.message);
          process.exitCode = 1;
          return;
        }
        // Same rule one file over: a broken reject ledger is a fact about a
        // YAML file somebody edited, and telling them to reindex would send
        // them at the one thing that is fine (FRICTION-030).
        const { RejectionsError } = await import("../../storage/rejections.js");
        if (err instanceof RejectionsError) {
          printError(err.code, err.message, `Fix or delete ${REJECTIONS_FILE} and re-run.`);
          process.exitCode = 1;
          return;
        }
        printError(
          "SUGGEST_EDGES_ERROR",
          err instanceof Error ? err.message : String(err),
          'Cache missing or stale? Run "docdog index" first.',
        );
        process.exitCode = 1;
        return;
      }
    });
}

/**
 * What the reject ledger did to this run.
 *
 * The suppression count prints whether or not anyone asked, on every format
 * that a human reads, and that is the whole of what keeps default-on
 * suppression inside DP-001 tier 2: a scanner that quietly withholds what it
 * once offered is deciding what the agent may see. Orphans — rows matching
 * no candidate in this scan — print only under --show-rejected, because they
 * suppress nothing and a line about them on every run is noise.
 */
function reportLedger(
  suppressed: number,
  orphans: ReadonlyArray<{ from: string; to: string; reason: string }>,
  showRejected: boolean,
): void {
  if (suppressed > 0) {
    console.log(
      `\n${suppressed} candidate${suppressed === 1 ? "" : "s"} suppressed by ${REJECTIONS_FILE} — rerun with --show-rejected to see them.`,
    );
  }
  // Gated on --show-rejected as well as on being non-empty: an orphan
  // suppresses nothing, so a line about one on every run is noise.
  if (!showRejected || orphans.length === 0) return;
  console.log(
    `\n${orphans.length} ledger row${orphans.length === 1 ? "" : "s"} match no candidate in this scan — the mention is gone, the edge was declared, or an id moved. Nothing is reaped; delete a row to clear it:`,
  );
  for (const o of orphans) console.log(`  ${o.from} -> ${o.to}: ${o.reason}`);
}

/**
 * The scan command that produced a review document, echoed into its header.
 *
 * The list-valued flags are re-emitted as one quoted CSV each, whatever
 * spelling produced them — which is also the spelling that survives a shell
 * (FRICTION-038): this line is meant to be copied and re-run.
 */
function reviewCommandLine(opts: Record<string, unknown>): string {
  const parts = ["docdog suggest-edges --format review"];
  const csv = (flag: string, value: unknown): void => {
    const values = splitCsvAll(value as string[] | undefined);
    if (values) parts.push(`${flag} "${values.join(",")}"`);
  };
  csv("--collection", opts.collection);
  if (opts.id) parts.push(`--id '${String(opts.id)}'`);
  if (opts.path) parts.push(`--path ${String(opts.path)}`);
  csv("--status", opts.status);
  csv("--exclude-status", opts.excludeStatus);
  if (opts.showRejected) parts.push("--show-rejected");
  return parts.join(" ");
}

async function acceptFrom(
  projectRoot: string,
  config: DocdogConfig,
  opts: Record<string, string | boolean | undefined>,
): Promise<void> {
  try {
    const { acceptEdgesFromFile, warningsFor } = await import("../../storage/accept.js");

    const report = await acceptEdgesFromFile(
      { config, projectRoot },
      opts.acceptFrom as string,
      {
        dryRun: opts.dryRun === true,
        allowEmptyContext: opts.allowEmptyContext === true,
        allowCrossVisibility: opts.allowCrossVisibility === true,
      },
    );

    const skipped = report.outcomes.filter((o) => !o.applied);
    const { unregisteredType, danglingTarget } = warningsFor(report.outcomes);
    const files = report.dryRun
      ? new Set(report.outcomes.filter((o) => o.applied).map((o) => o.sourceFile)).size
      : report.filesWritten.length;

    console.log();
    if (report.dryRun) console.log("Dry run — nothing was written.\n");

    console.log(
      `${report.dryRun ? "would apply" : "applied"} ${report.edgesApplied} edge${report.edgesApplied === 1 ? "" : "s"} across ${files} file${files === 1 ? "" : "s"} (of ${report.edgesRead} row${report.edgesRead === 1 ? "" : "s"} read)`,
    );

    // The reject half reports on the same footing as the accept half, even at
    // zero: a drain that judged 116 candidates and recorded none of them is
    // exactly the state FRICTION-025 describes, and silence about it is how
    // that state went unnoticed for two sweeps.
    if (report.rejectionsRead > 0) {
      const stored = report.rejectionsAdded + report.rejectionsRefreshed;
      console.log(
        `${report.dryRun ? "would record" : "recorded"} ${stored} rejection${stored === 1 ? "" : "s"} in ${REJECTIONS_FILE} (${report.rejectionsAdded} new, ${report.rejectionsRefreshed} re-affirmed; of ${report.rejectionsRead} row${report.rejectionsRead === 1 ? "" : "s"} read)`,
      );
    }
    for (const outcome of report.rejectionOutcomes) {
      if (outcome.recorded) continue;
      console.log(
        `  skip  ${outcome.rejection.from} -> ${outcome.rejection.to}: unknown source id — no body to key the rejection to`,
      );
    }

    if (skipped.length > 0) {
      console.log(`skipped ${skipped.length} — ${summarize(skipped)}`);
    }
    const warned = unregisteredType.length + danglingTarget.length;
    if (warned > 0) {
      const parts: string[] = [];
      if (unregisteredType.length > 0) parts.push(`${unregisteredType.length} unregistered type`);
      if (danglingTarget.length > 0) parts.push(`${danglingTarget.length} dangling target`);
      console.log(`warned ${warned} — ${parts.join(", ")} (applied anyway)`);
    }

    // Detail only for the rows the reviewer has to do something about.
    for (const outcome of skipped) {
      if (!outcome.skipReason || !ACTIONABLE_SKIPS.has(outcome.skipReason)) continue;
      const { fromId, toId, type } = outcome.edge;
      const detail = outcome.detail ? ` — ${outcome.detail}` : "";
      console.log(
        `  skip  ${fromId} ${type} ${toId}: ${SKIP_LABELS[outcome.skipReason]}${detail}`,
      );
    }
    const written = report.dryRun ? "would still be written" : "was written";
    for (const outcome of unregisteredType) {
      console.log(
        `  warn  ${outcome.edge.fromId} ${outcome.edge.type} ${outcome.edge.toId}: relation type "${outcome.edge.type}" is not in the registry (advisory — the edge ${written})`,
      );
    }
    for (const outcome of danglingTarget) {
      console.log(
        `  warn  ${outcome.edge.fromId} ${outcome.edge.type} ${outcome.edge.toId}: target "${outcome.edge.toId}" has no record — the edge dangles`,
      );
    }
    console.log();
  } catch (err) {
    const { RejectionsError } = await import("../../storage/rejections.js");
    if (err instanceof RejectionsError) {
      printError(err.code, err.message, `Fix or delete ${REJECTIONS_FILE} and re-run.`);
      process.exitCode = 1;
      return;
    }
    printError(
      "ACCEPT_EDGES_ERROR",
      err instanceof Error ? err.message : String(err),
      'Emit a review file with "docdog suggest-edges --format review > candidates.yaml", edit it, then re-run.',
    );
    process.exitCode = 1;
    return;
  }
}

function summarize(skipped: RelateOutcome[]): string {
  const counts = new Map<RelateSkipReason, number>();
  for (const o of skipped) {
    if (!o.skipReason) continue;
    counts.set(o.skipReason, (counts.get(o.skipReason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} ${SKIP_LABELS[reason]}`)
    .join(", ");
}
