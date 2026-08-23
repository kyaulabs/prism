# Bounded Diff-Causal Code Review Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Replace full-branch review restarts with a validated local review chain that preserves one complete initial review, appends repair-delta evidence, and blocks `/pr` only on unresolved concrete diff-causal defects.

**Architecture:** Prism Core owns a new descriptor-checked local review-chain record under `.pi/prism-tool/code-review/`. The dedicated code-review launcher gains explicit validated review ranges and narrow chain inspect/record/verify operations; finalization and `/pr` consume the chain while skills classify findings using ADR-0080's causal policy.

**Tech Stack:** Node.js 24+, CommonJS, built-in `fs`/`crypto`/`path`, Bash contract tests, existing `prism-tool`, OCR, Semgrep. No new dependencies.

## Global constraints

- Core owns every review-chain and finalization behavior; add no PHP/web adapter logic.
- The initial review must complete tooling/OCR, standards, requirement coverage, and SAST for the full attested branch range.
- Repair review covers only the continuous prior-reviewed-HEAD-to-current-HEAD delta, closure evidence, and directly affected tests.
- Only unresolved concrete diff-causal defects block; Advisory findings remain visible and require no waiver.
- Failed or incomplete axes, malformed state, symlinks, history discontinuity, base movement, and unreviewed commits fail closed.
- Review-chain state is local, untracked, mode `0600`, bounded, schema-versioned, and contains no credentials or raw OCR output.
- `/pr` remains preparation-only and never pushes or mutates GitHub.
- No blanket bypass, retry-count rule, automatic waiver, issue creation, or new dependency.

---

### Task 1: Review-chain schema, storage, and continuity validation

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/review-chain.js`
- Create: `tests/Node/prism-tool-review-chain.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Produces: `inspectReviewChain(context): {state, path, record?}`.
- Produces: `recordReviewSegment(input, context): ReviewChainRecord`.
- Produces: `verifyReviewChain(expected, context): {record, advisoryFindings}`.
- Produces schema-v1 records with `branch`, `baseRef`, `baseSha`, `headSha`, and continuous `segments`.
- Each segment contains `kind`, `from`, `to`, four axis statuses, findings, and closure records.

- [x] **Step 1: Write failing schema and filesystem-boundary tests**

```javascript
const initial = {
    schemaVersion: 1,
    kind: 'initial',
    branch: 'fix/tester-abcd-review-chain',
    baseRef: 'origin/develop',
    baseSha: '1'.repeat(40),
    from: '1'.repeat(40),
    to: '2'.repeat(40),
    axes: {
        tooling: 'COMPLETE',
        standards: 'COMPLETE',
        spec: 'COMPLETE',
        sast: 'COMPLETE',
    },
    findings: [{
        axis: 'tooling',
        path: 'src/example.js',
        line: 12,
        summary: 'renamed API is not called by the changed flow',
        classification: 'BLOCKING',
        causality: 'introduced by the reviewed delta',
        impact: 'changed setup flow exits before completion',
        evidence: 'node --test tests/Node/example.test.js fails deterministically',
    }],
    closures: [],
};

const first = recordReviewSegment(initial, fixture.context);
assert.equal(first.headSha, '2'.repeat(40));
assert.equal(first.segments.length, 1);
assert.equal(first.openBlocking.length, 1);
assert.equal(fs.statSync(first.path).mode & 0o777, 0o600);
```

Add cases that reject unknown keys, oversized text, controls, invalid branches,
invalid SHA lengths, duplicate finding fingerprints, Advisory findings carrying
no special waiver, Blocking findings missing causality/impact/evidence,
non-contiguous append ranges, base movement, rewritten ancestry, symlinked
parents/files, permissive modes, and a current Git HEAD that differs from
`input.to`.

- [x] **Step 2: Run the focused test and confirm Red**

Run: `node --test tests/Node/prism-tool-review-chain.test.js`

Expected: FAIL because `review-chain.js` and its exports do not exist.

- [x] **Step 3: Implement the bounded schema and atomic local record**

```javascript
const STATE = Object.freeze({ABSENT: 'ABSENT', VALID: 'VALID', UNSAFE: 'UNSAFE'});
const AXIS_STATUS = new Set(['COMPLETE', 'COMPLETE_NO_SPEC']);
const CLASSIFICATION = new Set(['BLOCKING', 'ADVISORY']);
const FILE_LIMIT = 131072;

function findingFingerprint(finding) {
    const stable = [finding.axis, finding.path, finding.line, finding.summary].join('\n');
    return crypto.createHash('sha256').update(stable).digest('hex');
}

function recordReviewSegment(input, context = {}) {
    const repository = inspectRepositoryIdentity(context);
    const segment = validateSegment(input, repository);
    const current = inspectReviewChain(context);
    const record = segment.kind === 'initial'
        ? createInitialRecord(segment, repository, current)
        : appendSegment(segment, repository, current);
    publishPrivateRecord(record, context);
    return {...record, path: resolveReviewChainPath(context)};
}

function verifyReviewChain(expected, context = {}) {
    const inspected = inspectReviewChain(context);
    if (inspected.state !== STATE.VALID) throw new ReviewChainError('review chain is unavailable');
    assertExpectedIdentity(inspected.record, expected);
    assertContinuousAncestry(inspected.record, context);
    if (inspected.record.openBlocking.length !== 0) {
        throw new ReviewChainError('review chain has unresolved Blocking findings');
    }
    return {
        record: inspected.record,
        advisoryFindings: inspected.record.findings.filter(({classification}) => classification === 'ADVISORY'),
    };
}
```

Use `lstatSync` plus `O_NOFOLLOW`, descriptor `fstatSync` identity checks,
private owned directories, bounded fatal UTF-8 decoding, `0600` files, an
exclusive temporary file, file and directory `fsync`, atomic rename, and
post-publication reinspection. Validate Git branch, base, HEAD, and ancestry
through fixed argument arrays supplied by `context.run ?? runBounded`.

- [x] **Step 4: Run focused and packaging tests**

Run: `node --test tests/Node/prism-tool-review-chain.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS; the packed Core archive includes `scripts/prism-tool/review-chain.js`.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/review-chain.js tests/Node/prism-tool-review-chain.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope review --subject "record bounded review chains"
```

---

### Task 2: Dedicated delta-review and review-chain launcher commands

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/code-review.js`
- Modify: `tests/Node/prism-tool-code-review.test.js`
- Test: `tests/Node/prism-tool-review-chain.test.js`

**Interfaces:**
- Consumes Task 1's `inspectReviewChain`, `recordReviewSegment`, and `verifyReviewChain`.
- Produces `prism-tool code-review ocr -- review --from SHA --to HEAD --audience agent --format json`.
- Produces `prism-tool code-review chain inspect --json`.
- Produces `prism-tool code-review chain record --input PATH --json`.
- Produces `prism-tool code-review chain verify --branch B --base-ref R --base-sha S --head-sha H --json`.

- [x] **Step 1: Write failing exact-grammar and dispatch tests**

```javascript
const deltaArgs = [
    'code-review', 'ocr', '--', 'review',
    '--from', '2'.repeat(40), '--to', 'HEAD',
    '--audience', 'agent', '--format', 'json',
];
const result = capture(() => main(deltaArgs, target.context));
assert.equal(result.status, 0);
assert.deepEqual(target.calls.at(-1).args, deltaArgs.slice(3));
```

Add parser rejection for non-hex refs, `--to` values other than literal `HEAD`,
reordered/duplicated controls, ranges whose `from` is not an ancestor of HEAD,
and uncontained/symlinked input files. Add JSON contract tests for chain inspect,
record, and verify with fixed generic diagnostics that never relay record input
or OCR provider output.

- [x] **Step 2: Run focused tests and confirm Red**

Run: `node --test tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js`

Expected: FAIL because explicit review ranges and chain subcommands are rejected.

- [x] **Step 3: Implement strict range parsing and chain dispatch**

```javascript
const EXPLICIT_REVIEW_PREFIX = Object.freeze(['review', '--from']);

function parseExplicitReview(operation, context) {
    if (
        operation.length !== 9 || operation[0] !== 'review' || operation[1] !== '--from' ||
        !SHA_RE.test(operation[2]) || operation[3] !== '--to' || operation[4] !== 'HEAD' ||
        operation[5] !== '--audience' || operation[6] !== 'agent' ||
        operation[7] !== '--format' || operation[8] !== 'json'
    ) throw new CodeReviewError(EXIT.USAGE, 'arguments are invalid');
    assertAncestor(operation[2], 'HEAD', context);
    return {args: operation, mode: 'review', root: resolveRoot(context)};
}

function codeReviewCommand(args, context = {}) {
    try {
        if (args[0] === 'chain') return reviewChainCommand(args.slice(1), context);
        return executeOcr(args, context);
    } catch (error) {
        return fail(error);
    }
}
```

Keep the existing default full-branch review grammar unchanged for an initial
review. The explicit range is the sole OCR delta-review form and remains behind
standing consent, readiness, connectivity, timeout, and redaction boundaries.

- [x] **Step 4: Run focused tests and lint**

Run: `node --test tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js`

Run: `prism-tool run eslint -- packages/prism-core/scripts/prism-tool/code-review.js packages/prism-core/scripts/prism-tool/review-chain.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js`

Expected: PASS.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/code-review.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js
prism-tool commit create --type feat --scope review --subject "support repair delta reviews"
```

---

### Task 3: Diff-causal classification and chain-aware review skills

**Files:**
- Modify: `packages/prism-core/skills/code-review/SKILL.md`
- Modify: `packages/prism-core/skills/receiving-code-review/SKILL.md`
- Modify: `packages/prism-core/skills/standards-review/SKILL.md`
- Modify: `packages/prism-core/skills/spec-review/SKILL.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Create: `tests/Shell/diff_causal_review_contract_test.sh`

**Interfaces:**
- Consumes Task 2's default initial OCR review, explicit delta review, and chain commands.
- Produces one normalized classification vocabulary: `Blocking` and `Advisory`.
- Produces a complete initial segment or continuous repair segment after all axes finish.

- [ ] **Step 1: Write failing policy contract tests**

```bash
assert_file_contains "$CODE_REVIEW" 'introduced or materially worsened by the reviewed delta' \
    'Blocking requires diff causality'
assert_file_contains "$CODE_REVIEW" 'deterministic reproduction, violated invariant, or direct security or data-loss path' \
    'Blocking requires concrete evidence'
assert_file_contains "$CODE_REVIEW" 'review only the prior reviewed HEAD through the current attested HEAD' \
    'repairs use delta review'
assert_file_not_contains "$FINISHING" 'no Suggested finding remains unresolved' \
    'Suggested-only gating is retired'
```

Add assertions that standards findings are Advisory, no-spec requirement review
is a completed informational outcome, changed-test findings block only when they
can invalidate a changed acceptance criterion, all four axes complete before a
segment is recorded, and Advisory findings are retained for PR disclosure.

- [ ] **Step 2: Run contract tests and confirm Red**

Run: `bash tests/Shell/diff_causal_review_contract_test.sh`

Expected: FAIL on the old severity-only and full-review-restart wording.

- [ ] **Step 3: Rewrite review and receiving policy around ADR-0080**

```text
Blocking requires all applicable conditions:
1. Causal — introduced or materially worsened by the reviewed delta.
2. Relevant — affects changed behavior or its verification evidence.
3. Concrete — deterministic reproduction, violated invariant, or direct security/data-loss path.
4. Workflow-impacting — can make the changed runtime, build, setup, release, or verification flow incorrect.

If any condition is not established, classify the finding Advisory.
A changed-test finding is Blocking only when it can falsely pass, falsely fail,
or omit evidence for a changed acceptance criterion.
```

Define the initial path as full branch review plus `chain record kind=initial`.
Define the repair path as `chain inspect`, explicit OCR using the validated
`record.headSha` as `--from` and literal `HEAD` as `--to`, closure verification,
all applicable axes over the same delta, and
`chain record kind=repair`. Never auto-waive or create issues.

- [ ] **Step 4: Run review contract, harness validation, and ShellCheck**

Run: `bash tests/Shell/diff_causal_review_contract_test.sh`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Run: `shellcheck tests/Shell/diff_causal_review_contract_test.sh tests/Shell/toolchain_entrypoints_test.sh`

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/skills/code-review/SKILL.md packages/prism-core/skills/receiving-code-review/SKILL.md packages/prism-core/skills/standards-review/SKILL.md packages/prism-core/skills/spec-review/SKILL.md tests/Shell/toolchain_entrypoints_test.sh tests/Shell/diff_causal_review_contract_test.sh
prism-tool commit create --type feat --scope review --subject "classify findings by diff causality"
```

---

### Task 4: Chain-aware finalization and `/pr` preflight

**Files:**
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Modify: `packages/prism-core/prompts/pr.md`
- Modify: `packages/prism-core/scripts/prism-tool/pr.js`
- Modify: `tests/Node/prism-tool-pr.test.js`
- Modify: `tests/Shell/branch_finalization_workflow_test.sh`
- Modify: `tests/Shell/pr_command_test.sh`

**Interfaces:**
- Consumes Task 1's `verifyReviewChain(expected, context)`.
- Extends `prism-tool pr preflight` with validated review-chain status and advisory count.
- Produces preparation-only PR evidence with complete axes and no open Blocking findings.

- [ ] **Step 1: Write failing preflight and workflow tests**

```javascript
const verified = {
    record: {headSha: '2'.repeat(40), openBlocking: []},
    advisoryFindings: [{fingerprint: 'a'.repeat(64), summary: 'follow-up cleanup'}],
};
const result = captureWrites(() => main(['pr', 'preflight'], {
    ...context,
    verifyReviewChain: (expected) => {
        assert.deepEqual(expected, {
            branch: 'fix/tester-abcd-example',
            baseRef: 'origin/develop',
            baseSha: '1'.repeat(40),
            headSha: '2'.repeat(40),
        });
        return verified;
    },
}));
assert.match(result.stdout, /REVIEW_CHAIN\tVALID/);
assert.match(result.stdout, /ADVISORY_COUNT\t1/);
```

Add cases for absent/unsafe/stale chains, open Blocking findings, incomplete
axes, base movement, and current HEAD beyond the final segment. Update shell
contracts to require preserved initial evidence, repair-delta review, Advisory
disclosure, and no blanket bypass or automatic waiver.

- [ ] **Step 2: Run focused tests and confirm Red**

Run: `node --test tests/Node/prism-tool-pr.test.js`

Run: `bash tests/Shell/branch_finalization_workflow_test.sh`

Run: `bash tests/Shell/pr_command_test.sh`

Expected: FAIL because preflight does not verify a chain and the prose restarts complete review after repairs.

- [ ] **Step 3: Verify chain identity in preflight and update finalization flow**

```javascript
const verify = context.verifyReviewChain ?? verifyReviewChain;
let review;
try {
    review = verify({branch, baseRef, baseSha, headSha}, {...context, projectRoot: cwd});
} catch {
    return failure('review chain is incomplete, stale, or has unresolved Blocking findings');
}

fields.push(['REVIEW_CHAIN', 'VALID']);
fields.push(['ADVISORY_COUNT', String(review.advisoryFindings.length)]);
```

Change finalization so a repair consumes the current attempt but preserves a
valid initial chain. After fresh acceptance and `/check`, review only the repair
delta and append it. Stop for incomplete axes, invalid chains, or open Blocking
findings; Advisory findings do not require waivers. `/pr` must validate the
chain twice around artifact generation and include observed Advisory summaries
and inert issue recommendations.

- [ ] **Step 4: Run focused tests and safety-boundary contracts**

Run: `node --test tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-review-chain.test.js`

Run: `bash tests/Shell/branch_finalization_workflow_test.sh`

Run: `bash tests/Shell/pr_command_test.sh`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: PASS; no command pushes or mutates GitHub.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/skills/finishing-a-development-branch/SKILL.md packages/prism-core/prompts/pr.md packages/prism-core/scripts/prism-tool/pr.js tests/Node/prism-tool-pr.test.js tests/Shell/branch_finalization_workflow_test.sh tests/Shell/pr_command_test.sh
prism-tool commit create --type feat --scope review --subject "finalize through continuous review evidence"
```

---

### Task 5: Documentation, aggregate verification, and migration behavior

**Files:**
- Modify: `packages/prism-core/README.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Test: all review-chain, PR, finalization, Node, shell, PHP coverage, lint, and SAST suites.

**Interfaces:**
- Documents review-chain lifecycle, diff-causal Blocking, Advisory disclosure, invalidation, and absence of force/waiver behavior.
- Existing branches without a review chain start with one complete initial review; no migration of old session evidence is attempted.

- [ ] **Step 1: Write failing documentation and migration assertions**

```javascript
assert.match(coreReadme, /review chain/i);
assert.match(coreReadme, /repair delta/i);
assert.match(coreReadme, /Advisory findings do not block/i);
assert.doesNotMatch(coreReadme, /--force-review|automatic waiver/i);
```

Add shell assertions that contributor and harness docs explain: one full initial
review, continuous repair ranges, base/history invalidation, all axes mandatory,
and human-run GitHub publication unchanged.

- [ ] **Step 2: Run packaging and entrypoint tests and confirm Red**

Run: `node --test tests/Node/toolchain-packaging.test.js`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: FAIL on missing review-chain documentation.

- [ ] **Step 3: Update user-facing documentation and migration wording**

```text
A completed branch receives one complete four-axis review. If a concrete
branch-caused bug is repaired, Prism preserves that review and reviews only the
continuous repair delta. Advisory findings remain visible in the prepared pull
request but do not block it. A moved target base, rewritten history, incomplete
axis, malformed chain, or unreviewed commit requires a new complete review.
```

State explicitly that existing branches begin a new initial chain, local chain
state is untracked, `/pr` does not create issues, and humans still push and
create pull requests.

- [ ] **Step 4: Run aggregate verification**

Run: `prism-tool doctor --local-only`

Run: `npm run test:node`

Run: `bash tests/Shell/run-all.sh`

Run: `prism-tool run pest -- --coverage --min=80`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Run: `prism-tool run php-cs-fixer -- fix --dry-run --diff`

Run: `prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input`

Run: `prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern`

Run: `prism-tool run eslint -- packages/prism-core/scripts/prism-tool/code-review.js packages/prism-core/scripts/prism-tool/review-chain.js packages/prism-core/scripts/prism-tool/pr.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js tests/Node/prism-tool-pr.test.js`

Run: `prism-tool run semgrep -- scan --config .semgrep/kyaulabs.yml --baseline-commit origin/develop --metrics off --disable-version-check --error`

Run: `git diff --check`

Expected: every command passes; Node and shell suites have zero failures; Pest reports at least 80% coverage; Semgrep reports zero blocking findings.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/README.md README.md CODING_HARNESS.md CONTRIBUTING.md packages/prism-core/AGENTS.md tests/Node/toolchain-packaging.test.js tests/Shell/toolchain_entrypoints_test.sh
prism-tool commit create --type docs --scope review --subject "document bounded review finalization"
```

---

## Plan self-review

- Spec AC 1–8 are covered by Tasks 1–3 through full initial evidence, causal classification, continuous delta recording, and invalidation.
- Spec AC 9–12 are covered by Tasks 4–5 through `/pr` verification, Advisory disclosure, complete-axis enforcement, and explicit absence of force or automatic waiver behavior.
- Interface names are consistent: `inspectReviewChain`, `recordReviewSegment`, and `verifyReviewChain` are introduced in Task 1 and consumed unchanged later.
- No dependency, adapter behavior, GitHub mutation, or credential access is introduced.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
