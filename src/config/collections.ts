/**
 * Collection-name resolution from config — pure config mechanics,
 * no storage dependency.
 *
 * A "collection" in v3 is a config-declared record type routed from
 * frontmatter `collection:` (DD-070 §6 restating DD-046's survival);
 * it materializes as a column value in the cache's vertices table,
 * not as a physical table. These helpers resolve the declared set:
 * system ∪ template-shipped ∪ config.vertex_collections.
 */
import type { DocdogConfig } from "../types/config.js";
import { getTemplateCollections } from "./templates.js";

// System vertex collections — docdog machinery, never user content.
// Currently empty: the sole v2-era entry (dd_patches, DD-050 tier-3
// pre-wiring) was removed as dormant with OQ-26's closure (RECON-001).
// The dd_ prefix remains reserved either way — the writes guard
// refuses creating records in any dd_* collection.
export const SYSTEM_VERTEX_COLLECTIONS = [] as const;

export type SystemVertexCollectionName = typeof SYSTEM_VERTEX_COLLECTIONS[number];

/**
 * All vertex collection names for this config:
 * system ∪ template-shipped ∪ config.vertex_collections.
 *
 * PROPOSAL-015 introduced the template-shipped tier so that shipped
 * user-facing collections don't have to be duplicated into every
 * project's `vertex_collections`. Legacy projects that still list the
 * full shipped set in config keep working — the set-union dedupes.
 */
export function getVertexCollections(config: DocdogConfig): string[] {
  const shipped = getTemplateCollections(config.template);
  const user = config.vertex_collections ?? [];
  const all = [...SYSTEM_VERTEX_COLLECTIONS, ...shipped, ...user];
  return [...new Set(all)];
}

/**
 * Classify a vertex collection by its lifecycle source.
 * PROPOSAL-015.
 */
export type VertexCollectionSource = "system" | "shipped" | "user";

export function getVertexCollectionSource(
  name: string,
  config: DocdogConfig,
): VertexCollectionSource {
  if ((SYSTEM_VERTEX_COLLECTIONS as readonly string[]).includes(name)) return "system";
  if (getTemplateCollections(config.template).includes(name)) return "shipped";
  return "user";
}

/**
 * Check whether a collection name is known (system or user-declared).
 */
export function isKnownVertexCollection(name: string, config: DocdogConfig): boolean {
  return getVertexCollections(config).includes(name);
}

/**
 * The default collection for files that can't be routed via frontmatter or directory name.
 * Returns null if no default is configured — indexer should skip with a warning.
 */
export function getDefaultCollection(config: DocdogConfig): string | null {
  const dc = config.default_collection;
  if (!dc) return null;
  // Must be in the resolved union (template-shipped + user-declared).
  if (!getVertexCollections(config).includes(dc)) return null;
  return dc;
}
