/**
 * Shared CLI parsing for the vertex filters `search` and `list` both take.
 *
 * The two commands apply the same predicate (`vertexFilters` in
 * storage/search.ts), so they must also *accept* it the same way — a
 * `--where` that coerced differently between them would be a filter that
 * means one thing when you rank and another when you enumerate.
 */
import { parse as parseYaml } from "yaml";

/** `--status a,b,c` → ["a","b","c"]; empty/absent → undefined (no filter). */
export function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

/** commander reducer for a repeatable option. */
export function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Every occurrence of a repeatable CSV option, flattened (FRICTION-038).
 *
 * These flags used to take a single `<list>` string, which meant repeating
 * one silently kept only the last: `--exclude-status shipped
 * --exclude-status superseded` excluded superseded alone and returned a
 * plausible number. Accumulating is tier-1 mechanics and makes the natural
 * guess correct, so both spellings now mean the same thing. It does not
 * replace validating the values — an inert filter and a mis-parsed one look
 * identical from the outside, which is why FRICTION-038 needed both halves.
 */
export function splitCsvAll(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const parts = values.flatMap((v) => splitCsv(v) ?? []);
  return parts.length > 0 ? [...new Set(parts)] : undefined;
}

/**
 * `--where key=value` pairs → the `where` map (PROPOSAL-027).
 * Values parse as YAML scalars so `true`/`3` coerce like frontmatter
 * itself would; quoting forces a string.
 */
export function parseWherePairs(
  pairs: string[],
): Record<string, string | number | boolean> | undefined {
  if (pairs.length === 0) return undefined;
  const where: Record<string, string | number | boolean> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`--where expects key=value, got: ${pair}`);
    }
    const key = pair.slice(0, eq).trim();
    const rawValue = pair.slice(eq + 1);
    const value = parseYaml(rawValue) as unknown;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`--where ${key}: value must be a YAML scalar, got: ${rawValue}`);
    }
    where[key] = value;
  }
  return where;
}
