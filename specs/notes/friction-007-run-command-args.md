---
id: FRICTION-007
title: "`docdog run <name> args...` rejects extra positional args despite code expecting them"
collection: issues
status: resolved
description: The run command was declared as `run <name>` (one positional), so extra args were rejected by Commander with 'too many arguments'. But run.ts tried to read them via `cmd.args.slice(1)` — dead code. Fixed by declaring `run <name> [args...]` and passing args to the action callback.
severity: inconvenient
relationships:
  - references: FRICTION-006
---

# Friction: `docdog run` command rejected script arguments

## What happened

Called `docdog run move-collection notes specs/notes/oq-` expecting the
script to receive `["notes", "specs/notes/oq-"]` in `ctx.args`. Got:

```
error: too many arguments for 'run'. Expected 1 argument but got 3.
```

Tried `docdog run move-collection -- notes specs/notes/oq-` as a passthrough —
same error. `allowUnknownOption(true)` only affects flags, not positionals.

## Root cause

`src/cli/commands/run.ts` declared the command as:

```ts
program.command("run <name>").action(async (name, _opts, cmd) => {
  ...
  const scriptArgs = cmd.args.slice(1);  // dead code
  ...
});
```

Commander enforces the `<name>` signature (exactly one positional), so the
action handler was never invoked for multi-arg calls. `cmd.args.slice(1)`
was unreachable.

## Fix (applied this session)

```ts
program
  .command("run <name> [args...]")
  .action(async (name: string, args: string[], _opts, _cmd) => {
    ...
    const ctx: ScriptContext = { ..., args: args ?? [] };
    ...
  });
```

Now `docdog run move-collection notes specs/notes/oq-` works as intended.

## Tests

None exist for the run command. Worth adding:
- `run <name>` with no args → empty `ctx.args`
- `run <name> arg1 arg2` → `ctx.args = ["arg1", "arg2"]`
- `run <name> --flag value` → flags pass through (verify `allowUnknownOption`
  still works alongside varargs)

## Impact

Inconvenient, not blocking. The fix was tiny. But it meant the documented
"pass args to scripts" feature was broken for everyone until now.

## Related

- FRICTION-006 (the script that needed args was the workaround for FRICTION-006)

Surfaced and fixed: 2026-04-12.
