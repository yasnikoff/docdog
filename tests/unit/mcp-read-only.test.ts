/**
 * `serve --read-only` — the corpus-write rail (PROPOSAL-035).
 *
 * The rail is two mechanisms, and the tests cover both independently
 * because either alone is insufficient: the writes are *hidden* from the
 * tool list (a caller cannot attempt what it cannot see), and they are
 * *refused* on call (a client with a cached list, or one calling blind,
 * still reaches the handler).
 */
import { describe, it, expect } from "vitest";
import { visibleTools, readOnlyRefusal, WRITE_TOOLS } from "../../src/mcp/server.js";
import { handleStatus } from "../../src/mcp/tools/status.js";

const READS = ["docdog_search", "docdog_get", "docdog_traverse", "docdog_status", "docdog_index"];
const WRITES = ["docdog_create", "docdog_update", "docdog_relate"];

describe("read-only: the write set", () => {
  it("is exactly the three corpus writes", () => {
    expect([...WRITE_TOOLS].sort()).toEqual([...WRITES].sort());
  });

  it("excludes docdog_index — it writes the disposable cache, never the corpus", () => {
    // PROPOSAL-035 §Open. The rail protects the markdown; the cache is
    // rebuilt from disk on demand (DD-070). Refusing this would cost a
    // read-only agent correctness to protect nothing.
    expect(WRITE_TOOLS.has("docdog_index")).toBe(false);
  });

  it("is derived from the tool definitions, so every kernel tool is classified", () => {
    // Guards the drift this design exists to prevent: a new tool that
    // forgets to declare `write` must not silently land on the read side.
    const all = visibleTools(false).map((t) => t.name).sort();
    expect(all).toEqual([...READS, ...WRITES].sort());
  });
});

describe("read-only: tool visibility", () => {
  it("hides exactly the writes when enabled", () => {
    const names = visibleTools(true).map((t) => t.name).sort();
    expect(names).toEqual([...READS].sort());
  });

  it("shows every tool when disabled — the flag is opt-in", () => {
    expect(visibleTools(false)).toHaveLength(8);
  });

  it("never leaks the internal `write` field to the wire, in either mode", () => {
    for (const t of [...visibleTools(true), ...visibleTools(false)]) {
      expect(t).not.toHaveProperty("write");
    }
  });

  it("leaves the read tools' schemas untouched, including the root selector", () => {
    const search = visibleTools(true).find((t) => t.name === "docdog_search");
    expect(search?.inputSchema.properties).toHaveProperty("root");
    expect(search?.inputSchema.properties).toHaveProperty("query");
  });
});

describe("read-only: refusal", () => {
  it("names the tool, the flag, and every disabled tool", () => {
    const text = readOnlyRefusal("docdog_create").content[0].text ?? "";
    expect(text).toContain("SERVER_READ_ONLY");
    expect(text).toContain("docdog_create");
    expect(text).toContain("--read-only");
    for (const w of WRITES) expect(text).toContain(w);
  });

  it("is an error result, not a silent success", () => {
    // Silently accepting a refused write would be indistinguishable from
    // having written it — the ROOT_NOT_A_PROJECT lesson (PROPOSAL-033).
    expect(readOnlyRefusal("docdog_relate").isError).toBe(true);
  });

  it("tells the caller to report the change rather than route around it", () => {
    const text = readOnlyRefusal("docdog_update").content[0].text ?? "";
    expect(text).toMatch(/report .* to your caller/i);
  });
});

describe("read-only: status reports the mode", () => {
  // A missing cache is a state, not an error (status.ts), so these run
  // against a non-project path and still exercise the mode line.
  const NO_CACHE = "/definitely/not/a/docdog/project";
  const config = { project: { name: "t" }, scan_paths: [] } as never;

  it("says so when read-only, so an agent can state it instead of discovering it", async () => {
    const res = await handleStatus(config, NO_CACHE, { readOnly: true });
    expect(res.content[0].text).toContain("read-only");
  });

  it("stays silent when writable — no line for the default mode", async () => {
    const res = await handleStatus(config, NO_CACHE, { readOnly: false });
    expect(res.content[0].text).not.toContain("read-only");
  });

  it("defaults to writable when the option is omitted", async () => {
    const res = await handleStatus(config, NO_CACHE);
    expect(res.content[0].text).not.toContain("read-only");
  });
});
