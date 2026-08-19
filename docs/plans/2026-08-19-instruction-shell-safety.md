# Instruction Shell Safety Compatibility Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make every packaged skill, prompt, and authoritative instruction document executable through Prism's fail-closed safety extension without command substitution, ANSI-C quoting, or parenthesized shell subshells.

**Architecture:** Add one repository-wide Shell integration seam over the public instruction surface, then rewrite instruction recipes as observable multi-call procedures. Preserve self-locating resolution by resolving first and invoking a literal path later; preserve workflow state as validated agent context, stable project-local files, or narrow launcher output.

**Tech Stack:** Bash integration tests, Markdown skills and prompt templates, `prism-tool`, GitHub CLI, git-cliff.

## Global constraints

- Do not change the safety extension classifier, deny floor, or circuit breaker.
- Preserve every approval gate, validation rule, untrusted-data boundary, and workflow outcome.
- Scan packaged `SKILL.md` files, packaged prompt Markdown, root/core instruction files, and `CODING_HARNESS.md`.
- Bundled search helper script internals remain out of scope.
- Add no dependencies.

---

### Task 1: Add the global instruction-shell regression seam

**Files:**
- Create: `tests/Shell/instruction_shell_safety_test.sh`
- Verify: `tests/Shell/run-all.sh`

**Interfaces:**
- Consumes: repository Markdown instruction resources.
- Produces: a zero-argument Shell test returning non-zero with file-and-line diagnostics when prohibited syntax exists.

- [ ] **Step 1: Write the failing integration test**

Create an executable Bash test with the required RCS header and vim modeline. It must:

1. Resolve the repository root without shell substitution by deriving `SCRIPT_DIR` from `BASH_SOURCE`, changing directory to `../..`, and retaining `PWD`.
2. Build a Bash array containing:
   - root `AGENTS.md`
   - `CODING_HARNESS.md`
   - core `AGENTS.md` and `APPEND_SYSTEM.md`
   - every `packages/*/skills/*/SKILL.md`
   - every `packages/*/prompts/*.md`
3. Run `grep -nE "[$][(]|[$][']"` on each resource and count every match as a failure.
4. Run an `awk` fence parser on each resource. The parser constructs the Markdown fence character with `sprintf("%c", 96)`, enters only `bash`, `sh`, or `shell` fences, and reports any trimmed command line beginning with `(`.
5. Print one PASS summary when no findings exist, otherwise print the total and exit 1.

- [ ] **Step 2: Run the focused test to verify Red**

Run: `bash tests/Shell/instruction_shell_safety_test.sh`

Expected: FAIL with findings in the audited skills, prompts, and AGENTS files.

- [ ] **Step 3: Confirm automatic suite discovery**

Read `tests/Shell/run-all.sh` and verify its existing `*_test.sh` discovery includes the new test without editing the runner.

---

### Task 2: Rewrite self-locating script invocations

**Files:**
- Modify: `AGENTS.md`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `packages/prism-core/skills/brainstorming/SKILL.md`
- Modify: `packages/prism-core/skills/wayfinder/SKILL.md`
- Modify: `packages/prism-core/skills/from-issue/SKILL.md`
- Modify: `packages/prism-core/skills/searxng/SKILL.md`
- Modify: `packages/prism-core/skills/websearch/SKILL.md`
- Modify: `packages/prism-php-web/skills/rcs-header/SKILL.md`
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `packages/prism-core/prompts/setup-rulesets.md`

**Interfaces:**
- Consumes: `prism-tool resolve scripts|skills` output.
- Produces: separate resolver calls followed by literal-path Bash invocations.

- [ ] **Step 1: Replace every inline resolver recipe**

For scripts, show these as two separate tool calls:

```bash
prism-tool resolve scripts
```

```bash
bash /absolute/resolved/scripts/SCRIPT_NAME.sh LITERAL_ARGUMENTS
```

For search skills, use the equivalent `prism-tool resolve skills` call followed by a separately rendered absolute path ending in `websearch/search.sh` or `searxng/search.sh`.

Update prose to require retaining the first command's output as a validated literal path. Preserve checkout fallback language and all branch, setup, confirmation, and search behavior.

- [ ] **Step 2: Run the focused test**

Run: `bash tests/Shell/instruction_shell_safety_test.sh`

Expected: still FAIL only on the remaining capture/quoting/subshell resources; no findings from the files in this task.

- [ ] **Step 3: Run resolver-specific regressions**

Run:

```bash
bash tests/Shell/setup_rulesets_command_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS after updating obsolete marker assertions to require separate `prism-tool resolve scripts` and separately rendered absolute-path invocations.

---

### Task 3: Rewrite GitHub repository and payload capture guidance

**Files:**
- Modify: `packages/prism-core/skills/ticketing/SKILL.md`
- Modify: `packages/prism-core/skills/tracker-operator/SKILL.md`
- Modify: `packages/prism-core/skills/wayfinder/SKILL.md`
- Modify: `packages/prism-core/skills/from-issue/SKILL.md`
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/prism-core/prompts/setup-labels.md`
- Modify: `packages/prism-core/prompts/pr.md`

**Interfaces:**
- Consumes: direct `gh` output and stable payload files.
- Produces: validated repository/owner/name/node-ID conversation values and substitution-free GitHub CLI commands.

- [ ] **Step 1: Replace repository discovery assignments**

Run repository discovery as independent commands:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
gh repo view --json owner -q .owner.login
gh repo view --json name -q .name
```

Require the agent to validate and retain each output as inert context, then render the literal value in later commands. Replace every `REPO`, `OWNER`, `NAME`, `TASK_NODE`, and `PREREQ_NODE` capture assignment accordingly.

- [ ] **Step 2: Replace issue-title file capture**

Keep the single-quoted heredoc payload boundary. Read the single-line title without substitution:

```bash
IFS= read -r TITLE < /tmp/issue-title.txt
gh issue create --repo OWNER_REPO --title "$TITLE" --body-file /tmp/issue-body.md
```

Remove prose and comments that spell prohibited syntax. Preserve `--body-file`, GraphQL `-F` bindings, and the rule that untrusted tracker content is never evaluated.

- [ ] **Step 3: Rewrite the PR handoff block**

Have the agent render the validated repository, target branch, branch, title-file path, and body-file path as concrete literals. The human-run block reads the one-line title with `IFS= read -r TITLE < TITLE_FILE_PATH` and invokes `gh pr create` with the concrete repository plus `--title "$TITLE"` and the literal body path. Preserve the preparation-only and no-GitHub-mutation contract.

- [ ] **Step 4: Run focused regressions**

Run:

```bash
bash tests/Shell/instruction_shell_safety_test.sh
bash tests/Shell/skill_shell_injection_test.sh
bash tests/Shell/pr_command_test.sh
```

Expected: the global test still fails only on non-GitHub resources; injection and PR contracts pass after their syntax assertions are updated.

---

### Task 4: Rewrite health, documentation-location, and credential examples

**Files:**
- Modify: `packages/prism-core/prompts/doctor.md`
- Modify: `packages/prism-core/skills/pi-docs/SKILL.md`
- Modify: `packages/prism-core/skills/credential-protection/SKILL.md`
- Modify: `packages/prism-php-web/prompts/check-php.md`

**Interfaces:**
- Consumes: direct command output and literal multiline shell strings.
- Produces: substitution-free diagnostics, package-location guidance, and deny-floor configuration examples.

- [ ] **Step 1: Decompose doctor checks**

Run `git config core.hooksPath` directly, retain its output, and make the installed/not-installed decision at the agent level. Resolve the scripts directory in a separate command before displaying the literal installer path.

- [ ] **Step 2: Decompose pi package discovery**

Run `pi --version` directly and retain the version. Run `find` with the validated literal version embedded in the path pattern and retain the resulting package root. Keep the fallback and credential-path prohibition unchanged.

- [ ] **Step 3: Replace ANSI-C configuration syntax**

Use a literal multiline single-quoted assignment for `PRISM_SENSITIVE_PATHS`, preserving the newline-separated value contract without escape interpretation.

- [ ] **Step 4: Remove raw false-positive quote sequences**

Change the affected grep regular expressions in `check-php.md` from single-quoted end-anchored patterns to equivalent double-quoted patterns. Preserve every regex and command outcome.

- [ ] **Step 5: Run focused regressions**

Run:

```bash
bash tests/Shell/instruction_shell_safety_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/commit_workflow_drift_test.sh
```

Expected: the global test fails only on release-related resources; existing contracts pass.

---

### Task 5: Rewrite the release workflow as observable agent steps

**Files:**
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**
- Consumes: direct git, git-cliff, Node.js, `gh`, and `wc` output retained as validated agent context.
- Produces: the existing release branch, changelog, package bumps, signed release commit, and human handoff without unsupported shell grammar.

- [ ] **Step 1: Decompose preflight capture**

Replace shell comparisons around captured output with direct commands and explicit agent decisions:

- `git status --porcelain` must return no lines.
- `git branch --show-current` must return exactly `develop`.
- separate `git rev-parse HEAD` and `git rev-parse origin/develop` calls must return identical SHAs.
- `prism-tool run git-cliff -- --version` output must show major version 2 or newer.

Use double-quoted end-anchored regexes where shell validation remains.

- [ ] **Step 2: Decompose version and tag discovery**

Run tag discovery and bumped-version commands directly. Retain the observed tag/version as validated conversation values and render a literal `X.Y.Z` in later commands. Preserve first-release questioning, semantic-version grammar, bump rationale, and final release approval.

- [ ] **Step 3: Rewrite branch creation and changelog link replacement**

Resolve scripts separately, then invoke `new-branch.sh` with the validated literal version. Replace `mktemp` capture with `.pi/tmp/release-changelog.tmp`; create `.pi/tmp`, render the validated repository literal into `sed`, and atomically move the stable temp file.

- [ ] **Step 4: Rewrite section-size and package-version capture**

Run the `awk | wc -c` measurement directly and evaluate its numeric output at the agent level. For each validated package path, run package-name, current-version, and next-version commands separately and retain literal results. Replace the parenthesized `cd` subshell with:

```bash
npm --prefix PACKAGE_DIRECTORY version NEXT_VERSION --no-git-tag-version
```

Keep the bumped-package list as conversation state for literal staging and handoff rendering.

- [ ] **Step 5: Update release contract assertions**

Replace assertions that pin assignment/capture spellings with assertions for direct commands, literal-value rendering, stable `.pi/tmp` use, separate resolver calls, and `npm --prefix`. Add explicit negative assertions for the prohibited raw patterns and parenthesized package subshell.

- [ ] **Step 6: Run release regressions**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/instruction_shell_safety_test.sh
```

Expected: PASS. The global instruction-shell test is now green.

---

### Task 6: Verify the complete instruction contract

**Files:**
- Modify only if a regression reveals a missed instruction resource.

**Interfaces:**
- Consumes: completed instruction cleanup.
- Produces: verified repository state with no prohibited instruction syntax.

- [ ] **Step 1: Re-run the literal audit**

Run the new global test and independently scan the same resource set with patterns written as `[$][(]` and `[$][']`.

Expected: zero findings.

- [ ] **Step 2: Run all affected Shell regressions**

Run:

```bash
bash tests/Shell/instruction_shell_safety_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/setup_rulesets_command_test.sh
bash tests/Shell/skill_shell_injection_test.sh
bash tests/Shell/pr_command_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/commit_workflow_drift_test.sh
bash tests/Shell/search_skills_test.sh
```

Expected: PASS.

- [ ] **Step 3: Run the full shell suite**

Run: `composer test:shell`

Expected: PASS.

- [ ] **Step 4: Run project verification and gate**

Load `verification-before-completion`, run `/check`, then run `code-review` over the complete branch diff. Resolve every Blocking finding before preparing the implementation commit.

- [ ] **Step 5: Commit the implementation**

Stage the rewritten instructions, regression test, and adjusted contract tests. Use `prism-tool commit prepare` with type `fix`, scope `core`, and subject `make instruction shell recipes safety-compatible`. Present the exact launcher-produced message and plan ID for approval, then apply only after explicit approval.
