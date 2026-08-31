/**
 * Mechanical mutations to `.docdog/config.yaml`.
 *
 * These helpers read the raw YAML, mutate one field, and write it back.
 * Deliberately minimal: no normalization, no reformatting, no comment
 * preservation beyond what the yaml library already gives us. PROPOSAL-015
 * uses this for `docdog collections add` so newly-added user collections
 * land in config without a separate manual edit.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

function configPathFor(projectRoot: string): string {
  return join(projectRoot, ".docdog", "config.yaml");
}

function readRaw(projectRoot: string): Record<string, unknown> {
  const path = configPathFor(projectRoot);
  if (!existsSync(path)) {
    throw new Error(`No .docdog/config.yaml found in ${projectRoot}`);
  }
  const raw = readFileSync(path, "utf-8");
  return (parseYaml(raw) as Record<string, unknown>) ?? {};
}

function writeRaw(projectRoot: string, doc: Record<string, unknown>): void {
  writeFileSync(configPathFor(projectRoot), stringifyYaml(doc), "utf-8");
}

/**
 * Flip `code_refs.enabled` in config.yaml (PROPOSAL-005). Writes the
 * full `code_refs` block if missing so the user sees visible defaults.
 * Returns true if the file was modified.
 */
export function setCodeRefsEnabled(
  projectRoot: string,
  enabled: boolean,
  defaults: Record<string, unknown>,
): boolean {
  const doc = readRaw(projectRoot);
  const existing =
    typeof doc.code_refs === "object" && doc.code_refs !== null
      ? (doc.code_refs as Record<string, unknown>)
      : null;
  if (existing && existing.enabled === enabled) return false;
  doc.code_refs = existing ? { ...existing, enabled } : { ...defaults, enabled };
  writeRaw(projectRoot, doc);
  return true;
}

/**
 * Append a collection name to `vertex_collections` in config.yaml if it
 * isn't already there. Returns true if the file was modified.
 *
 * The caller is responsible for deciding whether the name is actually a
 * user collection (i.e. not already in the template-shipped set) — this
 * helper doesn't try to guess.
 */
export function appendUserVertexCollection(
  projectRoot: string,
  name: string,
): boolean {
  const doc = readRaw(projectRoot);
  const current = Array.isArray(doc.vertex_collections)
    ? (doc.vertex_collections as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (current.includes(name)) return false;
  doc.vertex_collections = [...current, name];
  writeRaw(projectRoot, doc);
  return true;
}
