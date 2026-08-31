/**
 * Docdog never forces the process down (FRICTION-020).
 *
 * An adopter's first full `docdog index` printed its success summary and then
 * exited 1 with nothing on stderr. It was never reproduced, and the cause was
 * never identified — but two paths inside docdog could produce exactly that
 * shape, and both are closed now. This pins the one that can silently come
 * back.
 *
 * `process.exit()` terminates before pending writes to stdout and stderr have
 * necessarily reached the terminal. Node documents those streams as
 * synchronous or asynchronous *depending on the destination*, with a TTY on
 * Windows — the platform this project is developed on — among the
 * asynchronous cases, and gives `printUsage(); exit(1)` as its own example of
 * what not to do. Every command here did precisely that: twenty-three sites
 * of `printError(...)` followed immediately by `process.exit(1)`, in which the
 * one line explaining the failure is the line most likely to be dropped.
 *
 * Setting `process.exitCode` and returning is the documented alternative, and
 * it was already the house idiom — `split` has used it since PROPOSAL-045, and
 * every *success* path has always exited this way, by returning and letting
 * the loop drain. So this only makes failure behave the way success already
 * did, and the invariant is cheap to state: nothing under `src/` calls
 * `process.exit`.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("nothing in src/ calls process.exit", () => {
  const files = sourceFiles(SRC);

  it("finds the sources to check", () => {
    // Guards against the sweep passing because it walked nothing.
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no forced exit anywhere", () => {
    // There is no allowlist on purpose. A command that needs to stop early
    // sets `process.exitCode` and returns; a command that cannot return from
    // where it is has a control-flow problem, not an exit problem. Commander
    // still exits the process itself for `--help` and for its own parse
    // errors, which is its call to make and outside this tree.
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        // Comment lines are skipped so the rule can be *explained* in the
        // source it governs — a line beginning `//` or `*` cannot execute.
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*")) return;
        if (/\bprocess\.exit\s*\(/.test(line)) {
          offenders.push(`${relative(ROOT, file)}:${i + 1}: ${code}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("a refusal still exits nonzero", () => {
  /**
   * The grep above proves docdog does not force the process down; this proves
   * the replacement actually works end to end, which is the one way the change
   * could have gone wrong — a command that used to exit 1 quietly returning 0
   * and reading, to a scripted gate, as success. `serve --root <missing>` is
   * the cheapest refusal in the CLI: it needs no config, no cache and no
   * embedder, and it returns before any server starts.
   */
  it("prints why and exits 1", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", join("src", "cli", "index.ts"), "serve", "--root", join(ROOT, "no-such-directory-for-tests")],
      { cwd: ROOT, encoding: "utf-8", timeout: 60_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, `stderr: ${result.stderr}`).toBe(1);
    expect(result.stderr).toContain("ROOT_NOT_FOUND");
  });
});
