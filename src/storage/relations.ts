/**
 * Relations registry from the cache — the session-4 load-source
 * decision, option (b): relation metadata loads from the cache's
 * `concepts` rows. Those rows are derived from the re-seeded DP-002
 * records on disk (.docdog/concepts/relation-*.md, DD-070 §7.3) —
 * `collection: concepts`, `concept_kind: relation` — so the
 * disk-canonical source feeds label resolution with no DB seeding.
 * Resolution itself stays in src/engine/relations-registry.ts.
 *
 * Rows that aren't relation concepts (concept_kind: collection) or
 * lack a usable `name:` are skipped; unknown relationship types
 * resolve with known=false inside the registry.
 */
import type Database from "better-sqlite3";
import {
  RelationsRegistry,
  type RelationRoutingEntry,
} from "../engine/relations-registry.js";

export function loadRegistryFromCache(db: Database.Database): RelationsRegistry {
  const rows = db
    .prepare(`SELECT frontmatter_json FROM vertices WHERE collection = 'concepts'`)
    .all() as Array<{ frontmatter_json: string }>;

  const entries: RelationRoutingEntry[] = [];
  for (const row of rows) {
    let fm: Record<string, unknown>;
    try {
      fm = JSON.parse(row.frontmatter_json) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (fm.concept_kind !== "relation" || typeof fm.name !== "string" || fm.name === "") {
      continue;
    }
    entries.push({
      name: fm.name,
      inverse_label:
        typeof fm.inverse_label === "string" && fm.inverse_label !== ""
          ? fm.inverse_label
          : fm.name,
      symmetric: fm.symmetric === true,
    });
  }
  return RelationsRegistry.fromEntries(entries);
}
