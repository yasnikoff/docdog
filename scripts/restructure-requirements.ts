/**
 * Restructure: remove stale §8 and §9 from Requirements page.
 * §8 (Design Decisions) → already a separate page in design category
 * §9 (Open Questions) → all resolved, tracked in system:discussions
 */
import { loadDocdogEnv } from "../src/config/env.js";
loadDocdogEnv();

const API = `http://localhost:${process.env.DOCDOG_PORT ?? 6637}`;
const HEADERS = { "Content-Type": "application/json", "X-Docdog-Project": "docdog" };
const PAGE_ID = "69d225673978e725faa2096f"; // Requirements v3.0

async function main() {
  // 1. Read current page
  const getRes = await fetch(`${API}/v1/pages/${PAGE_ID}`, { headers: HEADERS });
  const page = (await getRes.json() as { data: { content: string; version: number } }).data;
  console.log(`Current version: ${page.version}`);
  console.log(`Content length: ${page.content.length}`);

  // 2. Find §8 and replace §8+§9 with updated note
  const idx8 = page.content.indexOf("\n## 8. Design Decisions");
  if (idx8 === -1) {
    console.error("§8 not found in content");
    process.exit(1);
  }

  const updatedContent = page.content.slice(0, idx8) + `
## 8. Design Decisions

Design decisions are tracked in docdog's \`system:decisions\` collection and exported via \`docdog decisions export\`. The structured decision log (D1–D41+) is maintained as a separate page in the design category.

For the full decision history, query: \`docdog decisions list\` or \`docdog query --text "decision"\`

## 9. Open Questions

All original open questions have been resolved:

1. **Identity hint format** → Resolved (DDL-003): \`<!-- docdog:page id="..." title="..." -->\` with id and title only
2. **\`system:decisions\` export format** → Resolved (DDL-002): markdown with YAML frontmatter, grouped by scope
3. **Backward patch format** → Resolved (DDL-001): unified diff

New questions are tracked as \`system:discussions\` entries. Use \`docdog discuss list\` to view open discussions.
`;

  console.log(`Updated content length: ${updatedContent.length}`);
  console.log(`Removed ${page.content.length - updatedContent.length} characters`);

  // 3. Update via API
  const updateRes = await fetch(`${API}/v1/pages/${PAGE_ID}`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({
      content: updatedContent,
      expectedVersion: page.version,
      changeReason: "Restructure: update §8 and §9 to reference docdog systems instead of stale inline content",
      changedBy: "restructure-script",
    }),
  });

  const result = await updateRes.json() as { ok: boolean; data?: { version: number } };
  if (result.ok) {
    console.log(`Updated to version ${result.data!.version}`);
  } else {
    console.error("Update failed:", JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

main().catch(console.error);
