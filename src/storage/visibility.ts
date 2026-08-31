/**
 * Per-record visibility, derived from git (PROPOSAL-047).
 *
 * The question is only ever *will a clone of this repository contain this
 * file* — never *should it*. Docdog does not decide what is private; git
 * already knows what is published, and a frontmatter marker claiming
 * otherwise would be a decoration that reads as a guarantee (DISC-041, and
 * FRICTION-052 one directory over).
 *
 * Three states, because two would break the feature. A record written and
 * not yet committed is not a leak — it is work in progress, and the answer
 * changes the moment its author runs `git add`. Folding it in with a
 * deliberate exclusion would fire the warning on every new record until
 * commit, which is how a warning gets turned off.
 *
 * Git-aware, never git-dependent: outside a repository, or with no git
 * binary, the index reports `available: false` and every lookup answers
 * `undecided`, which triggers nothing anywhere.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { gitIgnoredFiles, gitTrackedFiles, gitWorktreeRoot } from "./git.js";

export type Visibility =
  /** Tracked by this repository — a clone will have it. */
  | "in-clone"
  /** Ignored, or outside the working tree entirely — a clone will not. */
  | "out-of-clone"
  /** Inside the tree, untracked, unignored. Not yet decided; never acted on. */
  | "undecided";

export interface VisibilityIndex {
  /** False when git could not answer at all. Every lookup is `undecided`. */
  available: boolean;
  /** Classify a path as stored in `vertices.file_path` (project-relative). */
  of(repoRelPath: string): Visibility;
}

const UNAVAILABLE: VisibilityIndex = {
  available: false,
  of: () => "undecided",
};

/**
 * Classify every given path in one pass: at most three git invocations for
 * the whole corpus, and none at all for paths outside the working tree.
 *
 * `repoRelPaths` are `vertices.file_path` values — relative to the *project*
 * root and forward-slashed, which for an external scan path is a `../` walk
 * out of it. The project root is not necessarily the working tree root, so
 * every path is resolved to absolute and re-relativized before git sees it.
 */
export function buildVisibilityIndex(
  projectRoot: string,
  repoRelPaths: readonly string[],
): VisibilityIndex {
  const worktreeRoot = gitWorktreeRoot(projectRoot);
  if (worktreeRoot === null) return UNAVAILABLE;

  // Path → its location relative to the working tree root, or null when it
  // lies outside the tree. `relative()` answers a `..` walk for a sibling
  // directory and an *absolute* path across Windows drive letters, so both
  // shapes have to be caught.
  const treeRel = new Map<string, string | null>();
  for (const repoRel of repoRelPaths) {
    if (treeRel.has(repoRel)) continue;
    const abs = resolve(projectRoot, repoRel);
    const rel = relative(worktreeRoot, abs);
    const outside = rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    treeRel.set(repoRel, outside ? null : rel.split(sep).join("/"));
  }

  const tracked = gitTrackedFiles(worktreeRoot);
  if (tracked === null) return UNAVAILABLE;

  // Only untracked in-tree paths need the second probe. Tracked wins over
  // ignored by construction — a file that is both is still in the clone —
  // and `check-ignore` answers 128 for an out-of-tree path, so excluding
  // both groups here is what keeps the call from failing wholesale.
  const needIgnoreCheck: string[] = [];
  for (const rel of treeRel.values()) {
    if (rel !== null && !tracked.has(rel)) needIgnoreCheck.push(rel);
  }
  const ignored = gitIgnoredFiles(worktreeRoot, needIgnoreCheck);
  if (ignored === null) return UNAVAILABLE;

  const resolved = new Map<string, Visibility>();
  for (const [repoRel, rel] of treeRel) {
    if (rel === null) resolved.set(repoRel, "out-of-clone");
    else if (tracked.has(rel)) resolved.set(repoRel, "in-clone");
    else if (ignored.has(rel)) resolved.set(repoRel, "out-of-clone");
    else resolved.set(repoRel, "undecided");
  }

  return {
    available: true,
    // A path the index was not built with is `undecided` rather than an
    // error: the caller asked about something outside the corpus it
    // enumerated, and inventing a verdict for it would be the one answer
    // that could produce a false leak report.
    of: (repoRelPath: string) => resolved.get(repoRelPath) ?? "undecided",
  };
}

/**
 * The rule, in one place: an edge may point from less-visible to
 * more-visible, never the reverse.
 *
 * Only `in-clone → out-of-clone` violates it. `out-of-clone → in-clone` is
 * the *repair* — the same relationship recorded on the side that is not
 * published — and `undecided` on either end is never a violation.
 */
export function isCrossVisibilityLeak(from: Visibility, to: Visibility): boolean {
  return from === "in-clone" && to === "out-of-clone";
}

/**
 * The two-path case: would an edge from `fromPath` to `toPath` leak?
 *
 * Convenience over `buildVisibilityIndex` for the write guards, which know
 * exactly two paths and want one answer. False whenever git cannot answer,
 * which is the same silence the index-time check keeps.
 */
export function crossVisibilityLeak(
  projectRoot: string,
  fromPath: string,
  toPath: string,
): boolean {
  const index = buildVisibilityIndex(projectRoot, [fromPath, toPath]);
  if (!index.available) return false;
  return isCrossVisibilityLeak(index.of(fromPath), index.of(toPath));
}
