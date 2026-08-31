/**
 * `docdog update` — PROPOSAL-041.
 *
 * Brings an adopting repo up to the docdog it now has. Before this, no pair
 * of commands could do it: `init` is additive only (it never touches a file
 * that is present) and `templates refresh` was update only (it walked the
 * destination, so it never added a file that was absent). A repo seeded
 * before a skill shipped could run both, in either order, and still not
 * receive it.
 *
 * The half that did write, clobbered — it compared the shipped file to the
 * one on disk and overwrote on any difference, having no idea what the file
 * looked like when docdog wrote it. The seed manifest supplies exactly that
 * missing fact, so every decision here is a hash comparison rather than a
 * guess about whose edit it is.
 *
 * Posture, copied from PROPOSAL-030's `.gitattributes` handling: **write the
 * adds and the provably-unmodified updates, report the rest.** There is no
 * `--force-all` and there must never be one — it is the `--accept-all`
 * analogue PROPOSAL-028 refused, and the decision it would automate ("my
 * edits to this file matter less than the shipped version") is DP-001 tier 3,
 * per file. `--force <path>` takes the file the user names, because then the
 * judgment happened outside the code.
 */
import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../config/loader.js";
import type { DocdogConfig } from "../../types/config.js";
import {
  findTemplatesRoot,
  missingConfigKeys,
  type UnavailableSeed,
} from "../../engine/seed-set.js";
import {
  docdogVersion,
  readSeedManifest,
  writeSeedManifest,
  type SeedOutcome,
} from "../../engine/seed-manifest.js";
import { applyUpdate, planUpdate, type PlanEntry, type UpdatePlan } from "../../engine/seed-update.js";
import { scanPathsCoverConcepts } from "../../engine/scan-reach.js";
import { readManagedBlock } from "../../engine/gitattributes.js";
import {
  mergeDriverManualCommands,
  readMergeDriverState,
  reconcileMergeDriver,
  type MergeDriverOutcome,
} from "../../engine/merge-driver.js";
import {
  describeInstall,
  formatUpdateLine,
  isNewer,
  performCheck,
  upgradeInstruction,
  type UpdateCheck,
} from "../../engine/upgrade.js";

interface JsonView {
  dryRun: boolean;
  docdog: string;
  written: Array<{ path: string; outcome: SeedOutcome; forced: boolean }>;
  reported: Array<{ path: string; outcome: SeedOutcome; seededVersion: string | null }>;
  unchanged: string[];
  /** Shipped, but not renderable on this run — see UnavailableSeed. */
  unavailable: UnavailableSeed[];
  configKeysAbsent: string[];
  /**
   * Named for the fact, not for the warning: whether the seeded concept
   * records are in the corpus at all. `false` is the condition worth
   * acting on, `true` is worth knowing, and `null` says the question does
   * not arise here — a consumer that keys on a `conceptsUnindexed`-style
   * flag would have to read a missing key as "fine" and a null as "true".
   */
  conceptsIndexed: boolean | null;
  mergeDriver: MergeDriverOutcome;
  update: UpdateCheck | null;
}

/**
 * Are the seeded concept records reachable by `scan_paths`?
 *
 * `null` when the concepts population is not in play — no concept record
 * on disk and none about to be written. A project with no concept records
 * has nothing to say about where they would be indexed, and warning about
 * an uncovered empty directory is noise on every run.
 *
 * Otherwise the plain coverage answer. This is the same silent failure
 * `split --apply-plan` reports about its children (PROPOSAL-039): the
 * writes succeed, `docdog index` says nothing, and the records docdog just
 * seeded are in no corpus. `init` has warned about it since PROPOSAL-025;
 * `update` writes the same `concepts` group — "the population with the
 * worst blast radius" — and said nothing.
 */
export function conceptsIndexed(plan: UpdatePlan, config: DocdogConfig): boolean | null {
  const inPlay = plan.all.some(
    (e) => e.item.group === "concepts" && (e.item.current !== null || e.outcome === "add"),
  );
  if (!inPlay) return null;
  return scanPathsCoverConcepts(config.scan_paths ?? []);
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Bring docdog's seeded skills, vocabulary and provider wiring up to this docdog version")
    .option("--dry-run", "Report every outcome and write nothing", false)
    .option(
      "--force <path...>",
      "Overwrite a file you edited with the shipped version — name each path (there is no --force-all)",
    )
    .option("--json", "Machine-readable output", false)
    // PROPOSAL-042 §2. `--check` is the whole command: ask the registry, cache
    // the answer, write nothing else. A plain run asks too, because upgrading
    // is what it is for; `--offline` suppresses that and is named for what it
    // guarantees rather than for the flag it negates.
    .option("--check", "Ask the registry for the latest version, cache the answer, and stop", false)
    .option("--offline", "Do the file work without asking the registry anything", false)
    .action(async (opts) => {
      const projectRoot = process.cwd();
      if (!existsSync(join(projectRoot, ".docdog", "config.yaml"))) {
        throw new Error(
          `Not a docdog project: no .docdog/config.yaml under ${projectRoot}. Run "docdog init" first.`,
        );
      }
      const templatesRoot = findTemplatesRoot();
      if (!templatesRoot) {
        throw new Error(
          "Could not locate the shipped templates/ directory — the docdog install looks incomplete.",
        );
      }

      const config = loadConfig(projectRoot);
      const manifest = readSeedManifest(projectRoot);
      const version = docdogVersion();

      if (opts.check) {
        // Both modifiers bind here too, which they did not when this branch
        // returned early past them. `--offline` guarantees no socket on every
        // command that accepts it — on a command whose only job is the ask,
        // that means rendering the verdict already cached rather than
        // quietly asking anyway. `--dry-run` writes nothing, and the cached
        // verdict is a write.
        const check = await performCheck({
          projectRoot,
          installed: version,
          offline: Boolean(opts.offline),
          dryRun: Boolean(opts.dryRun),
        });
        if (opts.json) {
          console.log(JSON.stringify({ ...describeInstall(projectRoot), check }, null, 2));
        } else {
          printUpdate(version, check);
        }
        return;
      }

      const plan = planUpdate({
        projectRoot,
        config,
        templatesRoot,
        manifest,
        force: (opts.force ?? []) as string[],
      });
      const { willWrite, reported, unchanged, unmatched, inert } = plan;

      // The merge driver's other half (FRICTION-041). The seed set holds file
      // and block *contents*; `.git/config` is neither, so the block could be
      // written while the driver it names stayed undefined — worse than not
      // installing the feature at all. Checked on every run, not only when the
      // block is written, because a plain `git clone` of a repo with a tracked
      // `.gitattributes` reaches the same broken state with no docdog involved.
      const blockWillExist =
        readManagedBlock(join(projectRoot, ".gitattributes")) !== null ||
        willWrite.some((e) => e.path === ".gitattributes#docdog");
      const mergeDriver: MergeDriverOutcome =
        opts.dryRun ?
          { ...readMergeDriverState(projectRoot), blockPresent: blockWillExist, registeredNow: false }
        : reconcileMergeDriver(projectRoot, blockWillExist);

      if (!opts.dryRun) {
        applyUpdate(projectRoot, plan, manifest, version);
        writeSeedManifest(projectRoot, manifest);
      }

      // The registry half — the same `performCheck` the `--check` branch
      // runs, so the two flags mean one thing on both paths rather than two
      // things that happen to look alike: `--offline` guarantees no socket,
      // `--dry-run` guarantees no write. A preview that silently answered
      // from a week-old cache would be reporting the wrong upgrade state at
      // exactly the moment someone is deciding whether to run this for real.
      // Every failure resolves to a value, so nothing here can fail the file
      // work that already happened above.
      const update = await performCheck({
        projectRoot,
        installed: version,
        offline: Boolean(opts.offline),
        dryRun: Boolean(opts.dryRun),
      });

      const configKeysAbsent = missingConfigKeys(projectRoot);
      // Reported on the dry run too: this is a fact about the project's
      // state, not about the writes this invocation makes.
      const conceptsReach = conceptsIndexed(plan, config);

      if (opts.json) {
        const view: JsonView = {
          dryRun: Boolean(opts.dryRun),
          docdog: version,
          written: willWrite.map((e) => ({ path: e.path, outcome: e.outcome, forced: e.forced })),
          reported: reported.map((e) => ({
            path: e.path,
            outcome: e.outcome,
            seededVersion: e.seededVersion,
          })),
          unchanged: unchanged.map((e) => e.path),
          unavailable: plan.unavailable,
          configKeysAbsent,
          conceptsIndexed: conceptsReach,
          mergeDriver,
          update,
        };
        console.log(JSON.stringify(view, null, 2));
      } else {
        printReport({
          dryRun: Boolean(opts.dryRun),
          version,
          willWrite,
          reported,
          unchangedCount: unchanged.length,
          unavailable: plan.unavailable,
          configKeysAbsent,
          conceptsIndexed: conceptsReach,
          unmatched,
          inert,
          mergeDriver,
          update,
        });
      }

      if (unmatched.length > 0) {
        throw new Error(
          `--force named ${unmatched.length} path(s) docdog does not seed: ${unmatched.join(", ")}`,
        );
      }
    });
}

export function printReport(r: {
  dryRun: boolean;
  version: string;
  willWrite: PlanEntry[];
  reported: PlanEntry[];
  unchangedCount: number;
  unavailable: UnavailableSeed[];
  configKeysAbsent: string[];
  conceptsIndexed: boolean | null;
  unmatched: string[];
  inert: PlanEntry[];
  mergeDriver: MergeDriverOutcome;
  update: UpdateCheck | null;
}): void {
  console.log(`docdog update — ${r.version}${r.dryRun ? " (dry run — nothing written)" : ""}`);
  console.log("");

  if (r.willWrite.length === 0) {
    console.log("  Nothing to add or update.");
  } else {
    for (const e of r.willWrite) {
      // A restored file has a manifest entry and no bytes on disk: docdog
      // seeded it once and it was deleted, which is init's repair semantics
      // and worth naming as something other than a plain add.
      const kind =
        e.forced ? (r.dryRun ? "would force " : "forced      ")
        : e.outcome === "add" ?
          e.seededVersion ?
            r.dryRun ? "would restore" : "restored     "
          : r.dryRun ? "would add    " : "added        "
        : r.dryRun ? "would update " : "updated      ";
      const from = e.outcome === "update" && e.seededVersion ? `  (was seeded at ${e.seededVersion})` : "";
      console.log(`  ${kind.trimEnd().padEnd(13)} ${e.path}${from}`);
    }
  }
  if (r.unchangedCount > 0) {
    console.log(`  ${r.unchangedCount} already current.`);
  }

  // Said out loud, never silently skipped. A member docdog ships and could
  // not render is the one case where "nothing to do" would be a lie, and it
  // is reported before the diverged/orphan block because it is not a
  // judgment the user has to make — it is a step that did not run.
  if (r.unavailable.length > 0) {
    console.log("");
    console.log("Not refreshed on this run:");
    for (const u of r.unavailable) console.log(`  ${u.path}
    ${u.reason}`);
  }

  const orphans = r.reported.filter((e) => e.outcome === "orphan");
  const diverged = r.reported.filter((e) => e.outcome === "diverged");
  const untracked = r.reported.filter((e) => e.outcome === "untracked");

  if (diverged.length > 0 || untracked.length > 0 || orphans.length > 0) {
    console.log("");
    console.log("Reported, not written:");
  }
  for (const e of diverged) {
    console.log(
      `  edited by you   ${e.path}${e.seededVersion ? `  (seeded at ${e.seededVersion})` : ""}`,
    );
  }
  // Every file in a repo seeded before the manifest existed lands here, so on
  // the first run this category is the whole corpus of seeded files and would
  // bury the two that matter. Counted, with a sample — `--json` has them all,
  // the same shape `docdog status` uses for over-cap records.
  if (untracked.length > 0) {
    console.log(
      `  no record of    ${untracked.length} file(s) present before docdog recorded what it seeds:`,
    );
    for (const e of untracked.slice(0, 5)) console.log(`                  ${e.path}`);
    if (untracked.length > 5) {
      console.log(`                  … and ${untracked.length - 5} more (--json for all)`);
    }
  }
  for (const e of orphans) {
    console.log(`  no longer ships ${e.path} — delete it when you are ready`);
  }
  if (diverged.length > 0 || untracked.length > 0) {
    console.log("");
    console.log("  To take the shipped version of one of those, name it:");
    console.log(`    docdog update --force ${(diverged[0] ?? untracked[0]).path}`);
    console.log("  There is no --force-all: choosing between your edit and docdog's is per file.");
  }

  for (const e of r.inert) {
    console.log("");
    console.log(
      `  --force ${e.path} did nothing: it is "${e.outcome}", and --force only ` +
        `takes a file you edited (--force cannot restore something docdog no longer ships).`,
    );
  }

  printMergeDriver(r.mergeDriver, r.dryRun);
  console.log("");
  printUpdate(r.version, r.update);

  if (r.configKeysAbsent.length > 0) {
    console.log("");
    console.log(
      `.docdog/config.yaml is missing ${r.configKeysAbsent.length} key(s) a fresh init writes: ${r.configKeysAbsent.join(", ")}`,
    );
    console.log("  Reported only — config is your file, and defaults apply either way.");
  }

  // Same posture, same reason it sits here: reported, never written.
  // The condition is a missing string in a list; the consequence is that
  // the vocabulary records docdog seeds are in no corpus, which is what
  // this says out loud.
  if (r.conceptsIndexed === false) {
    console.log("");
    console.log(
      'No scan path reaches ".docdog/concepts/", so the seeded concept records are not indexed —',
    );
    console.log("  search, get and traverse cannot see the relation and collection vocabulary.");
    console.log('  Add ".docdog/concepts/" to scan_paths in .docdog/config.yaml, then run `docdog index`.');
  }

  if (r.unmatched.length === 0) {
    console.log("");
    console.log(
      r.dryRun
        ? "Re-run without --dry-run to apply."
        : "Run `docdog index` if seeded records changed.",
    );
  }
}

/**
 * The `.git/config` half of the union merge driver (FRICTION-041).
 *
 * Silent when there is no block to honour — there is nothing to say about a
 * feature the repo has not opted into. Loud in the broken state, because that
 * state is invisible otherwise: git falls back to its default text merge and
 * warns per path, which reads as a git problem rather than a docdog one.
 */
function printMergeDriver(m: MergeDriverOutcome, dryRun: boolean): void {
  if (!m.blockPresent) return;
  console.log("");
  console.log("Merge driver (relationships union — PROPOSAL-030):");
  if (m.registeredNow) {
    console.log("  registered in .git/config — the .gitattributes block named a driver git could not find");
    console.log("  (shared by every worktree of this clone)");
    return;
  }
  if (m.registered) {
    console.log("  registered in .git/config.");
    return;
  }
  if (!m.git) {
    console.log("  not registered: git could not be reached here (not a repository, or not on PATH).");
  } else if (dryRun) {
    console.log("  not registered — a run without --dry-run would register it.");
    return;
  } else {
    console.log("  not registered, and git refused the write.");
  }
  console.log("  Until it is, .gitattributes names a driver git cannot find and every");
  console.log("  conflicting merge warns per path. Register it with:");
  for (const cmd of mergeDriverManualCommands()) console.log(`    ${cmd}`);
}

/**
 * The registry verdict, and — only when it says you are behind — the command
 * that would install it, chosen from how this copy of docdog was installed.
 *
 * Naming the command is where this stops: docdog reports, the host acts. No
 * self-update, for the same reason PROPOSAL-037 has no docdog_restart and
 * PROPOSAL-035 refuses docdog's writes rather than the filesystem's.
 */
function printUpdate(installed: string, check: UpdateCheck | null): void {
  console.log(formatUpdateLine(installed, check).replace(/\*\*/g, ""));
  // The same test the line above rendered — `isNewer`, not string inequality,
  // which called a version *ahead* of `latest` (a prerelease, a locally built
  // dependency) a reason to upgrade and printed the instruction underneath a
  // line saying "current".
  if (!check?.latest || !isNewer(check.latest, installed)) return;
  const instruction = upgradeInstruction(describeInstall(process.cwd()).shape);
  if (instruction) console.log(`  ${instruction}`);
}
