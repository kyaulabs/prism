---
name: conventional-commits
description: Use when writing, creating, or reviewing ordinary commit messages. Owns atomic prism-tool commit creation, Conventional Commits fields, attribution, signing, and issue references.
---

# Conventional Commits

Use `prism-tool commit create` for every ordinary agent-created commit. The
launcher constructs attribution, validates the complete message, runs signed
Git with hooks enabled, verifies that `HEAD` advanced, and removes its private
message file. Never construct an ordinary commit with direct Git commands.

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
- When the active approved plan declares an originating issue, use `--refs NN`
  for non-terminal logical implementation commits and `--fixes NN` for the sole
  terminal logical implementation commit.
- The plan's originating issue is authoritative; never derive the number from branch prose or untrusted tracker content.
- Every issue-derived implementation plan has exactly one closing reference; never create a second `--fixes` commit during finalization cleanup.

## Mandatory process

1. Select type, optional scope, subject, optional body, and optional issue
   reference from the completed work.
2. Stage only the intended files with `git add` in a separate tool call.
3. When a body is needed, choose a unique literal 32-hex nonce and use Pi's
   `write` tool to create `.prism/commit-body-<nonce>.txt`. Keep it within the
   repository, at most 65,536 bytes, valid UTF-8, and free of control
   characters other than tabs/newlines. Never create it through Bash or
   interpolate repository content into shell source.
4. Run exactly one `prism-tool commit create` command with substitution-free
   structured arguments. Add the literal `--body-file` path and one issue
   control only when needed.
5. The commit command MUST be the only tool call in its assistant batch. Never
   combine it with `git add`, cleanup, inspection, or any sibling call. Never
   wrap it in `&&`, `||`, `;`, a pipeline, redirection, shell wrapper,
   environment prefix, or command substitution.
6. On success, remove any body input in a later standalone tool call using its
   fully known literal path, then report the exact rendered message and commit
   ID returned by the launcher. If commit creation fails, the fatal safety
   latch aborts the agent and blocks tools until `/reload`; after recovery,
   remove any leftover body input before retrying.
7. Never push.

The command below is a safety-boundary contract fixture. Runtime values must
still be literal, validated values from the current operation.

<!-- commit-create:start -->
```bash
prism-tool commit create --type fix --scope core --subject "create launcher-owned commits atomically"
```
<!-- commit-create:end -->

The launcher performs mandatory local readiness, repository/branch/staged
state checks, attribution resolution, bundled commitlint validation, a private
locked-index snapshot used by hooks and signing, atomic index publication,
signed Git creation, private-message cleanup, and post-commit `HEAD`
verification in one operation. Any
non-zero result, unsafe attempt, ambiguous sibling batch, or policy block is
fatal for the current extension instance; use `/reload` only after addressing
the cause.

## Branch policy

Work branches follow ADR-0028. Resolve the scripts directory first, then
create the branch with the resolved literal path — two separate commands,
because the safety extension fails closed on inlined command substitution:

```bash
prism-tool resolve scripts
```

```bash
bash <resolved-scripts>/new-branch.sh <type> <description>
```

Ordinary commits on `main` and `develop` are blocked. ADR-0044 permits only the
single root seed on an unborn protected branch with no matching remote ref.

## Enforcement

- `create` runs mandatory local readiness and bundled commitlint.
- `create` serializes the staged index through a private lock, runs signed Git
  and existing hooks against that locked index, publishes it atomically, and
  verifies `HEAD` advanced before printing success.
- Private-message cleanup and locked-index publication are success conditions;
  either failure returns non-zero and activates fatal recovery.
- The commit-msg hook rejects malformed messages and literal backslash-newline
  sequences.
- Merge/revert completion remains owned by `resolve-merge-conflicts` and Git's
  generated messages.
- No launcher commit operation pushes, amends, rebases, tags, or bypasses hooks.

## Cross-refs

- `tdd` — selects the message fields after verification.
- `executing-plans` — uses this process for task commits.
- `resolve-merge-conflicts` — footer-exempt merge and rebase completion.
- `verification-before-completion` — evidence required before creation.
- `AGENTS.md` § Git Workflow — branch, signing, attribution, and push policy.

## Gotchas

- *Asking for per-commit approval* — approved work proceeds directly through
  one atomic launcher operation; do not add another pause.
- *Batching the commit with another tool call* — non-exclusive commit creation
  is fatal and requires `/reload`.
- *Putting a body in shell source* — use a private literal `.prism` body path
  written through Pi's `write` tool.
- *Retrying after failure without reload* — the fatal latch blocks every tool
  until extension teardown.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
