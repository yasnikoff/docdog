---
id: FRICTION-063
title: "`docdog traverse --direction both` is an argument error, and the CLI appends 'Cache missing or stale? Run docdog index' to it"
collection: notes
status: open
date: 2026-09-27
description: "A bad `--direction` value raises TRAVERSE_ERROR, which the CLI's generic error branch renders with the cache-staleness hint — the misdirection FRICTION-030 and FRICTION-050's WHERE_* fix removed from search, still live on traverse. Found while verifying issue #3 in a scratch project."
severity: cosmetic
relationships:
  - references: FRICTION-030
    context: "the rule: a fact about the argument must not be rendered with a remedy about the cache"
  - references: FRICTION-050
    context: "fixed the same misdirection for the three `where` guards by making them typed errors; traverse's argument validation did not get the same treatment"
---

# FRICTION-063: traverse blames the cache for a typo

## What happened

```
$ docdog traverse D-1 --direction both
Error [TRAVERSE_ERROR]: --direction must be one of outbound, inbound, any (got: both)
  Cache missing or stale? Run "docdog index" first.
```

The first line is right and complete. The second sends the reader to
rebuild a cache that is fine.

## What should change

Argument validation in traverse should raise an error the CLI knows is
about the argument, as the `where` guards were turned into `SearchError`s
(FRICTION-050), so it does not fall through to the generic branch. Worth a
sweep of every command's validation errors for the same fall-through, since
this is the second instance found by accident.

`both` is also a reasonable guess given `--direction`'s neighbours in other
tools; the message already lists the valid values, which is enough. No alias.
