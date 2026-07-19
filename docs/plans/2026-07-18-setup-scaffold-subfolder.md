# /setup Subfolder Scaffold Mode Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each code task follows
> Red → Green → Refactor. Docs-only tasks (Task 0, Task 7) follow the fast-path.

**Goal:** Add a subfolder-scaffold mode to `/setup` that clones or inits a new project inside the template checkout and copies a portable quality surface, without disturbing the legacy in-place sweep.

**Architecture:** A new `setup-scaffold.sh` reads a `quality-surface.manifest` (single source of truth), checks for an existing target folder (halt-on-exists, never overwrite), and offers clone-via-`gh` / `mkdir`+`git init` / skip. `setup-substitute.sh` gains an additive `--target-dir` flag so token substitution can target the scaffolded folder. `setup_version` bumps 2→3 with a split version check so older checkouts migrate cleanly. Re-runs short-circuit when `scaffold_mode` is set and the folder exists.

**Tech Stack:** Bash (`set -euo pipefail`), shell tests via `tests/Shell/lib/test_helpers.sh` (ADR-0018), `gh` CLI, Markdown (ADR + docs).

**Source:** GitHub issue kyaulabs/prism #117 — `feat(setup): scaffold standalone project subfolder with portable quality surface`. Architect verdict: GO-WITH-CONDITIONS, `ADR-required: 0026-project-scaffolding.md (new)`.

## Global constraints

- `set -euo pipefail` in every new shell script
- Every new source file gets an RCS header + vim modeline (`rcs-header` skill)
- Never overwrite an existing folder/file (halt on folder, skip-and-list on file)
- Never mutate the template's `.git` (AC-12)
- `--target-dir` on `setup-substitute.sh` is **additive**: when absent, byte-identical to current behavior (existing `setup_substitution_test.sh` must stay green — AC-9)
- `gh repo clone` only; **no `git clone` fallback**; missing/unauthed `gh` → exit 2 (AC-3)
- `aurora/` is excluded (non-goal)
- Signed commits, Conventional Commits, `Refs: #117` footer (issue closes only on the final feature commit)

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `adr/0026-project-scaffolding.md` | Locks the dual-mode contract, manifest pattern, setup_version 2→3 split checks, `--target-dir` spec, re-run semantics, quality-surface scope | **New** |
| `CONTEXT.md` | Add ADR-0026 to the Architectural Decisions list | Edit |
| `.github/scripts/quality-surface.manifest` | Single source of truth: every file copied into a scaffolded project | **New** |
| `.github/scripts/setup-scaffold.sh` | Scaffolder: check-only, no-overwrite, clone/new/skip, manifest copy | **New** |
| `.github/scripts/setup-substitute.sh` | Add `--target-dir` flag (additive) | Edit |
| `.opencode/commands/setup.md` | Insert §2.5 scaffold prompt; wire short-circuit re-run; bump `< 3` check; redirect §3–§7 to target dir; update frontmatter `description` | Edit |
| `.opencode/commands/doctor.md` | Add `gh auth status` row | Edit |
| `README.md` | Add `gh` to Prerequisites; document scaffold flow | Edit |
| `tests/Shell/setup_scaffold_test.sh` | Regression test (AC-1/2/3/4/5/6/7/12) | **New** |

---

## Task 0: ADR-0026 + CONTEXT.md (architect blocking condition)

> Docs-only, no behavior delta. Must land first per `ADR-required:` gate.

**Files:**
- Create: `adr/0026-project-scaffolding.md`
- Modify: `CONTEXT.md`

**ADR must cover (architect conditions #1–#3):**
- Dual-mode design (in-place sweep unchanged; subfolder mode additive)
- Manifest-as-single-source-of-truth pattern
- `setup_version` 2→3 migration with **split checks** (`< 2` → accent-variant prompt; `< 3` → scaffold prompt; independent gates)
- `--target-dir` flag specification on `setup-substitute.sh`: parsing approach, backward-compat guarantee (absent = byte-identical)
- Re-run short-circuit semantics (skip prompt when `scaffold_mode` set AND `project_folder` exists; re-prompt on drift/missing)
- Quality-surface scope + rationale for each included file
- `gh` prerequisite decision (CLI tool, not direct API; gated by `/doctor`)
- Excluded surface: `aurora/`, template `.git`
- Reversibility note (one-way schema door mitigated by split checks)

- [x] **Step 1:** Write `adr/0026-project-scaffolding.md` in Nygard format (Status: Accepted, Context, Decision, Consequences). Follow the `adr` skill template. — done in commit `6d91c37e`
- [x] **Step 2:** Add a one-line entry for ADR-0026 to `CONTEXT.md`'s Architectural Decisions list. — done; also added the previously-missing ADR-0025 entry (correctness fix)
- [x] **Step 3: Commit** — done; `6d91c37e` (signed, hooks passed)

```bash
git add adr/0026-project-scaffolding.md CONTEXT.md
git commit -S -m $'docs(adr): add ADR-0026 project scaffolding contract\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 1: quality-surface.manifest (TDD — AC-7)

**Files:**
- Create: `.github/scripts/quality-surface.manifest`
- Create: `tests/Shell/setup_scaffold_test.sh` (manifest-parity test only; later tasks append cases)

**Interfaces:**
- Produces: a newline-delimited manifest, one relative path per line, `#` comments allowed. Consumed by Task 4's copy loop.

**Manifest contents (factual corrections applied):**
```
# Quality surface — copied into every scaffolded project (ADR-0026)
.github/hooks/commit-msg.sh
.github/hooks/post-checkout.sh
.github/hooks/post-merge.sh
.github/hooks/pre-commit.sh
.github/hooks/pre-push.sh
.github/hooks/prepare-commit-msg.sh
.github/workflows/ci.yml
.github/scripts/coverage-gate.php
.github/scripts/frontmatter-parser.js
.github/scripts/install-hooks.sh
.github/scripts/setup-substitute.sh
.github/scripts/setup-scaffold.sh
.github/scripts/validate-harness.sh
.github/ISSUE_TEMPLATE/01_ISSUE.md
.github/ISSUE_TEMPLATE/config.yml
.semgrep/kyaulabs.yml
.opencodereview/rule.json
composer.json
package.json
phpunit.xml
.php-cs-fixer.dist.php
.stylelintrc.json
eslint.config.mjs
commitlint.config.js
tsconfig.json
cliff.toml
tests/Shell/lib/test_helpers.sh
```

- [x] **Step 1: Red — manifest parity test.** In `tests/Shell/setup_scaffold_test.sh`, source `lib/test_helpers.sh`, write a test that (a) reads each manifest line, (b) asserts the file exists in the template root, (c) asserts no template-root quality-surface file is missing from the manifest (bidirectional parity). Run → FAIL (manifest absent). — done; 2 failed → 0 passed (Red)
- [x] **Step 2: Green.** Write `.github/scripts/quality-surface.manifest` above. Run → PASS. — done; 2 passed → 0 failed (Green); corrections: hooks have no `.sh` ext, manifest self-entry added, `check-skill-frontmatter.sh` excluded as harness-only
- [x] **Step 3: Commit** — done; `e7af03d` (signed, hooks passed); independently re-verified green

```bash
git add .github/scripts/quality-surface.manifest tests/Shell/setup_scaffold_test.sh
git commit -S -m $'feat(setup): add quality-surface manifest (single source of truth)\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 2: setup-scaffold.sh — check-only + no-overwrite (TDD — AC-1, AC-2, AC-12)

**Files:**
- Create: `.github/scripts/setup-scaffold.sh`
- Modify: `tests/Shell/setup_scaffold_test.sh` (append cases)

**Interfaces:**
- Produces: `setup-scaffold.sh --check-only <target>` → exit 0 + prints plan; exit non-zero + stderr if target exists. `set -euo pipefail`. RCS header + modeline. Validates manifest exists & non-empty before any work (architect condition #4 + safety rail).

- [x] **Step 1: Red.** Test cases: (a) `--check-only` on absent target prints each manifest entry and touches nothing (assert no files created); (b) target folder pre-exists → non-zero exit, no mutation (AC-2); (c) a sentinel file pre-exists at a target path → skip + list, non-zero exit; (d) after any check-only run, template `.git` unchanged (AC-12: `git status --porcelain` empty on template root). Run → FAIL (script absent). — done; Tests 3–7 appended; 3 passed / 4 failed (Red)
- [x] **Step 2: Green.** Implement `setup-scaffold.sh` with: RCS header, `set -euo pipefail`, manifest-read+validate, `--check-only` branch, no-overwrite guard (folder → halt; file → skip+list), manifest existence/non-empty guard. Run → PASS. — done; 7/7 pass; added `--manifest <path>` override flag as testability seam (plan-suggested)
- [x] **Step 3: Refactor** — extract manifest-reading into a function if inline loop grows. Re-run → PASS. — skipped; code already clean
- [x] **Step 4: Commit** — done; `3e58977` (signed); also added `setup-scaffold.sh` to the manifest (28 entries); independently re-verified green

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'feat(setup): add setup-scaffold check-only + no-overwrite guard\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 3: clone path via gh (TDD — AC-3)

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh`
- Modify: `tests/Shell/setup_scaffold_test.sh`

**Interfaces:**
- Produces: `setup-scaffold.sh clone <owner/repo> <target>` → runs `gh repo clone`; missing `gh` or auth failure → exit 2; no `git clone` fallback.

- [x] **Step 1: Red.** Test cases using a fake `gh` shim on `PATH`: (a) shim succeeds → asserts `gh repo clone <repo> <target>` invoked, target folder exists; (b) `gh` missing from PATH → exit 2; (c) shim exits non-zero (auth fail) → exit 2, no partial state left. Assert no `git clone` invocation anywhere in the script. Run → FAIL. — done; Tests 8–12 appended (8/9/10/12 fail, 11 passes as regression guard)
- [x] **Step 2: Green.** Add `clone` subcommand: `command -v gh || exit 2`; `gh repo clone "$repo" "$target" || exit 2`. Run → PASS. — done; 12/12 pass; `guard_no_overwrite` extracted to shared function; exit 2 for gh failures, exit 1 for usage/guard
- [x] **Step 3: Commit** — done; `fc84d4c` (signed); shellcheck SC2034/SC2188 fixed via fresh commit; independently re-verified green + ADR-0026 no-git-clone rule confirmed

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'feat(setup): add gh repo clone path to setup-scaffold\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 4: new-app path + manifest copy (TDD — AC-4, AC-5, AC-6)

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh`
- Modify: `tests/Shell/setup_scaffold_test.sh`

**Interfaces:**
- Produces: `setup-scaffold.sh new <target>` → `mkdir -p` + `git init`, then copy every manifest entry into target preserving paths; `trap` cleanup on `mkdir`/`git init` failure (architect safety rail).

- [x] **Step 1: Red.** Test cases in a temp dir outside the template tree: (a) `new <tmpdir>/app` → folder created, `git -C <tmpdir>/app rev-parse` confirms repo; (b) every manifest entry present under target (AC-5); (c) standalone checks runnable in the temp copy: `composer install --quiet`, `npm install --quiet` (or assert lockfiles present if offline), `bash .github/scripts/install-hooks.sh`, shell tests run via the copied harness; (d) `trap` cleanup: simulate `git init` failure → partial dir removed. Run → FAIL. — done; Tests 13–17 appended (AC-6 offline-safe: smoke test sources copied harness, asserts lockfiles present, runs install-hooks.sh)
- [x] **Step 2: Green.** Add `new` subcommand with `trap 'rm -rf "$target"' ERR` around `mkdir`+`git init`, then a copy loop: `while read -r f; do mkdir -p "$target/$(dirname "$f")"; cp "$f" "$target/$f"; done < manifest`. Run → PASS. — done; 17/17 pass; `copy_quality_surface` shared + wired into clone; `read_manifest_entries` extracted; trap scoped to new only; lockfiles added to manifest (30 entries)
- [x] **Step 3: Commit** — done; `7b2f835` (signed); independently re-verified green + functional standalone smoke (harness + install-hooks.sh both work in scaffolded dir)

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'feat(setup): add new-app path + manifest copy to setup-scaffold\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 5: --target-dir flag on setup-substitute.sh (TDD — AC-9 regression, additive)

**Files:**
- Modify: `.github/scripts/setup-substitute.sh`
- Modify: `tests/Shell/setup_substitution_test.sh` (append; keep existing assertions byte-identical)

**Interfaces:**
- Produces: `setup-substitute.sh [--target-dir <dir>] <...existing args...>`. When flag absent → current behavior unchanged.

- [x] **Step 1: Read current signature.** Executor reads `.github/scripts/setup-substitute.sh` and the existing `setup_substitution_test.sh` to learn the exact positional args.
- [x] **Step 2: Red.** Add a test: invoke with `--target-dir <tmpdir>` and assert substitutions land in `<tmpdir>`; invoke WITHOUT the flag and assert output is byte-identical to the pre-change run (capture baseline first). Run → FAIL. — done; Tests 12–13 appended (Test 13 = AC-9 byte-identical regression guard using multi-token input)
- [x] **Step 3: Green.** Add manual `case`/`getopt` parsing at the top of the script that strips `--target-dir` and its value before the existing positional handling, then redirects output paths to the target dir when set. Run → PASS, and existing test stays green (AC-9). — done; leading `while`/`case` loop + `--` sentinel + missing-arg exit 2; path resolution placed before file-not-found guard; `sed_edit()` untouched
- [x] **Step 4: Commit** — done; `9e60bf6` (signed); independently re-verified 15/15 substitution + 17/17 scaffold

```bash
git add .github/scripts/setup-substitute.sh tests/Shell/setup_substitution_test.sh
git commit -S -m $'feat(setup): add additive --target-dir flag to setup-substitute\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 6: wire /setup §2.5 + short-circuit re-run + schema bump (AC-9, AC-10)

**Files:**
- Modify: `.opencode/commands/setup.md` (insert §2.5; add `< 3` split check; update frontmatter `description`)
- Modify: `.github/scripts/setup-scaffold.sh` (add `should-prompt` subcommand — **plan refinement per build-agent/user decision: the short-circuit decision logic needs a testable code surface; a subcommand in the existing script keeps all scaffold logic in one place, needs no new file, no manifest change**)
- Modify: `tests/Shell/setup_scaffold_test.sh` (re-run/short-circuit integration cases + should-prompt unit cases)

**Interfaces:**
- Consumes: `setup-scaffold.sh` (Tasks 2–4), `setup-substitute.sh --target-dir` (Task 5)
- Produces: `/setup` flow that, after app-name + repo prompts, runs the scaffold prompt when `setup_version < 3`; records `scaffold_mode` + `project_folder` in `.opencode/setup.json`; short-circuits on re-run when both are set and the folder exists.
- **`should-prompt` subcommand contract:** `setup-scaffold.sh should-prompt [<setup.json path>]` — default path `$REPO_ROOT/.opencode/setup.json`; exits **0 = prompt** (run §2.5) or **1 = skip** (short-circuit). Decision table: no setup.json / `setup_version` absent or `< 3` → 0; v3 + `scaffold_mode` absent/`skip` → 0; v3 + mode `clone`/`new` + `project_folder` exists → 1; v3 + mode `clone`/`new` + folder missing → 0 (drift). Does NOT call `read_manifest_entries` (no copy). JSON parsed dependency-free (sed/grep, no jq assumption).

- [x] **Step 1: Red.** should-prompt unit cases (Test 18–23): (18) no setup.json → exit 0; (19) `setup_version: 2` → exit 0 (case a); (20) v3 + `scaffold_mode: "skip"` → exit 0 (case b); (21) v3 + mode `new` + folder exists → exit 1 (case c, short-circuit); (22) v3 + mode `new` + folder missing → exit 0 (case d, drift); (23) v3 + mode `clone` + folder exists → exit 1. Run → FAIL (subcommand doesn't exist). — done; Tests 18–23 appended
- [x] **Step 2: Green.** Add `should-prompt)` case to the dispatcher (before `*)`); dependency-free JSON field extraction (sed for string + number fields); resolve `project_folder` against REPO_ROOT if relative. Run → PASS. — done; 5 guard clauses + symlink-aware existence check; USAGE updated; 23/23 pass
- [x] **Step 3: Wire setup.md.** (a) §1: add split check — `< 2` variant prompt (existing), `< 3` scaffold prompt; call `bash .github/scripts/setup-scaffold.sh should-prompt` and skip §2.5 on exit 1. (b) Insert §2.5 between §2 and §3: prompt clone/new/skip; on clone ask owner/repo then run `setup-scaffold.sh clone`; on new ask target then run `setup-scaffold.sh new`; record `scaffold_mode` + `project_folder`. (c) §6: when `project_folder` set, pass `--target-dir "$project_folder"` to `setup-substitute.sh`. (d) §8: add `scaffold_mode` + `project_folder` to schema, bump `setup_version` to 3. (e) Frontmatter `description`: mention scaffold mode. — done; all 5 edits applied; section numbering stable (§2.5 inserts cleanly)
- [x] **Step 4: Commit** — done; `bd5e58f` (signed); independently re-verified 23/23 scaffold + 15/15 substitution

```bash
git add .opencode/commands/setup.md .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'feat(setup): wire subfolder scaffold mode + short-circuit re-run\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 7: /doctor + README gh prerequisite (AC-8)

**Files:**
- Modify: `.opencode/commands/doctor.md`
- Modify: `README.md`

- [x] **Step 1: Edit `doctor.md`.** Add a row running `gh auth status` → PASS/FAIL with a one-line remediation ("run `gh auth login`"). — done; new Section 8 (Scaffold prerequisite) with 3-state check (installed+auth / installed+unauth / not_found) + output-table row + Rules soft-fail bullet
- [x] **Step 2: Edit `README.md`.** Add `gh` (GitHub CLI) to the Prerequisites table; add a short subsection documenting the `/setup` scaffold flow (clone/new/skip) and that `gh` is required only for the clone option. — done; gh row in Harness tools table + optional-note expanded + /setup slash-command line updated + scaffold-mode block (clone/new/skip + idempotent short-circuit + ADR-0026 ref)
- [x] **Step 3: Verify** the existing `setup_substitution_test.sh` and full `tests/Shell/` suite still pass. — done; 23/23 scaffold + 15/15 substitution, no regression (docs-only change)
- [x] **Step 4: Commit** — done; `f65ed92` (signed); pre-commit passed (gitleaks clean)

```bash
git add .opencode/commands/doctor.md README.md
git commit -S -m $'docs(setup): document gh prerequisite + scaffold flow\n\nRefs: #117\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 8: close issue — final verification + Fixes: footer

**Files:** none new (verification gate) — this task records the acceptance sweep in the plan log and closes the issue.

- [x] **Step 1: Full suite.** Run the shell-test runner → all green. Confirm `setup_substitution_test.sh` unchanged-behavior assertions pass (AC-9). — done; setup_scaffold 23/23, setup_substitution 15/15; 22-file shell suite all green (architect-adr-contract, ci-local-parity, coverage-gate, rcs-header-autoadd, etc.)
- [x] **Step 2: Acceptance sweep.** Walk AC-1…AC-12 against the implementation; note any gaps. — done; **no gaps**. AC-1(check-only T2), AC-2(guard T2), AC-3(gh-clone T3), AC-4(new+init T4), AC-5(copy T4), AC-6(standalone T4), AC-7(manifest-SOT T1), AC-8(docs T7), AC-9(target-dir T5+T6), AC-10(short-circuit T6), AC-11(ADR T0), AC-12(manifest-validate T2).
- [x] **Step 3: Manual smoke.** In a throwaway clone: run `/setup` → pick "new" → confirm scaffold folder + quality surface + standalone `install-hooks.sh` works. — done; `setup-scaffold.sh new <tmp>` → 30 files + git repo; `should-prompt` no-config→0 / v3+new+folder-exists→1 (AC-10 live); standalone `install-hooks.sh` → "Hooks installed via core.hooksPath" (AC-6)
- [x] **Step 4: Final commit** (if any AC-gap fixes were needed) using `Fixes: #117` as the top footer (issue closes here, not on earlier `Refs:` commits). — done; no code gaps found, so this commit records the completed plan log + closes the issue via `Fixes: #117`

---

## Self-review

- **Spec/issue coverage:** AC-1(T2), AC-2(T2), AC-3(T3), AC-4(T4), AC-5(T4), AC-6(T4), AC-7(T1), AC-8(T7), AC-9(T5+T6), AC-10(T6), AC-11(T0), AC-12(T2). All 12 covered.
- **Architect conditions:** ADR-0026 first (T0), CONTEXT.md update (T0), `--target-dir` spec in ADR (T0) + impl (T5), manifest validation before mutation (T2). All 4 blocking conditions addressed.
- **Factual corrections:** ADR-0026 (T0), `01_ISSUE.md`+`config.yml` (T1 manifest), `test_helpers.sh` in manifest (T1), frontmatter description (T6). All 4 applied.
- **User decisions:** short-circuit re-run (T6), split checks + v3 (T6), corrections batched (T0/T1).
- **Type consistency:** scaffold script subcommands `--check-only`/`clone`/`new` consistent across T2/T3/T4.
- **Recommended (non-blocking) rails folded in:** `set -euo pipefail` (global), manifest validation (T2), `trap` cleanup (T4). The `--check-only` mode (T2) satisfies the architect's recommended dry-run. The `gh` version floor in `/doctor` is left as a follow-up (not in ACs).
