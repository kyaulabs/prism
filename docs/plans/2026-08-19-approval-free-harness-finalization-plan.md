# Approval-Free Harness Finalization Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Replace repeated commit and OCR approvals with narrow launcher-owned
operations, make commit failures terminal until `/reload`, and run one accepted
branch-finalization attempt automatically through `/pr` preparation.

**Architecture:** Prism core gains focused CommonJS modules for consent state,
atomic commit creation, and dedicated OCR review. The existing safety extension
gains a separate fatal commit-failure state machine and Pi lifecycle wiring;
prompt and skill resources then consume those mechanics without adding another
extension or orchestration layer.

**Tech Stack:** Node.js 22+ CommonJS launcher modules, TypeScript Pi extension,
Node test runner, Bash contract tests, Git, Semgrep `>=1.173.0 <2.0.0`, OCR
`>=1.9.1 <2.0.0`, and Pest/PHPUnit through the active PHP/web adapter gate.

## Global constraints

- Preserve signed `git commit -S -F` execution, hooks, commitlint, ADR-0064
  attribution, protected branches, and the ADR-0044 unborn-root exception.
- Any failed or unsafe agent `commit create` attempt must abort and block every
  later tool call until extension teardown; no automatic retry is allowed.
- Standing OCR consent is global, explicit, persistent, revocable, and contains
  exactly `{"schemaVersion":1,"ocr":true}` with no credentials or project data.
- No OCR network access occurs when consent is absent or unsafe.
- `/setup` is the sole OCR-consent prompt; full `/doctor` and `code-review`
  never ask again.
- `/pr` remains preparation-only; the agent never pushes, creates, or merges a
  pull request.
- The safety extension remains the sole Pi extension. Add no dependencies.
- Keep all language-agnostic mechanics in `packages/prism-core`; add no
  PHP/Aurora-specific behavior to core.
- New `.js` and `.ts` files receive hook-managed RCS headers and required vim
  modelines; never edit generated minified assets.

---

### Task 1: Replace Commit Plans with Atomic `commit create`

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/commit.js`
- Modify: `tests/Node/prism-tool-commit.test.js`

**Interfaces:**
- Consumes: existing `runBounded`, local doctor, branch validator,
  attribution resolvers, and bundled commitlint.
- Produces: `commitCommand(["create", ...fields], context): number` and the
  public command `prism-tool commit create --type TYPE [--scope SCOPE]
  --subject SUBJECT [--body-file PATH] [--fixes NN | --refs NN]`.

- [x] **Step 1: Rewrite the launcher tests to require one atomic operation**

Replace plan-oriented assertions with behavior tests equivalent to:

```javascript
test('commit create renders, signs, verifies, and cleans one private message', (t) => {
    const {calls, context, gitDir} = makeCommitContext(t);
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--scope', 'toolchain',
        '--subject', 'create signed commits atomically',
    ], context));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^fix\(toolchain\): create signed commits atomically\n/m);
    assert.match(result.stdout, /Implemented-by: implementation-model/);
    assert.match(result.stdout, /Tested-by: review-model/);
    assert.match(result.stdout, /Signed-off-by: Test User <test@example.com>/);
    assert.match(result.stdout, new RegExp(`Commit: ${'3'.repeat(40)}`));
    const commit = calls.find(({command, args}) => command === 'git' && args[0] === 'commit');
    assert.deepEqual(commit.args.slice(0, 3), ['commit', '-S', '-F']);
    assert.equal(fs.statSync(commit.args[3]).mode & 0o777, 0o600);
    assert.equal(fs.existsSync(commit.args[3]), false);
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool', 'commit-plans')), false);
});

test('commit create rejects removed plan operations and approval flags', () => {
    for (const args of [
        ['commit', 'prepare'], ['commit', 'apply'], ['commit', 'discard'],
        ['commit', 'create', '--type', 'fix', '--subject', 'x', '--approval=yes'],
    ]) assert.equal(captureWrites(() => main(args)).status, 2);
});
```

Retain and adapt the existing malformed-field, protected-branch, body,
attribution, index-bound, signing/Git failure, and inert-argv cases. Add a
post-commit `HEAD` failure case proving the launcher returns non-zero after Git
was invoked and never prints success.

- [x] **Step 2: Run the focused test and confirm Red**

Run: `node --test tests/Node/prism-tool-commit.test.js`

Expected: FAIL because `commit create` is unknown and plan operations still
exist.

- [x] **Step 3: Implement atomic creation and remove plan persistence**

Refactor `commit.js` around these exact internal seams:

```javascript
function parseCreate(args) { /* ordered structured controls; no approval */ }
function createPrivateMessage(context, repository, message) {
    // Resolve the actual Git directory, validate/create mode-0700 prism-tool,
    // create one mode-0700 nonce directory and mode-0600 message.txt with
    // O_CREAT|O_EXCL|O_NOFOLLOW, and return {file, cleanup}.
}
function create(args, context) {
    const parsed = parseCreate(args);
    const header = validateStructured(parsed);
    runLocalReadiness(context);
    const before = repositoryState(context, coreRoot);
    const body = parsed.bodyfile === undefined ? '' : readBodyFile(parsed.bodyfile, before.repository);
    const message = buildMessage(header, parsed, resolveAttribution(context, coreRoot), body);
    validateCommitlint(context, coreRoot, message);
    const owned = createPrivateMessage(context, before.repository, message);
    try {
        requireSuccess(invoke(context, 'git', ['commit', '-S', '-F', owned.file]), EXIT.TOOL, 'signed Git commit failed');
        const after = repositoryHead(context);
        if (after === before.head) throw new CommitError(EXIT.TOOL, 'HEAD did not advance');
        process.stdout.write(`${message}\nCommit: ${after}\n`);
        return EXIT.OK;
    } finally {
        owned.cleanup();
    }
}
```

Delete `createPlan`, `loadPlan`, `resolvePlanDirectory`, `prepare`, `apply`, and
`discard`. Keep all existing validation and sanitized diagnostics. Export only
`commitCommand`; route only the `create` operation.

- [x] **Step 4: Run focused verification**

Run: `node --test tests/Node/prism-tool-commit.test.js`

Expected: PASS, including exact `git commit -S -F`, all previous fail-closed
cases, no plan artifacts, and cleanup after every failure.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/scripts/prism-tool/commit.js tests/Node/prism-tool-commit.test.js
prism-tool commit create --type feat --scope commit --subject "create signed commits atomically"
```

### Task 2: Add the Global Standing-Consent Store

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/consent.js`
- Create: `tests/Node/prism-tool-consent.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`

**Interfaces:**
- Produces:
  - `resolveConsentPath(context): string`
  - `inspectConsent(context): {state: "GRANTED"|"ABSENT"|"UNSAFE", path: string}`
  - `requireOcrConsent(context): {state: "GRANTED", path: string}` or throws
  - `consentCommand(args, context): number`
- Public commands: `consent status --json`, `consent grant-ocr --approval=yes`,
  and `consent revoke-ocr`.

- [x] **Step 1: Write consent storage tests first**

Create tests covering the public contract and filesystem boundary:

```javascript
test('grant writes the exact private schema and status reports granted', (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const consentPath = path.join(root, 'agent', 'prism-consent.json');
    assert.equal(capture(() => main(['consent', 'grant-ocr', '--approval=yes'], {consentPath})).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(consentPath, 'utf8')), {schemaVersion: 1, ocr: true});
    assert.equal(fs.statSync(consentPath).mode & 0o777, 0o600);
    const status = capture(() => main(['consent', 'status', '--json'], {consentPath}));
    assert.deepEqual(JSON.parse(status.stdout), {
        schemaVersion: 1, command: 'consent status', status: 'GRANTED', ocr: true,
    });
});
```

Add table cases for absent state, missing/duplicate/non-literal approval,
unknown keys, bad schema, `ocr:false`, malformed JSON, mode `0644`, wrong owner
through an injected stat seam, final-file symlink, parent symlink, path failure,
and a race where the final path appears before publication. Assert unsafe state
is never overwritten or revoked, valid revocation is ownership-bounded, and
absent revocation is idempotent.

- [x] **Step 2: Run the focused test and confirm Red**

Run: `node --test tests/Node/prism-tool-consent.test.js`

Expected: FAIL because `consent` is not routed.

- [x] **Step 3: Implement the private no-follow store**

Implement `consent.js` with these rules:

```javascript
const SCHEMA = Object.freeze({schemaVersion: 1, ocr: true});
const STATE = Object.freeze({GRANTED: 'GRANTED', ABSENT: 'ABSENT', UNSAFE: 'UNSAFE'});

function resolveConsentPath(context = {}) {
    if (context.consentPath) return path.resolve(context.consentPath);
    const piDir = context.piDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
    return path.join(piDir, 'prism-consent.json');
}
```

Validate the parent as an owned regular directory without symlink traversal;
create a missing launcher-owned parent with mode `0700`. Existing parents must
not be group/world writable. Open files with `O_NOFOLLOW`, require current-user
ownership and mode `0600`, enforce exact keys and schema, and never print file
contents. For grant, write and fsync a private exclusive temp file in the same
parent, then publish without overwriting an existing final path (use an atomic
no-replace link/publication step), and clean the temp in `finally`. Treat a
valid `ocr:false` record as `ABSENT`; Prism never writes it. Route `consent` in
`cli.js`.

- [x] **Step 4: Run focused verification**

Run: `node --test tests/Node/prism-tool-consent.test.js`

Expected: PASS with no access outside the injected fixture.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/scripts/prism-tool/consent.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-consent.test.js
prism-tool commit create --type feat --scope consent --subject "persist standing ocr consent"
```

### Task 3: Make Setup and Doctor Consume Standing Consent

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/preflight.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/scripts/install-global.sh`
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `packages/prism-core/prompts/doctor.md`
- Modify: `tests/Node/prism-tool-preflight.test.js`
- Modify: `tests/Shell/install_global_toolchain_test.sh`

**Interfaces:**
- Consumes: `inspectConsent`/`requireOcrConsent` from Task 2.
- Produces: full doctor automatically tests OCR only after valid consent;
  `doctor --local-only` remains offline; the installer performs local-only
  readiness and directs the human to `/setup`.

- [x] **Step 1: Change doctor and installer tests to the new cadence**

Update Node tests so full doctor with injected valid consent runs exactly one
`ocr llm test`, while absent/unsafe consent returns exit `3`, includes a fixed
`ocr-consent` failure, and never invokes OCR beyond `--version`. Remove every
`--ocr-test-approved=yes` test.

Update installer tests so:

```bash
output=$(HOME="$T1/home" PI_CODING_AGENT_DIR="$T1/pi-agent" \
    PRISM_BIN_DIR="$T1/bin-dir" PATH="$T1/bin:$PATH" \
    bash "$INSTALLER" 2>&1)
```

succeeds after local readiness, records no `ocr llm test`, creates no consent
record, and prints a next action directing the user to `/setup`. Assert the old
OCR approval option is rejected as unknown.

- [x] **Step 2: Run the focused tests and confirm Red**

Run:

```bash
node --test tests/Node/prism-tool-preflight.test.js
bash tests/Shell/install_global_toolchain_test.sh
```

Expected: FAIL because doctor and the installer still require per-operation
approval.

- [x] **Step 3: Implement consent-driven readiness and prompt behavior**

Change `testOcrConnectivity` to execute without an `approved` parameter; its
caller owns consent. Remove `ocrTestApproved` from `parseDoctor`. In full doctor:

```javascript
const consent = inspectConsent(context);
if (consent.state !== 'GRANTED') {
    checks.push({id: 'ocr-consent', status: 'FAIL', message: 'run /setup to grant standing OCR consent'});
    renderDoctor(checks, parsed.json);
    return EXIT.READINESS;
}
checks.push(runOcrConnectivity(context));
```

Keep local-only return before consent inspection. Remove the installer option,
state variable, and live doctor invocation. Update `/setup` to check
`prism-tool consent status --json`, ask the sole standing-consent question only
for `ABSENT`, run `grant-ocr --approval=yes`, and then run full doctor. For
`UNSAFE`, stop with human remediation; do not grant or revoke automatically.
Update `/doctor` to run full doctor without asking a question.

- [x] **Step 4: Run focused verification**

Run the two commands from Step 2.

Expected: PASS; local-only paths remain offline and every full live test is
preceded by valid standing consent.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/scripts/prism-tool/preflight.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/install-global.sh packages/prism-core/prompts/setup.md packages/prism-core/prompts/doctor.md tests/Node/prism-tool-preflight.test.js tests/Shell/install_global_toolchain_test.sh
prism-tool commit create --type feat --scope consent --subject "apply standing consent to readiness"
```

### Task 4: Add the Dedicated OCR Code-Review Operation

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/code-review.js`
- Create: `tests/Node/prism-tool-code-review.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-run.test.js`
- Modify: `packages/prism-core/skills/code-review/SKILL.md`

**Interfaces:**
- Consumes: core contract loading, external readiness, executable resolution,
  standing consent, `runBounded`.
- Produces: `codeReviewCommand(args, context): number` and exact public review
  and contained scan forms.

- [x] **Step 1: Write operation-order and no-egress-without-consent tests**

Create tests that inject subprocess calls and assert this order:

```javascript
assert.deepEqual(calls.map(({kind}) => kind), [
    'semgrep-version', 'ocr-version', 'ocr-connectivity', 'ocr-review',
]);
```

Cover exact `review --audience agent --format json`, `scan PATH --audience
agent --format json`, contained realpath validation, missing/unsafe consent,
version failure, connectivity failure, review timeout/non-zero, bounded output,
and provider-output canaries. Assert no OCR connectivity or review subprocess
runs before consent. Update `prism-tool-run.test.js` so every generic
`prism-tool run ocr ...` form is rejected even with the removed approval flag.

- [x] **Step 2: Run the focused tests and confirm Red**

Run:

```bash
node --test tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-run.test.js
```

Expected: FAIL because `code-review ocr` is unknown and generic OCR remains
available.

- [x] **Step 3: Implement the exact allowlisted operation**

Create `code-review.js` with an exact parser returning one of:

```javascript
{mode: 'review', args: ['review', '--audience', 'agent', '--format', 'json']}
{mode: 'scan', path: realContainedPath, args: ['scan', realContainedPath, '--audience', 'agent', '--format', 'json']}
```

Reject reordered, duplicated, extra, relative-escape, missing, and symlinked
scan operands. Validate consent first, then local Semgrep/OCR versions, then
run `ocr llm test` with discarded/sanitized output, then invoke OCR with the
contract timeout. Emit review stdout only on successful review; use fixed
redacted diagnostics on failure. Route `code-review` in `cli.js`. In
`runDeclaredTool`, reject `component.id === 'ocr'` before reading stdin or
executing a target.

Rewrite the tooling axis in `code-review/SKILL.md` to call only:

```bash
prism-tool code-review ocr -- review --audience agent --format json
```

or the exact scan form. Remove both questions, both approval flags, and the OCR
retry; an OCR failure marks tooling `FAILED` and the coordinator continues the
other axes.

- [x] **Step 4: Run focused verification**

Run the commands from Step 2.

Expected: PASS; generic OCR execution is unavailable and all dedicated OCR
network use is consent-gated.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/scripts/prism-tool/code-review.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/skills/code-review/SKILL.md tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-run.test.js
prism-tool commit create --type feat --scope review --subject "gate ocr review with standing consent"
```

### Task 5: Implement the Fatal Commit State Machine and Command Guard

**Files:**
- Create: `packages/prism-core/extensions/safety/fatal-commit-latch.ts`
- Create: `packages/prism-core/extensions/safety/commit-create-guard.ts`
- Create: `tests/Node/safety-fatal-commit-latch.test.ts`

**Interfaces:**
- Produces:
  - `FatalCommitLatch.isLatched(sid): boolean`
  - `FatalCommitLatch.trip(sid): boolean`
  - `FatalCommitLatch.track(toolCallId, sid): void`
  - `FatalCommitLatch.complete(toolCallId): string | undefined`
  - `FatalCommitLatch.clearAll(): void`
  - `classifyCommitCreate(command): "NONE"|"STANDALONE"|"UNSAFE_ATTEMPT"`
  - `countSiblingToolCalls(entries, toolCallId): number | null`

- [x] **Step 1: Write pure state and recognition tests**

Test that latch transition fires once, sessions are isolated, tracked calls
resolve to their session, and `clearAll` removes latch and pending state. Test
bare and absolute launcher spellings as standalone, while `&&`, `||`, `;`,
pipelines, redirections, shell wrappers, malformed arguments, and textual
echoes never execute as a safe commit attempt. Build synthetic assistant
entries with `{type:'toolCall', id, name, arguments}` and assert one call is
exclusive, two are siblings, and missing/ambiguous current messages return
`null` (fail closed).

- [x] **Step 2: Run the focused test and confirm Red**

Run: `node --test tests/Node/safety-fatal-commit-latch.test.ts`

Expected: FAIL because both modules are absent.

- [x] **Step 3: Implement the pure modules**

Use a per-session `Set<string>` and `Map<string,string>` pending-call index; do
not reuse `DenialCircuitBreaker`. Recognition must tokenize inert quoted
arguments with the existing safety tokenizer and require exactly one shell
segment whose executable basename is `prism-tool`, followed by `commit` and
`create`. A command containing an executable-position commit-create prefix but
additional shell control is `UNSAFE_ATTEMPT`; ordinary text mentioning the
words is `NONE`.

`countSiblingToolCalls` walks `sessionManager.getBranch()` newest-first, finds
the assistant message containing the current tool-call ID, and counts its
`toolCall` content parts. It returns `null` if shape validation fails.

- [x] **Step 4: Run focused verification**

Run: `node --test tests/Node/safety-fatal-commit-latch.test.ts`

Expected: PASS with no command text retained in latch state.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/extensions/safety/fatal-commit-latch.ts packages/prism-core/extensions/safety/commit-create-guard.ts tests/Node/safety-fatal-commit-latch.test.ts
prism-tool commit create --type feat --scope safety --subject "track fatal commit failures"
```

### Task 6: Wire Fatal Commit Recovery into the Sole Safety Extension

**Files:**
- Modify: `packages/prism-core/extensions/safety/index.ts`
- Modify: `packages/prism-core/extensions/safety/tool-call-handler.ts`
- Modify: `packages/prism-core/extensions/safety/README.md`
- Modify: `tests/Node/safety-tool-call-handler.test.ts`
- Create: `tests/Node/safety-extension-lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 5 state/guard modules and Pi `toolCallId`,
  `tool_execution_end.isError`, `ctx.abort()`, and session lifecycle events.
- Produces: exclusive commit preflight, fatal failure abort, all-tool latch,
  `agent_end` persistence, and teardown recovery.

- [x] **Step 1: Write a fake-Pi lifecycle test before wiring**

Register the extension against a fake `pi.on` collector. Provide a context with
one assistant Bash tool call in `sessionManager.getBranch()`. Assert:

```typescript
await handlers.tool_call(commitEvent, ctx);            // allowed, tracked
await handlers.tool_execution_end({...end, isError: true}, ctx);
assert.equal(abortCalls, 1);
assert.equal((await handlers.tool_call(readEvent, ctx))?.block, true);
await handlers.agent_end({}, ctx);
assert.equal((await handlers.tool_call(readEvent, ctx))?.block, true);
await handlers.session_shutdown({}, ctx);
await handlers.session_start({}, ctx);
assert.equal(await handlers.tool_call(readEvent, ctx), undefined);
```

Add cases for successful commit completion, unrelated failed Bash, sibling
commit preflight, unsafe compound commit attempt, redacted notifications, and
normal denial-breaker behavior remaining unchanged.

- [x] **Step 2: Run the extension tests and confirm Red**

Run:

```bash
node --test tests/Node/safety-extension-lifecycle.test.ts tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-circuit-breaker.test.ts
```

Expected: FAIL because the extension does not track commit calls or abort on
failure.

- [x] **Step 3: Add lifecycle wiring without altering the classifier**

In `index.ts`, instantiate `FatalCommitLatch` beside the denial breaker. The
`tool_call` handler must:

1. block immediately when the session is fatally latched;
2. classify Bash commit-create intent;
3. for a safe standalone commit, require sibling count exactly `1`, then track
   `toolCallId`;
4. for unsafe/non-exclusive attempts, trip, notify with fixed redacted text,
   call `ctx.abort()`, and return `{block:true, terminate:true}`;
5. run the existing `handleToolCall`; if it blocks a tracked commit, remove the
   pending call, trip, notify, and abort.

In `tool_execution_end`, complete a tracked call first. On `isError`, trip,
notify, and abort; on success, continue normally. Preserve the existing Bash
success observation. `agent_end` resets only the denial breaker.
`session_shutdown` clears both state machines. Do not persist the latch in
session entries; `/reload` must create a fresh extension instance.

Update the README state table and threat model. Keep every fatal message free
of command text, arguments, output, path, branch, and provider data.

- [x] **Step 4: Run focused verification**

Run the commands from Step 2.

Expected: PASS; denial and fatal state machines remain independently tested.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/extensions/safety/index.ts packages/prism-core/extensions/safety/tool-call-handler.ts packages/prism-core/extensions/safety/README.md tests/Node/safety-tool-call-handler.test.ts tests/Node/safety-extension-lifecycle.test.ts
prism-tool commit create --type feat --scope safety --subject "abort after failed commit creation"
```

### Task 7: Migrate Every Commit Consumer to Approval-Free Creation

**Files:**
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `packages/prism-core/skills/conventional-commits/SKILL.md`
- Modify: `packages/prism-core/skills/tdd/SKILL.md`
- Modify: `packages/prism-core/skills/brainstorming/SKILL.md`
- Modify: `packages/prism-core/skills/writing-plans/SKILL.md`
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `.github/hooks/commit-msg`
- Modify: `packages/prism-core/scripts/check-commit-workflows.js`
- Modify: `tests/Shell/commit_workflow_drift_test.sh`
- Modify: `tests/Shell/commit_template_footer_test.sh`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**
- Consumes: atomic `commit create` from Task 1.
- Produces: one canonical instruction-layer commit workflow with no prepare,
  apply, discard, plan ID, approval flag, direct ordinary `git commit`, or
  caller-resolved attribution.

- [x] **Step 1: Change drift and release tests to reject the old interface**

Require active resources to contain `prism-tool commit create` and reject
`commit prepare`, `commit apply`, `commit discard`, `--plan`, and commit
`--approval=yes`. Update release assertions to require one creation command and
no “exact message approval” pause. Preserve direct ordinary Git and attribution
resolver rejection.

- [x] **Step 2: Run the focused shell tests and confirm Red**

Run:

```bash
bash tests/Shell/commit_workflow_drift_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/release_workflow_test.sh
```

Expected: FAIL because active resources still document two phases.

- [x] **Step 3: Rewrite the canonical workflow and all delegates**

Make `conventional-commits` select/stage fields, optionally write the bounded
body file through Pi’s write tool, run one standalone `commit create`, remove
the body input, report the returned message/ID, and never push. Explicitly warn
that the commit command must be the only tool call in its assistant batch and
must not be wrapped in compound shell syntax.

Update every delegating skill, the plan template, release prompt, AGENTS commit
policy, and commit-msg diagnostic. The writing-plans task template must use:

```bash
git add exact/files
prism-tool commit create --type feat --scope exact-scope --subject "exact subject"
```

with no manually written footers. Update the checker to report stable
file-and-line diagnostics for every retired operation.

- [x] **Step 4: Run focused verification and harness validation**

Run:

```bash
bash tests/Shell/commit_workflow_drift_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/release_workflow_test.sh
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS with zero old commit interface occurrences in active resources.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/AGENTS.md packages/prism-core/skills/conventional-commits/SKILL.md packages/prism-core/skills/tdd/SKILL.md packages/prism-core/skills/brainstorming/SKILL.md packages/prism-core/skills/writing-plans/SKILL.md packages/prism-core/skills/finishing-a-development-branch/SKILL.md packages/prism-core/prompts/release.md .github/hooks/commit-msg packages/prism-core/scripts/check-commit-workflows.js tests/Shell/commit_workflow_drift_test.sh tests/Shell/commit_template_footer_test.sh tests/Shell/release_workflow_test.sh
prism-tool commit create --type docs --scope commit --subject "remove per-commit approval workflow"
```

### Task 8: Make Branch Finalization One Accepted Automatic Attempt

**Files:**
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/prism-core/prompts/pr.md`
- Create: `tests/Shell/branch_finalization_workflow_test.sh`
- Modify: `tests/Shell/pr_command_test.sh`

**Interfaces:**
- Produces: one disclosed finalization-acceptance pause followed by ordered
  synchronization, attestation, `/check`, four-axis review, and automatic
  `/pr`; any failed gate stops and requires fresh acceptance.

- [x] **Step 1: Add static ordering and stop-semantics tests**

The new shell test must locate unique markers/headings and assert this order:

```text
artifact cleanup -> clean tree -> finalization acceptance -> target/sync ->
attestation -> /check -> code-review -> SHA revalidation -> /pr
```

Assert the acceptance text discloses `git fetch` and possible merge mutation,
that cleanup uses `commit create`, and that conflicts, failed check, incomplete
axis, Blocking, and unresolved Suggested findings each state “stop before
`/pr`” and “fresh finalization acceptance”. Assert no post-gate PR/keep/discard
menu remains and no push/PR execution is offered.

Update `/pr` tests to require evidence from the accepted finishing attempt and
to preserve preparation-only output.

- [x] **Step 2: Run focused tests and confirm Red**

Run:

```bash
bash tests/Shell/branch_finalization_workflow_test.sh
bash tests/Shell/pr_command_test.sh
```

Expected: FAIL because finishing currently runs gates before presenting a
three-option menu.

- [x] **Step 3: Rewrite finishing and align `/pr` evidence language**

Before the pause, require completed tasks, strict-greenfield checkpoint when
applicable, ADR-0027 cleanup through `commit create`, and a clean tree. Ask one
exact question that authorizes one attempt and discloses target fetch/merge.
After literal acceptance, perform the ordered attempt. When the work branch is
published, fetch and merge `origin/TARGET_BRANCH`; never rebase. Record exact
`BRANCH`, `HEAD_SHA`, `BASE_REF`, and `BASE_SHA` before gates and revalidate
afterward.

A repair or eligible explicit waiver happens outside the stopped attempt; then
pause again. Invoke `/pr` automatically only when every condition passes.
Keep `/pr` preparation-only and remove wording that permits stale or
unattested evidence.

- [x] **Step 4: Run focused verification**

Run the commands from Step 2.

Expected: PASS with the required order and no automatic publication.

- [x] **Step 5: Commit the vertical slice**

```bash
git add packages/prism-core/skills/finishing-a-development-branch/SKILL.md packages/prism-core/prompts/pr.md tests/Shell/branch_finalization_workflow_test.sh tests/Shell/pr_command_test.sh
prism-tool commit create --type feat --scope workflow --subject "automate accepted branch finalization"
```

### Task 9: Close Documentation, Packaging, and Cross-Workflow Regression Gaps

**Files:**
- Modify: `packages/prism-core/README.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `packages/prism-core/APPEND_SYSTEM.md` if commit or finalization
  guidance is present after inspection
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Shell/pi_ci_contract_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: any remaining active resource reported by the mandatory drift scan

**Interfaces:**
- Consumes: all earlier public operations and workflow language.
- Produces: packaged modules, no stale approval flags or generic OCR routes,
  and documentation consistent with ADR-0074.

- [x] **Step 1: Strengthen repository-wide contract tests**

Update the entrypoint test to require `/setup` as the sole standing-consent
prompt, full doctor without an approval flag, dedicated OCR review, local-only
installer behavior, and `commit create` everywhere. Extend package tests to
require `consent.js` and `code-review.js` plus both new safety modules. Add a
scan over active resources forbidding:

```text
--ocr-test-approved
--code-egress-approved
prism-tool run ocr
prism-tool commit prepare
prism-tool commit apply
prism-tool commit discard
```

Historical ADRs and superseded specifications remain exempt.

- [x] **Step 2: Run focused regression tests and confirm Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/pi_ci_contract_test.sh
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL on stale docs/package expectations.

- [x] **Step 3: Update remaining authoritative and user-facing documentation**

Document standing OCR consent’s global scope and revocation, installer
local-only readiness, full doctor behavior, dedicated OCR review, atomic
approval-free commits, fatal `/reload` recovery, and one-attempt finalization.
Preserve human-only push/PR/merge language. Remove stale model names or other
unrelated historical guidance only when it directly contradicts current
accepted ADRs; do not rewrite frozen ADRs.

- [x] **Step 4: Run focused and complete verification**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/pi_ci_contract_test.sh
node --test tests/Node/toolchain-packaging.test.js
npm run test:node
composer test:shell
composer test:coverage
bash packages/prism-core/scripts/validate-harness.sh
git diff --check
```

Then run `/check`. Expected: every command PASS, changed-file coverage at least
80%, no generated asset changes, and no credential/canary output.

Run the four-axis `code-review` skill on the branch. Expected: all axes
complete or explicitly resolved under ADR-0074, with no Blocking or unresolved
Suggested findings.

- [x] **Step 5: Commit the integration closure**

```bash
git add packages/prism-core/README.md README.md CODING_HARNESS.md CONTRIBUTING.md packages/prism-core/APPEND_SYSTEM.md tests/Shell/toolchain_entrypoints_test.sh tests/Shell/pi_ci_contract_test.sh tests/Node/toolchain-packaging.test.js
prism-tool commit create --type docs --scope harness --subject "document approval-free finalization"
```

After this commit, use `verification-before-completion`, then the updated
`finishing-a-development-branch` workflow. It will remove this plan and the
approved specification under ADR-0027, create the cleanup commit, and pause for
one finalization acceptance.

---

## Plan self-review

- **Spec coverage:** Tasks 1–4 cover atomic commits, standing consent, doctor,
  setup, installer, and dedicated OCR. Tasks 5–6 cover exclusivity, fatal
  abort/latch, lifecycle, redaction, and independent denial state. Tasks 7–9
  cover every active consumer, automatic finalization, `/pr`, packaging,
  documentation, and full gates.
- **Boundary coverage:** No task adds a dependency, second extension, push,
  merge-to-protected-branch, GitHub mutation, credential read, or stack logic
  in core.
- **Failure coverage:** Unsafe consent, missing consent, OCR failure, commit
  preflight/execution/post-verification failure, sibling calls, finalization
  conflict, stale attestation, failed gates, and unresolved findings all have
  explicit Red tests.
- **Type/interface consistency:** `inspectConsent`, `requireOcrConsent`,
  `consentCommand`, `codeReviewCommand`, `FatalCommitLatch`,
  `classifyCommitCreate`, and `countSiblingToolCalls` retain one spelling and
  responsibility throughout the plan.
- **Placeholder scan:** Every implementation step names concrete behavior and
  validation. Runtime identity, model attribution, commit IDs,
  and generated nonce paths remain launcher-owned rather than plan literals.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
