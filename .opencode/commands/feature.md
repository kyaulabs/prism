---
description: "Start a new feature from an idea. Loads the brainstorming skill for the idea -> spec -> plan -> @tdd pipeline. Use @from-issue #NN for an existing issue, or @debug for a bug."
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash: deny
---

Load the `brainstorming` skill and begin the idea -> spec -> plan -> @tdd
pipeline for the new feature described in $ARGUMENTS.

Redirect instead of starting when the entry is wrong: an existing issue ->
`@from-issue #NN`; a bug -> `@debug`; an already-approved spec -> skip to
`writing-plans`.

Arguments: $ARGUMENTS
