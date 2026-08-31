---
id: FRICTION-004
title: CLI commands print raw unhandled-promise-rejection stack traces on error
collection: issues
status: resolved
fixed_date: 2026-04-14
description: When docdog index encounters an ArangoError (e.g. missing collection), it dumps a ~50-line Node.js stack trace with internal request/response objects instead of a clean error message. Suggests no top-level try/catch around async command handlers.
severity: inconvenient
relationships:
  - references: FRICTION-002
---

# Friction: unhandled promise rejections crash with raw stack traces

## What happened

Running `docdog index` against a misconfigured DB produced:

```
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

ArangoError: collection or view not found: requirements
    at new ArangoError (...)
    at Connection._runQueue (...)
    ...
  response: Response {
    request: Request {
      [Symbol(dispatcher)]: undefined,
      [Symbol(state)]: { ... ~30 lines of opaque internals ... }
    }
  }
```

Then Node exited with a non-zero code.

## Expected

Top-level catch in each CLI command. On ArangoError (or any known error
class), print:

```
error: <friendly message>
  <suggested fix>
```

…and exit 1. Raw stack traces should only appear under `--debug` or `DEBUG=1`.

## Impact

Inconvenient, not blocking. The error *is* visible, but buried. Raw stack
dumps also suggest "code bug" when it's actually a user-config issue (see
FRICTION-002).

## Related

- FRICTION-002 (same incident revealed both issues)

Surfaced: 2026-04-12 during self-hosting Phase 2.

## Resolution (2026-04-14)

`src/cli/index.ts` now uses `program.parseAsync().catch(...)`. The
handler recognizes two common failure modes:

- `collection or view not found` → points at `docdog init`
- `ECONNREFUSED` / `ENOTFOUND` / `fetch failed` → points at
  `docdog infra status`

Everything else prints the error message and a hint to set
`DOCDOG_DEBUG=1` for the full stack. FRICTION-002's self-heal now
makes the first pattern unreachable in normal use, but the handler
still exists for anything else that slips through.
