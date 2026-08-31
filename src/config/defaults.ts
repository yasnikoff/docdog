import type { DocdogConfig, ScanPathConfig, ScanPathEntry } from "../types/config.js";

/**
 * Normalize a scan_paths entry into its full ScanPathConfig shape.
 * String entries become { path, parser: "default" }.
 */
export function normalizeScanPath(entry: ScanPathEntry): ScanPathConfig {
  if (typeof entry === "string") {
    return { path: entry, parser: "default" };
  }
  return { ...entry, parser: entry.parser ?? "default" };
}

export const defaultConfig: DocdogConfig = {
  project: {
    name: "",
  },
  scan_paths: ["specs/"],
  vertex_collections: [],
  default_collection: null,
  git: {
    enabled: true,
    canonical_branch: "main",
  },
  embed: {
    provider: "onnx",
    model: "nomic-ai/nomic-embed-text-v1",
    ollama_url: "http://localhost:11434",
    // OBS-026. Both are written into a fresh config.yaml by `docdog init`
    // (it serializes this block verbatim), which is what makes them
    // visible defaults rather than hidden ones — the DP-001 tier 2
    // distinction is whether a user can *see* the knob, not whether one
    // exists. An adopting project whose config predates these keys reads
    // the same values through `??` at each use site.
    auto_gc: true,
    retain_days: 7,
  },
  search: {
    preview_length: 600,
  },
};
