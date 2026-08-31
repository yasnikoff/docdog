# Using docdog from Claude Cowork (desktop app)

`docdog init` wires the repo's `.mcp.json` for **Claude Code** (the CLI), so
the CLI gets the tool surface automatically. **Cowork** — the desktop app —
does not read a project's `.mcp.json`. To use docdog from a Cowork session you
register `docdog serve` as a local MCP server in the desktop app's own config;
the app then proxies it into the connected session, where the tools appear
namespaced under the device bridge (e.g.
`mcp__remote-devices__docdog__docdog_search`).

Register **once, for the machine** — not once per repo. Every kernel tool takes
an optional **`root`** (PROPOSAL-033), an absolute path naming the project the
call acts on, so a single server reaches every docdog project you own. The
repo's `.mcp.json` and this desktop registration are independent and don't
interfere.

---

## Why `root` is the mechanism here

`docdog serve` resolves a **default project** by walking up from its own process
working directory looking for `.docdog/config.yaml` (`findProjectRoot()` in
`src/config/loader.ts`). In Claude Code that default is free and always correct:
you `cd` into a repo, the server spawns there, done.

A desktop app has no `cd`. It spawns the server once, from a working directory
you don't choose, and keeps it running across sessions and folders. So the
default project is either absent or arbitrary — which is exactly the coupling
`root` removes:

- **A server started outside any project still runs.** It has no default; each
  call names its `root`. This is a working mode, not an error state.
- **A `root` that isn't a docdog project is a hard error** (`ROOT_NOT_A_PROJECT`).
  It never silently falls back to the default project — acting on the wrong
  corpus is indistinguishable from success, which makes it worse than failing.
- **`root` must be absolute.** A relative path would resolve against the
  *server's* working directory, which is not yours (`ROOT_NOT_ABSOLUTE`).

Full rules and the not-federation caveats: `docs/multi-repo-setup.md`.

---

## Prerequisites

For each repo you intend to reach:

```bash
docdog --version                 # docdog is installed and on PATH
test -f .docdog/config.yaml      # this is a docdog project
test -f .docdog/cache/index.db   # the cache is built (run `docdog index` once if not)
```

The embedding model must already be available locally (docdog loads it the same
way the CLI does). If it isn't, vector search fails on first query while keyword
and graph tools keep working — see the model-cache note in the offline setup
docs.

---

## Register the server

Open the config from the app — **Settings… → Developer → Edit Config** — rather
than guessing the path. It opens the file, creating it if needed:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows (plain installer):** `%APPDATA%\Claude\claude_desktop_config.json`
- **Windows (Microsoft Store / MSIX build):**
  `%LOCALAPPDATA%\Packages\Claude_<pkgid>\LocalCache\Roaming\Claude\claude_desktop_config.json`

> The Store build is packaged, so Windows **virtualizes `%APPDATA%`**: its
> `Roaming\Claude` is redirected under the package's `LocalCache`. If
> `%APPDATA%\Claude\` doesn't exist on a machine that plainly runs the app,
> that's why — you have the MSIX build, and the real file is the long path.
> The `<pkgid>` suffix is per-install; let the app open the file for you.

The file may already hold app state (`preferences`, folder grants, …). **Merge**
a `docdog` entry into `mcpServers` — creating that key if absent — rather than
replacing the file. No `cwd`, no `--root`, no repo path anywhere:

```json
{
  "mcpServers": {
    "docdog": {
      "command": "docdog",
      "args": ["serve"]
    }
  }
}
```

**Quit the app fully before you edit — a window close is not enough.** This is
not a precaution, it's measured: the app rewrites this file from its in-memory
state whenever that state changes (opening a session, granting a folder), and
the rewrite **drops top-level keys it isn't holding**. An `mcpServers` block
added while the app is running was silently gone minutes later. Quit, edit,
relaunch — the relaunch is also what spawns the server.

That's the whole setup. One server, every repo.

### If `command: "docdog"` doesn't resolve

The app spawns the server **without your shell's `PATH`**, and on Windows
`docdog` is a `.cmd` shim a bare spawn may not execute. Under a Node version
manager it's worse than that: `fnm` and `nvm` put the shim in an *ephemeral
per-shell* directory (`…\fnm_multishells\<pid>_<ts>\docdog.cmd`) that will not
exist for the app at all. `where.exe docdog` showing a path proves nothing about
what the app can see.

Sidestep the shim entirely — spawn Node directly against docdog's entrypoint,
both absolute:

```json
{
  "mcpServers": {
    "docdog": {
      "command": "C:\\absolute\\path\\to\\node.exe",
      "args": ["C:\\absolute\\path\\to\\docdog\\dist\\cli\\index.js", "serve"]
    }
  }
}
```

Find the two paths with `where.exe node` and, for a linked checkout, your repo's
`dist/cli/index.js`; for an installed package, `node_modules/@yasnikoff/docdog/dist/cli/index.js`.
Verify the exact pair before registering it:

```bash
"C:\path\to\node.exe" "C:\path\to\dist\cli\index.js" --version
```

If that prints a version, the app can spawn it. (A version-manager `node.exe`
path pins the Node version — if you later switch versions, update it.)

### Calling it

The server has no default project, so every call names one. The absolute path of
the folder connected to the Cowork session is the `root`:

```jsonc
docdog_search { "query": "retention policy", "root": "C:\\projects\\docdog" }
docdog_status { "root": "/Users/you/projects/other-repo" }
```

A steered call ends its response with the project it acted on —
`_(project: docdog — E:\projects\docdog)_` — so a wrong-repo call is visible in
the transcript rather than silent.

**`root` is a path on the machine running the server, not on the client.** A
cloud Cowork task reaches your machine through the device bridge: `docdog serve`
is a child process of your *desktop app*, so it sees your local filesystem. Pass
the path as your OS spells it (`E:\projects\docdog`), even though the agent's
own sandbox mounts the repo somewhere else entirely. Mixing the two up produces
`ROOT_NOT_FOUND` — which is the error doing its job.

In practice you tell the agent once per session: *"the docdog project is at
`<abs path>` — pass it as `root` on every docdog call."* If you forget, the
server says so rather than guessing:

```
ROOT_REQUIRED: No project. This server was not started inside a docdog
project, so every call must pass `root` …
```

### If you only ever use one repo

Pin it at startup and never type `root` again. Calls may still pass `root` to
reach sideways into another repo; omitting it acts on the pinned one.

```json
{
  "mcpServers": {
    "docdog": {
      "command": "docdog",
      "args": ["serve", "--root", "C:\\path\\to\\your-repo"]
    }
  }
}
```

On Windows use a double-backslashed absolute path — it's JSON.

> The older advice was to give the entry a `cwd` pointing at the repo, and rely
> on the app honoring it. `--root` states the same thing without depending on
> the app's stdio-transport behavior, and `root` beats both. Don't add a `cwd`.

---

## Confirm it's live

1. **Desktop app:** after restart, the MCP indicator in the input box should
   list a `docdog` server with its eight tools.
2. **In a Cowork session:** connect the repo folder, then ask the agent to run a
   status against it. A good smoke test:

   > "Run docdog status with root `<abs path to repo>` and report the record and
   > edge totals."

   (This also surfaces the cumulative graph totals — the `docdog index` summary
   line only reports per-run counts.)

   Then a retrieval check:

   > "Use docdog to search for `<a topic you know is in the corpus>`, root
   > `<abs path>`."

   Confirm the response's `_(project: … )_` footer names the repo you meant.

---

## Troubleshooting

Check the server's stderr log:

- Windows: `%APPDATA%\Claude\logs\mcp-server-docdog.log`
- macOS: `~/Library/Logs/Claude/mcp-server-docdog.log`

| Symptom | Cause | Fix |
|---|---|---|
| `ROOT_REQUIRED` on every call | server started outside a project, call named no `root` | pass `root`; this is the expected machine-scope mode, not a misconfiguration |
| `ROOT_NOT_A_PROJECT` | the path has no `.docdog/config.yaml` at or above it | run `docdog init` there, or fix the path — the call deliberately did not fall back |
| `ROOT_NOT_ABSOLUTE` | relative path passed | pass an absolute path |
| `root` rejected as an unknown argument | the server predates PROPOSAL-033 | upgrade docdog |
| `command not found` / ENOENT for `docdog` | app can't see your shell's PATH; the `.cmd` shim may live in a version manager's ephemeral dir | spawn Node directly against `dist/cli/index.js` — see *If `command: "docdog"` doesn't resolve* above |
| server registered but never appears | edited the wrong config file | on Windows Store builds the real path is under `%LOCALAPPDATA%\Packages\Claude_<pkgid>\LocalCache\…`, not `%APPDATA%\Claude\` |
| entry vanished from the config | app rewrote the file over your edit | quit the app fully, re-add, relaunch |
| no servers load at all | JSON syntax error in the config | validate it; on Windows every `\` must be `\\` |
| model load failure | embedding model not cached | keyword/graph tools still work; provide the model for vector search |

Sanity check by hand: `docdog serve` should start and block from **any**
directory (it's a stdio server; Ctrl-C to exit). If that works but the app's
spawn doesn't, the problem is shim resolution, not docdog.

---

## Notes

- **Two clients, two configs.** Claude Code uses the repo's `.mcp.json`; the
  desktop app uses `claude_desktop_config.json`. Editing one never affects the
  other. `docdog init` keeps writing `.mcp.json` (DISC-029) — that's for the
  CLI, and it does not conflict with this registration.
- **It is not federation.** Record ids are project-local and each project has
  its own cache. `docdog_relate` and `docdog_traverse` cannot cross a corpus
  boundary. One agent can hold two graphs in one session; the graphs stay
  separate. There is no "all projects" mode — a call acts on exactly one project
  or it errors.
- **Concurrent servers are fine for reads.** A desktop server, a Claude Code
  server, and CLI commands can all read the same `.docdog/cache/index.db` at
  once (SQLite handles concurrent readers). Simultaneous writes from two servers
  (`create`/`update`/`relate`) can briefly contend — not a concern for
  retrieval-only use.
- **A running `serve` reads the cache live** but does not re-parse files itself.
  After pulling spec changes, run `docdog index` (or let a post-merge hook do
  it) so the server serves current content.
- **Rebuilt docdog?** Restart the desktop app — a running `serve` keeps
  executing the old code.
