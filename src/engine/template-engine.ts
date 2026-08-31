import type { DocdogConfig } from "../types/config.js";

/**
 * Resolve {{config:*}} template variables against a DocdogConfig.
 *
 * Syntax: {{config:path.to.value}}
 * Examples:
 *   {{config:export.outputDir}} → "docs/"
 *   {{config:project.name}} → "my-app"
 *   {{config:api.port}} → "6637"
 *
 * Unresolved variables are left as-is (no silent swallowing).
 */
export function resolveTemplates(input: string, config: DocdogConfig): string {
  return input.replace(/\{\{config:([a-zA-Z0-9_.]+)\}\}/g, (_match, path: string) => {
    const value = getNestedValue(config as unknown, path);
    if (value === undefined) return _match; // leave unresolved
    return String(value);
  });
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * List all template variables found in a string.
 */
export function findTemplateVars(input: string): string[] {
  const matches = input.matchAll(/\{\{config:([a-zA-Z0-9_.]+)\}\}/g);
  return [...matches].map((m) => m[1]);
}
