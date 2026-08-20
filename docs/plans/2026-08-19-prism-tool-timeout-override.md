# Prism Tool Execution Timeout Override Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add a bounded per-invocation `prism-tool run` timeout control while preserving every existing default and consent boundary.

**Architecture:** Parse `--timeout-ms=NNN` only in the launcher-control region, validate it after resolving the selected component, and pass it only as the bounded runner's timeout option. Export the existing 30-second process default and the revised 15-minute contract ceiling as canonical constants.

**Tech Stack:** Node.js 24, built-in `node:test`, synchronous argument-array subprocess execution.

## Global constraints

- Existing tool defaults remain unchanged.
- The hard ceiling is exactly 900,000 ms.
- Overrides below the selected tool's effective default fail before subprocess execution.
- Timeout controls never enter child argv or environment.
- OCR connectivity and code-egress approvals remain independent and unchanged.
- Add no dependencies.

---

### Task 1: Add the bounded launcher timeout control

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/process.js`
- Modify: `packages/prism-core/scripts/prism-tool/contract.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-run.test.js`
- Modify: `tests/Node/prism-tool-preflight.test.js`
- Modify: `tests/Node/toolchain-contract.test.js`

**Interfaces:**
- Consumes: `prism-tool run TOOL_ID [CONTROLS] -- ARGUMENTS`, component `executionTimeoutMs`, and the process runner's effective default.
- Produces: optional parsed `timeoutMs`, canonical `DEFAULT_EXECUTION_TIMEOUT_MS = 30000`, canonical `MAX_EXECUTION_TIMEOUT_MS = 900000`, and a validated runner timeout that is never forwarded to the child.

- [x] **Step 1: Write failing contract and launcher tests**

Update `tests/Node/toolchain-contract.test.js` so 900,000 ms is accepted and 900,001 ms is rejected. Extend the bundled fixture helper in `tests/Node/prism-tool-run.test.js` to optionally declare `executionTimeoutMs`, then add tests proving:

```javascript
const accepted = ['600000', '900000'];
const rejected = ['599999', '900001', '0900000', '+600000', '600000.0', '6e5'];
```

For accepted values, invoke:

```javascript
main(['run', 'fixture', `--timeout-ms=${value}`, '--', 'payload'], context)
```

Assert the target runner receives the numeric timeout and child argv is exactly `['payload']`. For every rejected value and a duplicate timeout control, assert status 2 and zero target-runner calls. Add an invocation without the control and assert the fixture's declared default is retained.

Extend the approved OCR run test in `tests/Node/prism-tool-preflight.test.js` with both launcher controls in reversed order:

```javascript
[
    'run',
    'ocr',
    '--timeout-ms=900000',
    '--code-egress-approved=yes',
    '--',
    'review',
    '--audience',
    'agent',
    '--format',
    'json',
]
```

Assert the target call receives `options.timeout === 900000` and the control is absent from OCR argv.

- [x] **Step 2: Run focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-run.test.js tests/Node/prism-tool-preflight.test.js tests/Node/toolchain-contract.test.js
```

Expected: FAIL because `--timeout-ms` is rejected and the contract ceiling remains 600,000 ms.

- [x] **Step 3: Export canonical timeout bounds**

In `process.js`, replace the inline default with:

```javascript
const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;
```

Use it in `runBounded` and export it with `extractVersion` and `runBounded`.

In `contract.js`, change:

```javascript
const MAX_EXECUTION_TIMEOUT_MS = 900000;
```

Export that constant with the existing contract functions.

- [x] **Step 4: Parse and validate the launcher control**

In `cli.js`, import both constants and define one canonical usage string containing:

```text
[--timeout-ms=MILLISECONDS]
```

Update `parseRun` to accept the OCR approval control and at most one timeout control in either order. Validate the timeout token with `^[1-9][0-9]*$`, convert it with `Number`, require `Number.isSafeInteger`, and return it as `timeoutMs` without adding it to `toolArgs`.

After selecting the component and before readiness checks, compute:

```javascript
const defaultTimeoutMs = component.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
```

Return usage status when the parsed timeout is below `defaultTimeoutMs` or above `MAX_EXECUTION_TIMEOUT_MS`. Invoke the runner with:

```javascript
timeout: context.timeout ?? parsed.timeoutMs ?? defaultTimeoutMs,
```

- [x] **Step 5: Run focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-run.test.js tests/Node/prism-tool-preflight.test.js tests/Node/toolchain-contract.test.js
```

Expected: PASS.

- [x] **Step 6: Refactor and run complete verification**

Run:

```bash
npm run test:node
bash packages/prism-core/scripts/validate-harness.sh
git diff --check
```

Expected: all PASS with no generated assets or dependency changes.

- [x] **Step 7: Prepare the atomic implementation commit**

Stage only the six source/test files, verify the staged diff, then use:

```bash
prism-tool commit prepare --type feat --scope core --subject "add bounded tool timeout overrides"
```

Present the exact launcher-rendered message and apply its plan only after explicit approval.
