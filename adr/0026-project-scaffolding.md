# 0026. Project Scaffolding

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-18

## Status

Accepted

## Context

The `/setup` command currently performs an in-place sweep of 7 token types
across 20 files (ADR-0007). It operates on the template checkout itself —
rewriting identity tokens, `<app>`, and `<domain>` placeholders directly in the
working tree. This is sufficient for a single-project checkout but does not
support the growing pattern of scaffolding a standalone sibling project inside
the same clone.

Issue #117 requests a second mode: scaffold a subfolder that is a complete,
self-contained project with a portable quality surface — git hooks, CI
workflow, `.github/scripts/` harness, lint/format configs, shell-test helper,
and lockfile manifests — so that a project scaffolded on a staging box without
the template or opencode harness can still run lint + tests + hooks + CI.

An architect review returned `GO-WITH-CONDITIONS`, requiring an ADR that
locks the dual-mode contract, the manifest pattern, the `setup_version` 2→3
migration with split checks, the `--target-dir` flag specification, re-run
semantics, and the rationale for the quality-surface scope.

## Decision

1. **Dual-mode design.** `/setup` gains a second mode — subfolder scaffold —
   additive to the unchanged legacy in-place sweep. The legacy mode remains the
   default and is selected when the user picks "skip" at the scaffold prompt.
   When the user picks "clone" or "new," the scaffolded subfolder becomes the
   target of all subsequent token-substitution steps (§3–§7).

2. **Manifest as single source of truth.** `.github/scripts/quality-surface.manifest`
   is the canonical list of every file copied into a scaffolded project. The
   scaffolder reads it; shell tests validate bidirectional parity against the
   template root (every manifest entry exists on disk, and every template-root
   quality-surface file is listed in the manifest). No duplicated file lists in
   `setup.md` or the script. The set covers: git hooks (`commit-msg`, `pre-commit`,
   `pre-push`, `post-checkout`, `post-merge`, `prepare-commit-msg`), CI workflow
   (`ci.yml`), `.github/scripts/` (coverage gate, frontmatter parser, install-hooks,
   setup-substitute, setup-scaffold, validate-harness), issue templates
   (`01_ISSUE.md`, `config.yml`), Semgrep rules (`.semgrep/kyaulabs.yml`), opencode
   review config (`.opencodereview/rule.json`), lockfile manifests (`composer.json`,
   `package.json`), test runner config (`phpunit.xml`), lint/format configs
   (`.php-cs-fixer.dist.php`, `.stylelintrc.json`, `eslint.config.mjs`,
   `commitlint.config.js`, `tsconfig.json`, `cliff.toml`), and the shell-test helper
   library (`tests/Shell/lib/test_helpers.sh`).

3. **`setup_version` 2→3 migration with split checks.** The existing `< 2` check —
   which drives the accent-variant prompt (ADR-0007) — is preserved unchanged. A
   new, independent `< 3` check drives the scaffold prompt. Split checks prevent
   coupling the two migrations. A version-1 checkout flows through both prompts in
   order (accent-variant first, then scaffold). State is recorded in
   `.opencode/setup.json` as `setup_version`, `scaffold_mode` (`clone` | `new` |
   `skip`), and `project_folder`.

4. **`--target-dir` flag on `setup-substitute.sh`.** Additive named flag. When
   absent, the script's behavior is byte-identical to today (regression-guarded by
   `tests/Shell/setup_substitution_test.sh`, per ADR-0007). When present, token-
   substitution output is redirected to the target directory. Parsing uses a
   manual `case`/`getopt` loop that strips `--target-dir <dir>` before the
   existing positional-argument handling.

5. **Re-run short-circuit semantics.** On `/setup` re-run, if `.opencode/setup.json`
   records `scaffold_mode` AND the recorded `project_folder` exists on disk, the
   scaffold prompt is skipped (short-circuit) and `/setup` proceeds to the legacy
   in-place sweep. The prompt re-fires when: (a) `scaffold_mode` is unset (first
   run), (b) `scaffold_mode` is `skip` (no folder recorded), or (c) the recorded
   `project_folder` is missing (drift). Note: a `clone`-mode folder may go stale
   (e.g. `gh auth` expiry) and re-runs still short-circuit; re-clone is manual.

6. **`gh` prerequisite.** The clone path uses `gh repo clone` (the pre-authenticated
   GitHub CLI), not a direct API call and not a `git clone` fallback. `gh` is
   documented as a README prerequisite and gated by `/doctor` via
   `gh auth status`. Missing or unauthenticated `gh` causes the scaffolder to
   exit 2.

7. **Excluded surface.** `aurora/` is excluded — it is an application-code
   submodule, out of scope. The template's own `.git` directory is never mutated:
   the scaffolder copies FROM the template but writes only into the scaffold
   target; it never touches the template working tree.

8. **Reversibility.** The `setup_version` 2→3 bump is a one-way door: a project
   with `setup_version: 3` would require a manual edit to roll back to the
   pre-scaffold `/setup` behavior. Mitigated by the split-check design (`< 2` and
   `< 3` are independent gates — a version-1 checkout can still flow through
   both). The manifest file format is a new contract: format changes would require
   updating all scaffolded projects, which is the strongest justification for this
   ADR. A scaffolded subfolder can be deleted manually to fully undo a scaffold
   operation.

## Consequences

### Positive

- A scaffolded project carries a portable quality surface: lint, CI, hooks, and
  tests are runnable without the template or opencode harness, directly from the
  scaffolded subfolder.
- Idempotent re-runs: short-circuit logic prevents redundant prompts on re-run.
- Manifest-driven DRY: the manifest is the single list consumed by the scaffolder
  and verified by tests, eliminating duplicated file inventories.
- `--target-dir` is fully backward-compatible: omitting it preserves byte-identical
  behavior, guarded by the existing regression test.

### Negative

- `setup_version` 2→3 is a one-way schema door. A project with `version: 3` cannot
  flow back through the pre-scaffold `/setup` without manual state edit, though the
  split-check design ensures that a version-1 checkout can still navigate both
  migrations in sequence.
- The manifest format is a locked contract. Changing the file format (e.g. from
  newline-delimited to JSON) requires updating every scaffolded project and every
  consumer of the manifest. This is the strongest lock-in introduced by this ADR.

### Neutral

- Scaffolded projects inherit the full harness parity described in ADR-0025: CI
  gates that run in the template also run in the scaffolded project.
- The `gh` dependency is additive for the clone path only; the new-app and legacy
  modes do not require it.
- `aurora/` and template `.git` remain untouched, preserving the template as a
  pristine source.

## Alternatives Considered

### Direct `git clone` fallback
Rejected: `gh repo clone` uses the user's pre-authenticated session and avoids
re-implementing credential management. A `git clone` fallback would introduce a
second code path subject to SSH/HTTPS auth drift.

### Single `setup_version`
Rejected: coupling the accent-variant prompt (ADR-0007) and the scaffold prompt
under a single version number would force both migrations anytime either one
changed. Split checks (`< 2`, `< 3`) keep them independent.

### Inline file lists in `setup.md`
Rejected: duplicated file inventories between the command doc and the scaffolder
script would drift (pattern already observed in ADR-0007 and ADR-0018). The
manifest as single source of truth eliminates this risk.

## Refs

- Issue: [#117](https://github.com/kyaulabs/prism/issues/117)
- ADR-0007: setup token strategy, token substitutions, re-run limitation
- ADR-0018: shell test helper library (included in quality surface)
- ADR-0025: CI ↔ local check parity (scaffolded projects inherit parity gates)
- Supersedes: none
