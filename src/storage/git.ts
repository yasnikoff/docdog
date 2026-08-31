/**
 * Every git invocation in the codebase — the DD-050 tier-2 surface:
 * `gitCommonDir` (PROPOSAL-029, the relocatable embed store) and
 * `gitMergeFile` / `gitConfigSet` (PROPOSAL-030, the union merge driver).
 *
 * Git-*aware*, never git-*dependent*: every function here reports failure
 * instead of throwing — no git binary, not a repository, an exotic or
 * broken setup — and every caller must have a working fallback, so tier 1
 * (docdog runs on any directory, outside git entirely) survives by
 * construction.
 */
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Probes are memoized per project root: a directory's git common dir
 * cannot change under a running process, and the indexer, gc and status
 * all resolve the same path.
 */
const probed = new Map<string, string | null>();

/** Result of the ordinary three-way text merge git already knows how to do. */
export interface TextMergeResult {
  /** False when git could not run the merge at all (no binary, unreadable file). */
  ok: boolean;
  /** 0 = clean. Anything above = git's conflict count. */
  conflicts: number;
  /** The merged text, conflict markers and all. Empty when `ok` is false. */
  text: string;
}

/**
 * Run git's own three-way text merge over three files, without touching
 * them (`merge-file -p` prints the result). This is the merge driver's
 * *first* act (PROPOSAL-030 §1): docdog logic engages only on a merge git
 * already failed, so the driver cannot make a clean merge worse.
 *
 * Never throws.
 */
export function gitMergeFile(opts: {
  basePath: string;
  oursPath: string;
  theirsPath: string;
  markerSize?: number;
  label?: string;
}): TextMergeResult {
  const label = opts.label ?? "record";
  const args = ["merge-file", "-p"];
  if (opts.markerSize && Number.isFinite(opts.markerSize)) {
    args.push(`--marker-size=${opts.markerSize}`);
  }
  args.push(
    "-L", `${label} (ours)`,
    "-L", `${label} (base)`,
    "-L", `${label} (theirs)`,
    // git merge-file's argument order is <current> <base> <other>.
    opts.oursPath, opts.basePath, opts.theirsPath,
  );

  let proc;
  try {
    proc = spawnSync("git", args, {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return { ok: false, conflicts: 0, text: "" };
  }

  // git merge-file exits 0 on a clean merge, with the conflict count
  // (truncated at 127) when it conflicted, and negative — surfacing as a
  // high status or a signal — on an actual error.
  const status = proc.status;
  if (status === null || status < 0 || status > 127 || typeof proc.stdout !== "string") {
    return { ok: false, conflicts: 0, text: "" };
  }
  return { ok: true, conflicts: status, text: proc.stdout };
}

/**
 * Write a key into the repository-local git config (`.git/config`), which
 * is *shared* by every worktree of the clone — install the merge driver
 * once and all present and future worktrees are covered (PROPOSAL-030 §5).
 *
 * Returns false when git could not do it (no binary, not a repository).
 * Never throws: an uninstalled driver degrades to git's default text
 * merge, which is exactly today's behavior.
 */
export function gitConfigSet(projectRoot: string, key: string, value: string): boolean {
  try {
    const proc = spawnSync("git", ["config", "--local", key, value], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    return proc.status === 0;
  } catch {
    return false;
  }
}

/**
 * Read a repository-local git config key. Returns null when the key is
 * unset *or* when git could not be consulted at all — the caller that
 * needs to tell those apart (FRICTION-041: "unregistered" and "no git" are
 * different reports) checks `gitAvailable` separately.
 *
 * Never throws, for the same reason as every other function here.
 */
export function gitConfigGet(projectRoot: string, key: string): string | null {
  try {
    const proc = spawnSync("git", ["config", "--local", "--get", key], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    if (proc.status !== 0 || typeof proc.stdout !== "string") return null;
    const value = proc.stdout.trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

/**
 * True when git can be run against `projectRoot` at all. Distinguishes
 * "the key is unset" from "there is no git here", which a null from
 * `gitConfigGet` alone cannot.
 */
export function gitAvailable(projectRoot: string): boolean {
  try {
    const proc = spawnSync("git", ["rev-parse", "--git-dir"], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    return proc.status === 0;
  } catch {
    return false;
  }
}

/**
 * Absolute path of the git *common* directory for `projectRoot` — the
 * one shared by every worktree of the clone (`<clone>/.git`), as opposed
 * to `--git-dir`, which inside a linked worktree is the private
 * `<clone>/.git/worktrees/<name>`.
 *
 * Returns null when the answer is not a usable directory, for any reason.
 * Never throws.
 */
export function gitCommonDir(projectRoot: string): string | null {
  const memo = probed.get(projectRoot);
  if (memo !== undefined) return memo;

  const result = probe(projectRoot);
  probed.set(projectRoot, result);
  return result;
}

/** Test seam: forget memoized probes. */
export function resetGitProbeCache(): void {
  probed.clear();
}

/**
 * Absolute paths of every working tree of this clone — the main tree plus
 * each linked worktree — as `git worktree list --porcelain` reports them.
 *
 * This is the question `shared` was standing in for and answering wrong
 * (DISC-032): the embed store is *shared* whenever git answers at all, but
 * it is *contended* only when this list has more than one entry. Counting
 * is tier 1 mechanics; guessing from the store's location was not.
 *
 * Returns an empty array when git cannot answer — no binary, not a
 * repository, an output shape this parser does not recognize. Callers must
 * read empty as "unknown", never as "no worktrees exist": the caller here
 * falls back to the conservative single-tree treatment it would have had
 * anyway. Never throws.
 */
export function gitWorktrees(projectRoot: string): string[] {
  let raw: string;
  try {
    const proc = spawnSync("git", ["worktree", "list", "--porcelain"], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    if (proc.status !== 0 || typeof proc.stdout !== "string") return [];
    raw = proc.stdout;
  } catch {
    return [];
  }

  // Porcelain format: stanzas separated by blank lines, each opening with
  // `worktree <absolute-path>`. Other keys (HEAD, branch, bare, detached,
  // locked, prunable) are not our business — a bare repository has no
  // working tree to hold a cache, and a prunable one may still have files
  // on disk, so both are handled by simply failing to find an index.db.
  const paths: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const path = line.slice("worktree ".length).trim();
    if (path !== "") paths.push(resolve(path));
  }
  return paths;
}

/**
 * Absolute path of the top of the working tree that contains `projectRoot`
 * (`git rev-parse --show-toplevel`).
 *
 * Distinct from `gitCommonDir`, which answers *where the clone keeps its
 * shared metadata*. This answers *which files a clone of this repo will
 * contain* — a different question, and the one PROPOSAL-047 needs: a docdog
 * project may sit in a subdirectory of its repository, and a `scan_paths`
 * entry may point outside the repository altogether.
 *
 * Returns null when git cannot answer. Never throws.
 */
export function gitWorktreeRoot(projectRoot: string): string | null {
  try {
    const proc = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    if (proc.status !== 0 || typeof proc.stdout !== "string") return null;
    const raw = proc.stdout.trim();
    return raw === "" ? null : resolve(raw);
  } catch {
    return null;
  }
}

/**
 * Every path git tracks under `worktreeRoot`, relative to it and
 * forward-slashed — the set of files a clone will contain.
 *
 * Tracked wins over ignored wherever they disagree, and callers must keep
 * that precedence: a file can be *both* tracked and matched by an ignore
 * rule (this repo's own DD-071 audit found exactly that shape), and such a
 * file is in the clone. The ignore rule is inert on it.
 *
 * Returns null when git cannot answer — never an empty set, which a caller
 * would read as "the repo tracks nothing" and act on. Never throws.
 */
export function gitTrackedFiles(worktreeRoot: string): Set<string> | null {
  try {
    const proc = spawnSync("git", ["ls-files", "-z"], {
      cwd: worktreeRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (proc.status !== 0 || typeof proc.stdout !== "string") return null;
    const out = new Set<string>();
    for (const entry of proc.stdout.split(" ")) {
      if (entry !== "") out.add(entry);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Which of `relPaths` git's ignore rules exclude, as a subset of the input.
 * Paths are relative to `worktreeRoot` and forward-slashed.
 *
 * `check-ignore` exits **1** when none of the given paths are ignored, which
 * is a successful answer of "none" and not a failure — reading it as one
 * would make every clean corpus look unknowable. 128 is the real error, and
 * it is what an out-of-tree path produces; callers must exclude those before
 * asking rather than relying on this to report them.
 *
 * Returns null when git cannot answer. Never throws.
 */
export function gitIgnoredFiles(
  worktreeRoot: string,
  relPaths: readonly string[],
): Set<string> | null {
  if (relPaths.length === 0) return new Set();
  try {
    const proc = spawnSync("git", ["check-ignore", "-z", "--stdin"], {
      cwd: worktreeRoot,
      input: relPaths.join(" "),
      encoding: "utf-8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (proc.status !== 0 && proc.status !== 1) return null;
    if (typeof proc.stdout !== "string") return null;
    const out = new Set<string>();
    for (const entry of proc.stdout.split(" ")) {
      if (entry !== "") out.add(entry);
    }
    return out;
  } catch {
    return null;
  }
}

function probe(projectRoot: string): string | null {
  let raw: string;
  try {
    const proc = spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: projectRoot,
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5000,
    });
    if (proc.status !== 0 || typeof proc.stdout !== "string") return null;
    raw = proc.stdout.trim();
  } catch {
    // No git binary on PATH, or spawn refused. Not an error condition —
    // it is simply the no-git case.
    return null;
  }
  if (raw === "") return null;

  // Git answers relatively (".git") when run from the top of the main
  // tree, absolutely from a linked worktree.
  const path = isAbsolute(raw) ? raw : resolve(projectRoot, raw);

  // A worktree's `.git` is a *file*, not a directory. If a git version
  // hands back something that resolves to one, the answer is unusable
  // and the caller's fallback is correct.
  try {
    return statSync(path).isDirectory() ? path : null;
  } catch {
    return null;
  }
}
