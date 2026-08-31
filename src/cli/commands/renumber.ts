/**
 * `docdog renumber <old-id> <new-id>` — the promotion primitive
 * (PROPOSAL-031, authorized by DISC-027).
 *
 * A host project running a provisional-id scheme (`DD-T168-01` on a task
 * branch → `DD-072` on trunk) needs one mechanic from docdog: rename the
 * id and fix everything that pointed at it. Docdog does not know what a
 * branch is, cannot tell a provisional id from a canonical one, and does
 * not care — it renames what it is told to rename.
 *
 * CLI-only: the MCP kernel stays at 8 (DD-070 §4). Every input here is a
 * short scalar, so PROPOSAL-032's parity test is satisfied in the one
 * direction that matters.
 *
 * What the output is *for*: the exact half (the id, its inbound edges,
 * optionally the file name) is applied silently because it is provable.
 * The reported half — prose mentions, slash-lists, sources that cannot be
 * patched — is printed because it is not, and a human or agent has to
 * finish it. Reading past the summary is the job.
 */
import { Command } from "commander";
import { loadConfig, findProjectRoot } from "../../config/loader.js";
import { printError } from "../output.js";
import type { ProseMention, RenumberPlan } from "../../storage/renumber.js";

export function registerRenumberCommand(program: Command): void {
  program
    .command("renumber <old-id> <new-id>")
    .description("Rename a record's id and rewrite every inbound edge (reports prose mentions)")
    .option("--dry-run", "Print the full plan, write nothing")
    .option("--prose", "Also rewrite unambiguous prose mentions in bodies (slash-lists never)")
    .option("--rename-file", "Rename the file too, when its name derives from the old id")
    .option("--file <path>", "The file to renumber, when two records claim the old id")
    .action(async (oldId: string, newId: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      const config = loadConfig(projectRoot);

      const { renumberRecord } = await import("../../storage/renumber.js");
      const { WriteError } = await import("../../storage/writes.js");
      const { FrontmatterPatchError } = await import("../../storage/frontmatter.js");

      try {
        const result = await renumberRecord(
          // A rename reindexes one file per citing record; the indexer's
          // per-file progress lines would bury the part of this command that
          // matters — the residue it is handing back. Warnings still speak.
          { config, projectRoot, log: () => {} },
          oldId,
          newId,
          {
            prose: opts.prose === true,
            renameFile: opts.renameFile === true,
            file: opts.file,
            dryRun: opts.dryRun === true,
          },
        );
        report(result.plan, opts.dryRun === true);
      } catch (err) {
        if (err instanceof WriteError || err instanceof FrontmatterPatchError) {
          printError("RENUMBER_ERROR", err.message);
          process.exitCode = 1;
          return;
        }
        printError(
          "RENUMBER_ERROR",
          err instanceof Error ? err.message : String(err),
          'Cache missing or stale? Run "docdog index" first.',
        );
        process.exitCode = 1;
        return;
      }
    });
}

function report(plan: RenumberPlan, dryRun: boolean): void {
  const { oldId, newId } = plan;

  // Locations are for a reader who is about to open the file. After a rename
  // that means the new path; under --dry-run nothing moved, so it means the old.
  const where = (file: string): string =>
    !dryRun && plan.rename && file === plan.rename.from ? plan.rename.to : file;

  console.log();
  if (dryRun) console.log("Dry run — nothing was written.\n");

  console.log(`${dryRun ? "would renumber" : "renumbered"} ${oldId} → ${newId}`);
  console.log(`  record:  ${plan.recordFile}`);
  console.log(
    `  edges:   ${plan.edges.length} inbound edge${plan.edges.length === 1 ? "" : "s"} ` +
      `${dryRun ? "to rewrite" : "rewritten"} (exact — from the cache's edges.to_id index)`,
  );
  for (const edge of plan.edges) {
    console.log(`             ${edge.fromId} --[${edge.type}]--> ${newId}  (${edge.file})`);
  }

  if (plan.rename) {
    console.log(`  file:    ${plan.rename.from} → ${plan.rename.to}`);
  } else if (plan.renameSkipped) {
    console.log(`  file:    not renamed — ${plan.renameSkipped}`);
  }

  const rewritable = plan.mentions.filter((m) => !m.ambiguous);
  const ambiguous = plan.mentions.filter((m) => m.ambiguous);

  if (plan.proseRewrites > 0) {
    console.log(
      `  prose:   ${plan.proseRewrites} line${plan.proseRewrites === 1 ? "" : "s"} ` +
        `${dryRun ? "to rewrite" : "rewritten"} (${rewritable.length} mention${rewritable.length === 1 ? "" : "s"})`,
    );
  } else if (rewritable.length > 0) {
    console.log(
      `  prose:   ${rewritable.length} mention${rewritable.length === 1 ? "" : "s"} left as written — ` +
        `pass --prose to rewrite them, or fix them by hand:`,
    );
    printMentions(rewritable, where);
  }

  // Everything below is what renumber refuses to guess at. It is the whole
  // reason the command reports at all (PROPOSAL-031 §1).
  if (ambiguous.length > 0) {
    const one = ambiguous.length === 1;
    console.log();
    console.log(
      `⚠ ${ambiguous.length} slash-list mention${one ? "" : "s"} ${one ? "names" : "name"} ${oldId} alongside its siblings — ` +
        `substituting the token would rename them too, so ${one ? "it is" : "they are"} left for you (OQ-46):`,
    );
    printMentions(ambiguous, where);
  }

  if (plan.unpatchableSources.length > 0) {
    console.log();
    console.log(
      `⚠ ${plan.unpatchableSources.length} inbound edge${plan.unpatchableSources.length === 1 ? "" : "s"} could not be rewritten — ` +
        `${dryRun ? "they would still point" : "they still point"} at ${oldId}:`,
    );
    for (const source of plan.unpatchableSources) {
      console.log(`    ${where(source.file)}  (${source.fromId} --[${source.type}]-->): ${source.reason}`);
    }
  }

  if (!plan.ownsId) {
    console.log();
    console.log(`Note: ${oldId} is held in the cache by another file — this was the contested loser.`);
    console.log(
      `  ${plan.retainedEdges.length} inbound edge${plan.retainedEdges.length === 1 ? "" : "s"} to ${oldId} ${plan.retainedEdges.length === 1 ? "was" : "were"} left alone: ` +
        `${oldId} now resolves unambiguously to the record that kept it. Review them if any meant this one.`,
    );
    for (const edge of plan.retainedEdges) {
      console.log(`    ${edge.fromId} --[${edge.type}]--> ${oldId}  (${edge.file})`);
    }
  }

  console.log();
}

function printMentions(mentions: ProseMention[], where: (file: string) => string): void {
  for (const mention of mentions) {
    const text = mention.text.length > 96 ? `${mention.text.slice(0, 93)}...` : mention.text;
    console.log(`    ${where(mention.file)}:${mention.line}  ${text}`);
  }
}
