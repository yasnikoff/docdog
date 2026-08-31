/**
 * Import historical discussion sessions from docs/discussion.md into docdog's
 * system:discussions collection. One-time migration script.
 *
 * Usage: npx tsx scripts/import-discussions.ts
 */
import { readFileSync } from "node:fs";
import { loadDocdogEnv } from "../src/config/env.js";
loadDocdogEnv();

const API_URL = `http://localhost:${process.env.DOCDOG_PORT ?? 6637}`;

interface ParsedSession {
  number: number;
  title: string;
  date: string;
  status: "open" | "resolved";
  content: string;
}

function parseSessions(markdown: string): ParsedSession[] {
  const sessions: ParsedSession[] = [];
  // Split on session headers: ## Session N — Title
  const sessionPattern = /^## Session (\d+) — (.+)$/gm;
  const matches = [...markdown.matchAll(sessionPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const number = parseInt(match[1]);
    const title = match[2].trim();
    const startIdx = match.index! + match[0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : markdown.length;
    const content = markdown.slice(startIdx, endIdx).trim();

    // Extract date
    const dateMatch = content.match(/\*\*Date:\*\* (\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] ?? "2026-04-05";

    // Determine status
    const statusMatch = content.match(/\*\*Status:\*\* (\w+)/);
    const status = statusMatch?.[1] === "open" ? "open" : "resolved";

    sessions.push({ number, title, date, status, content });
  }

  return sessions;
}

async function apiCall(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Docdog-Project": "docdog" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  console.log("Parsing docs/discussion.md...");
  const markdown = readFileSync("docs/discussion.md", "utf-8");
  const sessions = parseSessions(markdown);
  console.log(`Found ${sessions.length} sessions.`);

  let imported = 0;
  let skipped = 0;

  for (const session of sessions) {
    // Create discussion
    const createResult = await apiCall("POST", "/v1/discussions", {
      title: `Session ${session.number}: ${session.title}`,
      description: `Historical discussion session ${session.number} imported from docs/discussion.md (${session.date})`,
      createdBy: "import-script",
    }) as { ok: boolean; data?: { _id: string } };

    if (!createResult.ok) {
      console.error(`  Failed to create discussion for session ${session.number}`);
      skipped++;
      continue;
    }

    const discId = createResult.data!._id;

    // Add the session content as a single agent entry
    await apiCall("POST", `/v1/discussions/${discId}/entries`, {
      role: "agent",
      content: session.content,
    });

    // If resolved, resolve the discussion
    if (session.status === "resolved") {
      await apiCall("POST", `/v1/discussions/${discId}/resolve`, {
        title: `Session ${session.number} resolved: ${session.title}`,
        rationale: `Historical resolution from discussion session ${session.number}`,
        scope: "historical",
        decidedBy: "import-script",
      });
    }

    imported++;
    process.stdout.write(`  Imported session ${session.number}: ${session.title.slice(0, 50)}${session.title.length > 50 ? "..." : ""} [${session.status}]\n`);
  }

  console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}`);

  // Verify
  const discussions = await apiCall("GET", "/v1/discussions?status=all") as { data: unknown[] };
  console.log(`Total discussions in DB: ${discussions.data?.length ?? 0}`);
}

main().catch(console.error);
