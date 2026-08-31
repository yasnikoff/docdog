import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  sourcemap: true,
  clean: true,
  splitting: false,
  // Dependencies are external by default (not bundled)
});
