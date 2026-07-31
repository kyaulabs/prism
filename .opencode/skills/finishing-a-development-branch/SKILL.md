---
name: finishing-a-development-branch
description: Use when a feature branch's work is complete — all tasks green, /check passed, @code-review clean — and you need to verify readiness and present disposal options (PR, keep, discard).
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
- [ ] All commits follow Conventional Commits format and include
      `Authored-by:` + `Implemented-by:` + `Tested-by:` + `Signed-off-by:` footers (see `conventional-commits` skill).
- [ ] Plan and spec files deleted from `docs/plans/` and `docs/specs/`
      (unless branch is being kept for further work — see post-disposal
      cleanup below).

After every item passes, present the summary below. If any item fails, stop
and fix it — do not proceed with a failing item.

## Determine the target branch

Derive `TARGET_BRANCH` from the work-branch name:

```bash
case "$(git rev-parse --abbrev-ref HEAD)" in
    hotfix/*|release/*) TARGET_BRANCH=main ;;
    *)                 TARGET_BRANCH=develop ;;
esac
```

Normal work branches target `develop`; `hotfix/*` and `release/*` target
`main`. All integration to a protected branch must go through a merged pull
request — never a direct merge or push.

## Synchronize with the target branch

If the work branch has already been published to a remote, merge
`origin/$TARGET_BRANCH` into it with a merge commit to avoid a force-push:

```bash
git fetch origin
git merge origin/"$TARGET_BRANCH"
```

Rerun `/check` and resolve any conflicts. The resulting branch is a
fast-forward of the remote work branch, so the human can push it without
`--force`. Never rebase a published work branch — rebasing an already-pushed
branch requires a force-push, which is blocked by the pre-push hook on
protected targets.

If the work branch has not yet been published, the synchronization step is
optional because the PR can still be opened against an up-to-date base. The
fast-forward update after publication is sufficient.

## Summary after checklist

Present this block to the user:

```
## Branch completion — ready for PR

Branch: <branch-name>
Target: <TARGET_BRANCH>
Commits: N (all conventional-commits, all signed)
Check: /check green
Review: @code-review clean
Coverage: >= 80% on changed files

What would you like to do?
1. Open a pull request (I will prepare the gh pr command)
2. Keep branch for further work (no action)
3. Discard branch (I will warn; you confirm)
```

Wait for the user's response. Do not auto-merge, auto-push, or bypass a PR.

## Option responses

### Open a pull request

Prepare the `gh pr create` command:

```bash
cat > /tmp/pr-title.txt <<'HEREDOC'
<subject>
HEREDOC
cat > /tmp/pr-body.md <<'HEREDOC'
<body>
HEREDOC
gh pr create --base "$TARGET_BRANCH" --head <branch-name> \
    --title-file /tmp/pr-title.txt \
    --body-file /tmp/pr-body.md
```

Use the branch description and commit subjects to construct the title and body.
Write each to a temp file via heredoc (`<<'HEREDOC'`) so no shell expansion
occurs inside the payload. Present the exact command for user approval.

### Keep / Discard

If "keep" — done. If "discard" — warn the user that unmerged commits will be
lost, then present:

```bash
git checkout "$TARGET_BRANCH"
git branch -D <branch-name>
```

## Post-disposal cleanup

After the branch is PR'd or discarded, clean up the plan and spec files:

```bash
rm -f docs/plans/<plan-filename>.md docs/specs/<spec-filename>.md
```

Plans and specs are development artifacts — git history preserves them. They
should not accumulate in the working tree. If the branch is being kept for
further work, defer cleanup until the branch is ultimately disposed of.

## Post-merge local cleanup (after the PR is merged)

Once the human confirms the PR has been merged, offer to clean up the local
work branch:

```bash
git checkout "$TARGET_BRANCH"
git pull origin "$TARGET_BRANCH"
git branch -d <branch-name>
```

## No-squash reminder

Each logical change is its own atomic commit — the git history serves as the
development and evaluation log. Do not squash. Do not suggest squashing. The
`--no-ff` merge flag on the PR preserves the branch commit history.

## Rules

- Every checklist item must pass before presenting the summary. No partial
  passes.
- Determine `TARGET_BRANCH` from the branch name: `main` for `hotfix/*` and
  `release/*`; `develop` for all other work branches.
- Merge `origin/$TARGET_BRANCH` into already-published work branches — never
  rebase a published branch (force-push is blocked).
- Never offer a direct merge to `develop` or `main`. Integration is by merged
  pull request only.
- Never auto-merge. Never auto-push. The user drives integration.
- Do not delete branches the user hasn't confirmed merging.
- Respect the `<type>/<username>-<hash>-<description>` convention per ADR-0028.
  Allowed `<type>` values mirror commitlint vocabulary (minus `ignore`):
  feat, fix, patch, docs, style, refactor, perf, test, build, ci, chore, revert.
  Plus two special prefix families: `release/<semver>` and
  `hotfix/<username>-<hash>-<description>`.
- Enforce the no-squash policy from `AGENTS.md`.

## Cross-refs

- `executing-plans` skill — produces the plan whose tasks you check off.
- `verification-before-completion` skill — the verification step in the
  checklist.
- `/check` command — the lint + coverage gate.
- `@code-review` agent — generates findings; use `receiving-code-review` skill
  to triage them.
- `conventional-commits` skill — validates commit message format.
- `@resolve-merge-conflicts` agent — if synchronization produces conflicts.
- `receiving-code-review` skill — triage any `@code-review` findings that
  aren't Informational.
- `AGENTS.md` § Git Workflow — branch naming convention, protected-branch
  policy, and no-squash policy.
- `writing-plans` skill — produces the plan; documents its own lifecycle.

## Gotchas

- *Presenting the summary before the checklist is complete* — a red checklist
  item means the branch is NOT ready. Fix it first.
- *Rebasing a published branch* — the pre-push hook blocks force-pushes.
  Always merge `origin/$TARGET_BRANCH` into the work branch instead.
- *Offering git push* — agents cannot push. Do not offer or attempt it.
- *Suggesting squashing* — the no-squash policy is load-bearing for the
  evaluation log. Never suggest or offer a squash merge.
- *Offering a direct merge to develop or main* — protected branches are
  PR-only. Always prepare `gh pr create --base "$TARGET_BRANCH"`.
