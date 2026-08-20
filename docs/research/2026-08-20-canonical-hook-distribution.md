# Canonical Prism hook distribution contract

## Summary

Prism Core should package a small, language-agnostic set of executable Git hook
wrappers and install them create-only into `.github/hooks/`. A core-owned
launcher operation should inspect and apply the hook plan, while the existing
`install-hooks.sh` remains a compatibility entry point that delegates to that
operation.

The installation contract is deliberately strict:

1. package four canonical hooks with executable modes;
2. inspect every source, target, legacy hook, and Git-config state before any
   mutation;
3. create only absent canonical files through same-directory atomic renames;
4. preserve byte-identical canonical files without rewriting or chmodding them;
5. preserve every unrelated hook and its mode;
6. fail closed, without partial creation, when a canonical pathname conflicts,
   an active legacy hook would be displaced, or another `core.hooksPath` is
   configured; and
7. set repository-local `core.hooksPath` to `.github/hooks` only after the
   complete hook surface is canonical.

The packaged hooks should be thin wrappers around `prism-tool hook <event>`.
Core owns generic commit, branch, and history policy; the active adapter owns
stack-specific staged and pre-push quality behavior behind the launcher
boundary. This keeps PHP, Pest, SCSS, and project-layout assumptions out of the
global core package while preventing copied hook implementations from growing
into independent policy engines.

## Decision

### 1. Package-owned canonical source

Add a package resource rooted at:

```text
packages/prism-core/hooks/
├── manifest.json
├── pre-commit
├── commit-msg
├── prepare-commit-msg
└── pre-push
```

Add `hooks` to `packages/prism-core/package.json`'s published `files` list.
`manifest.json` is the single inventory and records a schema version, each hook
basename, and required mode `0755`. The installer rejects duplicate names,
path separators, unsupported names, missing files, symlinks, non-regular
files, and source modes other than `0755`.

Tests must prove bidirectional manifest parity: every listed file exists and
every packaged hook file is listed. `npm pack --json` and the Git index must
both report executable modes for all four wrappers.

The package directory, not the repository-root `.github/hooks/`, is the
canonical consumer source. The Prism repository's current hooks contain
repository-development behavior such as harness validation and automatic
submodule updates; copying them wholesale would leak Prism-repository concerns
into consumers.

### 2. Canonical hook inventory

Package exactly these four hooks:

| Hook | Owner behind the wrapper | Required contract |
| --- | --- | --- |
| `pre-commit` | Core dispatch plus active adapter | Fail-closed readiness and staged-file policy through an adapter-neutral launcher interface. |
| `commit-msg` | Prism Core | Literal-backslash guard, Conventional Commit validation, and launcher-owned attribution/policy compatibility. |
| `prepare-commit-msg` | Prism Core | Protected-branch, branch-name, initial-root, and pushed-amend policy. |
| `pre-push` | Prism Core plus active adapter | Protected-ref, non-fast-forward, initial-root, and no-squash policy, followed by the adapter's shared local quality gate. |

Do not package `post-checkout` or `post-merge`. Their current implementation
runs recursive submodule initialization after ordinary Git operations. That is
repository-specific, may perform unexpected network access, and is not part of
a testing-ready application-free consumer scaffold. Projects that need those
hooks may keep their own versions as unrelated custom hooks.

Do not add hook names solely to reserve them. A package update may add a new
canonical hook only through an explicit contract change and compatibility
review.

### 3. Thin wrappers, deep launcher operation

Each packaged hook is a stable executable wrapper. It validates that
`prism-tool` is available, then delegates with the original Git arguments and,
for `pre-push`, the original standard input:

```text
prism-tool hook pre-commit
prism-tool hook commit-msg <message-file>
prism-tool hook prepare-commit-msg <message-file> [source] [sha]
prism-tool hook pre-push <remote-name> <remote-url>
```

The wrapper must not:

- reference `packages/prism-core` or a source checkout;
- name PHP, Pest, Composer, SCSS, JavaScript, Aurora, `vendor`, or `cdn`;
- invoke `vendor/bin`, `npx`, or ambient adapter tools;
- contain the staged-file implementation or the shared PHP/web quality gate;
- source consumer-controlled shell fragments; or
- auto-chain another same-event hook.

`prism-tool hook` is the deep module. It owns argument validation, bounded
standard-input handling, readiness, generic policy, adapter discovery, and
status propagation. Core handles generic events; pre-commit and pre-push may
delegate through the active adapter handler. The PHP/web adapter can invoke
its generated `.github/scripts/check-php.sh` and staged checks without making
those paths part of the core hook package.

This follows ADR-0070: fixed workflow mechanics live behind one narrow
launcher interface instead of being duplicated in agent-visible shell or in
large copied hook programs. The wrappers fail closed when the launcher,
required readiness, active adapter, or delegated operation is unavailable.

### 4. Core-owned inspect/apply surface

Expose two deterministic core operations:

```text
prism-tool hooks inspect --json
prism-tool hooks apply --approval=yes --json
```

`inspect` is read-only. `apply` accepts only literal `--approval=yes`, repeats
the complete inspection immediately before mutation, and applies only the
returned canonical plan. Neither operation requires registry access or adapter
dependency resolution.

Keep `packages/prism-core/scripts/install-hooks.sh` as a compatibility entry
point. It self-locates through the installed package, invokes the same launcher
operation, and contains no separate copy/config implementation. Directly
running that script is an explicit request to apply the hook plan; agent-run
workflows still obtain human mutation approval before invoking it.

The JSON report should use stable statuses:

```text
CREATE     canonical hook is absent
PRESERVE   canonical bytes and mode already match
EXTRA      unrelated target hook is preserved
CONFLICT   canonical pathname differs or has an unsafe type/mode
DISPLACED  an active legacy/configured hook surface would stop running
```

The overall result is GO only when every canonical hook is `CREATE` or
`PRESERVE`, no `CONFLICT` or `DISPLACED` item exists, and the configuration can
be activated without replacing another value.

### 5. Source and path attestation

Before examining content, the launcher must establish:

- the current working directory belongs to one Git worktree;
- the project root is the literal `git rev-parse --show-toplevel` result;
- the core package root is self-located and realpath-contained;
- the manifest and every source hook remain inside the package hook directory;
- `.github`, `.github/hooks`, and every target path component are absent or
  real directories, never symlinks; and
- every canonical target is absent or a regular non-symlink file.

No manifest value may become shell source. Basenames are allowlisted and joined
as filesystem paths by the launcher. The operation never follows a target
symlink, FIFO, socket, device, or directory.

### 6. Create-only compatibility matrix

For each canonical target:

| Existing state | Result | Mutation |
| --- | --- | --- |
| Absent | `CREATE` | Create canonical bytes as mode `0755`. |
| Regular file, identical bytes, exact mode `0755` | `PRESERVE` | None; do not rewrite, touch, or chmod. |
| Regular file, different bytes | `CONFLICT` | Preserve bytes and mode; fail closed. |
| Regular file, identical bytes, different mode | `CONFLICT` | Preserve bytes and mode; fail closed. |
| Symlink or non-regular path | `CONFLICT` | Do not follow or replace; fail closed. |

Exact mode is part of compatibility, matching the scaffold transaction's
static-file rule. Accepting merely "some executable bit" would hide group,
world, or owner-mode drift and make package-to-project parity untestable.

Files in `.github/hooks/` whose names are not in the canonical manifest are
`EXTRA`. Preserve their bytes, metadata, and executable modes. They become
active under `.github/hooks` according to Git's normal hook naming rules. The
inspection preview must list them so activation is not surprising.

A differing existing same-event hook is never renamed, backed up, wrapped,
merged, or chained automatically. Hook ordering, standard input, arguments,
and failure propagation are security-sensitive behavior; Prism cannot infer a
safe composition.

### 7. Preserve active legacy hook surfaces

Setting `core.hooksPath` silently disables the default `$GIT_DIR/hooks`
directory and overrides inherited system/global configuration. File
preservation alone is therefore insufficient: the installer must preserve
active behavior as well.

Before mutation, inspect:

1. every effective `core.hooksPath` value and origin; and
2. `$GIT_DIR/hooks/` for executable non-`.sample` hooks.

Use these rules:

| State | Result |
| --- | --- |
| No effective `core.hooksPath`, no active legacy hooks | Compatible. |
| Effective value is exactly `.github/hooks` | Compatible after target validation. |
| Any other effective value, including `/dev/null` | `DISPLACED`; preserve config and fail closed. |
| Executable non-sample hook under `$GIT_DIR/hooks/` while hooksPath is unset | `DISPLACED`; preserve it and fail closed. |
| Non-executable files and `*.sample` defaults under `$GIT_DIR/hooks/` | Ignore as inactive. |

Do not migrate personal/global hooks, move files out of `.git/hooks`, or create
an implicit hook multiplexer. The report should give human remediation:
manually reconcile the existing hook manager or same-event hook into
`.github/hooks/`, then rerun setup.

The canonical configured value is the literal repository-local value:

```text
.github/hooks
```

Do not write system or global Git configuration. A relative tracked path keeps
the hook surface available in ordinary linked worktrees without package-path
or machine-path coupling.

### 8. Two-phase, monotonic application

Application has a strict preflight and apply split:

1. inspect package manifest and source modes;
2. inspect all target paths, custom hooks, legacy hooks, and config origins;
3. stop before any write if any conflict or displacement exists;
4. create missing directories only when their complete path is safe;
5. create every missing hook through a unique same-directory temporary file;
6. write canonical bytes, set mode `0755`, flush, and atomically rename into
   the absent target pathname;
7. verify every canonical target's bytes and mode;
8. set local `core.hooksPath` only after all files verify; and
9. read back the effective value and report GO.

The operation is monotonic and rerunnable. If it is interrupted after some
files are created but before config activation, the next run sees those files
as `PRESERVE` and creates the remainder. For a caught apply error, remove only
files created by that invocation whose bytes and modes still match the
expected canonical state; never remove or restore a pre-existing file.

Configuration is the final commit point. If config activation or verification
fails, remove only this invocation's safely attributable creations and restore
the prior local config state. Existing custom hooks and configuration are
never included in rollback ownership.

### 9. Relationship to the PHP/web scaffold transaction

Canonical hooks remain an independent Prism Core operation, as fixed by the
PHP/web scaffold inventory and transaction decisions. They are not placed in
the adapter desired-tree plan and do not share its registry, manifest, lock,
or candidate-workspace approval.

The final end-to-end orchestration decision should order the operations so that:

- Git exists before hook inspection/application;
- the adapter and generated quality surface exist before the first ordinary
  commit or push invokes delegated checks;
- canonical hooks are active before Prism creates or asks the human to create
  the initial root commit; and
- the existing ADR-0044 single-root exception permits that first `develop`
  commit and push without weakening later protected-branch enforcement.

If adapter setup fails before its desired state is committed, hook activation
should not proceed. If adapter post-apply verification fails after commit, the
final orchestration decision must define whether hooks remain active while the
project reports NO-GO.

### 10. Acceptance criteria

The contract is complete only when tests prove:

1. `npm pack` includes `hooks/manifest.json` and exactly the four canonical
   hook wrappers;
2. all source and packed hook modes are executable and exactly `0755`/`100755`
   at their respective filesystem/Git seams;
3. the manifest and packaged directory are bidirectionally complete;
4. no packaged hook contains PHP/web vocabulary or repository checkout paths;
5. an empty compatible repository receives all four files atomically and local
   `core.hooksPath=.github/hooks`;
6. rerunning preserves canonical files without changing bytes, mode, inode,
   or modification time;
7. a differing canonical file remains byte- and mode-identical, no missing
   canonical file is created, and config remains unchanged;
8. an identical canonical file with a non-canonical mode remains untouched and
   causes NO-GO;
9. unrelated `.github/hooks/*` files and modes survive unchanged;
10. active `$GIT_DIR/hooks/*` files block activation and remain untouched;
11. inherited, global, local, or worktree `core.hooksPath` values other than the
    exact canonical value block activation and remain unchanged;
12. symlinked directories, symlinked targets, non-regular files, malformed
    manifests, and source mode drift fail before mutation;
13. an injected mid-apply or config failure rolls back only safely attributable
    new files and the operation's own config write;
14. `pre-push` preserves Git's standard input and every wrapper preserves the
    original positional arguments;
15. missing launcher, readiness failure, adapter-discovery failure, or delegated
    check failure propagates as a hook failure;
16. the initial root on `develop` passes the exact ADR-0044 exception while a
    later protected-branch commit or direct push fails; and
17. no packaged `post-checkout` or `post-merge` hook performs implicit
    submodule/network work.

## Alternatives considered

### Copy the repository-root hooks wholesale

Rejected. The current files include PHP/web lint selection, Prism harness
validation, repository paths, and recursive submodule updates. They violate the
core/adapter boundary and would give consumers repo-development behavior they
did not request.

### Let the adapter package the hooks

Rejected. Commit message, branch naming, protected refs, history preservation,
and hook activation are language-agnostic Prism policy. Adapter ownership would
duplicate those rules across every future stack and contradict the ownership
boundary already recorded by the scaffold decisions.

### Install per-hook symlinks into `.git/hooks`

Rejected. Symlinks are untracked, worktree-sensitive, package-location coupled,
and prone to executable-mode and stale-target failures. The existing
`core.hooksPath` decision avoids those defects.

### Overwrite or back up differing hooks

Rejected. A backup preserves bytes but not active composition or ordering.
Replacing a user hook remains a behavior mutation, and automatic chaining
cannot prove safe argument, stdin, or failure semantics.

### Set `.github/hooks` despite another hooksPath

Rejected. A local override would silently disable a global hook manager or an
intentional `/dev/null` setting. That violates the requirement to preserve
existing hooks and fails closed only after behavior has changed.

### Accept identical bytes with any executable mode

Rejected. It creates mode drift, weakens package parity, and invites setup to
silently normalize metadata that the create-only contract promises to
preserve.

### Keep full policy logic in copied hook files

Rejected. Large copied programs become stale consumer forks and mix adapter
logic into Prism Core. Thin wrappers plus one launcher dispatch provide a much
smaller stable interface and centralize bounded input, readiness, and adapter
delegation.

## Consequences

- **Positive:** consumer hooks are packaged, testable, executable, and
  independent of a Prism source checkout.
- **Positive:** existing files, custom hooks, modes, hook managers, and Git
  configuration are never silently replaced.
- **Positive:** core policy remains language-agnostic while adapter quality
  checks remain adapter-owned.
- **Positive:** reruns converge through create/preserve states without needing a
  durable journal.
- **Negative:** a customized same-event hook or global hook manager blocks
  automatic setup until a human explicitly reconciles it.
- **Negative:** strict mode equality rejects hooks that are executable but not
  exactly canonical.
- **Negative:** the launcher gains hook dispatch and bounded Git-hook input as a
  new public compatibility surface.
- **Neutral:** Prism's own repository may keep additional repo-specific hooks,
  but they are not part of the published consumer inventory.

No new dependency or safe directory is required. The design composes existing
core/adapter ownership, launcher mechanics, protected-branch, and local/CI
parity decisions; the later architect review can determine whether the public
hook-dispatch interface merits a dedicated Pi-era ADR.

## Sources

1. `CONTEXT.md` — Prism Core/stack-adapter ownership and toolchain boundaries.
2. `packages/prism-core/scripts/install-hooks.sh` — current hooksPath-only
   installer and source-checkout assumption.
3. `packages/prism-core/package.json` and
   `tests/Node/toolchain-packaging.test.js` — current published resources and
   executable-mode package tests.
4. `.github/hooks/pre-commit`, `commit-msg`, `prepare-commit-msg`, and
   `pre-push` — current policy and stack/repository coupling.
5. `.github/hooks/post-checkout` and `post-merge` — current implicit recursive
   submodule behavior excluded from consumers.
6. `tests/Shell/install-hooks_test.sh` — current hooksPath, mode, worktree, and
   no-symlink regression seams.
7. `packages/prism-core/prompts/setup.md` — current approval and hook activation
   flow.
8. `docs/research/2026-08-20-testing-ready-scaffold.md` — Core ownership of Git
   initialization/hooks and the adapter-owned shared quality surface.
9. `docs/research/2026-08-20-php-web-scaffold-transaction.md` — independent
   adapter desired-state transaction and create-only static-file rules.
10. `docs/research/2026-08-20-testing-ready-generated-ci.md` — one shared
    local/CI PHP/web gate and first-push-safe behavior.
11. `adr/0025-ci-local-parity-principle.md` — pre-remote enforcement and shared
    local/CI policy.
12. `adr/0044-pr-only-protected-branches.md` — protected refs and exact
    initial-root exception.
13. `adr/0058-core-adapter-package-split.md` — language-agnostic core boundary.
14. `adr/0060-global-core-project-local-adapter-install.md` — installed-package
    and consumer ownership model.
15. `adr/0070-launcher-owned-workflow-mechanics.md` and
    `adr/0073-safety-compatible-instruction-shell-contract.md` — narrow
    launcher interfaces and observable instruction-layer execution.
16. Git's `core.hooksPath` configuration contract and the repository's current
    `.git/config`/README behavior — a configured hooks path supersedes default
    `.git/hooks` execution.
