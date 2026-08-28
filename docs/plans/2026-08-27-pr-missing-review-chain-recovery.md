# Missing Review-Chain Recovery Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Let `/pr` run one initial four-axis review when the review chain is absent, then continue preparation after strict revalidation.

**Architecture:** `prism-tool pr review-preflight` distinguishes an absent chain from invalid evidence while sharing the existing mechanical checks. The `/pr` prompt coordinates the agent-owned review and reruns strict `prism-tool pr preflight` before generating artifacts.

**Tech Stack:** Node.js, Bash contract tests, Pi prompt templates, Markdown

**Originating issue:** none

## Global constraints

- Follow ADR-0093.
- Recover only `ABSENT`; all invalid chain states remain fatal.
- One `/pr` invocation authorizes one initial review, not repairs or retries.
- Standing OCR consent remains required for reviewed-code egress.
- `/pr` remains preparation-only.
- No new dependency or review-chain schema change.

---

### Task 1: Add the pre-review launcher probe

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/pr.js`
- Test: `tests/Node/prism-tool-pr.test.js`

**Interfaces:**

- Consumes: `inspectReviewChain(context)` and `verifyReviewChain(expected, context)`
- Produces: `prism-tool pr review-preflight`
- Produces: existing attestation fields plus `REVIEW_CHAIN\tVALID` or `REVIEW_CHAIN\tABSENT`
- Preserves: strict `prism-tool pr preflight`

- [x] **Step 1: Write the failing tests**

Add these complete observable cases to `tests/Node/prism-tool-pr.test.js`:

```javascript
test('pr review-preflight reports an absent review chain', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChain: () => ({state: 'ABSENT'}),
        verifyReviewChain: () => assert.fail('absent chain must not be verified'),
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tABSENT/);
    assert.doesNotMatch(result.stdout, /ADVISORY_COUNT/);
});

test('pr review-preflight verifies a present chain', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChain: () => ({state: 'VALID'}),
        verifyReviewChain: () => ({
            advisoryFindings: [{summary: 'follow-up cleanup'}],
        }),
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tVALID/);
    assert.match(result.stdout, /ADVISORY_COUNT\t1/);
});

test('pr review-preflight rejects unsafe review-chain state', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChain: () => ({state: 'UNSAFE'}),
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review chain is unsafe or invalid/);
});

test('pr review-preflight rejects unusable present review-chain evidence', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChain: () => ({state: 'VALID'}),
        verifyReviewChain: () => { throw new Error('CANARY'); },
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review chain is incomplete, stale, or has unresolved Blocking findings/);
    assert.doesNotMatch(result.stderr, /CANARY/);
});
```

Keep the existing strict-preflight rejection test to prove that absent or invalid evidence remains fatal there.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-pr.test.js`

Expected: FAIL because `review-preflight` is not a supported command.

- [x] **Step 3: Implement the shared preflight mode**

Update the review-chain imports and command dispatch in `packages/prism-core/scripts/prism-tool/pr.js`:

```javascript
const {
    STATE,
    inspectReviewChain,
    verifyReviewChain,
} = require('./review-chain');

function prCommand(args, context = {}) {
    if (args.length === 1 && args[0] === 'preflight') {
        return preflight(context, {allowAbsentReviewChain: false});
    }
    if (args.length === 1 && args[0] === 'review-preflight') {
        return preflight(context, {allowAbsentReviewChain: true});
    }
    if (args[0] === 'validate-title') return validateTitle(args.slice(1), context);
    process.stderr.write(
        'usage: prism-tool pr preflight | prism-tool pr review-preflight | ' +
        'prism-tool pr validate-title --title-file PATH --validation-file PATH\n'
    );
    return EXIT.USAGE;
}
```

Change the preflight signature:

```javascript
function preflight(context, options = {}) {
    const allowAbsentReviewChain = options.allowAbsentReviewChain === true;
```

Replace the current review verification block with:

```javascript
    let reviewChainState = STATE.VALID;
    let advisoryCount;

    if (allowAbsentReviewChain) {
        const inspect = context.inspectReviewChain ?? inspectReviewChain;
        let inspected;
        try {
            inspected = inspect({...context, projectRoot: cwd});
        } catch {
            return failure('review chain is unsafe or invalid');
        }
        if (inspected.state === STATE.ABSENT) {
            reviewChainState = STATE.ABSENT;
        } else if (inspected.state !== STATE.VALID) {
            return failure('review chain is unsafe or invalid');
        }
    }

    if (reviewChainState === STATE.VALID) {
        const verify = context.verifyReviewChain ?? verifyReviewChain;
        let review;
        try {
            review = verify({branch, baseRef, baseSha, headSha}, {
                ...context,
                projectRoot: cwd,
            });
        } catch {
            return failure(
                'review chain is incomplete, stale, or has unresolved Blocking findings'
            );
        }
        advisoryCount = String(review.advisoryFindings.length);
    }
```

Replace the output field tail with:

```javascript
        ['NON_MERGE_COUNT', nonMergeCount],
        ['REVIEW_CHAIN', reviewChainState],
    ];
    if (advisoryCount !== undefined) {
        fields.push(['ADVISORY_COUNT', advisoryCount]);
    }
```

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-pr.test.js`

Expected: PASS.

- [x] **Step 5: Create the commit**

Stage `packages/prism-core/scripts/prism-tool/pr.js` and `tests/Node/prism-tool-pr.test.js`, then load `conventional-commits` and run this as a standalone tool call:

```bash
prism-tool commit create --type fix --scope pr --subject "distinguish absent review chains"
```

---

### Task 2: Make `/pr` recover an absent chain

**Files:**

- Modify: `packages/prism-core/prompts/pr.md`
- Test: `tests/Shell/pr_command_test.sh`
- Test: `tests/Shell/toolchain_entrypoints_test.sh`

**Interfaces:**

- Consumes: `REVIEW_CHAIN=VALID|ABSENT` from Task 1
- Consumes: existing `code-review` skill
- Produces: strict post-review `prism-tool pr preflight`

- [x] **Step 1: Add failing prompt-contract tests**

Add these assertions to `tests/Shell/pr_command_test.sh`:

```bash
assert_contains "$COMMAND_FILE" 'prism-tool pr review-preflight' \
    'pr probes review-chain state before strict preflight'
assert_contains "$COMMAND_FILE" 'REVIEW_CHAIN=ABSENT' \
    'pr recognizes only an absent chain as recoverable'
assert_contains "$COMMAND_FILE" 'authorizes one complete initial four-axis review' \
    'pr invocation authorizes one absent-chain review'
assert_contains "$COMMAND_FILE" 'load the `code-review` skill' \
    'pr delegates missing-chain review to code-review'
assert_contains "$COMMAND_FILE" 'does not authorize a second review' \
    'pr forbids automatic review retries'
assert_contains "$COMMAND_FILE" 'strict `prism-tool pr preflight`' \
    'pr reruns strict preflight after review'
```

Add this assertion to `tests/Shell/toolchain_entrypoints_test.sh` beside the current PR launcher assertions:

```bash
assert_file_contains "$CORE_PROMPTS/pr.md" 'prism-tool pr review-preflight' \
    'pr delegates review readiness to the launcher'
```

- [x] **Step 2: Run the contract tests to verify Red**

Run: `bash tests/Shell/pr_command_test.sh`

Expected: FAIL because the prompt has no recovery path.

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: FAIL because the prompt does not call `review-preflight`.

- [x] **Step 3: Implement the prompt recovery flow**

Replace the initial strict-only preflight section of `packages/prism-core/prompts/pr.md` with these stages:

````markdown
## 1. Pre-review mechanical preflight

Run the marked block exactly. Stop on its first failure.

<!-- pr-review-preflight:start -->
```bash
prism-tool pr review-preflight
```
<!-- pr-review-preflight:end -->

Retain every tab-delimited field as validated inert context. Accept only
`REVIEW_CHAIN=VALID` or `REVIEW_CHAIN=ABSENT`. Any other state or command
failure stops preparation.

## 2. Recover an absent review chain

When `REVIEW_CHAIN=VALID`, do not run another review and continue to strict
preflight.

When `REVIEW_CHAIN=ABSENT`, require the active finalization path to contain its
applicable target synchronization, exact attestation, and successful full
`/check` evidence at the BRANCH, HEAD_SHA, BASE_REF, and BASE_SHA reported by
pre-review preflight. This `/pr` invocation authorizes one complete initial
four-axis review. Standing OCR consent remains the sole authority for OCR
connectivity and reviewed-code egress.

Load the `code-review` skill and run one complete initial review over the exact
attested BASE_SHA through HEAD_SHA range. Require all four axes to complete,
record the initial review-chain segment, and leave no unresolved diff-causal
Blocking finding. Advisory findings remain visible and do not block
preparation.

A failed or incomplete axis, unresolved Blocking finding, dirty tree, changed
identity, or invalid recorded segment stops preparation. This invocation does
not authorize repairs or a second review. Existing finalization policy governs
repairs, `/check` reruns, and fresh approval for any later chain-selected
review.

## 3. Strict preflight and authorized-finalization evidence

After a valid existing chain or a successful absent-chain review, run the
marked block exactly. Stop on its first failure.

<!-- pr-preflight:start -->
```bash
prism-tool pr preflight
```
<!-- pr-preflight:end -->

Strict `prism-tool pr preflight` must report a valid review chain at the same
branch, base, and HEAD before artifact generation continues.
````

Move the existing authorized-finalization checks beneath that strict gate,
renumber later workflow sections, and retain the final strict-preflight rerun
immediately before artifact output.

- [x] **Step 4: Run the contract tests to verify Green**

Run: `bash tests/Shell/pr_command_test.sh`

Expected: PASS.

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: PASS.

- [x] **Step 5: Create the commit**

Stage the prompt and both shell tests, then load `conventional-commits` and run this as a standalone tool call:

```bash
prism-tool commit create --type fix --scope pr --subject "recover missing review chain during preparation"
```

---

### Task 3: Synchronize user-facing policy documentation

**Files:**

- Modify: `packages/prism-core/AGENTS.md`
- Modify: `packages/prism-core/README.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Test: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: ADR-0093 and the Task 2 prompt behavior
- Produces: one consistent absent-only recovery contract across maintained guidance

- [x] **Step 1: Add the failing documentation test**

Extend `documents bounded diff-causal review chains` in `tests/Node/toolchain-packaging.test.js` while preserving its existing assertions:

```javascript
    const publicReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const harnessDocs = fs.readFileSync(path.join(root, 'CODING_HARNESS.md'), 'utf8');
    const agents = fs.readFileSync(path.join(CORE_PKG, 'AGENTS.md'), 'utf8');
    for (const document of [coreReadme, publicReadme, harnessDocs, agents]) {
        assert.match(
            document,
            /standalone `?\/pr`?.*absent.*one complete initial review/is
        );
        assert.match(document, /invalid.*review chain.*fail closed/is);
        assert.match(document, /second review.*fresh explicit approval/is);
    }
```

- [x] **Step 2: Run the documentation test to verify Red**

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: FAIL because maintained guidance lacks ADR-0093 behavior.

- [x] **Step 3: Update maintained guidance**

Add this policy, adapted to each document's surrounding prose without changing its meaning:

```markdown
A standalone `/pr` invocation may authorize one complete initial review only
when deterministic preflight classifies the review chain as absent. Invalid
review-chain evidence continues to fail closed. A failed or second review
requires fresh explicit approval. `/pr` remains preparation-only.
```

Update the `/pr` command-table descriptions in `README.md` and
`packages/prism-core/AGENTS.md` to mention absent-chain recovery without
implying publication or GitHub mutation.

- [x] **Step 4: Run the focused documentation and workflow tests**

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run: `bash tests/Shell/pr_command_test.sh`

Expected: PASS.

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: PASS.

Run: `node --test tests/Node/prism-tool-pr.test.js`

Expected: PASS.

- [x] **Step 5: Create the commit**

Stage the four documents and `tests/Node/toolchain-packaging.test.js`, then load `conventional-commits` and run this as a standalone tool call:

```bash
prism-tool commit create --type docs --scope pr --subject "document missing review chain recovery"
```

---

## Final verification

- [ ] Run `node --test tests/Node/prism-tool-pr.test.js` and require PASS.
- [ ] Run `node --test tests/Node/toolchain-packaging.test.js` and require PASS.
- [ ] Run `bash tests/Shell/pr_command_test.sh` and require PASS.
- [ ] Run `bash tests/Shell/toolchain_entrypoints_test.sh` and require PASS.
- [ ] Invoke `/check` and require the complete Core and active-adapter gate to pass.
- [ ] Confirm the working tree is clean.
- [ ] Hand the completed plan to `finishing-a-development-branch`.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
