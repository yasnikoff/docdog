/**
 * `docdog split` — three modes, and the third is the only one that writes.
 *
 *   split <file>                              report structure and descent, write nothing
 *   split <file> --format plan                emit the plan document for review
 *   split <file> --format plan --on "## DD-"  ...with boundaries pre-populated by a rule
 *   split <file> --format plan --depth 3      ...at every heading of a level
 *   split --apply-plan plan.yaml              the one executor
 *
 * `--on` and `--depth` used to be a fourth mode that executed directly and
 * produced sibling files. PROPOSAL-045 demoted them to *pre-population
 * selectors*: a rule is a fine way to nominate boundaries and a poor way to
 * assert them, since `--on "## DD-"` claims uniformly and unreviewably that
 * every matching heading begins a separate idea — the claim PROPOSAL-039
 * forbade descent from making. Passing either without `--format plan` is now
 * an error naming the two-command form.
 *
 * What comes out is a property of the **plan**, not of which flag you typed:
 * `output: records` keeps the source as a live parent with `part_of` children
 * (DD-072), `output: files` retires it to `<base>.index.md` and writes
 * edge-free siblings. The header prints whichever one it defaulted to, and the
 * reviewer can change it.
 *
 * With no selector at all the command reports and writes nothing. That is
 * PROPOSAL-039's amendment to PROPOSAL-038: descent computes which heading
 * depth would break the document into pieces that fit, and reporting it is as
 * far as a tool may go — where a document divides into ideas is judgment, and
 * "every piece fits under the cap" optimizes the one property OBS-019
 * measured does not predict retrieval quality.
 */
import { Command } from "commander";
import { basename } from "node:path";
import {
  inspectFile,
  planForFile,
  applyPlan,
  type ApplyPlanResult,
} from "../../engine/ingest.js";
import { describeDescent, describeNextSteps, SplitPlanError } from "../../engine/split-plan.js";
import { findProjectRoot } from "../../config/loader.js";

/** `--depth` is a heading level, so only 1-6 are meaningful. */
function parseDepth(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    throw new Error(`--depth must be a heading level 1-6, got: ${value}`);
  }
  return n;
}

/** `--on` is repeatable: two cohorts in one document is the case PROPOSAL-034
 * already solved with a list on the config side, and the CLI was the missing
 * half. Two flags used to silently take the last one. */
function collectPattern(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerSplitCommand(program: Command): void {
  program
    .command("split [file]")
    .description(
      "Split a multi-section file: report it, emit a reviewable plan (--format plan), or execute one (--apply-plan)",
    )
    .option(
      "--on <pattern>",
      'Pre-populate plan boundaries at every heading matching this pattern (e.g. "## DD-"); repeatable',
      collectPattern,
      [] as string[],
    )
    .option(
      "--depth <n>",
      "Pre-populate plan boundaries at every heading of this level, whatever its text",
      parseDepth,
    )
    .option("--format <format>", 'Emit "plan" — the reviewable boundary document, to stdout')
    .option("--apply-plan <file>", "Execute a reviewed plan file")
    .option(
      "--allow-empty-description",
      "Apply plan sections whose description is empty (refused by default under output: records)",
      false,
    )
    .option("--collection <name>", "Target collection for all sections")
    .option("--output <dir>", "Output directory for the child files (default: <basename>/ sibling)")
    .option("--force", "Overwrite existing files", false)
    .option("--dry-run", "Show what would be written without writing", false)
    .option(
      "--update-config",
      "Edit .docdog/config.yaml so the new files are scanned (output: records only adds; it never removes the parent's coverage)",
      false,
    )
    .action(async (file, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const on = (opts.on as string[]) ?? [];
      const hasSelector = on.length > 0 || opts.depth !== undefined;

      try {
        if (opts.applyPlan) {
          if (file) {
            console.error(
              "--apply-plan names its own source; drop the file argument so there is only one answer to which file is being split.",
            );
            process.exitCode = 1;
            return;
          }
          runApplyPlan(opts, projectRoot);
          return;
        }

        if (!file) {
          console.error("Give a file to split, or --apply-plan <file> to execute a reviewed plan.");
          process.exitCode = 1;
          return;
        }

        if (opts.format !== undefined && opts.format !== "plan") {
          console.error(`Unknown --format ${JSON.stringify(opts.format)} — the only format is "plan".`);
          process.exitCode = 1;
          return;
        }

        if (on.length > 0 && opts.depth !== undefined) {
          console.error("--on and --depth are alternative ways to select headings; give one.");
          process.exitCode = 1;
          return;
        }

        // PROPOSAL-045 §1: a rule nominates, it does not execute. There is no
        // deprecation shim — the rewritten ingest skill reaches adopters
        // through `docdog update` as an ordinary seed refresh (PROPOSAL-041)
        // rather than through a release note nobody reads.
        if (hasSelector && opts.format !== "plan") {
          console.error(
            "--on and --depth pre-populate a plan; they no longer split on their own. Two commands:",
          );
          console.error(`  docdog split ${file} --format plan ${selectorEcho(on, opts.depth)} > plan.yaml`);
          console.error("  docdog split --apply-plan plan.yaml");
          console.error(
            "Review the boundaries in between — that is the point, and it is where you find out the pattern matched 40 of 41 headings.",
          );
          process.exitCode = 1;
          return;
        }

        if (opts.format === "plan") {
          // Only the plan document goes to stdout, so it can be redirected.
          process.stdout.write(
            planForFile(file, projectRoot, {
              collection: opts.collection,
              on: on.length > 0 ? on : undefined,
              depth: opts.depth as number | undefined,
            }),
          );
          return;
        }

        reportStructure(file);
      } catch (err) {
        if (err instanceof SplitPlanError) {
          console.error(`Error [${err.code}]: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });
}

/** Echo the selector back into the suggested command line, so the fix is a
 * copy-paste rather than a re-derivation. */
function selectorEcho(on: string[], depth: number | undefined): string {
  if (on.length > 0) return on.map(p => `--on ${JSON.stringify(p)}`).join(" ");
  return `--depth ${depth}`;
}

/**
 * No selector: say what the document looks like and stop.
 *
 * The report names **every** form, including the selectors. It exists to
 * encourage looking before splitting, and an agent that looked never learned
 * `--on` existed — it was told only about `--format plan`.
 */
function reportStructure(file: string): void {
  const { outline, descent, parentId, collection } = inspectFile(file);

  console.log(
    `${file} — ${descent.headings} heading${descent.headings === 1 ? "" : "s"}, ${descent.totalChars.toLocaleString("en-US")} chars, embed cap ${descent.cap.toLocaleString("en-US")}`,
  );
  console.log("");
  for (const line of describeDescent(descent)) console.log(`  ${line}`);

  if (outline.length === 0) return;

  console.log("");
  for (const line of describeNextSteps(file, { parentId, collection })) {
    console.log(line === "" ? "" : `  ${line}`);
  }
}

function runApplyPlan(opts: Record<string, unknown>, projectRoot: string): void {
  const result = applyPlan({
    planFile: String(opts.applyPlan),
    projectRoot,
    outputDir: opts.output as string | undefined,
    force: opts.force === true,
    dryRun: opts.dryRun === true,
    allowEmptyDescription: opts.allowEmptyDescription === true,
    updateConfig: opts.updateConfig === true,
  });

  const verb = result.dryRun ? "Would write" : "Wrote";
  const noun = result.output === "records" ? "child record" : "section file";
  console.log(`${verb} ${result.children.length} ${noun}(s) in ${result.outputDir}`);
  for (const c of result.children) {
    console.log(`  ${(c.id || "(no id)").padEnd(12)}  ${c.chars.toLocaleString("en-US")} chars  ${c.filename}`);
  }

  if (result.output === "records") {
    console.log(
      `  each declares part_of ${result.parentId}; ${result.dryRun ? "would rewrite" : "rewrote"} ${result.parentFile} down to its preamble`,
    );
  } else {
    console.log(
      `  no edges minted; ${result.dryRun ? "would retire" : "retired"} ${result.parentFile} to ${basename(result.indexFile ?? "")} beside it and ${result.dryRun ? "would delete" : "deleted"} the source`,
    );
  }

  if (result.overCap.length > 0) {
    console.log("");
    console.log(`  ${result.overCap.length} child record(s) are still over the embed cap:`);
    for (const c of result.overCap) {
      console.log(`    ${c.id || "(no id)"} — ${c.chars.toLocaleString("en-US")} chars`);
    }
    console.log("  Their tails embed as a prefix. That may be fine (OBS-019); it is disclosed, not fixed.");
  }

  reportCoverage(result);

  if (!result.dryRun) {
    console.log("");
    console.log(
      `Run 'docdog index' to index the new ${result.output === "records" ? "records" : "files"}.`,
    );
  }
}

/**
 * Say whether `docdog index` will actually reach the children.
 *
 * Directory scan paths recurse, so this is usually already true and the line
 * is one word. When it is false — the source reached by a file-level entry —
 * the failure is otherwise silent: the writes succeed, indexing reports
 * nothing, and (under `output: records`) the parent's roster points at records
 * that are not in the corpus. Reporting is unconditional and runs on **both**
 * output modes; editing the config is not.
 */
function reportCoverage(result: ApplyPlanResult): void {
  const { coverage } = result;
  if (coverage.configPath === null) return;

  console.log("");
  if (coverage.removed > 0) {
    console.log(
      `  Removed ${coverage.removed} scan_paths entry/entries for the retired ${result.parentFile}`,
    );
  }
  if (coverage.added) {
    console.log(`  Added ${coverage.path}/ to scan_paths in ${coverage.configPath}`);
    return;
  }
  if (coverage.coveredBy !== null) {
    console.log(`  scan_paths covers the children (via ${coverage.coveredBy})`);
    return;
  }

  console.log(`  No scan_paths entry covers ${coverage.path}/ — the children would not be indexed.`);
  console.log(
    `  Add it to ${coverage.configPath}, or re-run with --update-config.`,
  );
}
