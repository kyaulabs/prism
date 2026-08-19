---
name: conventional-commits
description: Use when writing, preparing, creating, or reviewing ordinary commit messages. Owns the two-phase prism-tool approval workflow, Conventional Commits fields, attribution, signing, and issue references.
---

# Conventional Commits

Use `prism-tool commit` for every ordinary agent-created commit. The launcher
constructs attribution, validates the complete message, binds approval to the
repository state, signs through Git, and keeps message content out of shell
source. Never construct an ordinary commit with direct Git commands.

## Message fields

Select only these structured fields:

```text
<type>[optional scope]: <subject>

[optional body]

[optional Fixes: #NN or Refs: #NN]
Implemented-by: <active-model-id>
Tested-by: <review-model-id>
Signed-off-by: <human identity>
```

The launcher owns all three attribution values and their canonical order.
Callers never resolve or interpolate them.

### Types

| Type | Use |
|---|---|
| `feat` | New behavior |
| `fix`, `patch` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting without logic changes |
| `refactor` | Neither feature nor fix |
| `perf` | Performance improvement |
| `test` | Test additions or corrections |
| `build` | Build or asset pipeline |
| `ci` | CI configuration |
| `chore` | Maintenance |
| `ignore` | Initial repository seed only |

Merge and revert completion are separate Git-generated, footer-exempt
workflows. The ordinary launcher rejects `revert`.

### Scope and subject

- Scope is optional and identifies the affected module or feature.
- Subject is one non-empty line.
- The rendered header is at most 100 characters.
- Use lowercase wording with no trailing period.
- Never place shell substitutions or attribution data in a field.

### Issue references

- `--fixes NN` renders `Fixes: #NN` and closes the issue.
- `--refs NN` renders `Refs: #NN` without closing it.
- The controls are mutually exclusive and accept positive digits only.

## Mandatory process

1. Select type, optional scope, subject, optional body, and optional issue
   reference from the completed work.
2. Stage only the intended files with `git add`.
3. When a body is needed, choose a unique literal 32-hex nonce and use Pi's
   `write` tool to create `.prism/commit-body-<nonce>.txt`. Do not create it
   through Bash or interpolate repository content into shell source.
4. Run `prepare` using substitution-free structured argv. Add `--body-file`
   with the literal body path and one issue control only when needed.
5. Remove the body input with `rm -- .prism/commit-body-<nonce>.txt` using the
   same fully known literal path whether preparation succeeds or fails.
6. Present the launcher's exact rendered message and plan ID. Stop and wait for
   explicit human approval of that exact message.
7. On approval, run `apply` with the literal plan ID and `--approval=yes`.
8. If approval is declined or the message is replaced, run `discard` with the
   literal plan ID and prepare a fresh plan.
9. Report the resulting commit ID. Never push.

Representative commands below are safety-boundary contract fixtures. Runtime
values must still be literal, validated values from the current operation.

<!-- commit-prepare:start -->
```bash
prism-tool commit prepare --type fix --scope core --subject "add launcher-owned commits"
```
<!-- commit-prepare:end -->

<!-- commit-apply:start -->
```bash
prism-tool commit apply --plan 0123456789abcdef0123456789abcdef --approval=yes
```
<!-- commit-apply:end -->

<!-- commit-discard:start -->
```bash
prism-tool commit discard --plan 0123456789abcdef0123456789abcdef
```
<!-- commit-discard:end -->

The launcher prints the complete message before mutation and stores a private
plan under the repository's actual Git directory. Approval becomes stale when
the repository, branch, `HEAD`, or staged index changes. A failed apply consumes
the plan; correct the cause and prepare again rather than amending.

## Branch policy

Work branches follow ADR-0028 and are created with:

```bash
bash "$(prism-tool resolve scripts)/new-branch.sh" <type> <description>
```

Ordinary commits on `main` and `develop` are blocked. ADR-0044 permits only the
single root seed on an unborn protected branch with no matching remote ref.

## Enforcement

- `prepare` and `apply` run mandatory local readiness and bundled commitlint.
- `apply` invokes signed Git with existing hooks enabled.
- The commit-msg hook rejects malformed messages and literal backslash-newline
  sequences.
- Merge/revert completion remains owned by `resolve-merge-conflicts` and Git's
  generated messages.
- No launcher commit operation pushes, amends, rebases, tags, or bypasses hooks.

## Cross-refs

- `tdd` — selects the message fields after verification.
- `executing-plans` — uses this process for task commits.
- `resolve-merge-conflicts` — footer-exempt merge and rebase completion.
- `verification-before-completion` — evidence required before preparation.
- `AGENTS.md` § Git Workflow — branch, signing, attribution, and push policy.

## Gotchas

- *Treating prepare as approval* — prepare is read-only with respect to commit
  history. Always stop for approval of the exact rendered message.
- *Reusing a stale plan* — any relevant repository-state change requires a new
  prepare operation.
- *Putting a body in shell source* — use a private literal `.prism` body path
  written through Pi's `write` tool.
- *Leaving a declined plan active* — discard it before preparing a replacement.
