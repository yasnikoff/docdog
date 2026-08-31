/**
 * A reserved `where` key must have the parameter it names (FRICTION-050).
 *
 * `WHERE_DEDICATED_PARAMS` makes `--where collection=…` an error whose text
 * is a promise: *use the dedicated "collection" parameter*. That promise is
 * only true where the parameter exists, and it stopped being true for
 * `scope` on every read surface — CLI `search`, CLI `list` and
 * `docdog_search` — while `vertexFilters` implemented the filter in full,
 * DD-058 default and all. The dedicated parameter the message named lived
 * only on the *writes* (`docdog_create`, `docdog_update`), so the message
 * was right about the corpus vocabulary and wrong about the surface, and the
 * one route to a working filter was the one it closed. Nobody noticed
 * because it only fails for a caller who reaches for `where` after finding
 * the parameter absent — everyone else concludes scope is not filterable.
 *
 * So this walks the reserved set against the surfaces rather than asserting
 * three literal flags: the invariant is *every* reserved key has a door, and
 * the next name added to that set should fail here rather than ship an error
 * message that lies.
 *
 * The CLI half builds the commands on a throwaway `Command` — the registrars
 * are pure registration, and `src/cli/index.ts` itself calls `parseAsync` at
 * module scope and so cannot be imported.
 */
import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { WHERE_DEDICATED_PARAMS } from "../../src/storage/search.js";
import { registerSearchCommand } from "../../src/cli/commands/search.js";
import { registerListCommand } from "../../src/cli/commands/list.js";
import { visibleTools } from "../../src/mcp/server.js";

/**
 * What "has a dedicated parameter" means per key. `status` is the one that
 * is not a rename: it is refused on behalf of a *pair*, because an allowlist
 * and a blocklist are two filters over one field, and the refusal names both.
 */
const CLI_FLAGS: Record<string, string[]> = {
  collection: ["--collection"],
  status: ["--status", "--exclude-status"],
  scope: ["--scope"],
};
const MCP_PROPS: Record<string, string[]> = {
  collection: ["collection"],
  status: ["status", "exclude_status"],
  scope: ["scope"],
};

function optionsOf(register: (p: Command) => void, name: string): string[] {
  const program = new Command();
  register(program);
  const cmd = program.commands.find((c) => c.name() === name);
  expect(cmd, `no "${name}" command was registered`).toBeDefined();
  return cmd!.options.map((o) => o.long ?? o.short ?? "");
}

describe("every reserved where key has the parameter its refusal names", () => {
  const reserved = [...WHERE_DEDICATED_PARAMS].sort();

  it("knows which keys are reserved", () => {
    // Guards the sweep passing because the set came back empty.
    expect(reserved).toEqual(["collection", "scope", "status"]);
  });

  it("maps every reserved key to a surface parameter", () => {
    // The tables above are hand-written; this is what keeps them honest when
    // a key is added to the set and nowhere else.
    for (const key of reserved) {
      expect(CLI_FLAGS[key], `no CLI flag recorded for where.${key}`).toBeDefined();
      expect(MCP_PROPS[key], `no MCP property recorded for where.${key}`).toBeDefined();
    }
  });

  const surfaces: Array<{ label: string; flags: string[] }> = [
    { label: "docdog search", flags: optionsOf(registerSearchCommand, "search") },
    { label: "docdog list", flags: optionsOf(registerListCommand, "list") },
  ];

  for (const surface of surfaces) {
    for (const key of reserved) {
      for (const flag of CLI_FLAGS[key] ?? []) {
        it(`${surface.label} accepts ${flag}`, () => {
          expect(surface.flags).toContain(flag);
        });
      }
    }
  }

  const searchTool = visibleTools(false).find((t) => t.name === "docdog_search");

  for (const key of reserved) {
    for (const prop of MCP_PROPS[key] ?? []) {
      it(`docdog_search declares "${prop}"`, () => {
        const properties = searchTool?.inputSchema.properties as Record<string, unknown>;
        expect(properties).toBeDefined();
        expect(Object.keys(properties)).toContain(prop);
      });
    }
  }
});

/**
 * The presence filters reach every read surface too (FRICTION-045).
 *
 * Not part of the sweep above, because `has` / `lacks` are not reserved `where`
 * keys and never will be — they take a *field name* rather than replacing one,
 * so no refusal points at them. But they are a filter added to three surfaces
 * at once, and the failure FRICTION-050 pinned is precisely a filter that
 * exists in `vertexFilters` and on only some of the doors. The reserved-key
 * sweep would not have caught that; this does.
 */
describe("the presence filters exist wherever records are read", () => {
  const cli = [
    { label: "docdog search", flags: optionsOf(registerSearchCommand, "search") },
    { label: "docdog list", flags: optionsOf(registerListCommand, "list") },
  ];

  for (const surface of cli) {
    for (const flag of ["--has", "--lacks"]) {
      it(`${surface.label} accepts ${flag}`, () => {
        expect(surface.flags).toContain(flag);
      });
    }
  }

  for (const prop of ["has", "lacks"]) {
    it(`docdog_search declares "${prop}"`, () => {
      const tool = visibleTools(false).find((t) => t.name === "docdog_search");
      const properties = tool?.inputSchema.properties as Record<string, unknown>;
      expect(Object.keys(properties)).toContain(prop);
    });
  }
});
