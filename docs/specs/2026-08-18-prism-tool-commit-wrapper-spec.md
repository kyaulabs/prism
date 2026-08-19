# Prism Tool Commit Wrapper — Specification

- **Date:** 2026-08-18
- **Status:** Approved
- **Type:** fix

## Problem

The `conventional-commits` skill currently tells agents to pass a complete
multiline commit message through Bash with ANSI-C `$'...'` quoting. Prism's
safety extension deliberately rejects ANSI-C quoting and non-arithmetic command
substitution because its flat tokenizer cannot prove those constructs safe.
The documented commit recipe therefore conflicts with the enforced safety
boundary and can consume denial-circuit-breaker capacity before a safe spelling
is found.

A regular double-quoted multiline argument can work, but it still places
repository metadata and attribution payloads in agent-generated shell source.
That leaves quoting correctness to every caller and does not provide a stable,
audited commit boundary.

ADR-0070 already assigns fixed workflow mechanics that exceed the safety
tokenizer's supported subset to the `prism-tool` launcher. Signed commit
construction and execution require the same boundary.

## Goals

1. Make `prism-tool` the sole agent-facing wrapper for constructing and creating
   ordinary non-merge, non-revert signed commits.
2. Present the exact validated commit message before any commit mutation.
3. Require explicit human approval before creating a commit.
4. Keep complete multiline commit messages and resolved attribution payloads
   out of shell source. Structured, validated single-line fields (`type`,
   `scope`, `subject`, and issue number) may be passed as inert argv.
5. Preserve the three-footer attribution contract from ADR-0064 and the
   model-agnostic recording policy from ADR-0067.
6. Bind approval to the exact branch, `HEAD`, and staged index that was
   reviewed.
7. Keep existing Git hooks and commitlint enforcement active.
8. Prevent active skills and prompts from drifting back to direct agent-facing
   `git commit` recipes.

## Non-goals

- Do not push branches, create pull requests, merge, amend, rebase, tag, or
  create merge/revert commits.
- Do not weaken the safety extension or add shell-parser exceptions.
- Do not replace Git hooks or commitlint.
- Do not hide commit-hook or signing failures.
- Do not prohibit direct Git commits inside isolated test fixtures that build
  synthetic histories, human-oriented Git documentation, or merge/revert
  completion workflows whose Git-generated messages are footer-exempt.
- Do not add a second Pi extension, external dependency, or persistent user
  configuration surface.

## Architecture

Add a deep, workflow-specific module at:

`packages/prism-core/scripts/prism-tool/commit.js`

The module owns argument validation, readiness, attribution resolution,
message construction, plan lifecycle, staged-state binding, commitlint
validation, signed Git invocation, and sanitized output. `cli.js` only routes
the top-level `commit` command to this module.

The public interface is:

```text
prism-tool commit prepare --type TYPE [--scope SCOPE] --subject SUBJECT \
  [--body-file PATH] [--fixes NN | --refs NN]

prism-tool commit apply --plan PLAN_ID --approval=yes

prism-tool commit discard --plan PLAN_ID
```

The interface is intentionally smaller than the mechanics it hides. It extends
ADR-0070's launcher-owned workflow boundary and introduces no new system
boundary.

## Prepare operation

`commit prepare` performs these steps in order:

1. Run mandatory local-only toolchain readiness.
2. Resolve the current Git repository and branch without fetching or mutating
   remotes.
3. Reject detached `HEAD`, protected branches, and invalid work-branch names,
   except for the documented ADR-0044 single-root seed on an unborn protected
   branch with no corresponding remote-tracking ref.
4. Require a non-empty staged diff. Unstaged changes remain allowed; existing
   partial-staging hook safeguards still apply.
5. Parse and validate the structured message inputs.
6. Resolve `Implemented-by:` from the active `PI_MODEL`, `Tested-by:` through
   `resolve-ocr-model.sh`, and `Signed-off-by:` through
   `resolve-identity.sh`.
7. Construct the complete message in canonical footer order.
8. Validate the message through the bundled commitlint operation.
9. Capture the current branch, `HEAD` or unborn sentinel, and a SHA-256
   fingerprint of the staged index's modes, full blob IDs, stages, and paths.
10. Create a private launcher-owned plan and print the exact message plus its
    opaque plan ID.

### Structured input validation

- `TYPE` must be a supported non-merge Conventional Commit type.
- `SCOPE`, when present, must match `[a-z0-9][a-z0-9._/-]*` and must not end
  with punctuation or contain consecutive separators.
- `SUBJECT` must be one non-empty line, lowercase where required by commitlint,
  have no control characters, and remain within the 100-character header cap
  after type and scope are rendered.
- `--fixes` and `--refs` are mutually exclusive and accept only a positive
  decimal issue number without a leading sign.
- The optional body file must resolve inside the project, be a regular
  non-symlink file, contain valid UTF-8 without NUL or control characters other
  than tab and line feed, and be at most 64 KiB.
- Body line endings normalize to LF. One trailing LF is removed before message
  assembly; internal content is otherwise preserved for commitlint to judge.
- Unknown, duplicated, reordered, or conflicting controls fail closed.

### Message format

The launcher renders:

```text
type(scope): subject

optional body

optional Fixes: #NN or Refs: #NN
Implemented-by: active-model-id
Tested-by: ocr-model-id
Signed-off-by: Name <email>
```

Scope, body, and issue reference are omitted when absent. The final message has
one trailing line feed. Resolver output is validated before interpolation and
never treated as shell source.

## Commit plan

Plans live under a launcher-owned directory in the repository's actual Git
directory:

```text
<git-dir>/prism-tool/commit-plans/<32-lowercase-hex-id>/
```

Each plan directory is mode `0700`; plan and message files are mode `0600`.
Creation uses exclusive, no-follow file operations. A plan contains:

- schema version;
- canonical repository realpath;
- branch name;
- `HEAD` object ID or unborn sentinel;
- staged-index SHA-256 fingerprint;
- fully rendered commit message;
- creation timestamp.

Plans contain no credential values or raw OCR configuration. Plan IDs are
strictly validated before path construction and cannot contain separators or
traversal syntax.

The launcher creates only known files and cleans them by unlinking each known
file followed by removing its exact plan directory. It never performs an
unbounded recursive deletion.

## Apply operation

`commit apply` requires exactly one valid plan ID and literal
`--approval=yes`. It then:

1. Loads the private plan with no-follow semantics and validates its schema,
   ownership, permissions, and repository identity.
2. Recomputes branch, `HEAD`, and staged-index fingerprint.
3. Fails if any value differs from the prepared plan.
4. Re-runs mandatory local-only readiness and commitlint against the frozen
   message.
5. Materializes the frozen message as a private launcher-owned file.
6. Invokes Git through bounded argv exactly as:

   ```text
   git commit -S -F <owned-message-file>
   ```

7. Allows the existing prepare-commit-msg, pre-commit, and commit-msg hooks to
   run normally.
8. Confirms that `HEAD` advanced to a new commit and prints its object ID.
9. Removes all files owned by the plan.

Any usage, readiness, stale-state, hook, signing, Git, timeout, or output-limit
failure creates no claimed success. Apply invalidates and removes the plan on
both success and failure; retry requires a fresh prepare so approval can never
be replayed against changed state.

The operation never invokes `git push` or any network command.

## Discard operation

`commit discard` validates the plan ID and removes only the known files in the
matching launcher-owned plan directory. A missing plan is an idempotent
success. It performs no Git mutation.

The `conventional-commits` skill uses discard when the human declines or
replaces a prepared message.

## Exit statuses and diagnostics

The operation uses the launcher's existing classes:

- `0` — success;
- `2` — invalid invocation or malformed input;
- `3` — readiness or attribution resolution failure;
- `4` — commitlint, hook, signing, Git, timeout, or bounded-process failure;
- `5` — stale, mismatched, malformed, or inaccessible commit plan.

Diagnostics identify the failed boundary without printing credentials, raw OCR
configuration, untrusted file content, or stack traces. Bounded Git and hook
output may be displayed as inert diagnostics and is never evaluated.

## Skill and prompt integration

Update `packages/prism-core/skills/conventional-commits/SKILL.md` so its
mandatory process is:

1. Select type, scope, subject, optional body, and optional issue reference.
2. Write an optional body to a uniquely named `.prism/commit-body-<nonce>.txt`
   file using Pi's `write` tool rather than shell interpolation.
3. Run `prism-tool commit prepare` with substitution-free arguments.
4. Remove the body input with a literal, fully known path after prepare returns,
   whether preparation succeeds or fails.
5. Display the launcher's exact rendered message and wait for explicit human
   confirmation.
6. Run `prism-tool commit apply --plan <literal-id> --approval=yes`.
7. Report the resulting commit ID and never push.
8. Run `commit discard` if approval is declined or the message is replaced.

Remove ANSI-C quoting, command substitution, multiline `-m`, and direct
agent-facing `git commit` recipes from the skill. Update the commit-msg hook's
literal-backslash diagnostic to point to `prism-tool commit` rather than
recommending `$'...'`.

Other active skills and prompts delegate ordinary agent-created commits to the
`conventional-commits` skill and launcher operation instead of duplicating Git
recipes. Direct `git commit` remains permitted in tests that create synthetic
repository history, human-oriented Git documentation, inert historical
records, and merge/revert completion workflows whose Git-generated messages
are footer-exempt.

## Drift prevention

Harness validation and shell regression coverage scan active skills and prompts
for agent-facing direct ordinary-commit recipes. New runnable `git commit`,
`$'...'` commit-message guidance, or command-substitution-based attribution
recipes are rejected unless the occurrence is an explicitly scoped test-fixture
history operation or a merge/revert completion workflow.

The exact `prism-tool commit prepare`, `apply`, and `discard` commands from the
skill are passed through the public safety tool-call handler. Functional tests
alone are insufficient because ADR-0070 requires testing the actual Pi safety
boundary.

## Testing

### Launcher unit tests

Add `tests/Node/prism-tool-commit.test.js` with behavior-level coverage for:

1. Prepare renders the canonical message and three footers.
2. Scope, body, `Fixes:`, and `Refs:` render correctly.
3. Invalid, duplicated, conflicting, or reordered arguments fail closed.
4. Invalid type, scope, subject, body encoding, issue number, model, identity,
   or OCR output fails without creating a plan.
5. Missing readiness, repository, branch, staged changes, or commitlint blocks
   preparation.
6. Ordinary protected branches are rejected and the ADR-0044 unborn single-root
   seed remains supported.
7. Plan paths, modes, schema, no-follow behavior, and bounded sizes are
   enforced.
8. Apply requires literal approval and a valid plan ID.
9. Branch, `HEAD`, repository, or staged-index drift blocks apply.
10. Apply invokes exactly `git commit -S -F <owned-message-file>` through the
    injected process boundary.
11. Hook, signing, Git, timeout, and output failures never report success.
12. Success prints the new commit ID.
13. Success and failure remove owned plan artifacts.
14. Discard is traversal-safe, ownership-bounded, and idempotent.
15. No subprocess argument contains evaluated repository or message content.

### Integration and contract tests

Update shell and Node contract tests to prove:

1. The exact skill commands pass the public safety classifier.
2. Active agent-facing resources contain no direct `git commit` recipe,
   ANSI-C commit message, or command-substitution attribution recipe.
3. The commit-msg hook recommends the launcher operation.
4. Existing commitlint and hook suites remain green.
5. Package archives include the new launcher module.
6. Test-fixture Git-history setup and footer-exempt merge/revert completion
   remain unaffected.
7. A temporary repository can prepare, approve, and reach the signed Git
   invocation boundary without shell-interpolating message content.

## Acceptance criteria

- Every active agent-facing non-merge, non-revert signed commit flow uses
  `prism-tool commit`.
- Complete multiline commit messages and resolver output never appear in Bash
  source; only structured, validated single-line fields appear as inert argv.
- The launcher prints the exact commit message before mutation.
- Only a literal approval tied to an unchanged branch, `HEAD`, repository, and
  staged index can create a commit.
- Commits retain the ADR-0064 footer order and ADR-0067 passive model
  attribution.
- Existing hooks and commitlint run for the signed commit.
- Protected-branch rules and the ADR-0044 root-seed exception remain intact.
- Plans and temporary message files are private, bounded, no-follow, and cleaned
  without recursive deletion.
- Safety remains fail closed with no new exception or extension.
- The launcher never pushes.
- `/check` and the four-axis `code-review` complete before the implementation
  branch is handed back.

## Architecture decision

No new ADR is required. ADR-0070 already decides that fixed workflow mechanics
which exceed the safety tokenizer's supported subset belong in narrow,
audited `prism-tool` operations. This specification applies that accepted
decision to signed commits without changing its boundary.
