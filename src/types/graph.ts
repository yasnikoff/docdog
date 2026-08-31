/**
 * Graph-shaped types that survive v3 (DD-070). The v2 Arango document
 * shapes (VertexBase, EdgeBase, …) died with src/arango/ — cache row
 * shapes live beside their tables in src/storage/.
 */

/**
 * Relevance signals for a search result. Each field names the method that produced it.
 * A single `score` field would imply a unified, authoritative verdict — this object
 * is explicit that relevance is multi-signal.
 *
 * Agents should treat these as informative hints, not authoritative rankings.
 * Cosine similarity does not equal conceptual relevance.
 */
export interface Relevance {
  /** Cosine similarity from vector search (0–1). Present when the vector leg matched. */
  vector_search?: number;
  /**
   * BM25 relevance from the cache's FTS5 leg. Positive, higher =
   * better (FTS5's `rank` is negative-better; this is its negation).
   * Present when the keyword leg matched.
   */
  keyword_bm25?: number;
}
