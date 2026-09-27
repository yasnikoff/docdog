#!/usr/bin/env node
import { loadDocdogEnv } from "../config/env.js";
loadDocdogEnv();

import { createRequire } from "node:module";
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerIndexCommand } from "./commands/index-cmd.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerListCommand } from "./commands/list.js";
import { registerGetCommand } from "./commands/get.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerTraverseCommand } from "./commands/traverse.js";
import { registerRelateCommand } from "./commands/relate.js";
import { registerSuggestEdgesCommand } from "./commands/suggest-edges.js";
import { registerPairsCommand } from "./commands/pairs.js";
import { registerRenumberCommand } from "./commands/renumber.js";
import { registerMergeDriverCommand } from "./commands/merge-driver.js";
import { registerGcCommand } from "./commands/gc.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerAddCommand } from "./commands/add.js";
import { registerSplitCommand } from "./commands/split.js";
import { registerRunCommand } from "./commands/run.js";
import { registerSkillCommand } from "./commands/skill.js";

/**
 * Read from package.json rather than repeating it here. The literal this
 * replaces had drifted a patch version behind, which made `docdog --version`
 * — the dev loop's sanity check that the installed CLI still works — a
 * constant that could not fail: it would report a version against a build
 * that no longer ran at all.
 *
 * `../../` is the package root from `src/cli/` under tsx, from `dist/cli/`
 * in the bundle, and from `dist/cli/` in the published package, so all three
 * modes report the same truth.
 */
const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const program = new Command();

program
  .name("docdog")
  .description("Context management toolkit for AI agents — disk-canonical, MCP-native")
  .version(version);

registerInitCommand(program);
registerIndexCommand(program);
registerServeCommand(program);
registerSearchCommand(program);
registerListCommand(program);
// PROPOSAL-032 — CLI counterparts of the MCP kernel's read trio + relate.
registerGetCommand(program);
registerStatusCommand(program);
registerTraverseCommand(program);
registerRelateCommand(program);
registerSuggestEdgesCommand(program);
// PROPOSAL-049 — similar pairs: nominate and validate, never judge.
registerPairsCommand(program);
// PROPOSAL-031 — the promotion primitive: rename an id, fix every edge.
registerRenumberCommand(program);
// PROPOSAL-030 — plumbing: git invokes this, a user never does.
registerMergeDriverCommand(program);
registerGcCommand(program);
// PROPOSAL-041 — the upgrade path. Absorbs `templates refresh`, which was
// half of this command with a destructive default and a misleading name.
registerUpdateCommand(program);
registerAddCommand(program);
registerSplitCommand(program);
registerRunCommand(program);
registerSkillCommand(program);

// FRICTION-004: top-level error handler. Commander action handlers are
// async; without this, a rejected promise dumps Node's raw unhandled
// rejection stack trace. Print a friendly message instead. Set
// DOCDOG_DEBUG=1 to see the full stack.
//
// FRICTION-020: it ends by setting `process.exitCode`, not by calling
// `process.exit`. Those are not interchangeable. `process.exit` terminates
// before pending writes to stdout and stderr have necessarily reached the
// terminal, and Node documents those streams as synchronous or asynchronous
// depending on the destination — a TTY on Windows, the platform this project
// is developed on, is one of the asynchronous cases. So
// `console.error(msg); process.exit(1)` — Node's own documented example of
// what not to do — can produce a process that exits 1 having said nothing
// about why, which is FRICTION-020's exact signature. The message this
// handler exists to deliver is precisely the one that must not be dropped.
//
// Nothing under `src/` may call `process.exit` for that reason; the invariant
// is pinned by tests/unit/cli-exit.test.ts. Success has always exited this
// way — `index`, `init`, `add` and `update` simply return and let the loop
// drain — so this only makes failure behave the way success already did.
program.parseAsync().catch((err: unknown) => {
  const debug = process.env.DOCDOG_DEBUG === "1" || process.env.DOCDOG_DEBUG === "true";
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "Error";

  console.error(`error: ${message}`);

  if (debug) {
    console.error(`\n[${name}] full stack:`);
    console.error(err instanceof Error && err.stack ? err.stack : err);
  } else {
    console.error("  (set DOCDOG_DEBUG=1 for full stack trace)");
  }

  process.exitCode = 1;
});
