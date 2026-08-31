/**
 * The upgrade path — PROPOSAL-042.
 *
 * `docdog update` brings an adopting repo up to *the docdog it has*, which
 * presupposes the new docdog arrived by some route docdog neither writes nor
 * observes. This module is that route's three mechanical pieces: ask the
 * registry what `latest` is, remember the answer, and name the command that
 * would install it for the way this copy was installed.
 *
 * ## The socket lives here and nowhere else
 *
 * PROPOSAL-037 §Limits ruled a registry check out of `status`: *"a `status`
 * that phones home is worse than the problem."* That refusal stands. The
 * request happens in `docdog update`, the command whose entire job is
 * upgrading; the verdict is cached; `status` reads the file and never opens a
 * socket. When to check at all is a judgment about whether interrupting is
 * worth it — DP-001 tier 3 — so it belongs to the agent, via the seeded
 * instruction, not to a timer in here.
 *
 * ## The request must describe nothing
 *
 * No installed version as a query parameter, no machine identifier, no
 * custom user-agent describing the corpus. This is not style. DISC-039's
 * consent asymmetry — a version check may be default-on *because* it
 * transmits nothing about the user, while every feedback report is asked for
 * individually — holds only if this stays a lookup. The moment the request
 * describes its sender it is a telemetry beacon and the asymmetry collapses.
 *
 * ## Every failure is degrade-and-continue
 *
 * Offline, DNS failure, 404, timeout, malformed JSON: one line, exit 0, and
 * `update` finishes its file work. FRICTION-018 is the standing reminder
 * that a network-restricted environment is a real environment.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { docdogVersion } from "./seed-manifest.js";

export const PACKAGE_NAME = "@yasnikoff/docdog";
const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 3000;

/** Where the cached verdict lives — disposable in DD-070 §2's exact sense. */
export function updateCheckPath(projectRoot: string): string {
  return join(projectRoot, ".docdog", "cache", "update-check.json");
}

export interface UpdateCheck {
  /** ISO 8601, so the file stays readable by a human debugging it. */
  checked_at: string;
  installed: string;
  /** Null when the registry could not be reached — a recorded failure, not a gap. */
  latest: string | null;
  registry: string;
  error?: string;
}

/**
 * The registry a check should ask. Honours `npm_config_registry`, which npm
 * exports for a proxied or mirrored install, so a repo behind a mirror asks
 * its own mirror rather than reporting a version it could not install.
 */
export function registryUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.npm_config_registry?.trim();
  return (configured && configured.length > 0 ? configured : DEFAULT_REGISTRY).replace(/\/+$/, "");
}

/**
 * One unauthenticated GET for the `latest` dist-tag. Resolves to a verdict
 * either way — the error case is a value, never a throw, because the caller
 * is in the middle of doing file work that must finish.
 */
export async function checkRegistry(
  installed: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<UpdateCheck> {
  const registry = registryUrl(env);
  const base: UpdateCheck = {
    checked_at: now.toISOString(),
    installed,
    latest: null,
    registry,
  };
  try {
    const res = await fetch(`${registry}/${encodeURIComponent(PACKAGE_NAME)}/latest`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ...base, error: `registry answered ${res.status}` };
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== "string") return { ...base, error: "registry sent no version" };
    return { ...base, latest: body.version };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

export function readUpdateCheck(projectRoot: string): UpdateCheck | null {
  const path = updateCheckPath(projectRoot);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as UpdateCheck;
    return typeof parsed.checked_at === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeUpdateCheck(projectRoot: string, check: UpdateCheck): void {
  const path = updateCheckPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(check, null, 2) + "\n", "utf-8");
}

/**
 * Is `latest` ahead of `installed`? Numeric triples, prerelease tags ignored
 * — enough for a report, and deliberately not a semver implementation.
 * Anything unparseable answers false: "I cannot tell" must never render as
 * "you are behind".
 */
export function isNewer(latest: string, installed: string): boolean {
  const parse = (v: string): number[] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(latest);
  const b = parse(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// ─── How this copy was installed ───────────────────────────────────────────

export type InstallShape = "npx" | "global" | "dependency" | "source";

/**
 * Read the install shape off the path of the module that is actually running.
 *
 * Pure path inspection, DP-001 tier 1. Its honest limit is the last case:
 * `npm link` and a source checkout are indistinguishable — which is exactly
 * the configuration that hid FRICTION-044 from the maintainer, so the report
 * says so rather than guessing.
 */
export function installShape(entry: string, projectRoot?: string): InstallShape {
  const path = entry.replace(/\\/g, "/");
  if (path.includes("/_npx/")) return "npx";
  if (projectRoot) {
    const local = `${projectRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/node_modules/`;
    if (path.startsWith(local)) return "dependency";
  }
  if (!path.includes("/node_modules/")) return "source";
  // Inside node_modules but not the project's: a global prefix, an npm
  // workspace root, or a parent directory's install. All upgrade the same way.
  return "global";
}

/** What to run, for this shape. `null` when there is nothing to run. */
export function upgradeInstruction(shape: InstallShape): string | null {
  switch (shape) {
    case "npx":
      return `.mcp.json pins the version docdog runs; "docdog update" bumps that pin. To upgrade the CLI itself: npm i -g ${PACKAGE_NAME}@latest`;
    case "global":
      return `npm i -g ${PACKAGE_NAME}@latest`;
    case "dependency":
      return `npm i -D ${PACKAGE_NAME}@latest`;
    case "source":
      return null;
  }
}

/**
 * The one-line report, in all four of its states. Never opens a socket — it
 * renders a file somebody else wrote, which is what lets `status` carry it.
 */
export function formatUpdateLine(
  installed: string,
  check: UpdateCheck | null,
  now: Date = new Date(),
): string {
  if (!check) {
    return '**Update:** never checked — run "docdog update --check".';
  }
  const age = ageWords(now.getTime() - Date.parse(check.checked_at));
  if (check.latest === null) {
    return `**Update:** could not reach ${check.registry} ${age} ago${check.error ? ` (${check.error})` : ""}.`;
  }
  if (isNewer(check.latest, installed)) {
    return `**Update:** ${check.latest} available (you are on ${installed}) — checked ${age} ago.`;
  }
  return `**Update:** current as of ${age} ago.`;
}

function ageWords(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Prose for a shape, for the surfaces a human reads. */
export function installWords(shape: InstallShape): string {
  switch (shape) {
    case "npx":
      return "run via npx";
    case "global":
      return "installed globally";
    case "dependency":
      return "a devDependency of this project";
    case "source":
      return "a source checkout (or npm link)";
  }
}

/**
 * Everything about *the installation* rather than the corpus, in one value.
 *
 * It exists because `docdog status --json` is what a friction report pastes
 * as its environment block (PROPOSAL-043), and the first question triage asks
 * is which version — which that report carried on no surface at all until
 * this. The install shape is here for the same reason: PROPOSAL-042 made it
 * load-bearing (what to run to upgrade depends on it), and asking a reporter
 * to describe it in prose asks them to know something docdog can read.
 *
 * Opens no socket on any path. `check` is whatever `update --check` last
 * wrote, or null.
 */
export interface InstallReport {
  version: string;
  shape: InstallShape;
  check: UpdateCheck | null;
}

export function describeInstall(
  projectRoot: string,
  entry: string = fileURLToPath(import.meta.url),
): InstallReport {
  return {
    version: docdogVersion(),
    shape: installShape(entry, projectRoot),
    check: readUpdateCheck(projectRoot),
  };
}

/**
 * The `--check` half of `docdog update`, with both modifiers bound.
 *
 * Extracted from the command because the bug it fixes was a flag ignored by
 * an early return, which no test could see while it lived inside an action.
 *
 * - `--offline` renders the verdict already cached and opens nothing. The
 *   flag names what it guarantees; on the one command whose entire job is
 *   the ask, honouring it means answering from disk, not asking anyway.
 * - `--dry-run` writes nothing, and the cached verdict is a write.
 */
export async function performCheck(opts: {
  projectRoot: string;
  installed: string;
  offline?: boolean;
  dryRun?: boolean;
}): Promise<UpdateCheck | null> {
  if (opts.offline) return readUpdateCheck(opts.projectRoot);
  const check = await checkRegistry(opts.installed);
  if (!opts.dryRun) writeUpdateCheck(opts.projectRoot, check);
  return check;
}
