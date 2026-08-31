# Working across several repos from one docdog server

Since PROPOSAL-033 the MCP server is not bound to the repo that spawned it.
Every kernel tool takes an optional **`root`** — an absolute path to a docdog
project, or to any directory inside one — and a call that omits it acts on the
server's **default project**.

The default is resolved once, when the server starts, by walking up from its
working directory looking for `.docdog/config.yaml`. That single fact is what
makes the multi-repo setup below cost nothing in the common case.

---

## If you work in one repo

Do nothing. `docdog init` writes `.mcp.json`, the server starts in your repo,
its default project is your repo, and you never type `root`. Nothing on this
page changes that.

---

## If you work across several repos (recommended setup)

**Register the server once, at user scope, and don't wire `.mcp.json` in your
repos at all.**

```bash
claude mcp add --scope user docdog -- docdog serve
```

(Or `-- npx -y @yasnikoff/docdog serve` if docdog isn't on your PATH.)

Now `cd` into any docdog project and the server spawns with that repo as its
working directory — so its default project is *that repo*, automatically. You
type `root` only to reach **sideways** into a different repo:

```jsonc
// acts on the repo you're standing in
docdog_search { "query": "retention policy" }

// reaches into another one
docdog_search { "query": "retention policy", "root": "/abs/path/to/other-repo" }
```

One registration, no per-repo files, no arguments in the common case.

### Why no `.mcp.json`?

Because a project-scope entry **shadows** the user-scope one. Measured:

| Claude launched from | which server spawns |
|---|---|
| a directory with a project `.mcp.json` | the project-scope one |
| a directory without one | the user-scope one |

Exactly one server ever runs — there is no duplicate tool surface. Shadowing
is harmless in itself (a project-scope docdog server takes `root` too, so it
can still reach other repos), but if you skip the per-repo file you get one
server, one version, one place to configure.

If a repo already has `.mcp.json` and you want the machine-scope server there,
delete it. `docdog init` will not recreate it unless you re-run init.

---

## When the server starts outside any project

It still starts — and every call must then name its `root`:

```
ROOT_REQUIRED: No project. This server was not started inside a docdog
project, so every call must pass `root` …
```

This is the mode you get from a scratch directory, a non-docdog repo, or a
launcher with an unhelpful working directory. It is a working mode, not an
error state.

To pin a default instead, name it at startup:

```bash
docdog serve --root /abs/path/to/repo
```

---

## `root` rules

| Situation | Result |
|---|---|
| omitted, server started in a project | acts on that project |
| omitted, server started outside one | `ROOT_REQUIRED` |
| absolute path to a project (or a dir inside one) | acts on that project |
| absolute path that is **not** a docdog project | `ROOT_NOT_A_PROJECT` |
| relative path | `ROOT_NOT_ABSOLUTE` |
| path that doesn't exist | `ROOT_NOT_FOUND` |

Two of those are deliberate refusals rather than conveniences:

- **A bad `root` never falls back to the default project.** Silently acting on
  the wrong corpus is indistinguishable from success, which makes it worse
  than failing.
- **A relative `root` is refused** because it would be resolved against the
  *server's* working directory, which is not yours.

When a call passes an explicit `root`, the response ends with the project it
acted on — `_(project: docdog — E:\projects\docdog)_` — so a wrong-repo call
is visible in the transcript rather than silent.

---

## What this is not

**It is not federation.** Record ids are project-local and each project has its
own cache. `docdog_relate` and `docdog_traverse` cannot cross a corpus
boundary: you cannot record an edge from one repo's `FRICTION-012` to
another's `SPEC-004`. One agent can hold two graphs in one session; the graphs
stay separate.

**There is no "all projects" mode.** A call acts on exactly one project or it
errors. Searching every known project, or guessing which project an id belongs
to, is judgment — it belongs to the agent and the user, not to docdog's code
(DP-001).

---

## Version note

`docdog init` wires `.mcp.json` to the **published** package. A project using
that wiring gains `root` support only when it picks up a docdog release
containing PROPOSAL-033. If `root` is rejected as an unknown argument, the
server predates the feature.

See also: `docs/cowork-mcp-setup.md` for the Claude desktop app, which reads
its own config rather than a repo's `.mcp.json`.
