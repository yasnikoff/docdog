import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DOCDOG_HOME = join(homedir(), ".docdog");
const SYSTEM_ENV_PATH = join(DOCDOG_HOME, "env");

/**
 * Load environment variables with proper precedence:
 * 1. ~/.docdog/env (system-level, lowest priority)
 * 2. .env.local (project-level, medium priority)
 * 3. Existing env vars (highest priority, already set)
 *
 * Call this early in both server and CLI entry points.
 */
export function loadDocdogEnv(projectRoot?: string): void {
  const projectEnv = projectRoot
    ? join(projectRoot, ".env.local")
    : join(process.cwd(), ".env.local");

  const envState = new Map<string, string>();

  // 1. System env (lowest)
  readEnvInto(SYSTEM_ENV_PATH, envState);
  // 2. Project env (overrides system)
  readEnvInto(projectEnv, envState);

  // Apply: only set if not already in process.env
  for (const [key, value] of envState) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readEnvInto(filePath: string, target: Map<string, string>): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    target.set(key, value); // later calls override earlier
  }
}

export { DOCDOG_HOME, SYSTEM_ENV_PATH };
