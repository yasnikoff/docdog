/**
 * The server's own vintage — PROPOSAL-037.
 *
 * A `docdog serve` runs whatever it loaded at boot. That tradeoff is fine and
 * deliberate (DISC-021 records it as the CLI's one structural advantage over
 * MCP); what is not fine is that it was **silent**. An agent talking to a
 * server three versions behind gets old behaviour with no signal, and the
 * failure looks like a docdog bug rather than a stale process.
 *
 * The sharpest case is FRICTION-037's own fix: a user updates docdog *to get
 * it*, exercises it through a server spawned before the update, sees the old
 * refusal, and concludes the fix does not work.
 *
 * ## Two signals, because each is blind where the other works
 *
 * | | source mode (`npx tsx src/…`) | installed (`npm i` / `npm link`) |
 * |---|---|---|
 * | version compare | blind — constant across every edit | **catches it** |
 * | mtime vs boot | **catches it** | blind — see below |
 *
 * The installed-mode blindness of mtime is measured, not theorised: **npm
 * preserves the tarball's mtimes on extract**, so a package installed today
 * carries its publish timestamps, which can predate the running server's
 * boot. An mtime rule would report "current" at the exact moment it is
 * wrong — a signal that reads as reassurance. So both run, the verdicts OR
 * together, and the report names which fired.
 *
 * ## Two things it must never become
 *
 * Disclosure only. No `docdog_restart`, no self-reexec, no refusing calls
 * while stale: process lifecycle belongs to the host that spawned the
 * server, the same boundary PROPOSAL-035 drew when it refused docdog's
 * writes rather than the filesystem's. And it stays DP-001 tier 1 only while
 * it is disclosure — advising which surface the agent should have used for
 * the task at hand would be tier 3.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Facts captured once, at process start. */
export interface BootStamp {
  /** Epoch ms at which the server started. */
  at: number;
  /** The version this process loaded — read once, never re-read. */
  version: string;
  /** `src/` or `dist/` directory the loaded module lives under, or null. */
  codeRoot: string | null;
  /** The module actually loaded, for the report's first line. */
  entry: string;
}

export interface Vintage extends BootStamp {
  /** True when the code root's basename is `src` — i.e. running from source. */
  sourceMode: boolean;
  /** The version on disk *now*, re-read at call time. */
  diskVersion: string;
  /** Newest mtime under the code root, or null when it could not be walked. */
  newestMtime: number | null;
  /** Path of the file carrying that mtime. */
  newestFile: string | null;
  /** How many files under the code root are newer than boot. */
  changedSinceBoot: number;
  stale: boolean;
}

/**
 * Walk up from the loaded module to the `src/` or `dist/` directory it lives
 * under. `import.meta.url` rather than `process.argv[1]`, because the host
 * controls the latter and this must describe the code that is actually
 * running.
 */
function findCodeRoot(from: string): string | null {
  let current = dirname(from);
  for (let i = 0; i < 12; i += 1) {
    const name = basename(current);
    if (name === "src" || name === "dist") return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/** Capture the boot-time half. Called once, by `startMcpServer`. */
export function captureBoot(now = Date.now()): BootStamp {
  const entry = fileURLToPath(import.meta.url);
  const codeRoot = findCodeRoot(entry);
  return { at: now, version: readVersionFromDisk(codeRoot), codeRoot, entry };
}

/**
 * Read `package.json` beside the code root, **from disk, every time**.
 *
 * Deliberately not `docdogVersion()`: that one goes through `createRequire`,
 * whose module cache would hand back the value read at boot — which is the
 * one thing this comparison must not do. Signal A only works if one side is
 * genuinely re-read.
 */
function readVersionFromDisk(codeRoot: string | null): string {
  if (!codeRoot) return "unknown";
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(codeRoot), "package.json"), "utf-8")) as {
      version?: string;
    };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Newest mtime under `root`, skipping *nested* `node_modules/` and `.git/`.
 *
 * Over-reports by design: editing a file the server never imports marks it
 * stale, and so does a `git checkout` that rewrites mtimes. That is the safe
 * direction — it says "restart" slightly more often than strictly necessary,
 * never less.
 */
function newestUnder(
  root: string,
  since: number,
): { mtime: number | null; file: string | null; newerThanSince: number } {
  let mtime: number | null = null;
  let file: string | null = null;
  let newerThanSince = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > 12) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git") continue;
      const abs = join(dir, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(abs, depth + 1);
        continue;
      }
      const m = st.mtimeMs;
      if (mtime === null || m > mtime) {
        mtime = m;
        file = abs;
      }
      if (m > since) newerThanSince += 1;
    }
  };

  walk(root, 0);
  return { mtime, file, newerThanSince };
}

/** Compare the boot-time facts against disk, now. */
export function assessVintage(boot: BootStamp): Vintage {
  const diskVersion = readVersionFromDisk(boot.codeRoot);
  const walked =
    boot.codeRoot ?
      newestUnder(boot.codeRoot, boot.at)
    : { mtime: null, file: null, newerThanSince: 0 };

  const versionMoved = diskVersion !== boot.version && diskVersion !== "unknown";
  const codeMoved = walked.newerThanSince > 0;

  return {
    ...boot,
    sourceMode: boot.codeRoot !== null && basename(boot.codeRoot) === "src",
    diskVersion,
    newestMtime: walked.mtime,
    newestFile: walked.file,
    changedSinceBoot: walked.newerThanSince,
    stale: versionMoved || codeMoved,
  };
}

/** `3h 41m`, `12m`, `41s` — the shape a reader can act on without arithmetic. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * The `Server` block, printed on every status path including the no-cache
 * one and identical regardless of which `root` the call steered to: it
 * describes the process, not the corpus — exactly as the read-only mode line
 * does.
 */
export function formatVintage(v: Vintage, now = Date.now()): string[] {
  const mode = v.sourceMode ? "source mode" : "installed";
  const lines = [
    `**Server:** ${mode} — ${v.entry}`,
    `Booted ${new Date(v.at).toISOString()} (${formatAge(now - v.at)} ago), version ${v.version}.`,
  ];

  if (!v.stale) {
    lines[1] = `Booted ${new Date(v.at).toISOString()} (${formatAge(now - v.at)} ago), version ${v.version} · current.`;
    lines.push("");
    return lines;
  }

  if (v.diskVersion !== v.version && v.diskVersion !== "unknown") {
    lines.push(`**STALE:** booted version ${v.version}, on disk ${v.diskVersion}.`);
  }
  if (v.changedSinceBoot > 0 && v.codeRoot) {
    const newest =
      v.newestFile && v.newestMtime ?
        `; newest is ${v.newestFile} at ${new Date(v.newestMtime).toISOString()}`
      : "";
    lines.push(
      `**STALE:** ${v.changedSinceBoot} file(s) under ${basename(v.codeRoot)}/ changed since boot${newest}.`,
    );
  }
  lines.push(
    "This server is running the code as it was at boot. Restarting it is the host's action, " +
      "not docdog's — until then the CLI is current by construction.",
  );
  lines.push("");
  return lines;
}
