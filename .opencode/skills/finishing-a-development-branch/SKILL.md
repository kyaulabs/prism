---
name: finishing-a-development-branch
description: Use when a feature branch's work is complete — all tasks green, /check passed, @code-review clean — and you need to verify readiness and present disposal options (merge, PR, keep, discard).
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Finishing a Development Branch

Complete a feature branch with a disciplined verification checklist and
structured disposal options. This skill runs after all plan tasks are done
and the branch is ready for integration.

**Announce at start:** "I'm using the finishing-a-development-branch skill to
verify and wrap up this feature branch."

## Pre-completion checklist

Run every item; do not skip:

- [ ] All plan tasks checked off (`- [x]` in `docs/plans/`).
- [ ] `verification-before-completion` run on the final state — all checks
      passed.
- [ ] `/check` green — lint + coverage 80% minimum.
- [ ] `@code-review` clean — only Informational findings remain (see
      `receiving-code-review` skill if not).
- [ ] Working tree clean — `git status` shows no uncommitted changes.
- [ ] Branch is rebased on `develop` (or `main` if no develop branch):
      `git fetch origin && git rebase origin/develop`.
- [ ] No merge conflicts after rebase. If conflicts exist, suggest
      `@resolve-merge-conflicts` or manual resolution.
- [ ] All commits follow Conventional Commits format and include
      `Acked-by:` + `Signed-off-by:` footers (see `conventional-commits` skill).

After every item passes, present the summary below. If any item fails, stop
and fix it — do not proceed with a failing item.

## Summary after checklist

Present this block to the user:

```
## Branch completion — ready for integration

Branch: <branch-name>
Target: develop
Commits: N (all conventional-commits, all signed)
Check: /check green
Review: @code-review clean
Coverage: >= 80% on changed files

What would you like to do?
1. Merge to develop (I will prepare the merge command)
2. Open a pull request (I will prepare the gh pr command)
3. Keep branch for further work (no action)
4. Discard branch (I will warn; you confirm)
```

Wait for the user's response. Do not auto-merge or auto-push.

## Option responses

### Merge

Present the merge commands. Both require user confirmation:

```bash
git checkout develop
git merge --no-ff <branch-name>
git push origin develop   # human executes this
```

Note: `git push` is denied to agents — the user pushes. Do not attempt it
and do not offer the `git push` command in the approval dialog.

After the user confirms the merge is done, offer to delete the local branch:

```bash
git branch -d <branch-name>
```

### Pull request

Prepare the `gh pr create` command:

```bash
gh pr create --base develop --head <branch-name> --title "<subject>" --body "<body>"
```

Use the branch description and commit subjects to construct the title and body.
Present the exact command for user approval.

### Keep / Discard

If "keep" — done. If "discard" — warn the user that unmerged commits will be
lost, then present:

```bash
git checkout develop
git branch -D <branch-name>
```

## No-squash reminder

Each logical change is its own atomic commit — the git history serves as the
development and evaluation log. Do not squash. Do not suggest squashing. The
`--no-ff` merge flag preserves the branch commit history.

## Rules

- Every checklist item must pass before presenting the summary. No partial
  passes.
- Rebase on the target branch before presenting. Do not suggest merging into
  an outdated base.
- Never auto-merge. Never auto-push. The user drives integration.
- Do not delete branches the user hasn't confirmed merging.
- Respect the `feat/<username>-<hash>-<description>` convention and the
  no-squash policy from `AGENTS.md`.

## Cross-refs

- `executing-plans` skill — produces the plan whose tasks you check off.
- `verification-before-completion` skill — the verification step in the
  checklist.
- `/check` command — the lint + coverage gate.
- `@code-review` agent — generates findings; use `receiving-code-review` skill
  to triage them.
- `conventional-commits` skill — validates commit message format.
- `@resolve-merge-conflicts` agent — if rebase produces conflicts.
- `receiving-code-review` skill — triage any `@code-review` findings that
  aren't Informational.
- `AGENTS.md` § Git Workflow — branch naming convention and no-squash policy.

## Gotchas

- *Presenting the summary before the checklist is complete* — a red checklist
  item means the branch is NOT ready. Fix it first.
- *Skipping the rebase* — stale branches produce merge conflicts later.
  Rebase before presenting.
- *Offering git push* — agents cannot push. Do not offer or attempt it.
- *Suggesting squashing* — the no-squash policy is load-bearing for the
  evaluation log. Never suggest or offer a squash merge.
