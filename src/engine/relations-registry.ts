/**
 * Run-scoped relationship type registry.
 *
 * V3 (DD-070): relation metadata is disk-canonical — concept records
 * under `.docdog/concepts/relation-*.md` — and loads from their cache
 * rows via src/storage/relations.ts. The registry resolves display
 * semantics only: inverse labels for INBOUND edges and the symmetric
 * flag. The v2 `dd_edges_*` routing collection died with Arango
 * (edges live in one cache table — DD-070 §2 / OQ-20).
 *
 * A single run loads the registry once into memory; writes to concept
 * records during the run are not re-read — a subsequent run picks
 * them up.
 */

export interface RelationRoutingEntry {
  name: string;
  symmetric: boolean;
  inverse_label: string;
}

export interface RegistryLookup {
  type: string;
  symmetric: boolean;
  inverse_label: string;
  known: boolean;
}

export class RelationsRegistry {
  private readonly byType: Map<string, RelationRoutingEntry>;

  private constructor(entries: RelationRoutingEntry[]) {
    this.byType = new Map(entries.map((e) => [e.name, e]));
  }

  /** Build a registry from an in-memory list — the cache loader and tests. */
  static fromEntries(entries: RelationRoutingEntry[]): RelationsRegistry {
    return new RelationsRegistry(entries);
  }

  /**
   * Resolve a type name. Unknown types resolve with known=false so
   * callers can emit the warning aggregation described in
   * PROPOSAL-003 §Open questions (3); the type itself is still used
   * verbatim (the registry is advisory, never blocking).
   */
  lookup(type: string): RegistryLookup {
    const entry = this.byType.get(type);
    if (entry) {
      return {
        type,
        symmetric: entry.symmetric,
        inverse_label: entry.inverse_label,
        known: true,
      };
    }
    return {
      type,
      symmetric: false,
      inverse_label: type,
      known: false,
    };
  }

  has(type: string): boolean {
    return this.byType.has(type);
  }

  size(): number {
    return this.byType.size;
  }

  /** Registered type names, sorted — a vocabulary to show, e.g. to a judge. */
  names(): string[] {
    return [...this.byType.keys()].sort();
  }

  /**
   * Given a querying vertex and an edge, return the effective type
   * the caller should display (PROPOSAL-003 §8.1). Pure mechanical
   * lookup — DP-001 Tier 1.
   */
  effectiveType(
    edge: { _from: string; _to: string; type: string },
    queryingVertexId: string,
  ): { effective_type: string; direction: "OUTBOUND" | "INBOUND" } {
    if (edge._from === queryingVertexId) {
      return { effective_type: edge.type, direction: "OUTBOUND" };
    }
    const entry = this.byType.get(edge.type);
    if (!entry || entry.symmetric) {
      return { effective_type: edge.type, direction: "INBOUND" };
    }
    return { effective_type: entry.inverse_label, direction: "INBOUND" };
  }
}
