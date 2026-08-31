/**
 * Per-call project resolution for the MCP server (PROPOSAL-033).
 *
 * A server is no longer bound to the repo that spawned it. Each tool call
 * names the project it acts on via an optional `root` path; when it omits
 * one, the server's default root — resolved once at boot from its process
 * cwd — stands in. When neither resolves, the call fails loudly.
 *
 * Three rules carry the safety of the whole feature:
 *
 *   1. An explicit `root` that is not a docdog project is a HARD ERROR.
 *      It never falls back to the default root. Silently acting on the
 *      wrong corpus would be indistinguishable from success.
 *   2. There is no "all projects" mode. A call acts on exactly one project
 *      or it errors — searching every known project, or inferring the
 *      project from an id prefix, is DP-001 tier 3 and must never be built.
 *   3. Config is read from disk on EVERY call, never memoized across them.
 *      A server outlives the config it was started with: declaring a new
 *      collection or scan path is a config edit, and a resolver that
 *      remembered its first read would answer from a config the user had
 *      already replaced — `docdog_create` refusing an "unknown collection"
 *      the user just declared, `docdog_index` skipping the sections under a
 *      scan path that is right there in the file. Both were hit in the
 *      field. The alternative — a reload command — makes correctness depend
 *      on remembering a ritual, which is the class of manual invariant
 *      FRICTION-033 removed from the embed store. So it is mechanical here:
 *      re-reading a file the user edited is DP-001 tier 1, and the memo it
 *      replaces was saving two small readFileSync on a path that already
 *      opens SQLite and, for search, runs an ONNX forward pass.
 *
 * Consistency within a call is unaffected: a handler resolves once, at the
 * top, and passes that config down. Only the window *between* calls closes.
 * A config edit racing a call yields a YAML parse error rather than half a
 * config — loud, and the same choice ROOT_NOT_A_PROJECT makes.
 *
 * `root` must be absolute. Resolving a relative path would reintroduce a
 * hidden dependence on the server's cwd, which is the very coupling this
 * removes.
 */
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { findProjectRoot, loadConfig } from "../config/loader.js";
import type { DocdogConfig } from "../types/config.js";

export type ProjectResolutionCode =
  | "ROOT_REQUIRED"
  | "ROOT_NOT_ABSOLUTE"
  | "ROOT_NOT_FOUND"
  | "ROOT_NOT_A_PROJECT"
  | "ROOT_NOT_A_STRING";

export class ProjectResolutionError extends Error {
  constructor(
    readonly code: ProjectResolutionCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectResolutionError";
  }
}

export interface ResolvedProject {
  projectRoot: string;
  config: DocdogConfig;
}

export class ProjectResolver {
  constructor(readonly defaultRoot: string | null) {}

  /** Resolve the project a call acts on. `rootArg` is the raw tool argument. */
  resolve(rootArg: unknown): ResolvedProject {
    if (rootArg === undefined || rootArg === null || rootArg === "") {
      if (this.defaultRoot === null) {
        throw new ProjectResolutionError(
          "ROOT_REQUIRED",
          "No project. This server was not started inside a docdog project, so every call must pass `root` — " +
            "an absolute path to a docdog project (or any directory inside one).",
        );
      }
      return this.open(this.defaultRoot);
    }

    if (typeof rootArg !== "string") {
      throw new ProjectResolutionError("ROOT_NOT_A_STRING", "`root` must be a string path.");
    }

    if (!isAbsolute(rootArg)) {
      throw new ProjectResolutionError(
        "ROOT_NOT_ABSOLUTE",
        `\`root\` must be an absolute path (got: ${rootArg}). A relative path would be resolved against the server's working directory, which is not yours.`,
      );
    }

    const abs = resolve(rootArg);

    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new ProjectResolutionError(
        "ROOT_NOT_FOUND",
        `\`root\` is not an existing directory: ${abs}`,
      );
    }

    // Walk-up, exactly as the cwd default does — a path inside the project works.
    const projectRoot = findProjectRoot(abs);
    if (projectRoot === null) {
      throw new ProjectResolutionError(
        "ROOT_NOT_A_PROJECT",
        `No .docdog/config.yaml at or above ${abs}. This call did NOT fall back to the default project — ` +
          "acting on the wrong corpus is worse than failing.",
      );
    }

    return this.open(projectRoot);
  }

  /** Rule 3: a fresh read, every call. Deliberately not memoized — see the header. */
  private open(projectRoot: string): ResolvedProject {
    return { projectRoot, config: loadConfig(projectRoot) };
  }
}
