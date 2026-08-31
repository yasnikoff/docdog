#!/usr/bin/env node
/**
 * Compute the next TASK-NNN id. PROPOSAL-016, v3 shape (DD-070): disk
 * is canonical, so the scan of `tasks/` IS the authoritative answer —
 * the v2 DB leg is gone.
 *
 * Output: prints the next id (e.g. `TASK-053`) to stdout.
 * No side effects. No files written. Caller decides what to do next.
 *
 * Run as: `docdog run next-task-id`
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TASK_PATTERN = /^TASK-(\d+)$/i;

function scanDisk(projectRoot) {
  const tasksDir = join(projectRoot, "tasks");
  if (!existsSync(tasksDir)) return 0;
  let max = 0;
  for (const name of readdirSync(tasksDir)) {
    const m = TASK_PATTERN.exec(name);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

function main() {
  const projectRoot = process.env.DOCDOG_PROJECT_ROOT ?? process.cwd();
  const next = scanDisk(projectRoot) + 1;
  const padded = String(next).padStart(3, "0");
  process.stdout.write(`TASK-${padded}\n`);
}

main();
