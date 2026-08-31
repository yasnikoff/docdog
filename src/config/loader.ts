import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DocdogConfig } from "../types/config.js";
import { defaultConfig } from "./defaults.js";

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== undefined && val !== null) {
      if (
        typeof val === "object" &&
        !Array.isArray(val) &&
        typeof result[key] === "object" &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          val as Record<string, unknown>,
        );
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

function readYamlFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  return (parseYaml(content) as Record<string, unknown>) ?? {};
}

function applyEnvOverrides(config: DocdogConfig): DocdogConfig {
  const env = process.env;
  if (env.DOCDOG_PROJECT_NAME) config.project.name = env.DOCDOG_PROJECT_NAME;
  if (env.DOCDOG_EMBED_PROVIDER) {
    config.embed.provider = env.DOCDOG_EMBED_PROVIDER as "onnx" | "ollama";
  }
  if (env.DOCDOG_OLLAMA_URL) config.embed.ollama_url = env.DOCDOG_OLLAMA_URL;
  return config;
}

export function findProjectRoot(from: string = process.cwd()): string | null {
  let dir = resolve(from);
  while (true) {
    if (existsSync(join(dir, ".docdog", "config.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

// V2-era keys (arango, gc, edge_collections, code_refs, version) merge
// through harmlessly — nothing reads them. Existing config.yaml files
// keep loading without warnings.
export function loadConfig(projectRoot?: string): DocdogConfig {
  const root = projectRoot ?? findProjectRoot() ?? process.cwd();

  const configPath = join(root, ".docdog", "config.yaml");
  const localConfigPath = join(root, ".docdog", "config.local.yaml");

  const fileConfig = readYamlFile(configPath);
  const localConfig = readYamlFile(localConfigPath);

  const baseObj = JSON.parse(JSON.stringify(defaultConfig)) as Record<string, unknown>;
  const merged = deepMerge(deepMerge(baseObj, fileConfig), localConfig);
  let config = merged as unknown as DocdogConfig;
  config = applyEnvOverrides(config);

  return config;
}
