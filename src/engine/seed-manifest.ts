/**
 * The seed manifest — PROPOSAL-041.
 *
 * `.docdog/.seeded.json` records, for every file docdog authored in an
 * adopting repo, the content hash of the bytes docdog wrote and the version
 * that wrote them. That one record is what makes an upgrade command possible:
 * without it, "is this file yours or mine?" is inference about the user's
 * intent, which DP-001 forbids code from performing — which is why the
 * command this replaces resolved the question by guessing, and guessed
 * destructively.
 *
 * With it, the question is a hash comparison. **The manifest does not give
 * docdog permission to judge; it removes the need to.**
 *
 * Everything here is tier-1 mechanics: hash, compare, classify. Nothing in
 * this module writes a seeded file — it only says what each one is.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const SEED_MANIFEST_VERSION = 1;

/** Repo-relative location of the manifest. Committed: see PROPOSAL-041 Q2. */
export const SEED_MANIFEST_REL = ".docdog/.seeded.json";

export interface SeedManifestEntry {
  /** `sha256:…` over the LF-normalized bytes docdog wrote. */
  hash: string;
  /** The docdog version that wrote them. Reported, never compared. */
  docdog: string;
}

export interface SeedManifest {
  version: number;
  entries: Record<string, SeedManifestEntry>;
}

export function emptySeedManifest(): SeedManifest {
  return { version: SEED_MANIFEST_VERSION, entries: {} };
}

/**
 * Hash over **LF-normalized** content, for the reason `engine/discovery.ts`
 * already normalizes: under `core.autocrlf` a worktree holds CRLF where the
 * tree it was cut from holds LF, and an EOL-sensitive key would report every
 * seeded file on Windows as edited by the user.
 */
export function seedHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

/**
 * Read the manifest, or an empty one. A missing manifest is the normal state
 * of every repo seeded before this shipped; a malformed one is treated the
 * same way, because the conservative reading of "no provenance" is "every
 * file is the user's", which is the outcome that never overwrites anything.
 */
export function readSeedManifest(projectRoot: string): SeedManifest {
  const path = join(projectRoot, ".docdog", ".seeded.json");
  if (!existsSync(path)) return emptySeedManifest();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<SeedManifest>;
    const entries = parsed.entries;
    if (!entries || typeof entries !== "object") return emptySeedManifest();
    return { version: parsed.version ?? SEED_MANIFEST_VERSION, entries: entries as Record<string, SeedManifestEntry> };
  } catch {
    return emptySeedManifest();
  }
}

/**
 * Write the manifest with sorted keys and LF endings. It is a tracked file
 * that changes on every seed, so a stable serialization is the difference
 * between a readable diff and a reshuffled one.
 */
export function writeSeedManifest(projectRoot: string, manifest: SeedManifest): void {
  const sorted: Record<string, SeedManifestEntry> = {};
  for (const key of Object.keys(manifest.entries).sort()) {
    sorted[key] = manifest.entries[key];
  }
  const body = JSON.stringify({ version: manifest.version, entries: sorted }, null, 2);
  writeFileSync(join(projectRoot, ".docdog", ".seeded.json"), `${body}\n`, "utf-8");
}

/** Record that docdog just wrote `content` at repo-relative `path`. */
export function recordSeed(
  manifest: SeedManifest,
  path: string,
  content: string,
  docdogVersion: string,
): void {
  manifest.entries[normalizeSeedPath(path)] = { hash: seedHash(content), docdog: docdogVersion };
}

/** Manifest keys are repo-relative and forward-slashed on every platform. */
export function normalizeSeedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

// ─── Classification ────────────────────────────────────────────────────────

export type SeedOutcome =
  /** docdog ships it, the repo does not have it. Safe to write. */
  | "add"
  /** The repo has exactly what docdog wrote, and docdog now ships something else. */
  | "update"
  /** The repo has exactly what docdog ships. Nothing to do. */
  | "unchanged"
  /** The repo's copy differs from what docdog wrote. The user owns it. */
  | "diverged"
  /** On disk with no manifest entry — seeded before provenance existed. The user owns it. */
  | "untracked"
  /** docdog no longer ships this path, and the repo still has it. */
  | "orphan";

export interface SeedState {
  /** Manifest key and display path. */
  path: string;
  /** What docdog ships for this path now; null when it ships nothing. */
  shipped: string | null;
  /** What the repo holds now; null when absent. */
  current: string | null;
}

export interface SeedClassification {
  path: string;
  outcome: SeedOutcome;
  /** The docdog version that seeded it, when the manifest knows. */
  seededVersion: string | null;
}

/**
 * The whole decision, as a pure function of (what is shipped, what is on
 * disk, what was recorded). The order of the checks is the design:
 *
 *   1. Not shipped any more → orphan if it is still there, otherwise gone.
 *      This is deliberately independent of the manifest, so a path docdog
 *      *used* to write in a shape it no longer writes — the flat
 *      `.claude/skills/specs.md` of FRICTION-040 — is reported even though
 *      no manifest ever recorded it. Callers only ever pass paths docdog
 *      knows it may have authored.
 *   2. Absent → add. Adding a file the repo does not have cannot destroy
 *      anything, and it restores init's repair semantics for a deleted seed.
 *   3. No manifest entry → untracked. Every file in every repo seeded before
 *      the manifest shipped lands here, and lands as the user's. Assuming an
 *      unrecorded file is pristine would reintroduce the clobber on exactly
 *      the repos that have been running longest.
 *   4. On disk but not what docdog wrote → diverged. The user edited it.
 *   5. Byte-identical to what ships → unchanged.
 *   6. Otherwise → update: the shipped file moved and the user's did not.
 */
export function classifySeed(
  state: SeedState,
  entry: SeedManifestEntry | undefined,
): SeedClassification | null {
  const seededVersion = entry?.docdog ?? null;
  const path = normalizeSeedPath(state.path);

  if (state.shipped === null) {
    if (state.current === null) return null;
    return { path, outcome: "orphan", seededVersion };
  }
  if (state.current === null) return { path, outcome: "add", seededVersion };
  if (!entry) return { path, outcome: "untracked", seededVersion: null };

  const currentHash = seedHash(state.current);
  if (entry.hash !== currentHash) return { path, outcome: "diverged", seededVersion };
  if (seedHash(state.shipped) === currentHash) return { path, outcome: "unchanged", seededVersion };
  return { path, outcome: "update", seededVersion };
}

/** Classify a whole seed set, dropping the paths with nothing to say. */
export function classifySeeds(
  states: SeedState[],
  manifest: SeedManifest,
): SeedClassification[] {
  const out: SeedClassification[] = [];
  for (const state of states) {
    const c = classifySeed(state, manifest.entries[normalizeSeedPath(state.path)]);
    if (c) out.push(c);
  }
  return out;
}

/** Outcomes docdog writes without being asked. Everything else is reported. */
export const WRITING_OUTCOMES: readonly SeedOutcome[] = ["add", "update"];

/** Outcomes `--force <path>` can act on: the two that mean "the user owns this". */
export const FORCEABLE_OUTCOMES: readonly SeedOutcome[] = ["diverged", "untracked"];

// ─── Version ───────────────────────────────────────────────────────────────

/**
 * The running docdog version, for the manifest's provenance half.
 * `../../package.json` is the package root from `src/engine/` under tsx and
 * from the bundle in `dist/`, the same relative path `src/cli/index.ts` uses.
 */
export function docdogVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
