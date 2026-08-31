/**
 * `docdog skill install <name>` — emit a standalone skill file into
 * a target directory. PROPOSAL-019.
 *
 * The `install` verb is the first and only subcommand. Future verbs
 * (`list`, `update`, `uninstall`) are explicitly out of scope per the
 * proposal.
 */
import { Command } from "commander";
import { findProjectRoot, loadConfig } from "../../config/loader.js";
import {
  skillInstall,
  DEFAULT_SKILL_TARGET,
  REGISTERED_INJECTABLE_SKILLS,
  type SkillInstallResult,
} from "../../engine/skill-install.js";
import { printError } from "../output.js";

// One constant, shared with the seed set: `init` and `update` write to this
// same path, so a drift here would put a second copy of every skill in a
// directory nothing else maintains.
const DEFAULT_TARGET = DEFAULT_SKILL_TARGET;

export function registerSkillCommand(program: Command): void {
  const skill = program
    .command("skill")
    .description("Install standalone skill files into a target directory");

  skill
    .command("install <name>")
    .description(
      `Install a registered injectable skill. Available: ${Object.keys(
        REGISTERED_INJECTABLE_SKILLS,
      )
        .sort()
        .join(", ")}`,
    )
    .option(
      "--target <dir>",
      `Target directory, relative to the current directory (default: ${DEFAULT_TARGET})`,
      DEFAULT_TARGET,
    )
    .option("--force", "Overwrite an existing outer skill file", false)
    .option("--dry-run", "Print what would be written without writing", false)
    .option("--json", "Output raw JSON")
    .action(async (name: string, opts) => {
      const projectRoot = findProjectRoot() ?? process.cwd();
      try {
        const config = loadConfig(projectRoot);
        const result = await skillInstall({
          config,
          name,
          targetDir: opts.target,
          force: Boolean(opts.force),
          dryRun: Boolean(opts.dryRun),
          baseDir: projectRoot,
        });

        if (opts.json) {
          console.log(JSON.stringify(projectionJson(result, opts.dryRun), null, 2));
          return;
        }
        console.log(formatResult(result, opts.dryRun));
      } catch (err) {
        printError("SKILL_INSTALL_ERROR", err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
    });
}

interface JsonView {
  dryRun: boolean;
  name: string;
  installName: string;
  skillDir: string;
  outerPath: string;
  outerWritten: boolean;
  outerSkipped: boolean;
  prefixCount: number;
  prefixes: Array<{ prefix: string; collection: string; count: number }>;
  corpusAvailable: boolean;
}

function projectionJson(result: SkillInstallResult, dryRun: boolean): JsonView {
  return {
    dryRun,
    name: result.name,
    installName: result.installName,
    skillDir: result.skillDir,
    outerPath: result.outerPath,
    outerWritten: result.outerWritten,
    outerSkipped: result.outerSkipped,
    corpusAvailable: result.corpusAvailable,
    prefixCount: result.prefixes.length,
    prefixes: result.prefixes.map((p) => ({
      prefix: p.prefix,
      collection: p.collection,
      count: p.count,
    })),
  };
}

export function formatResult(result: SkillInstallResult, dryRun: boolean): string {
  const lines: string[] = [];
  const verb = dryRun ? "Would install" : "Installed";
  lines.push(
    result.prefixes.length > 0
      ? `${verb} skill /${result.installName} — ${result.prefixes.length} id prefixes discovered`
      : `${verb} skill /${result.installName}`,
  );
  lines.push(`  skill: ${result.outerPath}`);
  // Written anyway, with the roster reading "not read yet": `skill install`
  // is an explicit act on one file, so the user asked for this exact write.
  // `docdog update` makes the opposite call on the same condition, because
  // there the file already exists and was not what the user asked about.
  if (!result.corpusAvailable) {
    lines.push(`    note: no cache to read, so the id-prefix map is empty.`);
    lines.push(`          run \`docdog index\`, then \`docdog update\` to fill it in.`);
  }
  if (!dryRun) {
    if (result.outerWritten) lines.push(`    written`);
    else if (result.outerSkipped) lines.push(`    skipped (exists; pass --force to overwrite)`);
  }
  if (result.prefixes.length > 0) {
    lines.push(`  prefixes:`);
    for (const p of result.prefixes) {
      lines.push(`    ${p.prefix}  (${p.collection}, ${p.count})`);
    }
  }
  return lines.join("\n");
}
