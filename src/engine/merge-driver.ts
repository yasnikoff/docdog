/**
 * The union merge driver's two halves, in one place (PROPOSAL-030, FRICTION-041).
 *
 * The driver is only ever half a file. The tracked half is the
 * `.gitattributes` block naming `merge=docdog` on every path docdog manages;
 * the untracked half is two keys in `.git/config`, which git will not let a
 * repository ship (cloning would be arbitrary code execution). Either half
 * without the other is a broken state, and one of them is *worse than
 * uninstalled*: a block that names a driver git cannot find makes git warn
 * per path on every conflicting merge, which is the one direction
 * PROPOSAL-030 promised an optional feature would never fail in.
 *
 * That state was reachable because the halves lived apart: `init` did both,
 * and `update` reached the block through the seed set — whose members are
 * file and block *contents*, and `.git/config` is neither. So `update` wrote
 * the claim and never the definition (FRICTION-041).
 *
 * It is also reachable with no docdog involvement at all, by the most
 * ordinary route there is: **clone a repo whose `.gitattributes` is
 * committed**. The block arrives tracked, `.git/config` does not, and
 * nothing has run. That case is why this reports on every run rather than
 * only when it writes.
 *
 * DP-001 tier 1. Registration touches `merge.docdog.*` — docdog's own
 * config namespace, so unlike a seeded file it cannot clobber a choice the
 * user made, which is precisely why it never needed the seed manifest.
 */
import { MERGE_DRIVER_NAME } from "./gitattributes.js";
import { gitAvailable, gitConfigGet, gitConfigSet } from "../storage/git.js";

export const MERGE_DRIVER_CONFIG = {
  name: {
    key: `merge.${MERGE_DRIVER_NAME}.name`,
    value: "docdog frontmatter-aware merge",
  },
  driver: {
    key: `merge.${MERGE_DRIVER_NAME}.driver`,
    value: "docdog merge-driver %O %A %B %L %P",
  },
} as const;

export interface MergeDriverState {
  /** git can be run here at all — false means "not a repository, or no binary". */
  git: boolean;
  /** Both config keys are present. */
  registered: boolean;
}

/** What the driver's `.git/config` half looks like right now. */
export function readMergeDriverState(projectRoot: string): MergeDriverState {
  if (!gitAvailable(projectRoot)) return { git: false, registered: false };
  const registered =
    gitConfigGet(projectRoot, MERGE_DRIVER_CONFIG.driver.key) !== null &&
    gitConfigGet(projectRoot, MERGE_DRIVER_CONFIG.name.key) !== null;
  return { git: true, registered };
}

/**
 * Write both keys. Returns true only when both landed — a half-written
 * driver is the state this module exists to prevent, so it is never
 * reported as success.
 */
export function registerMergeDriver(projectRoot: string): boolean {
  const named = gitConfigSet(projectRoot, MERGE_DRIVER_CONFIG.name.key, MERGE_DRIVER_CONFIG.name.value);
  const defined = gitConfigSet(projectRoot, MERGE_DRIVER_CONFIG.driver.key, MERGE_DRIVER_CONFIG.driver.value);
  return named && defined;
}

/** The two commands a user runs by hand when docdog could not. */
export function mergeDriverManualCommands(): string[] {
  return [
    `git config ${MERGE_DRIVER_CONFIG.name.key} "${MERGE_DRIVER_CONFIG.name.value}"`,
    `git config ${MERGE_DRIVER_CONFIG.driver.key} "${MERGE_DRIVER_CONFIG.driver.value}"`,
  ];
}

export interface MergeDriverOutcome extends MergeDriverState {
  /** The `.gitattributes` block naming the driver is present on disk. */
  blockPresent: boolean;
  /** This run wrote the config keys. */
  registeredNow: boolean;
}

/**
 * Reconcile the two halves: register the driver when the block claims it and
 * `.git/config` does not define it, and report the result either way.
 *
 * `blockPresent` is passed in rather than re-read because the caller has
 * just decided the block's fate — `update` may have written it this run.
 */
export function reconcileMergeDriver(projectRoot: string, blockPresent: boolean): MergeDriverOutcome {
  const before = readMergeDriverState(projectRoot);
  if (!blockPresent || before.registered || !before.git) {
    return { ...before, blockPresent, registeredNow: false };
  }
  const ok = registerMergeDriver(projectRoot);
  return { git: true, registered: ok, blockPresent, registeredNow: ok };
}
