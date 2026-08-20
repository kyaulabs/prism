# Safe Prism Core Git initialization contract

## Summary

`/setup` should delegate Git repository discovery and initialization to one
narrow Prism Core launcher operation. The operation preserves every valid
existing repository, creates only an absent `.git` repository, and initializes
new repositories with an unborn `develop` branch. It creates no commit, remote,
work branch, hook, identity, signing configuration, or global Git setting.

The operation is automatic because invoking `/setup` already requests the
create-only local bootstrap. It requires no additional mutation prompt, performs
no network access, and does not authorize later adapter, hook, GitHub, commit, or
push operations.

The public seam should be:

```text
prism-tool setup init-git --json
```

The launcher owns path attestation, ambient-environment isolation, repository
classification, deterministic initialization, postcondition verification, and
safe failure reporting. This replaces the current prompt-level
`git rev-parse --show-toplevel` preflight, which stops before setup can repair an
absent repository and cannot safely express the required multi-step mechanics.

## Decision

### 1. Core-owned launcher boundary

Git discovery and initialization are language-agnostic Prism Core behavior.
They must run before adapter scaffold resolution and before canonical hook
inspection. The PHP/web adapter never creates, removes, repairs, or configures
`.git`.

`prism-tool setup init-git --json` operates only on the current Pi project. It
accepts no caller-supplied repository path, branch name, template path, object
format, ref format, or Git configuration override. Repository-derived values
remain inert launcher data and are never evaluated as shell source.

The operation has three dispositions:

| Disposition | Meaning |
| --- | --- |
| `CREATE` | No containing repository or `.git` entry exists; create and verify a new repository. |
| `PRESERVE` | A valid containing repository already exists; change nothing and report its state. |
| `CONFLICT` | Git state is unsafe, malformed, redirected, or incompatible; change nothing further and return NO-GO. |

A JSON report records a schema version, command, overall `GO`/`NO-GO` status,
disposition, canonical project root, Git directory kind, branch/HEAD state,
object format, ref format when supported, and bounded diagnostic checks. It
must not include arbitrary Git configuration or hook contents.

### 2. Project-root and repository discovery

The launcher realpaths the current working directory and requires it to be a
real directory. It clears repository-redirection variables such as `GIT_DIR`,
`GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, and
`GIT_INDEX_FILE` for its bounded Git subprocesses so ambient process state
cannot redirect setup outside the current project.

Discovery follows these rules:

1. If Git identifies the current directory as part of an existing non-bare
   worktree, preserve it and use the literal `git rev-parse --show-toplevel`
   result as the canonical project root. Running setup from a repository
   subdirectory therefore does not create a nested repository.
2. A valid `.git` directory or Git worktree/submodule gitfile is preserved.
   The launcher resolves the Git directory through Git and verifies it remains
   associated with the discovered worktree; it does not parse a gitfile as
   shell or follow an arbitrary project symlink.
3. A bare repository, a `.git` symlink, a malformed gitfile, an unreadable Git
   directory, contradictory worktree results, or a `.git` path of any other
   kind is `CONFLICT` and NO-GO.
4. If no containing worktree exists and the current directory has no `.git`
   entry, the current real directory is the new project root and initialization
   may proceed. Existing non-Git project files and directories are allowed and
   remain untouched.

Setup never initializes a nested repository merely because the current
subdirectory lacks its own `.git` entry.

### 3. Deterministic new-repository state

A newly created repository has these exact externally visible postconditions:

- `.git` is a real directory rooted in the current project;
- `HEAD` is the symbolic ref `refs/heads/develop`;
- `HEAD` is unborn and the repository contains zero commits and zero refs;
- the object format is `sha1`, matching the generated PHP/web CI contract's
  40-hex comparison-object surface;
- the ref format is the ordinary `files` format, independent of an ambient
  `init.defaultRefFormat` preference;
- no remote exists;
- no commit, index entry, tag, stash, work branch, or `main` branch exists;
- no local identity, signing, credential, merge, pull, or push configuration is
  added; and
- no `core.hooksPath` value or active legacy hook is created.

The launcher uses explicit initialization inputs rather than ambient defaults:
initial branch `develop`, object format `sha1`, files refs, and an owned empty
template directory. This prevents `init.defaultBranch`,
`init.defaultObjectFormat`, `init.defaultRefFormat`, `init.templateDir`,
`GIT_TEMPLATE_DIR`, and the system sample-hook directory from changing the
created surface. The launcher removes its empty temporary template after the
operation.

If the installed Git cannot honor or verify this contract, setup returns
NO-GO with a capability remediation. It must not fall back to Git's configured
default branch, create `master`/`main` and rename it later, or silently accept a
different repository format.

### 4. Preserve and classify existing repositories

Initialization is never rerun against an existing repository. `PRESERVE`
performs no write, does not refresh templates, and does not change branch,
object/ref format, remotes, config, hooks, index, refs, or worktree metadata.

The report distinguishes these existing HEAD states for the later orchestration
decision:

- born symbolic branch;
- unborn `develop`;
- unborn branch other than `develop`; and
- detached HEAD.

A structurally valid existing repository remains preserved even when its branch
state is unsuitable for scaffold mutation. Unborn non-`develop`, detached,
unsupported object-format, or protected-branch continuation is reported as an
incompatibility and NO-GO for the end-to-end bootstrap; setup does not repair it
automatically. A human may reconcile the repository and rerun `/setup`.

Existing SHA-256 repositories are therefore never converted or deleted. They
are preserved and reported incompatible with the current generated PHP/web
40-hex CI baseline. Supporting them requires a separate contract change across
the shared gate and generated CI rather than an implicit Git conversion.

### 5. Create-only application and failure safety

Before creation, the launcher attests the project root, confirms no containing
repository exists, confirms `.git` is absent with `lstat`, and takes one
exclusive ownership-marked initialization lock. It then runs the narrow Git
initialization and verifies every postcondition before reporting `CREATE`/GO.
The lock and temporary template are removed after success.

The operation never writes outside its owned temporary state and the absent
`.git` destination. It does not touch existing project files, including
`.gitignore`, `.gitattributes`, manifests, source, tests, `.github`, or `.pi`
configuration.

If Git fails or a postcondition differs:

1. report the failed phase and preserve all pre-existing project content;
2. remove only operation-owned temporary files;
3. remove an incomplete `.git` only when the launcher can prove it was created
   by this invocation and remains in the exact known initialization state; and
4. when concurrent or third-state modification makes ownership uncertain,
   preserve `.git`, report its path for manual recovery, and fail closed.

A rerun after a verified success is `PRESERVE` and performs zero writes. Two
concurrent setup attempts serialize on the operation lock; a stale lock is not
removed unless ownership and process state can be proved safely.

### 6. Relationship to protected branches and the initial seed

Git initialization ends before the first commit. The later orchestration may
activate canonical hooks and then ask for the initial root commit. That commit
is the sole ADR-0044 protected-branch exception: an unborn `develop` branch,
one root commit, and no matching remote ref. Only the human pushes the initial
`develop` seed.

This operation does not create `main`, create a work branch, configure a remote,
run `/setup-rulesets`, commit, or push. Those actions remain separate workflow
boundaries. Once the root commit exists, ordinary changes follow the normal
work-branch and PR-only integration policy.

### 7. End-to-end ordering contract

The final orchestration decision should use this order around the core Git
operation:

1. make the Prism Core launcher available;
2. run `prism-tool setup init-git --json` automatically;
3. stop on Git NO-GO before adapter registry access or project mutation;
4. resolve and apply the adapter-owned testing scaffold;
5. inspect and apply canonical core hooks only after the adapter quality surface
   is committed and verified sufficiently for hook delegation;
6. verify the combined local quality surface; and
7. leave root commit, remote configuration, GitHub rulesets, and first push as
   explicit later boundaries.

The adapter transaction never rolls back a successfully created repository,
and Git initialization never removes adapter files. Each owner remains
independently rerunnable.

## Acceptance criteria

Tests at the public launcher seam must prove:

1. a non-Git directory with arbitrary existing project files receives only a
   valid `.git` directory and preserves every existing byte and mode;
2. the new repository has unborn `develop`, zero commits/refs/remotes, SHA-1
   objects, files refs, and no hooksPath or active template hook;
3. global/system `init.defaultBranch`, object/ref-format preferences, template
   directories, and Git repository-redirection environment variables cannot
   alter or redirect the created repository;
4. a second run reports `PRESERVE` and does not change bytes, modes, mtimes,
   refs, config, or HEAD;
5. invocation from a subdirectory of an existing worktree preserves the
   containing repository and returns its top level without creating nested
   `.git` state;
6. ordinary repositories, linked worktrees, and valid submodule gitfiles are
   preserved without writes;
7. bare repositories, `.git` symlinks, malformed gitfiles, non-regular `.git`
   paths, unreadable state, or contradictory roots fail before mutation;
8. an existing unborn non-`develop` branch, detached HEAD, unsupported object
   format, or other orchestration-incompatible state is preserved and reported
   NO-GO rather than normalized;
9. unsupported Git initialization capabilities fail without falling back to an
   ambient default branch or repository format;
10. injected failure before `.git` creation leaves no persistent project
    mutation;
11. injected failure after partial initialization removes only provably owned
    state, while a concurrent third state is preserved for manual recovery;
12. concurrent invocations cannot overwrite or replace one another's `.git`;
13. initialization performs no network operation and creates no remote, commit,
    `main`, work branch, hook, identity, signing setting, credential setting, or
    GitHub state; and
14. the operation's command and JSON output pass the public Pi safety boundary
    without command substitution or caller-supplied filesystem paths.

## Alternatives considered

### Keep prompt-level `git rev-parse` and ask to continue without Git

Rejected. It cannot reach the destination because an absent repository is the
state setup must repair, and it leaves hooks, branch policy, and later
orchestration without a canonical root.

### Run `git init` directly from the prompt

Rejected. Prompt shell cannot safely own environment isolation, path
attestation, compatibility classification, rollback, and structured reporting.
ADR-0070 places fixed multi-step mechanics behind the launcher.

### Initialize with Git's ambient defaults, then rename the branch

Rejected. It can briefly create the wrong branch, inherits object/ref/template
preferences, and introduces a second mutation that may fail after partial
initialization. The desired state must be selected at repository creation.

### Reinitialize every existing repository

Rejected. Git documents reinitialization as safe for repository data but it may
copy newly added templates. `/setup` promises preservation, so existing
repositories receive inspection only and zero `git init` calls.

### Rename an existing unborn branch to `develop`

Rejected. Even an unborn branch is existing repository state. Automatic rename
would violate preservation and could invalidate user tooling or remote intent.
Setup reports the incompatibility and leaves remediation to the human.

### Create the first commit automatically

Rejected. The root commit includes the approved scaffold/specification history,
requires signing and attribution, activates the ADR-0044 exception, and is
followed by a human-only push. Git initialization must not collapse those
separate consent and provenance boundaries.

### Let the PHP/web adapter initialize Git

Rejected. Repository identity, branch policy, protected refs, and hooks are
language-agnostic Core concerns. Adapter ownership would duplicate Git policy
and violate the Core/adapter boundary.

## Consequences

- **Positive:** `/setup` can bootstrap a non-Git project without a preliminary
  manual command.
- **Positive:** reruns preserve existing repositories and converge without
  template refresh or branch normalization.
- **Positive:** new repositories deterministically align with `develop`, the
  initial-root exception, canonical hooks, and the current generated CI object
  format.
- **Positive:** unsafe Git state fails before registry, adapter, hook, commit,
  remote, or GitHub effects.
- **Negative:** existing detached, unborn non-`develop`, SHA-256, bare, or
  malformed repositories require human remediation instead of automatic repair.
- **Negative:** the launcher gains another public setup operation and failure-
  recovery test surface.
- **Neutral:** no new dependency, credential access, network permission, global
  Git configuration, or safety-extension surface is required.

This decision stays within the existing Core ownership and launcher mechanics.
Architect review can determine whether deterministic repository format and the
new public setup operation require a Pi-era ADR.

## Sources

1. `CONTEXT.md` — Prism Core/adapter ownership, protected-branch, work-branch,
   and external-effect boundaries.
2. `packages/prism-core/prompts/setup.md` — current non-Git stop path and setup
   approval model.
3. `packages/prism-core/scripts/prism-tool/cli.js` — existing launcher-owned
   setup namespace and structured GO/NO-GO reporting.
4. `adr/0044-pr-only-protected-branches.md` — `develop`/`main` protection and
   exact single-root seed exception.
5. `adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md` —
   unborn greenfield scaffold and human initial push requirements.
6. `adr/0070-launcher-owned-workflow-mechanics.md` and
   `adr/0073-safety-compatible-instruction-shell-contract.md` — narrow launcher
   interfaces and observable, substitution-free prompt execution.
7. `docs/research/2026-08-20-testing-ready-scaffold.md` — Core ownership of Git
   initialization and initial `develop`; adapter ownership of the quality
   scaffold.
8. `docs/research/2026-08-20-php-web-scaffold-transaction.md` — independent,
   journaled adapter transaction and no `.git` ownership.
9. `docs/research/2026-08-20-canonical-hook-distribution.md` — Git-before-hooks
   ordering, create-only hook activation, and ADR-0044 integration.
10. `docs/research/2026-08-20-testing-ready-generated-ci.md` — current 40-hex
    first-push comparison-object contract.
11. Local Git 2.55 `git-init(1)` documentation — safe reinitialization,
    `--initial-branch`, object/ref-format controls, and template precedence.
12. [feat(setup): define safe core git initialization](https://github.com/kyaulabs/prism/issues/354)
    — wayfinder question resolved by this research.
