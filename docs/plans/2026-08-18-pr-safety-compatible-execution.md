# Safety-Compatible Pull Request Preparation Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make `/pr` preparation executable through Pi's safety boundary without weakening fail-closed shell classification.

**Architecture:** Add narrow `prism-tool pr preflight` and `prism-tool pr validate-title` operations that own fixed workflow mechanics and use bounded argument-array subprocess calls. Replace the prompt's inline shell mechanics with substitution-free launcher calls, then test the exact marked blocks through the public safety handler.

**Tech Stack:** Node.js CommonJS launcher, Bash prompt-contract tests, Node test runner, existing safety extension and toolchain launcher.

## Global constraints

- Keep command substitution and unsupported shell grammar fail-closed in the safety extension.
- Add no Pi extension, dependency, network action, GitHub mutation, push, or merge behavior.
- Preserve preflight output fields and existing policy diagnostics.
- Keep repository-derived values inert and subprocess execution bounded.
- Support source checkouts and globally installed Prism core packages.

---

### Task 1: Launcher-owned pull request operations

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/pr.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Create: `tests/Node/prism-tool-pr.test.js`

**Interfaces:**
- Consumes: `runBounded(command, args, options)`, the Prism core root, current working directory, environment, branch validator, identity resolver, OCR model resolver, and the existing launcher entry point.
- Produces: `prCommand(args: string[], context: object): number`; CLI forms `prism-tool pr preflight` and `prism-tool pr validate-title --title-file PATH --validation-file PATH`.

- [x] **Step 1: Write failing public CLI tests**

Create fixture tests that call `main()` and inject a bounded runner. The preflight success test must assert this exact output shape:

```text
BRANCH\tfix/tester-abcd-example
TARGET_BRANCH\tdevelop
BASE_REF\torigin/develop
BASE_SHA\t1111111111111111111111111111111111111111
HEAD_SHA\t2222222222222222222222222222222222222222
MERGE_BASE\t1111111111111111111111111111111111111111
COMMIT_COUNT\t2
NON_MERGE_COUNT\t2
```

Cover detached HEAD, invalid/protected branch, dirty tree, absent base ref, zero-ahead range, merge-only range, net-empty range, and subprocess failure. Assert fixed diagnostics contain no untrusted subprocess output.

For title validation, create private title and validation files, provide `PI_MODEL`, and assert that the operation:

```text
feat(core): preserve inert $(payload) text
```

is preserved byte-for-byte as line one, receives the required synthetic trailers, invokes commitlint with the validation file as an inert argument, and rejects missing files, multiline titles, missing model attribution, failed identity/model resolution, and failed commitlint.

- [x] **Step 2: Run tests to verify Red**

Run: `node --test tests/Node/prism-tool-pr.test.js`

Expected: FAIL because `prism-tool` reports `unknown command` for `pr`.

- [x] **Step 3: Implement the preflight operation**

Create `pr.js` with the existing RCS header/modeline and export:

```javascript
function prCommand(args, context = {}) {
    if (args.length === 1 && args[0] === 'preflight') {
        return preflight(context);
    }
    if (args[0] === 'validate-title') {
        return validateTitle(args.slice(1), context);
    }
    process.stderr.write(
        'usage: prism-tool pr preflight | prism-tool pr validate-title --title-file PATH --validation-file PATH\n'
    );
    return 2;
}

module.exports = {prCommand};
```

The implementation must:

- run mandatory local readiness through the current launcher with fixed argv;
- invoke Git with argument arrays only;
- validate branch output before printing it;
- distinguish expected `git diff --quiet` status `1` from execution failure;
- cap subprocess output and never relay raw failure output;
- invoke only canonical core scripts for branch, identity, and OCR-model resolution;
- read title input with a size cap and require one non-empty LF/CR-free line;
- create the validation file with mode `0600` and exact synthetic trailers;
- invoke commitlint through the current launcher with fixed argv and the validation path as one argument.

Wire it in `main()`:

```javascript
if (command === 'pr') return prCommand(args, context);
```

- [x] **Step 4: Run tests to verify Green**

Run: `node --test tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-run.test.js tests/Node/prism-tool-preflight.test.js`

Expected: PASS.

- [x] **Step 5: Commit**

```text
feat(toolchain): add pull request workflow operations

Authored-by: gpt-5.6-sol
Implemented-by: gpt-5.6-sol
Tested-by: gpt-5.6-sol
Signed-off-by: kyau <kyau@kyau.net>
```

### Task 2: Prompt and safety boundary integration

**Files:**
- Modify: `packages/prism-core/prompts/pr.md`
- Modify: `tests/Node/safety-tool-call-handler.test.ts`
- Modify: `tests/Shell/pr_command_test.sh`
- Modify: `tests/Shell/skill_shell_injection_test.sh`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`

**Interfaces:**
- Consumes: `prism-tool pr preflight`, `prism-tool pr validate-title`, marked prompt blocks, and `handleToolCall()`.
- Produces: exact agent-executed blocks that contain no unsupported substitution and are accepted by the public safety boundary.

- [x] **Step 1: Write the failing safety integration test**

Read the prompt as inert text, extract both marked blocks, and pass each exact block to:

```typescript
handleToolCall("bash", { command: extractedBlock }, deps)
```

Assert the result is `undefined` and the breaker count remains zero. Keep negative tests proving destructive and sensitive substitutions block.

- [x] **Step 2: Run test to verify Red**

Run: `node --test tests/Node/safety-tool-call-handler.test.ts`

Expected: FAIL because the current preflight and title blocks contain unsupported command substitution and ANSI-C quoting.

- [x] **Step 3: Replace inline mechanics with launcher calls**

Make the preflight marked block exactly:

```bash
prism-tool pr preflight
```

Make title validation use only the fixed operation and existing concrete file variables:

```bash
prism-tool pr validate-title \
    --title-file "$TITLE_FILE" \
    --validation-file "$VALIDATION_FILE"
```

Retain every non-execution instruction, gate, output section, and human-run GitHub command. Adjust shell contract fixtures so their `PATH` resolves the source `prism-tool` launcher and functional assertions exercise the new operations rather than duplicated inline policy.

- [x] **Step 4: Run focused tests to verify Green**

Run:

```text
node --test tests/Node/safety-tool-call-handler.test.ts tests/Node/prism-tool-pr.test.js
bash tests/Shell/pr_command_test.sh
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS.

- [x] **Step 5: Commit**

```text
fix(prompts): route pull request mechanics through launcher

Authored-by: gpt-5.6-sol
Implemented-by: gpt-5.6-sol
Tested-by: gpt-5.6-sol
Signed-off-by: kyau <kyau@kyau.net>
```

### Task 3: Architecture records and complete verification

**Files:**
- Modify: `CONTEXT.md`
- Create: `adr/0070-launcher-owned-workflow-mechanics.md`
- Create: `docs/specs/2026-08-18-pr-safety-compatible-execution-spec.md`
- Create: `docs/plans/2026-08-18-pr-safety-compatible-execution.md`

**Interfaces:**
- Consumes: approved specification, architect condition `ADR-required: 0070`, and completed implementation.
- Produces: accepted architecture record and complete branch evidence.

- [x] **Step 1: Verify the architecture record contract**

Run:

```text
bash packages/prism-core/scripts/validate-harness.sh
git diff --check
```

Expected: PASS with ADR-0070 listed in `CONTEXT.md`.

- [x] **Step 2: Run complete relevant suites**

Run:

```text
npm run test:node
bash tests/Shell/run-all.sh
shellcheck --severity=warning tests/Shell/pr_command_test.sh
prism-tool doctor --local-only
```

Expected: PASS.

- [x] **Step 3: Commit the approved records**

```text
docs(architecture): record launcher-owned workflow mechanics

Authored-by: gpt-5.6-sol
Implemented-by: gpt-5.6-sol
Tested-by: gpt-5.6-sol
Signed-off-by: kyau <kyau@kyau.net>
```

- [ ] **Step 4: Exercise the original reproduction**

Run the exact `/pr` preflight marked block through `handleToolCall()` and then execute `prism-tool pr preflight` on the clean work branch.

Expected: the safety handler allows the command and preflight reports the exact branch/base attestation without a sensitive-path denial.

- [ ] **Step 5: Complete branch lifecycle**

Run `/check`, the four-axis `code-review`, remove the committed plan/spec under ADR-0027, commit that cleanup, then recompute the exact branch attestation and repeat `/check` plus review before invoking `/pr` again.
