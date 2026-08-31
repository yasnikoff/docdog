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
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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
  const projectTree = gitWorktreeRoot(projectRoot);
  if (projectTree === null) return UNAVAILABLE;

  // Which working tree OWNS each path — the one whose clone would carry it.
  // For a path under a scan entry that walks out of the project (`../other/`)
  // that is a DIFFERENT repository, and the distinction is the whole of
  // FRICTION-054: a path outside this tree is not "absent from every clone",
  // it is absent from THIS one.
  const ownerOf = new Map<string, string | null>();
  const treeOfDir = new Map<string, string | null>();
  const relIn = new Map<string, string>();

  for (const repoRel of repoRelPaths) {
    if (ownerOf.has(repoRel)) continue;
    const abs = resolve(projectRoot, repoRel);
    const inProject = relative(projectTree, abs);
    const outside =
      inProject === "" || inProject === ".." || inProject.startsWith(`..${sep}`) || isAbsolute(inProject);

    if (!outside) {
      ownerOf.set(repoRel, projectTree);
      relIn.set(repoRel, inProject.split(sep).join("/"));
      continue;
    }

    // One `rev-parse` per distinct directory, not per file.
    const dir = dirname(abs);
    if (!treeOfDir.has(dir)) treeOfDir.set(dir, gitWorktreeRoot(dir));
    const owner = treeOfDir.get(dir) ?? null;
    ownerOf.set(repoRel, owner);
    if (owner !== null) {
      const r = relative(owner, abs);
      relIn.set(repoRel, r.split(sep).join("/"));
    }
  }

  // Batch the two probes per owning tree. Two repositories means two pairs
  // of git calls, not two per path.
  const trackedByTree = new Map<string, Set<string>>();
  const ignoredByTree = new Map<string, Set<string>>();
  for (const owner of new Set([...ownerOf.values()])) {
    if (owner === null) continue;
    const tracked = gitTrackedFiles(owner);
    if (tracked === null) {
      // Only the PROJECT's own tree failing is fatal — that is the check's
      // ground truth. A sibling repository we cannot read leaves its paths
      // undecided, which triggers nothing.
      if (owner === projectTree) return UNAVAILABLE;
      continue;
    }
    trackedByTree.set(owner, tracked);
    const need: string[] = [];
    for (const [repoRel, o] of ownerOf) {
      if (o !== owner) continue;
      const r = relIn.get(repoRel);
      if (r !== undefined && !tracked.has(r)) need.push(r);
    }
    const ignored = gitIgnoredFiles(owner, need);
    if (ignored === null) {
      if (owner === projectTree) return UNAVAILABLE;
      continue;
    }
    ignoredByTree.set(owner, ignored);
  }

  const resolved = new Map<string, Visibility>();
  for (const [repoRel, owner] of ownerOf) {
    // Inside no working tree at all: no clone of anything carries it, so
    // this is the one out-of-tree case git can be certain about.
    if (owner === null) {
      resolved.set(repoRel, "out-of-clone");
      continue;
    }
    const rel = relIn.get(repoRel);
    const tracked = trackedByTree.get(owner);
    const ignored = ignoredByTree.get(owner);
    if (rel === undefined || tracked === undefined || ignored === undefined) {
      resolved.set(repoRel, "undecided");
      continue;
    }
    if (ignored.has(rel)) {
      // Excluded from its OWN repository — undistributable wherever it lives.
      resolved.set(repoRel, "out-of-clone");
    } else if (owner !== projectTree) {
      // Tracked (or merely untracked) in ANOTHER repository. Git knows what a
      // clone of one repo contains; it cannot say whether that repo is more
      // or less visible than this one, and guessing in either direction is a
      // claim it has no basis for. Undecided is the honest answer, and it
      // triggers nothing (FRICTION-054).
      resolved.set(repoRel, "undecided");
    } else if (tracked.has(rel)) {
      resolved.set(repoRel, "in-clone");
    } else {
      resolved.set(repoRel, "undecided");
    }
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
 * True when a path is reached by walking OUT of the project's working tree.
 *
 * Not a visibility verdict — a fact about where the corpus lives. Edges that
 * cross this boundary will not resolve in a clone of this repository alone,
 * which is worth saying once about the project rather than once per edge.
 */
export function isOutsideProjectTree(repoRelPath: string): boolean {
  const rel = repoRelPath.split("\\").join("/");
  return rel === ".." || rel.startsWith("../");
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
