/**
 * Clone-wide liveness — DISC-032.
 *
 * The embed store is shared by every worktree of a clone (PROPOSAL-029),
 * but the question "is this vector still needed?" is asked from inside
 * one working tree, which can only see its own corpus. PROPOSAL-029 §5
 * resolved that mismatch by refusing the sweep on a shared store — and
 * `shared` means *"git answered"*, not *"a sibling worktree exists"*, so
 * the refusal fires on every git-based project including single-worktree
 * ones. gc became unreachable rather than careful.
 *
 * The question git can actually answer is how many working trees exist
 * and where they are. Each keeps its own `index.db`, so the union of
 * their vertex hashes is the clone's liveness set, and the complement of
 * that union is safe to evict in a way one tree's answer never was.
 *
 * Two things this deliberately does not do:
 *
 * - **It does not refuse when a sibling is unreadable.** A worktree that
 *   has never been indexed, or whose cache is stale, contributes nothing
 *   to the union and its rows look dead. Refusing there would restore the
 *   unreachability this exists to fix, for a mistake that costs a
 *   re-embed and nothing else (DD-070 §2). It is reported instead, by
 *   name, and the caller decides.
 * - **It does not see commits checked out nowhere.** Nothing can, and the
 *   price is the same re-embed. That is the accepted cost of a grow-only
 *   store, not a hole to plug.
 */
import { existsSync } from "node:fs";
import { cacheFilePath, openCacheRead } from "./cache.js";
import { liveContentHashes } from "./embed-store.js";
import { gitWorktrees } from "./git.js";

export interface WorktreeLiveness {
  /** Absolute path of the working tree. */
  path: string;
  /** True for the tree gc was invoked from. */
  current: boolean;
  /** False when this tree has no readable cache — its live rows are invisible. */
  readable: boolean;
  /** Distinct content hashes contributed, or null when unreadable. */
  hashes: number | null;
}

export interface CloneLiveness {
  /** Union of every readable tree's vertex hashes. */
  live: Set<string>;
  /** One entry per working tree, in git's order. */
  trees: WorktreeLiveness[];
  /** Trees whose cache could not be read — the union's blind spots. */
  blind: WorktreeLiveness[];
}

/**
 * Gather liveness across every working tree of the clone.
 *
 * Falls back to `[projectRoot]` when git cannot answer — the single-tree
 * treatment, which is both the honest reading of "unknown" and exactly
 * what the caller would have done before this existed.
 */
export function collectCloneLiveness(projectRoot: string): CloneLiveness {
  const paths = gitWorktrees(projectRoot);
  const roots = paths.length > 0 ? paths : [projectRoot];

  const live = new Set<string>();
  const trees: WorktreeLiveness[] = [];

  for (const path of roots) {
    const current = samePath(path, projectRoot);

    // Probe before opening: openCacheRead throws on a missing file, and a
    // never-indexed sibling is an ordinary state, not an exception.
    if (!existsSync(cacheFilePath(path))) {
      trees.push({ path, current, readable: false, hashes: null });
      continue;
    }

    try {
      const handle = openCacheRead(path);
      try {
        const hashes = liveContentHashes(handle.db);
        for (const h of hashes) live.add(h);
        trees.push({ path, current, readable: true, hashes: hashes.size });
      } finally {
        handle.close();
      }
    } catch {
      // A stale schema, a corrupt file, a lock we lost. Same class as
      // never-indexed: invisible to the union, reported, not fatal.
      trees.push({ path, current, readable: false, hashes: null });
    }
  }

  return { live, trees, blind: trees.filter((t) => !t.readable) };
}

function samePath(a: string, b: string): boolean {
  // Worktree paths come back resolved; projectRoot may not be, and on
  // Windows the drive letter's case is not stable across sources.
  const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
