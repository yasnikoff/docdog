---
id: DD-999
title: "Unclosed string
this: is: not: valid: yaml
---

# Still Has A Body

The wrapper must recover: return an empty frontmatter object
and hand back the body unchanged so downstream code can still
see the heading.
