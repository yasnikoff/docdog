# Injectable skills

Templates under this directory become skills in a target repository:
`.claude/skills/docdog-<name>/SKILL.md`. They teach an agent how to
navigate a repo's content with or without docdog installed.
Semantically distinct from `templates/skills/`, which holds
**docdog-operation skills** for projects that have docdog running.

One template per registered skill name. The registry lives in
`src/engine/skill-install.ts` (`REGISTERED_INJECTABLE_SKILLS`).

## Who writes them

Three callers, one renderer (`renderInjectableSkill`):

- `docdog init` — writes them into a fresh project.
- `docdog update` — maintains them afterwards, through the seed
  manifest's ordinary four outcomes (PROPOSAL-044). A skill you have
  edited is reported and left alone.
- `docdog skill install <name>` — re-emits one on demand, or installs
  to a non-default `--target`.

## Template grammar

Markdown with literal `{{placeholder}}` substitutions. No conditionals,
no loops — one pass of string replacement, and an unknown placeholder
is a hard error.

| Placeholder | Skill | Value |
|---|---|---|
| `{{docdog_version}}` | all | docdog version at render time |
| `{{id_prefixes}}` | `specs` | discovered id prefixes, from the cache |
| `{{file_conventions}}` | `specs` | scan paths and their parsers, from config |

**There is no `{{generated_at}}`, and adding one back would break
`docdog update`.** A fresh timestamp makes every re-render differ from
the bytes recorded in the seed manifest, so every update would rewrite
every skill and produce a diff in which nothing changed. The version
stamp answers the same question without that cost.

Anything else a template needs must be derivable at render time from
the config or the cache — that is what lets `update` compute what
docdog *would write now* and compare it against what it wrote before.

## Adding a new injectable skill

1. Create `<name>.md` here with the placeholders you need.
2. Register it in `REGISTERED_INJECTABLE_SKILLS`, declaring
   `installName` (always `docdog-` prefixed — FRICTION-040) and the
   exact `allowedPlaceholders` set.
3. Extend discovery if new placeholders were introduced.
4. Pin the registry entry in `tests/unit/skill-seeds.test.ts` — an
   unregistered skill stops being installable silently.
5. Cover the render end to end in `tests/unit/skill-install.test.ts`.

Registered today: `specs` (PROPOSAL-019, absorbed `navigate-specs`
under PROPOSAL-044) and `feedback` (PROPOSAL-043).

## Two capabilities that were removed, and must not come back

**A companion data file.** A skill emits exactly one file. It used to
be able to write a flat index of every vertex beside `SKILL.md`; that
is gone (FRICTION-043). Corpus state committed into a skill directory
had no invalidation path and nothing read it.

**A generation timestamp.** See above. The distinction between the two
is worth keeping straight: the index was removed because it could not
be refreshed, and the timestamp because it could never compare equal.
Both are the same underlying rule — everything in a generated file must
be something docdog can recompute and check.
