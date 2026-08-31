/**
 * PROPOSAL-014: MCP tool responses carry `next_actions` hints.
 *
 * Per-tool templates are hardcoded — no inference. The agent decides
 * whether to follow up. DP-001 Tier 2 (visible default with override).
 *
 * Hints are advisory metadata: MCP clients that understand the field
 * render them as suggested calls; clients that don't ignore the field.
 * A text fallback is also appended to `content[0].text` so minimal
 * clients still see the hints.
 */

export interface NextAction {
  tool: string;
  args: Record<string, unknown>;
  hint: string;
}

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  next_actions?: NextAction[];
}

export function withNextActions<T extends McpToolResult>(
  result: T,
  actions: NextAction[],
): T & { next_actions?: NextAction[] } {
  if (result.isError || actions.length === 0) return result;

  const first = result.content[0];
  if (first && first.type === "text") {
    first.text = `${first.text}\n\n${renderFallback(actions)}`;
  }

  return { ...result, next_actions: actions };
}

function renderFallback(actions: NextAction[]): string {
  const lines = ["---", "Next actions you could take:"];
  for (const a of actions) {
    const argStr = Object.entries(a.args)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ");
    lines.push(`  • ${a.tool}(${argStr}) — ${a.hint}`);
  }
  return lines.join("\n");
}
