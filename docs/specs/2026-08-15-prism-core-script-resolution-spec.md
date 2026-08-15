# Spec: Self-Locating Prism-Core Script Resolution

Date: 2026-08-15
Status: Proposed
Branch type: fix

## 1. Problem

When prism-core is installed globally (`pi install npm:@kyaulabs/prism-core`),
the harness's instruction layer still references its own scripts and skill
scripts with checkout-relative paths of the form
`bash packages/prism-core/scripts/<tool>.sh`. Those paths only resolve when
the working directory is the prism checkout (the dogfooding model). In any
consumer project — where the package lives at
`~/.pi/agent/npm/node_modules/@kyaulabs/prism-core/` — every such instruction
fails with exit 127 "No such file or directory". The same breakage affects the
two git hooks that still use `$REPO_ROOT/packages/prism-core/scripts/...`.

The failure is confirmed by the debug loop (Phase 1 of the debug skill):

```
$ mkdir -p /tmp/x && cd /tmp/x && bash packages/prism-core/scripts/classify-greenfield.sh
bash: packages/prism-core/scripts/classify-greenfield.sh: No such file or directory
exit=127
```

while the same script invoked at its installed location runs normally.

Root cause (ADR-0060, commit `53cc6b8`): the global-install model relocated
the package, but script references were never made location-aware. The
`prism-tool` launcher — the harness's own declared toolchain boundary — was
built for *tools*; the *scripts* layer kept the checkout assumption.

## 2. Goal

Every executable reference in the instruction layer (AGENTS.md, skills,
prompts, git hooks) resolves correctly in every context:

- **Checkout (dogfooding):** the checkout copy at `packages/prism-core/` wins,
  so development edits to scripts take effect immediately.
- **Global npm install (consumer):** resolves to the installed package under
  `~/.pi/agent/npm/node_modules/@kyaulabs/prism-core/`.
- **Project-local install:** resolves to the installed package under
  `.pi/npm/...` (via the launcher's canonicalized path).

## 3. Non-goals

- No changes to the install/deploy model itself (ADR-0060 stands; AGENTS.md
  keeps deploying verbatim — the resolver makes templating unnecessary).
- No changes to how *tools* (semgrep, OCR, commitlint, git-cliff, php-cs-fixer,
  stylelint, eslint) resolve — that already routes through the launcher.
- No rewriting of historical documents (`docs/specs/`, `docs/plans/`,
  READMEs, `CONTRIBUTING.md`, `CODING_HARNESS.md`, opencode-era ADRs,
  ADR-0064). They are records or checkout-context documentation; the path
  convention applies to the *instruction layer* only.
- ADR-0060's body is immutable per the ADR convention ("supersede, don't
  edit"); its stale re-run path is corrected in the new ADR instead.
- Pre-existing consumer limitations stay as-is (e.g. `install-hooks.sh` still
  requires the repo to carry `.github/hooks`).

## 4. Design

### 4.1 New `prism-tool resolve` subcommand

Add a `resolve` command to `packages/prism-core/scripts/prism-tool/cli.js`:

```
prism-tool resolve <kind>        kind ∈ {scripts, skills}
stdout: absolute path to the prism-core <kind> directory
exit 0 on success; exit 2 on usage error or unresolvable install
```

Resolution order (deterministic, context-correct):

1. **Checkout walk.** Starting from `context.cwd ?? process.cwd()`
   (realpathed), walk each ancestor directory; the first ancestor containing
   `packages/prism-core/<kind>` as a directory wins. Prints
   `<ancestor>/packages/prism-core/<kind>`.
2. **Own-install fallback.** Otherwise print
   `path.resolve(__dirname, '..', <kind>)` — the running package's own
   `<kind>` directory (the launcher's canonicalized real path).
3. **Fail.** If the fallback directory does not exist (broken install), print
   a diagnostic to stderr and exit 2.

This makes the resolver self-locating by construction: inside a checkout the
dev copy wins; anywhere else the installed package resolves.

### 4.2 Instruction-layer convention

Executable references in the instruction layer take the form

```
bash "$(prism-tool resolve scripts)/<tool>.sh" ...
bash "$(prism-tool resolve skills)/<skill>/<script>" ...
```

The always-on AGENTS.md documents the convention in the "Toolchain boundary"
section: harness scripts resolve through `prism-tool resolve {scripts,skills}`,
which prefers the checkout copy when the working directory is inside a prism
checkout; if `prism-tool` is unavailable (checkout without the launcher), fall
back to the checkout copy at `packages/prism-core/` from the repository root.
This fallback note preserves the launcher-free dogfooding path.

### 4.3 Git hooks

`.github/hooks/prepare-commit-msg` resolves `validate-branch-name.sh` in this
order:

1. Checkout copy: `-x "$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh"`
   — preserves today's dogfooding behavior exactly (and removes the CWD
   dependence by anchoring on `$REPO_ROOT`).
2. Launcher: `"$(prism-tool resolve scripts)/validate-branch-name.sh"` — any
   repo carrying these hooks without the checkout copy.
3. Otherwise: current skip semantics via the existing `[ -x "$VALIDATOR" ]`
   guards.

`.github/hooks/pre-push`'s validate-harness gate stays **checkout-only by
design** (ADR-0025 CI-parity: it validates the prism package tree in the repo
being pushed; running it against a consumer tree would be meaningless). The
fix anchors its guard on `$REPO_ROOT` and updates its guidance messages to
the resolver form — the invocation itself is unchanged.

Hook guidance messages that say `Run 'bash packages/prism-core/scripts/
install-global.sh'` (in `commit-msg`, `pre-commit`, `pre-push`,
`prepare-commit-msg`) switch to the resolver form.

Hook guidance messages that say `Run 'bash packages/prism-core/scripts/
install-global.sh'` (in `commit-msg`, `pre-commit`, `pre-push`,
`prepare-commit-msg`) switch to the resolver form.

### 4.4 Regression gates

- **`validate-harness.sh`** gains a "Checking instruction-layer script
  references" block: flag every `bash packages/prism-core/(scripts|skills)/`
  occurrence in `AGENTS.md` (root + core template), `packages/prism-core/
  skills/`, `packages/prism-core/prompts/`, `packages/prism-php-web/skills/`,
  `packages/prism-php-web/prompts/`. This is the always-on gate (`/check`,
  pre-push) that goes red on any reintroduction of the bug.
- **`tests/Shell/prism_tool_resolve_test.sh`** (new): behavioral tests for the
  resolver — checkout walk from a nested directory, own-install fallback from
  a consumer-like directory, usage errors, unresolvable-install failure.
- **`tests/Shell/validate-harness_test.sh`**: add the new check marker to the
  required-markers list.
- **`tests/Shell/install_global_toolchain_test.sh`**: assert the *deployed*
  `~/.pi/agent/AGENTS.md` contains no `bash packages/prism-core/` literal —
  the direct regression test for the reported symptom.

## 5. Files

| File | Change |
| --- | --- |
| `packages/prism-core/scripts/prism-tool/cli.js` | Add `resolve` command + dispatch |
| `packages/prism-core/AGENTS.md` | 4 refs → resolver form; convention paragraph in Toolchain boundary |
| `AGENTS.md` (root, project layer) | 2 refs → resolver form |
| `packages/prism-core/skills/{brainstorming,tdd,conventional-commits,from-issue,wayfinder,websearch,searxng}/SKILL.md` | 10 refs → resolver form |
| `packages/prism-core/prompts/{setup-rulesets,setup,check,release,pr,doctor}.md` | 16 refs → resolver form |
| `packages/prism-php-web/skills/rcs-header/SKILL.md` | 1 ref → resolver form |
| `.github/hooks/prepare-commit-msg` | Resolver-based validator lookup + message forms |
| `.github/hooks/pre-push` | `$REPO_ROOT`-anchored guard + message forms |
| `.github/hooks/commit-msg`, `.github/hooks/pre-commit` | Message forms only |
| `packages/prism-core/scripts/validate-harness.sh` | New instruction-layer reference check |
| `tests/Shell/prism_tool_resolve_test.sh` | New resolver tests |
| `tests/Shell/validate-harness_test.sh` | New required marker |
| `tests/Shell/install_global_toolchain_test.sh` | Deployed-AGENTS.md assertion |
| `adr/0065-self-locating-script-resolution.md` | New ADR (see §6) |
| `CONTEXT.md` | Add glossary term (see §6) |

Exempt (documentation/historical): `packages/prism-core/README.md`, root
`README.md`, `CONTRIBUTING.md`, `CODING_HARNESS.md`, `adr/0060`, `adr/0064`,
`docs/specs/`, `docs/plans/`, `writing-skills` layout tables.

## 6. ADR and glossary

- **ADR-0065** (new, Nygard format): "Self-Locating Script Resolution".
  Documents: instruction-layer executable references resolve through
  `prism-tool resolve {scripts,skills}`; checkout-copy precedence via the
  CWD walk; the launcher is the boundary for scripts as well as tools;
  historical/documentation references are exempt; corrects the stale
  install-path example from ADR-0060 (the missing `node_modules/` segment).
- **CONTEXT.md**: add glossary term "script resolution" — the convention by
  which instruction-layer executable references resolve to the prism-core
  package's `scripts/`/`skills/` directories through `prism-tool resolve`,
  preferring the checkout copy inside a prism checkout.

## 7. Acceptance criteria

1. The debug loop goes green: from a consumer-like CWD,
   `bash "$(prism-tool resolve scripts)/classify-greenfield.sh" .` runs the
   script (exit 2 `indeterminate` for a non-git dir, not exit 127).
2. `grep -rn "bash packages/prism-core/"` over the instruction layer
   (AGENTS.md files, `skills/`, `prompts/`, `.github/hooks/`) is empty.
3. `validate-harness.sh` passes with the new check wired; its test asserts
   the marker.
4. New `prism_tool_resolve_test.sh` passes (checkout walk, own-install fallback,
   usage errors). The unresolvable-install error path is defensive code — it
   cannot be simulated from a healthy checkout (the own install always
   exists), so it is not unit-tested.
5. Full shell test suite green; `/check` (delegating to `/check-php`) green.
6. `install_global_toolchain_test.sh` asserts the deployed AGENTS.md carries
   no `bash packages/prism-core/` literal.

## 8. Follow-up (not in scope for this branch)

- Publish a fresh `@kyaulabs/prism-core` npm release: the published 0.1.0
  predates `prism-tool.js`/`resolve-ocr-model.sh` (commits `4d9525d`,
  `3117551`), so installed consumers lack the launcher and resolver until the
  release pipeline ships a newer version.
