---
name: docdog-feedback
description: Report a docdog bug, limitation or friction upstream — formulate it, search for an existing issue, then decide between doing nothing, commenting, and filing. Use when docdog itself misbehaves, not when a record is wrong.
---

# /docdog-feedback — reporting a docdog problem upstream

Docdog is used in repositories its authors will never see. This skill is
how something you hit here gets fixed there.

**Nothing in this skill sends anything on its own.** Every path ends with
you showing the user the exact text and them deciding. Docdog holds no
token, runs no endpoint, and collects nothing.

---

## 0. Is this a docdog problem?

Only docdog's own behaviour belongs upstream: a command that errors, a
result that is wrong, a report that misleads, a workflow that cannot be
expressed. A record with bad content, a missing edge, a search that did
not find something because nobody wrote it down — those are this
repository's problems and stay here.

If you are unsure, it stays here. A local note costs nothing; a wrong
issue costs someone else a read.

## 1. Write it down locally first

A report starts as a record in **this** corpus, not as an issue:

```yaml
---
id: FRICTION-NNN
title: "<short description>"
collection: notes
status: open
description: "<what happened, in one sentence>"
severity: blocks-work | inconvenient | cosmetic
---
```

Body: what you were trying to do, what happened (the actual error or
output), what you did instead, and what you think should change.

The record is the source; an issue is a *projection* of it. If the user
never wants it sent, they still have the finding.

## 2. Assemble the report

- **Title** — the symptom, not the guess at the cause.
- **Reproduction** — the smallest command sequence that shows it. Run it
  once more and paste the real output, not a remembered version.
- **Environment** — paste the output of:

  ```bash
  docdog status --json
  ```

  Its `install` block carries the version and how this copy was installed
  (`npx`, `global`, `dependency`, `source`) — the two questions triage asks
  first — alongside collections, counts, cache location and embed model.
  If the project has no usable cache the command still prints `install`,
  with the cache error beside it; that output is *more* useful than none,
  because "index never finished" is exactly what you are reporting.

## 3. Redact before you search, not after you decide

A good report quotes record ids, titles, paths, sometimes body text —
all of which are this project's private content, and all of which would
become public.

- Quote the **minimum that reproduces the problem**.
- **Propose** redactions to the user; do not silently apply them. What is
  sensitive here is their call, not yours.
- Never attach the corpus, a cache file, or a config file wholesale.
- If the problem cannot be shown without private content, say so and ask
  whether a synthetic reproduction is worth building.

## 4. Search — including closed issues

```bash
gh issue list --repo yasnikoff/docdog --search "<distinctive terms>" --state all --limit 20
gh issue view <n> --repo yasnikoff/docdog
```

`--state all` is not optional. A **closed** issue usually means the fix
already shipped, and then the right outcome is not a report at all — it
is an upgrade:

```bash
docdog update --check      # one lookup; --offline answers from the cache
```

Check the version *before* you conclude anything: `install.version` in the
status JSON against the version the closed issue says it was fixed in. An
issue closed by a release you already run is a different finding from one
closed by a release you do not.

Without `--state all` that branch is invisible and you file a duplicate
of something already fixed.

If `gh` is not installed, search the web UI:
`https://github.com/yasnikoff/docdog/issues?q=<terms>`.

## 5. Decide

| What you found | Do this |
|---|---|
| A closed issue describing it | Upgrade. Record the version on the local record; do not file. |
| An open issue, same symptom **and** same cause | Comment — but only if you have something new: a different trigger, a smaller reproduction, an environment that differs. |
| An open issue, same symptom, **different** cause | New issue, linking to the other one and saying how it differs. |
| Nothing | New issue. |
| Nothing new to add to an existing issue | **Do nothing**, and tell the user why. A "+1" costs a maintainer a read and tells them nothing. |

This is a judgment, which is why it is written here as guidance rather
than compiled into a command. When two readings are defensible, show the
user both and let them pick.

## 6. Ask — every time, on the exact text

Show the user the **final title and body**, verbatim, and ask whether to
send it. Every report, every time.

Do not ask for standing permission and do not accept it if offered: the
content is different each time, so a remembered "yes" is consent to text
that does not exist yet.

If the user's own instructions say not to report outward, stop here and
keep the local record. That is a complete outcome.

## 7. Send it as the user

```bash
gh issue create --repo yasnikoff/docdog \
  --title "<title>" --body-file <path> --label friction

gh issue comment <n> --repo yasnikoff/docdog --body-file <path>
```

If the label does not exist on the repository, drop `--label friction` —
the label is a triage convenience, and a report is worth more than a tag.

If `gh` is missing or unauthenticated, do not try to work around it.
Hand the user a prefilled link and let them click it:

```
https://github.com/yasnikoff/docdog/issues/new?template=friction.yml&title=<urlencoded>
```

Either way the last action before anything leaves this machine is theirs.

## 8. Link it back

Record where it went, on the local record:

```
docdog_update(id: "FRICTION-NNN", fields: { upstream_issue: "https://github.com/yasnikoff/docdog/issues/NNN" })
```

Then `docdog list --collection notes --where upstream_issue=<url>` finds
it again, offline, without opening a browser. When the fix ships, close
the local record the way any friction closes: `status: resolved`, plus
the version it was fixed in.

---

## Never

- **Never report unattended.** No batch mode, no "send everything you
  noticed at the end of the session". The user decides per report.
- **Never redact automatically.** Propose; let them approve.
- **Never send a crash unprompted.** The moment consent cannot be asked
  is the moment it matters most.
- **Never invent an issue number, a maintainer's opinion, or a fix
  version.** If you did not read it, you do not know it.

---

_Generated by docdog {{docdog_version}}._
_Refreshed by `docdog update`; `docdog skill install feedback --force` re-emits it._
