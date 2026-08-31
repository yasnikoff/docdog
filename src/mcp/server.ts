/**
 * Docdog MCP server.
 * Exposes docdog capabilities as MCP tools to any compatible agent.
 * DD-048: AI-first interface, provider-neutral tools.
 * OQ-18: MCP tool API surface.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ProjectResolver, ProjectResolutionError } from "./project-resolver.js";
import { handleSearch } from "./tools/search.js";
import { handleGet } from "./tools/get.js";
import { handleTraverse } from "./tools/traverse.js";
import { handleRelate } from "./tools/relate.js";
import { handleIndex } from "./tools/index-tool.js";
import { handleStatus } from "./tools/status.js";
import { captureBoot } from "../engine/vintage.js";
import { handleCreate } from "./tools/create.js";
import { handleUpdate } from "./tools/update.js";

export interface McpServerOptions {
  /**
   * The project a call acts on when it passes no `root` (PROPOSAL-033).
   * Resolved once at boot from the server's cwd, or pinned via `serve --root`.
   * `null` is legal: a server started outside any docdog project still runs,
   * and every call must then name its `root`.
   */
  defaultRoot: string | null;
  /**
   * Refuse the corpus writes — `docdog_create`, `docdog_update`,
   * `docdog_relate` (PROPOSAL-035). Set by `serve --read-only`.
   *
   * Why this lives here and not in the caller's agent definition: hosts
   * disagree on per-agent tool restriction, and one major host (Cursor)
   * cannot express it at all — its only control blocks MCP entirely, so
   * there is no host configuration in which an agent reads the corpus but
   * does not write it. A rail in the server holds on every host, and no
   * instruction can talk a process out of a refusal.
   *
   * Scope, stated honestly: this refuses *docdog's* write tools. It is not
   * a filesystem sandbox — an agent holding ordinary file-write tools can
   * still edit markdown by hand. Sandboxing the filesystem is the host's
   * job; docdog's job is its own surface.
   */
  readOnly?: boolean;
}

/**
 * The per-call project selector, added to every kernel tool (PROPOSAL-033).
 * Optional inside a docdog project, required outside one — which is why the
 * single-repo caller never types it.
 */
const ROOT_PROPERTY = {
  root: {
    type: "string",
    description:
      "Absolute path to the docdog project this call acts on (or any directory inside it). Omit it to use the project the server was started in. Required when the server was started outside a docdog project. A path that is not a docdog project is an error — it never falls back.",
  },
} as const;

const BASE_TOOL_DEFINITIONS = [
  {
    name: "docdog_search",
    write: false,
    description:
      "Hybrid search across all indexed sections: BM25 keyword ranking fused with semantic vector similarity. Use this to find context before starting work on a task. Filter by status to exclude proposed/draft records when you only want committed decisions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        collection: {
          type: "string",
          description: "Limit to a specific collection, named exactly as this corpus defines it (e.g. decisions, notes, proposals — a project may namespace them, e.g. upstream-decisions). A name no collection uses is refused with UNKNOWN_COLLECTION listing the valid ones, not silently emptied. Run docdog_status to see the corpus's collections.",
        },
        scope: {
          type: "string",
          description: "Limit to a visibility scope (DD-058). A record that declares no scope counts as \"shared\", so scope=\"shared\" includes them. Unlike collection and status this is a free string with no registered vocabulary, so a value nothing carries returns an honest empty rather than a refusal — docdog_status rosters the scopes in use.",
        },
        status: {
          type: "array",
          items: { type: "string" },
          description: "Allowlist — return only vertices whose status is one of these (e.g. [\"accepted\", \"current\"]). A value no record carries and no collection concept declares is refused with UNKNOWN_STATUS listing the real ones, not silently emptied. Run docdog_status to see the corpus's statuses.",
        },
        exclude_status: {
          type: "array",
          items: { type: "string" },
          description: "Blocklist — exclude vertices whose status is one of these (e.g. [\"proposed\", \"draft\"]). Refused the same way as status: an exclusion naming nothing would return the whole corpus looking like a query that worked.",
        },
        where: {
          type: "object",
          additionalProperties: { type: ["string", "number", "boolean"] },
          description:
            "Equality filters over arbitrary top-level frontmatter fields, e.g. {\"severity\": \"blocks-work\", \"is_outdated\": true}. Records lacking the field never match. collection/status/scope have dedicated parameters and are refused here. So is a field the corpus stores as a list (tags, related, topics): equality cannot match a member, and WHERE_NOT_SCALAR says so rather than returning an empty result you would read as an answer.",
        },
        has: {
          type: "array",
          items: { type: "string" },
          description: "Require these top-level frontmatter fields to be present, e.g. [\"upstream_issue\"]. Unlike where, this never compares against the value, so a list field (tags, related) is answerable here.",
        },
        lacks: {
          type: "array",
          items: { type: "string" },
          description: "Require these top-level frontmatter fields to be absent — the exact complement of has, and the only way to ask which records a convention has not reached yet (\"which open frictions have no upstream_issue\"). A field written with no value counts as absent, so has and lacks partition the corpus. A field no record carries is NOT refused: returning everything is the correct answer on the day a convention is invented.",
        },
        limit: { type: "number", description: "Max results (default: 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "docdog_get",
    write: false,
    description:
      "Get a specific section by its ID (e.g. DD-070, FR-001, DP-002). Returns full content + metadata.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Record id (e.g. DD-070)" },
      },
      required: ["id"],
    },
  },
  {
    name: "docdog_traverse",
    write: false,
    description:
      "Follow relationship edges from a vertex to discover related sections. Use after docdog_get or docdog_search to explore a decision's context cluster.",
    inputSchema: {
      type: "object",
      properties: {
        vertex_id: { type: "string", description: "Record id of the starting vertex (e.g. DD-070)" },
        depth: { type: "number", description: "Traversal depth (default: 1, max: 3)" },
        direction: {
          type: "string",
          enum: ["outbound", "inbound", "any"],
          description: "Edge direction (default: any)",
        },
      },
      required: ["vertex_id"],
    },
  },
  {
    name: "docdog_relate",
    write: true,
    description:
      "Record an outbound relationship from a section you directly worked with. File-first: patches the source record's `relationships:` frontmatter block and reindexes that file — the edge is born in the file, not a database. Outbound only (EJ-004) — do NOT claim edges from sections you did not directly read. Registered types are concepts records: search with docdog_search (collection: \"concepts\") or get CONCEPT-RELATION-<TYPE>.",
    inputSchema: {
      type: "object",
      properties: {
        from_id: { type: "string", description: "Record id of the source (e.g. DD-070)" },
        to_id: { type: "string", description: "Record id of the target (e.g. PROPOSAL-023)" },
        type: {
          type: "string",
          description: "Relationship type name (e.g. references, supersedes, implements). Unknown types are recorded with a warning.",
        },
        role: {
          type: "string",
          description: "Legacy alias for `type`, accepted for backwards compatibility.",
        },
        context: { type: "string", description: "One-line factual summary of what connects these two sections" },
        anchor_text: {
          type: "string",
          description: "The exact text in the source that references the target (optional)",
        },
        allow_cross_visibility: {
          type: "boolean",
          description:
            "Write the edge even though the target's file will not be in a clone of this repository. Refused by default: the edge would publish the target's id and leave every clone a pointer to a record it does not have. Prefer recording the relationship on the target instead — traverse reads inbound edges, so nothing is lost.",
        },
      },
      required: ["from_id", "to_id", "context"],
    },
  },
  {
    // `write: false` deliberately (PROPOSAL-035 §Open). Indexing writes the
    // *cache*, never the corpus — and the cache is disposable derived state
    // rebuilt from disk on demand (DD-070). The rail exists to protect the
    // markdown, so refusing this would cost a read-only agent correctness
    // (stale answers after someone else's edit) to protect nothing.
    name: "docdog_index",
    write: false,
    description:
      "Trigger incremental re-index of changed section files. Use after adding or editing spec files. Pass full=true for a complete rebuild.",
    inputSchema: {
      type: "object",
      properties: {
        full: { type: "boolean", description: "Full rebuild (default: false)" },
        path: { type: "string", description: "Index only this path" },
      },
    },
  },
  {
    name: "docdog_status",
    write: false,
    description: "Cache/corpus statistics: record counts per collection, edge count, embedded chunks, embed model, cache location.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "docdog_create",
    write: true,
    description:
      "Create a new record as a markdown file at the path you choose, then index it. Placement is your decision — pick a directory under the configured scan paths that fits the collection (this repo's convention: specs/<collection>/<slug>.md). Any `relationships:` entries in `frontmatter` become graph edges at indexing.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repo-relative target file path (e.g. specs/notes/friction-016-slug.md). Must be under a configured scan path and end in .md." },
        collection: { type: "string", description: "Target collection (e.g. decisions, notes, proposals)" },
        title: { type: "string", description: "Record title" },
        content: { type: "string", description: "Markdown body content" },
        id: { type: "string", description: "Human-readable ID (optional, e.g. FRICTION-016)" },
        description: { type: "string", description: "Agent-authored summary (optional)" },
        scope: { type: "string", description: "Visibility scope (omit for the default: shared)" },
        status: { type: "string", description: "Status (omit for the default: current)" },
        frontmatter: {
          type: "object",
          description: "Extra frontmatter keys. Any `relationships:` entries here become graph edges when the file is indexed.",
        },
      },
      required: ["path", "collection", "title", "content"],
    },
  },
  {
    name: "docdog_update",
    write: true,
    description:
      "Update an existing record by patching its markdown file, then reindexing it. Re-embeds automatically if content changes. The record id stays stable, so edges stay intact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Record id (e.g. DD-070)" },
        title: { type: "string", description: "New title" },
        content: { type: "string", description: "New markdown body (triggers re-embedding if changed)" },
        description: { type: "string", description: "Updated summary" },
        status: { type: "string", description: "Updated status (e.g. current, superseded)" },
        scope: { type: "string", description: "Updated scope" },
        fields: {
          type: "object",
          additionalProperties: {
            type: ["string", "number", "boolean", "array", "null"],
            items: { type: ["string", "number", "boolean"] },
          },
          description:
            "Generic frontmatter patch: set any top-level field to a scalar or flat scalar list; null deletes the key. id/collection/relationships are refused (identity is immutable; edges go through docdog_relate); title/description/status/scope have dedicated parameters above.",
        },
      },
      required: ["id"],
    },
  },
] as const;

/** Every kernel tool carries the `root` selector. Injected, not hand-repeated. */
const TOOL_DEFINITIONS = BASE_TOOL_DEFINITIONS.map((t) => ({
  ...t,
  inputSchema: {
    ...t.inputSchema,
    properties: { ...t.inputSchema.properties, ...ROOT_PROPERTY },
  },
}));

/**
 * The tools `--read-only` refuses (PROPOSAL-035), derived from the tool
 * definitions themselves rather than kept as a second list beside them —
 * a parallel list is a thing that drifts, and drifting *open* is the
 * failure that matters. Every tool declares `write`, so adding one forces
 * the author to answer the question rather than defaulting into writable.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(
  TOOL_DEFINITIONS.filter((t) => t.write).map((t) => t.name),
);

/**
 * The tool list a caller sees. Under `--read-only` the writes are absent
 * rather than merely refused, and `write` — internal metadata — is stripped
 * either way, so it never reaches the wire.
 */
export function visibleTools(readOnly: boolean) {
  return TOOL_DEFINITIONS.filter((t) => !(readOnly && t.write)).map(
    ({ write: _write, ...t }) => ({ ...t }),
  );
}

export function readOnlyRefusal(name: string) {
  return {
    content: [
      {
        type: "text",
        text:
          `SERVER_READ_ONLY: \`${name}\` is refused. This MCP server was started with ` +
          `\`docdog serve --read-only\`, which disables ${[...WRITE_TOOLS].join(", ")}.\n\n` +
          `This is a server-side rail, not a preference — no instruction can lift it. ` +
          `Report the change you intended to your caller rather than working around it.`,
      },
    ],
    isError: true,
  };
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const resolver = new ProjectResolver(options.defaultRoot);
  // Captured before anything else runs: this is "the version this process
  // loaded", and every later comparison is against it (PROPOSAL-037).
  const boot = captureBoot();

  const server = new Server(
    { name: "docdog", version: boot.version },
    { capabilities: { tools: {}, resources: {} } },
  );

  // Tool list. Under --read-only the writes are not merely refused but
  // absent: a caller cannot attempt what it cannot see, and their schemas
  // stop costing context in an agent that could never have used them.
  // `write` is internal metadata and never reaches the wire.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools(options.readOnly === true),
  }));

  // Tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const callArgs = args ?? {};

    // Belt and braces: hiding the tool is not enough on its own. A client
    // with a cached tool list, or one calling blind, still reaches here —
    // and gets a refusal that names the flag rather than "Unknown tool".
    // Checked before resolution: whether the corpus writes are refused does
    // not depend on which corpus was named, and a bad `root` must not mask
    // the more fundamental refusal.
    if (options.readOnly && WRITE_TOOLS.has(name)) {
      return readOnlyRefusal(name);
    }

    try {
      const { config, projectRoot } = resolver.resolve(callArgs.root);
      // Named only when the caller steered — see namingFooter().
      const steered = callArgs.root !== undefined && callArgs.root !== null && callArgs.root !== "";

      const result = await (async () => {
        switch (name) {
          case "docdog_search":
            return await handleSearch(config, projectRoot, callArgs);
          case "docdog_get":
            return await handleGet(config, projectRoot, callArgs);
          case "docdog_traverse":
            return await handleTraverse(config, projectRoot, callArgs);
          case "docdog_relate":
            return await handleRelate(config, projectRoot, callArgs);
          case "docdog_index":
            return await handleIndex(config, projectRoot, callArgs);
          case "docdog_status":
            return await handleStatus(config, projectRoot, {
              readOnly: options.readOnly === true,
              boot,
            });
          case "docdog_create":
            return await handleCreate(config, projectRoot, callArgs);
          case "docdog_update":
            return await handleUpdate(config, projectRoot, callArgs);
          default:
            return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
        }
      })();

      return steered ? withProjectFooter(result, config.project.name, projectRoot) : result;
    } catch (err) {
      if (err instanceof ProjectResolutionError) {
        return { content: [{ type: "text", text: `${err.code}: ${err.message}` }], isError: true };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  });

  // Expose skill definitions as MCP resources (DD-048). Resources have no
  // per-call argument to carry a root, so they stay bound to the default
  // project; a rootless server simply exposes none.
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    if (options.defaultRoot === null) return { resources: [] };
    const skills = await listSkillResources(options.defaultRoot);
    return { resources: skills };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (options.defaultRoot === null) {
      throw new Error(
        "This server was not started inside a docdog project, so it exposes no skill resources. Skills are per-project; start the server in the project, or read the file from .docdog/skills/.",
      );
    }
    const content = await readSkillResource(options.defaultRoot, uri);
    return { contents: [{ uri, mimeType: "text/markdown", text: content }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * PROPOSAL-033 §5: name the project a call acted on — but only when the caller
 * steered with an explicit `root`. With no `root` there is exactly one project
 * it could have been, so the line would be noise; with one, the footer is the
 * check that catches "I meant the other repo" before it becomes a wrong edit.
 */
type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

function withProjectFooter<T extends ToolResult>(result: T, name: string, root: string): T {
  const last = [...result.content].reverse().find((c) => c.type === "text" && typeof c.text === "string");
  if (!last) return result;
  last.text = `${last.text}\n\n_(project: ${name} — ${root})_`;
  return result;
}

async function listSkillResources(projectRoot: string): Promise<Array<{ uri: string; name: string; mimeType: string }>> {
  const { readdirSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const skillsDir = join(projectRoot, ".docdog", "skills");
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir)
    .filter((f: string) => f.endsWith(".md"))
    .map((f: string) => ({
      uri: `docdog://skills/${f}`,
      name: f.replace(".md", ""),
      mimeType: "text/markdown",
    }));
}

async function readSkillResource(projectRoot: string, uri: string): Promise<string> {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const fileName = uri.replace("docdog://skills/", "");
  const filePath = join(projectRoot, ".docdog", "skills", fileName);
  if (!existsSync(filePath)) throw new Error(`Skill not found: ${uri}`);
  return readFileSync(filePath, "utf-8");
}
