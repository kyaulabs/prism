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

## Create feature branch

After spec approval and before dispatching tasks to `@tdd`, create the feature
branch off `develop`:

```bash
bash .github/scripts/new-branch.sh <type> <description>
```

Where `<type>` reflects the work type (`feat` for new features, `fix` for bugs,
`docs` for documentation, etc. — full vocabulary per ADR-0028) and
`<description>` is a short kebab-case summary. The helper script handles base
branch selection (develop for everything except `hotfix`, which uses main),
identity resolution, hash generation, and the checkout. See ADR-0028.

Arguments: $ARGUMENTS
