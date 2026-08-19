# Launcher-Owned Commit Workflow Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make `prism-tool commit` the exclusive agent-facing path for ordinary signed commits.

**Architecture:** A deep `commit.js` module owns structured input parsing, attribution, repository-state binding, private plans, approval, signing, and cleanup. The CLI only routes commands. Active instructions delegate to this interface, with drift and safety tests preventing regression.

**Tech Stack:** Node.js 22, `node:test`, Git, commitlint, Bash contract tests.

## Global constraints

- No new dependency or extension.
- Keep hooks, commitlint, signing, and ADR-0064 footer ordering.
- Never push or invoke network operations.
- Exit classes: usage `2`, readiness `3`, tool `4`, transaction `5`.
- Structured single-line fields may be inert argv; multiline messages and resolver output may not enter shell source.
- Plans use private, no-follow files under the worktree-aware actual Git directory.
- Index fingerprinting is SHA-256 over bounded binary `git ls-files --stage -z` output.

---

### Task 1: Implement commit preparation

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/commit.js`
- Create: `tests/Node/prism-tool-commit.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/scripts/prism-tool/process.js`

**Interfaces:**
- Consumes: existing `runBounded(command, args, options)` process boundary and the launcher-owned `doctor`, commitlint, identity, OCR, and branch-validation operations.
- Produces: `commitCommand(args, context = {}) -> number`.
- Produces: `prism-tool commit prepare --type TYPE [--scope SCOPE] --subject SUBJECT [--body-file PATH] [--fixes NN | --refs NN]`.
- Extends: `runBounded()` accepts an optional binary-output encoding while preserving existing string behavior by default.

- [x] **Step 1: Route the command and prove the public seam is Red**

Add one `node:test` case that invokes `main(['commit', 'prepare', ...])` and expects the current unknown-command result to change to structured commit handling.

Run:

```bash
node --test tests/Node/prism-tool-commit.test.js
```

Expected: FAIL because `cli.js` does not route `commit` and `commit.js` does not exist.

- [x] **Step 2: Add the minimum route and strict operation parser**

Create `commit.js` with the required RCS header/modeline and export only:

```javascript
function commitCommand(args, context = {}) {
    // Dispatch only prepare, apply, and discard; malformed operations return 2.
}

module.exports = {commitCommand};
```

Route `commit` from `cli.js`. Add one parser behavior at a time and keep each Green before adding the next: canonical order, required type/subject, unknown controls, duplicate controls, reordered controls, mutually exclusive issue controls, and unexpected positional arguments.

- [x] **Step 3: Render and validate the canonical message**

Append one test per behavior and implement only after each meaningful Red:

1. canonical header and three footers;
2. optional scope;
3. optional normalized body;
4. `Fixes: #NN`;
5. `Refs: #NN`;
6. type, scope, subject, issue number, `PI_MODEL`, identity, and OCR rejection.

The renderer must produce exactly one trailing LF and footer order:

```text
optional Fixes: #NN or Refs: #NN
Implemented-by: model-id
Tested-by: ocr-model-id
Signed-off-by: Name <email>
```

- [x] **Step 4: Add secure body-file handling**

Test and implement project containment, canonical realpath comparison, `O_NOFOLLOW`, regular-file enforcement, a 64 KiB limit, strict UTF-8 decoding, NUL/control rejection, CRLF-to-LF normalization, and removal of exactly one trailing LF before assembly.

- [x] **Step 5: Add readiness and commitlint boundaries**

Test and implement bounded argv calls to:

```text
<node> <core>/scripts/prism-tool.js doctor --local-only
bash <core>/scripts/resolve-identity.sh
bash <core>/scripts/resolve-ocr-model.sh
<node> <core>/scripts/prism-tool.js run commitlint --
```

Pass the complete message to commitlint through bounded stdin, not shell source or a caller-owned path. Map readiness/attribution failures to `3` and commitlint/process failures to `4`.

- [x] **Step 6: Enforce repository and branch state**

Test and implement bounded Git argv for canonical repository root, symbolic branch, `HEAD` or unborn sentinel, branch validation, ADR-0044’s unborn protected-branch exception, and non-empty staged changes. Detached `HEAD`, ordinary protected branches, malformed branches, and empty staged diffs must fail without creating plans.

- [x] **Step 7: Fingerprint exact staged-index data**

Extend `runBounded` so `encoding: null` returns bounded Buffers while its default remains UTF-8 strings. Hash bounded binary output from:

```text
git ls-files --stage -z
```

using SHA-256. Test arbitrary path bytes and an output-limit failure so large indexes fail closed rather than receiving a weakened fingerprint.

- [x] **Step 8: Create a worktree-safe private plan**

Resolve the actual Git directory with:

```text
git rev-parse --path-format=absolute --git-dir
```

Canonicalize it and create each launcher-owned directory component individually. Existing components must be owned directories, not symlinks, and have the required private mode. Create a random 32-lowercase-hex plan directory with exclusive semantics, mode `0700`, then exclusive `0600` `plan.json` and `message.txt` files. Store schema version, repository realpath, branch, `HEAD`/unborn sentinel, index fingerprint, message digest, and creation timestamp.

- [x] **Step 9: Verify Task 1 Green**

Run:

```bash
node --test tests/Node/prism-tool-commit.test.js
npm run test:node
```

Expected: all prepare tests and existing launcher tests pass.

Tasks 1 and 2 form one atomic launcher commit; do not commit the incomplete transaction yet.

---

### Task 2: Implement apply and discard

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/commit.js`
- Modify: `tests/Node/prism-tool-commit.test.js`

**Interfaces:**
- Consumes: Task 1’s private plan schema and `commitCommand` dispatcher.
- Produces: `prism-tool commit apply --plan PLAN_ID --approval=yes`.
- Produces: `prism-tool commit discard --plan PLAN_ID`.

- [x] **Step 1: Require exact approval and plan identifiers**

Write one failing test each for missing approval, non-literal approval, malformed IDs, traversal syntax, duplicates, reordered controls, and unknown controls. Implement strict parsing so usage failures return `2` without touching Git.

- [x] **Step 2: Load and validate private plans**

Test and implement no-follow reads plus schema, owner, mode, repository, file-size, and message-digest validation. Resolve plan paths only after the ID passes `^[0-9a-f]{32}$`. Malformed or inaccessible plans return `5` without following or deleting attacker-controlled paths.

- [x] **Step 3: Bind approval to unchanged state**

Write one Red/Green cycle for each mismatch: repository, branch, `HEAD`, unborn state, and staged-index fingerprint. Recompute each value using Task 1’s exact helpers; every mismatch returns `5` before commit execution.

- [x] **Step 4: Re-run readiness and validation**

Test that apply repeats local readiness and commitlint against the frozen private message. Failures return `3` or `4`, invalidate the plan when safe, and never invoke Git commit.

- [x] **Step 5: Invoke signed Git exactly once**

Write a failing test asserting the process boundary receives exactly:

```text
git commit -S -F <owned-message-file>
```

Implement the bounded invocation with hooks enabled and no network command. Add failures for hook rejection, signing failure, timeout, output limit, and non-zero Git status; diagnostics must not echo message or resolver content.

- [x] **Step 6: Confirm success and clean owned artifacts**

Test that apply resolves the post-commit `HEAD`, requires it to be a new valid SHA-1 or SHA-256 object ID, prints only the stable success diagnostic and commit ID, then unlinks known files and removes the exact plan directory. Apply must clean safely on both success and failure and never recursively delete.

- [x] **Step 7: Implement bounded idempotent discard**

Test missing-plan success, valid-plan cleanup, malformed-plan rejection, symlink refusal, foreign ownership/mode refusal, and preservation of unknown paths. Implement only known-file unlinking followed by removal of the exact empty plan directory.

- [x] **Step 8: Verify the complete launcher transaction**

Run:

```bash
node --test tests/Node/prism-tool-commit.test.js
npm run test:node
```

Expected: all launcher tests pass.

- [x] **Step 9: Commit Tasks 1–2 through the new wrapper**

Stage only the launcher implementation and tests:

```bash
git add packages/prism-core/scripts/prism-tool/commit.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/prism-tool/process.js tests/Node/prism-tool-commit.test.js
prism-tool commit prepare --type fix --scope toolchain --subject "add launcher-owned commit transactions"
```

Present the exact rendered message and wait for explicit approval. Then run with the literal returned ID:

```bash
prism-tool commit apply --plan <literal-plan-id> --approval=yes
```

Expected: a new signed commit ID; never push.

---

### Task 3: Route active instructions through the launcher

**Files:**
- Modify: `AGENTS.md`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `packages/prism-core/skills/brainstorming/SKILL.md`
- Modify: `packages/prism-core/skills/conventional-commits/SKILL.md`
- Modify: `packages/prism-core/skills/executing-plans/SKILL.md`
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/prism-core/skills/tdd/SKILL.md`
- Modify: `packages/prism-core/skills/writing-plans/SKILL.md`
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `.github/hooks/commit-msg`
- Modify: `docs/specs/2026-08-18-prism-tool-commit-wrapper-spec.md`
- Modify: `docs/plans/2026-08-18-prism-tool-commit-wrapper.md` (checkbox progress only)

**Interfaces:**
- Consumes: Tasks 1–2’s prepare/apply/discard commands.
- Produces: one canonical agent workflow owned by `conventional-commits`; all other ordinary commit instructions delegate to it.

- [x] **Step 1: Write failing instruction-contract assertions**

Update the relevant shell assertions first so they require launcher delegation, exact-message approval, three-footer preservation, and removal of ANSI-C/direct ordinary-commit recipes. Run focused tests and verify meaningful failures against current instructions.

- [x] **Step 2: Rewrite `conventional-commits` as the sole workflow owner**

Document this mandatory sequence:

1. select structured type/scope/subject/body/reference fields;
2. use Pi’s `write` tool for an optional uniquely named `.prism/commit-body-<nonce>.txt`;
3. run substitution-free `prism-tool commit prepare` argv;
4. remove the body input using only its literal known path whether prepare succeeds or fails;
5. display the launcher’s exact message and stop for explicit approval;
6. apply with the literal plan ID and `--approval=yes`;
7. discard if declined or replaced;
8. report the commit ID and never push.

Remove direct `git commit`, ANSI-C quoting, multiline `-m`, and direct attribution-resolver recipes.

- [x] **Step 3: Delegate every active ordinary-commit workflow**

Update brainstorming, TDD, planning, execution, branch finishing, release, and `AGENTS.md` so they load/delegate to `conventional-commits` instead of constructing or executing ordinary commits themselves. Preserve `resolve-merge-conflicts` merge and rebase completion because those Git-generated messages remain footer-exempt.

For release commits, keep staging and the validated literal version/optional issue number, then use:

```text
prism-tool commit prepare --type chore --scope release --subject vX.Y.Z [--refs NN]
```

The release confirmation does not replace the exact commit-message approval gate.

- [x] **Step 4: Correct hook guidance**

Replace `.github/hooks/commit-msg`’s `$'...'` recommendation with a concise instruction to use `prism-tool commit prepare`; retain the literal-backslash guard and existing commitlint execution.

- [x] **Step 5: Preserve the approved specification clarification**

Keep the confirmed wording in `docs/specs/2026-08-18-prism-tool-commit-wrapper-spec.md`: structured validated single-line fields may be inert argv, while complete multiline messages and resolver output never enter Bash source.

---

### Task 4: Add drift, safety, and packaging contracts

**Files:**
- Create: `packages/prism-core/scripts/check-commit-workflows.js`
- Create: `tests/Shell/commit_workflow_drift_test.sh`
- Modify: `packages/prism-core/scripts/validate-harness.sh`
- Modify: `tests/Node/safety-tool-call-handler.test.ts`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/commit_template_footer_test.sh`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**
- Consumes: active root/package `AGENTS.md`, skill, and prompt resources.
- Produces: `node packages/prism-core/scripts/check-commit-workflows.js ROOT` with zero on compliance and stable path/line diagnostics on drift.
- Produces: explicit merge/revert completion allowances without broad file allowlisting.

- [x] **Step 1: Build the drift checker via shell fixture tests**

In `commit_workflow_drift_test.sh`, create isolated temporary active-resource fixtures and add one Red/Green cycle each for:

1. runnable ordinary `git commit` rejection;
2. ANSI-C commit-message guidance rejection;
3. direct identity/OCR attribution recipe rejection;
4. ordinary `prism-tool commit` workflow acceptance;
5. exact merge/revert completion acceptance;
6. near-miss merge commands and broad exemptions rejection.

The checker must scan only explicit active resource roots and return stable inert diagnostics.

- [x] **Step 2: Integrate drift enforcement into harness validation**

Invoke the checker from `validate-harness.sh`, convert each emitted diagnostic into the existing `err` format, and fail when the checker itself errors. Do not use a broad grep allowlist for an entire skill.

- [x] **Step 3: Test the public safety boundary**

Add marked representative prepare/apply/discard blocks to `conventional-commits`. Extract those exact blocks in `safety-tool-call-handler.test.ts`, pass each through `handleToolCall`, and assert both allowance and zero denial-circuit-breaker consumption.

- [x] **Step 4: Update packaging contracts**

Require the core archive to contain both:

```text
scripts/prism-tool/commit.js
scripts/check-commit-workflows.js
```

Keep the generic package `scripts` inclusion unchanged; no dependency or manifest expansion is needed.

- [x] **Step 5: Update release, hook, and exemption contracts**

Make shell tests prove the release prompt uses prepare/apply rather than direct Git, the hook recommends the launcher, footer semantics remain intact, and direct Git in synthetic-history fixtures plus merge/revert completion remains unaffected.

- [x] **Step 6: Run focused integration verification**

Run:

```bash
node --test tests/Node/safety-tool-call-handler.test.ts
node --test tests/Node/toolchain-packaging.test.js
bash tests/Shell/commit_workflow_drift_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/release_workflow_test.sh
bash packages/prism-core/scripts/validate-harness.sh
composer test:shell
npm run test:node
```

Expected: all commands pass.

- [ ] **Step 7: Commit Tasks 3–4 through the wrapper**

Stage the exact instruction, validation, specification, plan-progress, and test paths changed by Tasks 3–4. Then prepare:

```bash
prism-tool commit prepare --type fix --scope harness --subject "enforce launcher-owned commit workflow"
```

Present the exact rendered message and wait for explicit approval. Apply only with the literal returned ID:

```bash
prism-tool commit apply --plan <literal-plan-id> --approval=yes
```

Expected: a new signed commit ID; never push.

---

### Task 5: Final verification and review

**Files:**
- Modify only if a verification failure proves an implementation defect; return to the responsible task’s Red → Green cycle before changing anything.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: fresh completion evidence and a reviewed, unpushed branch.

- [ ] **Step 1: Run focused and full tests**

```bash
node --test tests/Node/prism-tool-commit.test.js
npm run test:node
composer test:shell
composer test
composer test:coverage
```

Expected: all pass and coverage remains at or above the configured 80% gate.

- [ ] **Step 2: Run harness and security checks**

```bash
bash packages/prism-core/scripts/validate-harness.sh
```

Then run the repository’s Gitleaks check through `/check`; do not bypass unavailable mandatory tooling.

- [ ] **Step 3: Verify completion**

Load `verification-before-completion` and confirm:

- the original ANSI-C safety-parser reproduction no longer occurs in active guidance;
- exact prepare/apply/discard skill commands pass the public safety handler;
- no debug instrumentation remains;
- no commit plan or `.prism/commit-body-*` artifact remains;
- no generated minified asset changed;
- no dependency was added;
- no network or push command ran.

- [ ] **Step 4: Run the pre-push gate and review**

Run `/check`, then the four-axis `code-review`. Resolve findings through `receiving-code-review`, rerun affected evidence, and create an additional wrapper-owned commit only when an intentional fix is required.

- [ ] **Step 5: Hand back the branch**

Report commit IDs, verification evidence, and review results. Do not push.
