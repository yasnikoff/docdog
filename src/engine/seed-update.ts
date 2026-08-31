/**
 * `docdog update`'s core — PROPOSAL-041.
 *
 * Planning and applying live here, apart from the CLI, so both are testable
 * without a terminal and so the posture is stated in one place: **write the
 * adds and the provably-unmodified updates, report the rest.** That is
 * copied from PROPOSAL-030's `.gitattributes` handling, which is docdog's
 * existing answer to shipped scaffolding going stale.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DocdogConfig } from "../types/config.js";
import { collectSeeds, type SeedItem, type UnavailableSeed } from "./seed-set.js";
import {
  classifySeed,
  normalizeSeedPath,
  recordSeed,
  type SeedClassification,
  type SeedManifest,
} from "./seed-manifest.js";

export interface PlanEntry extends SeedClassification {
  item: SeedItem;
  /** True when `--force <path>` named this entry and the outcome allows it. */
  forced: boolean;
}

export interface UpdatePlan {
  /** Everything docdog will write: the adds, the safe updates, the forced. */
  willWrite: PlanEntry[];
  /** Diverged, untracked and orphaned — named, never touched. */
  reported: PlanEntry[];
  /** Already exactly what ships. */
  unchanged: PlanEntry[];
  /** `--force` paths that name nothing docdog seeds. A typo, not a no-op. */
  unmatched: string[];
  /** `--force` paths that matched something `--force` cannot act on. */
  inert: PlanEntry[];
  /** Every entry, in collection order. */
  all: PlanEntry[];
  /**
   * Members docdog ships but could not render on this run. Carried through
   * the plan rather than recomputed by the CLI, so the report cannot claim
   * a coverage the plan did not have.
   */
  unavailable: UnavailableSeed[];
}

export interface PlanUpdateOptions {
  projectRoot: string;
  config: DocdogConfig;
  templatesRoot: string;
  manifest: SeedManifest;
  /** Repo-relative paths the user named with `--force`. */
  force?: string[];
}

/**
 * Classify the whole seed set. Reads every file up front and writes nothing
 * — the same rail `split --apply-plan` and `suggest-edges --accept-from`
 * hold, so a failure part-way through can never half-apply an upgrade.
 */
export function planUpdate(opts: PlanUpdateOptions): UpdatePlan {
  const forced = new Set((opts.force ?? []).map(normalizeSeedPath));

  const all: PlanEntry[] = [];
  const collected = collectSeeds(opts);
  for (const item of collected.items) {
    const c = classifySeed(item, opts.manifest.entries[normalizeSeedPath(item.path)]);
    if (!c) continue;
    // `--force` acts only on the two outcomes that mean "the user owns this
    // file". It cannot resurrect an orphan and has nothing to add to a file
    // that is already being written.
    const isForced =
      forced.has(c.path) && (c.outcome === "diverged" || c.outcome === "untracked");
    all.push({ ...c, item, forced: isForced });
  }

  const willWrite = all.filter((e) => e.outcome === "add" || e.outcome === "update" || e.forced);
  const unchanged = all.filter((e) => e.outcome === "unchanged");
  const reported = all.filter(
    (e) => !e.forced && !["add", "update", "unchanged"].includes(e.outcome),
  );
  const unmatched = [...forced].filter((p) => !all.some((e) => e.path === p));
  const inert = all.filter((e) => forced.has(e.path) && !e.forced);

  return { willWrite, reported, unchanged, unmatched, inert, all, unavailable: collected.unavailable };
}

/**
 * Execute a plan: write each member, record what was written, and prune
 * manifest entries that now describe nothing. Never deletes a repo file —
 * orphans are reported and left where they are, because removal is the
 * user's call and files plus git are the archive.
 */
export function applyUpdate(
  projectRoot: string,
  plan: UpdatePlan,
  manifest: SeedManifest,
  version: string,
): void {
  for (const entry of plan.willWrite) {
    const content = entry.item.shipped;
    if (content === null) continue; // unreachable: an orphan never writes
    entry.item.write(content);
    recordSeed(manifest, entry.path, content, version);
  }
  pruneVanished(projectRoot, manifest, plan);
}

/**
 * Drop manifest entries for paths that exist nowhere any more — neither in
 * the seed set nor on disk. Bookkeeping only: such an entry describes
 * nothing, and leaving it would grow the manifest across every template
 * change.
 *
 * The disk check is what makes this safe. A file docdog seeded under a
 * template the project has since switched away from is no longer collected,
 * but it is still *there*, and forgetting docdog wrote it would silently
 * demote it to a user-owned file.
 */
function pruneVanished(projectRoot: string, manifest: SeedManifest, plan: UpdatePlan): void {
  const live = new Set(plan.all.map((e) => e.path));
  for (const key of Object.keys(manifest.entries)) {
    if (live.has(key)) continue;
    if (existsSync(join(projectRoot, key.split("#")[0]))) continue;
    delete manifest.entries[key];
  }
}
