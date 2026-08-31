import { describe, it, expect } from "vitest";
import { withNextActions, type NextAction } from "../../src/mcp/next-actions.js";

describe("withNextActions", () => {
  const actions: NextAction[] = [
    { tool: "docdog_traverse", args: { vertex_id: "decisions/42" }, hint: "explore" },
    { tool: "docdog_get", args: { id: "DD-01" }, hint: "read full" },
  ];

  it("attaches next_actions to a successful result", () => {
    const result = withNextActions(
      { content: [{ type: "text", text: "body" }] },
      actions,
    );
    expect(result.next_actions).toEqual(actions);
  });

  it("appends a fallback block to content[0].text", () => {
    const result = withNextActions(
      { content: [{ type: "text", text: "body" }] },
      actions,
    );
    const text = result.content[0].text;
    expect(text).toContain("body");
    expect(text).toContain("Next actions you could take:");
    expect(text).toContain("docdog_traverse(vertex_id=\"decisions/42\")");
    expect(text).toContain("— explore");
    expect(text).toContain("docdog_get(id=\"DD-01\")");
  });

  it("is a no-op on error results", () => {
    const result = withNextActions(
      { content: [{ type: "text", text: "boom" }], isError: true },
      actions,
    );
    expect(result.next_actions).toBeUndefined();
    expect(result.content[0].text).toBe("boom");
  });

  it("is a no-op on empty actions", () => {
    const result = withNextActions(
      { content: [{ type: "text", text: "body" }] },
      [],
    );
    expect(result.next_actions).toBeUndefined();
    expect(result.content[0].text).toBe("body");
  });

  it("preserves the original content type field", () => {
    const result = withNextActions(
      { content: [{ type: "text", text: "body" }] },
      actions,
    );
    expect(result.content[0].type).toBe("text");
  });
});
