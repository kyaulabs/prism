---
name: finishing-a-development-branch
description: Use when a feature branch's work is complete — all tasks green, /check passed, code-review clean — and you need to verify readiness and present disposal options (PR via /pr, keep, discard).
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Finishing a Development Branch

Complete a feature branch with a disciplined verification checklist and
structured disposal options. This skill runs after all plan tasks are done
and the branch is ready for integration.

**Announce at start:** "I'm using the finishing-a-development-branch skill to
verify and wrap up this feature branch."

## Final-state ordering

Run the items in this order; do not skip any:

1. **Confirm every implementation task is complete** (`- [x]` in
   `docs/plans/`) and per-task verification passed.
2. **Strict-greenfield checkpoint (bootstrap branches only).** Require
   successful `/check` and all four `code-review` axes first. Then derive
   the immutable spec link and direct the user to a fresh wayfinder session:
   - run `gh repo view --json nameWithOwner -q .nameWithOwner`, validate the
     result, and retain it as inert `REPO` context
   - derive `SPEC_SHA` from the commit that added `SPEC_PATH` with
     `git log --format=%H --diff-filter=A -1 -- "$SPEC_PATH"`
   - render the link from the validated literal repository, SHA, and path
3. **Require map evidence before artifact cleanup (bootstrap branches
   only).** Confirm that the fresh wayfinder map exists and its Notes contain
   that immutable URL; otherwise halt without deleting development artifacts.
4. **Clean up plan/spec artifacts.** Delete the tracked plan/spec files that
   match this branch's work from `docs/plans/` and `docs/specs/`, then load
   `conventional-commits` and use its launcher-owned approval workflow for the
   cleanup commit before any final gate (ADR-0027). If no matching artifacts
   exist, record that fact and do not create an empty cleanup commit. Map
   issues live on the GitHub tracker, outside repository cleanup; only
   tracked plan/spec artifacts are deleted.
5. **Recompute branch attestation.** Derive `TARGET_BRANCH` (below),
   synchronize if the work branch is already published (below), and print the
   exact attestation (below) with a clean working tree. Cleanup changed HEAD,
   so rerun `/check` and all four `code-review` axes on the new HEAD.
6. **Continue the existing finish/PR/keep/discard options.** Require no
   Blocking finding from the review (resolve every Suggested finding or
   record the human's explicit waiver), recheck the clean tree, HEAD SHA, and
   base SHA, then offer exactly: prepare a pull request through `/pr`, keep,
   or discard. For the first option, invoke the `/pr` procedure and state
   that `/pr` only prepares artifacts — the human publishes the work branch
   and runs the displayed GitHub CLI block.

## Determine the target branch

Read the work-branch name directly:

```bash
git rev-parse --abbrev-ref HEAD
```

Retain the validated output as inert context. Set `TARGET_BRANCH` to `main`
when the observed branch starts with `hotfix/` or `release/`; otherwise set it
to `develop`.

Normal work branches target `develop`; `hotfix/*` and `release/*` target
`main`. All integration to a protected branch must go through a merged pull
request — never a direct merge or push. `release/*` branches originate from
`develop` (ADR-0028) but their PR target is `main` (ADR-0044).

## Synchronize with the target branch

If the work branch has already been published to a remote, merge
`origin/$TARGET_BRANCH` into it with a merge commit to avoid a force-push:

```bash
git fetch origin
git merge origin/"$TARGET_BRANCH"
```

Rerun `/check` and resolve any conflicts (load `resolve-merge-conflicts`).
The resulting branch is a fast-forward of the remote work branch, so the
human can push it without `--force`. Never rebase a published work branch —
rebasing an already-pushed branch requires a force-push, which is blocked by
the pre-push hook on protected targets.

If the work branch has not yet been published, the synchronization step is
optional because the PR can still be opened against an up-to-date base. The
fast-forward update after publication is sufficient.

## Exact branch-completion attestation

After synchronization and with a clean tree, print this exact attestation
shape with resolved values (not angle-bracket text):

```text
BRANCH=<resolved valid work branch>
HEAD_SHA=<git rev-parse HEAD>
BASE_REF=origin/<resolved target branch>
BASE_SHA=<git rev-parse origin/resolved-target>
```

`/check` and all four `code-review` axes are valid only when the exact
`BRANCH`, `HEAD_SHA`, `BASE_REF`, and `BASE_SHA` values above are recorded
before the gates and current values still match afterward. Any changed SHA or
dirty tree invalidates both final gates; restart the attestation → `/check` →
review sequence after any commit or merge. A review axis that failed or was
skipped is incomplete evidence; the human may explicitly waive it in-session,
and `/pr` then records the axis as waived rather than blocking.

## Summary after final gates

Present this block to the user after the recheck:

```
## Branch completion — ready for PR

Branch: <branch-name>
Target: <TARGET_BRANCH>
Commits: N (all conventional-commits, all signed)
Check: /check green
Review: code-review clean (all four axes)
Coverage: >= 80% on changed files

What would you like to do?
1. Prepare a pull request (I will invoke /pr to prepare title, body, and the
   GitHub CLI command)
2. Keep branch for further work (no action)
3. Discard branch (I will warn; you confirm)
```

Wait for the user's response. Do not auto-merge, auto-push, or bypass a PR.

## Option responses

### Prepare a pull request

Invoke the `/pr` command. `/pr` validates the branch, collects evidence from
the attested session, generates a commitlint-valid conventional title and a
template-complete body, and displays the exact GitHub CLI pull-request
creation command. It only prepares artifacts: the human publishes the work
branch and runs the displayed GitHub CLI block. `/pr` never creates the PR
itself.

### Keep / Discard

If "keep" — done. If "discard" — warn the user that unmerged commits will be
lost, then present:

```bash
git checkout "$TARGET_BRANCH"
git branch -D <branch-name>
```

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

- Every final-state item must pass before presenting the summary. No partial
  passes.
- Plan/spec cleanup per ADR-0027 happens and is committed before the final
  gates, not after disposal.
- Determine `TARGET_BRANCH` from the branch name: `main` for `hotfix/*` and
  `release/*`; `develop` for all other work branches.
- Merge `origin/$TARGET_BRANCH` into already-published work branches — never
  rebase a published branch (force-push is blocked).
- Record the exact attestation before `/check` and all four `code-review`
  axes; recheck afterwards.
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
- `/pr` command — prepares the conventional title, template-complete body,
  and human-run GitHub CLI pull-request creation command.
- `code-review` skill — generates findings; use `receiving-code-review` to
  triage them.
- `conventional-commits` skill — validates commit message format.
- `resolve-merge-conflicts` skill — if synchronization produces conflicts.
- `receiving-code-review` skill — triage any `code-review` findings that
  aren't Informational.
- `AGENTS.md` § Git Workflow — branch naming convention, protected-branch
  policy, and no-squash policy.
- `writing-plans` skill — produces the plan; documents its own lifecycle.
- `wayfinder` skill — charts the remainder map for a strict-greenfield
  bootstrap between the initial gates and ADR-0027 cleanup; its map Notes
  hold the immutable bootstrap-spec link.

## Gotchas

- *Presenting the summary before the final gates* — a failed item means the
  branch is NOT ready. Fix it first.
- *Running `/check` or review without the attestation* — gates are valid only
  when bound to the exact branch, HEAD, base ref, and base SHA recorded
  before them.
- *Deferring plan/spec cleanup until after the PR* — ADR-0027 cleanup must be
  committed before the final gates so `/pr` can recover the last committed
  plan/spec from branch history.
- *Rebasing a published branch* — the pre-push hook blocks force-pushes.
  Always merge `origin/$TARGET_BRANCH` into the work branch instead.
- *Offering git push* — agents cannot push. Do not offer or attempt it.
- *Suggesting squashing* — the no-squash policy is load-bearing for the
  evaluation log. Never suggest or offer a squash merge.
- *Offering a direct merge to develop or main* — protected branches are
  PR-only. Delegate preparation to `/pr`; the human runs the displayed
  command.
- *Deleting development artifacts before the map checkpoint* — a
  strict-greenfield bootstrap must complete `/check` and `code-review`,
  derive the immutable spec link, and record it in a fresh wayfinder map's
  Notes before ADR-0027 cleanup. Cleanup changes HEAD, so the attestation
  and both gates must be repeated.
