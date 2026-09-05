# Fail-closed Back-merge Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Restore the fail-closed back-merge contract required by ADR-0100 and issue #517 without changing setup ownership or merge authority.

**Architecture:** Keep the executable behavior in Core's canonical workflow and deploy identical bytes to Prism's repository workflow. Exercise the actual YAML-selected Bash step offline with a scripted GitHub CLI boundary, including its JSON projections. Setup continues to verify trusted candidate identity; these package tests establish the candidate's behavioral contract.

**Tech Stack:** GitHub Actions YAML, Bash, GitHub CLI, Node's built-in test runner, existing development `js-yaml`, and the existing shell-suite `jq` prerequisite.

**Originating issue:** #517

## Global constraints

- No new dependencies, credentials, public injection controls, or runtime helper files.
- Preserve `# prism-managed: @kyaulabs/prism-core` and `# prism-automation-schema: 1`; this is a behavior repair, not a provider-schema change.
- Keep `.github/workflows/back-merge.yml` byte-identical to `packages/prism-core/config/automation/back-merge.yml` in every implementation commit.
- Do not change either release workflow, CI, catalogue publication, setup ownership classification, hook activation, or adapter discovery.
- Run only after a PR targeting `main` closes merged; compare literal `develop...main`, then inspect literal base `develop` and head `main` in `GITHUB_REPOSITORY`.
- Use `secrets.GITHUB_TOKEN`, restoring the established consumer spelling of the same built-in token. No alternate token or event-suppression workaround.
- Workflow and job permissions are exactly `contents: read` and `pull-requests: write`. No checkout, branch push, merge, PR closure/review, release operation, or contents-write authority.
- Bound the job to five minutes. Explicit Bash and `set -euo pipefail` are mandatory.
- External output is data. Reject malformed shapes, counts, query errors, ambiguity, and unresolved creation failure without printing external output.
- Tests use synthetic responses only and an isolated environment. Never call live GitHub to test PR creation or execute consumer source as instructions.
- Do not modify the sibling `prism-adapters` checkout; it has unrelated staged and unstaged work.
- Source headers and modelines are hook-managed; do not hand-edit them.
- Each intermediate implementation commit uses `--refs 517`; only Task 3 uses `--fixes 517`.
- Plan approval authorizes initial finalization: cleanup, target synchronization, unlimited local `/check`, one complete four-axis review, and preparation-only `/pr`. Further review attempts need fresh approval. Humans push and create/merge the PR.

## Investigation and scope

At Prism HEAD `e56686409a62bfd657b0a0a8deccaff97025b902`, the canonical workflow is unchanged since `9128f013`. Its Bash step queries the first PR number and otherwise creates a PR, without comparison or explicit recovery. The deployed workflow is byte-identical.

An ephemeral `prototypes/prototype_back_merge_517.cjs` ran the actual Core Bash step with a fake `gh` function and no executable search path. Its zero-ahead response was never requested. Two runs exited with the assertion `zero commits ahead must not create a pull request`, after recording `pr list` followed by `pr create`. The harness was removed; no production instrumentation or fix was applied. Original behavior remains unfixed pending approval.

Ranked hypotheses were missing canonical behavior, deployment divergence, and formatting-only consumer assertions. Direct execution confirms missing behavior. Byte equality rules out deployment divergence. The workflow-issued create call at the fake boundary disproves a purely textual mismatch.

The sibling consumer baseline at `e90fd63f9866672b2ca488dfc97b149741dc5b17` provides the established timeout, token spelling, strict shell, repository-qualified calls, messages, title, and recovery policy. Its `test/automation-workflows.test.js` was inspected, not executed or changed. The reported seven-to-four test regression is reporter evidence, not a locally rerun full-suite result.

This is one workflow's restoration under ADR-0100's existing Back-merge and release separation decision. No new domain entity, provider interface, ownership rule, or architecture decision is proposed. ADR-0104's separate release/back-merge resources remain intact; #501 and downstream catalogue migration are outside scope.

**Threat boundary:** the assets are repository integration integrity and the built-in token's limited authority. GitHub/CLI responses may be erroneous or malformed. Raw JSON must have the expected object/array shape before projection; projected scalars must be closed decimal states. All creation is bound to the exact repository/branches. Failure never grants integration authority.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `packages/prism-core/config/automation/back-merge.yml` | Canonical event, permission, shell, compare/list/create/recovery policy |
| `.github/workflows/back-merge.yml` | Byte-identical dogfood copy |
| `tests/Node/back-merge-workflow.test.js` | Offline workflow execution, response validation, permission/event assertions, consumer compatibility checks |
| `tests/Node/prism-tool-automation.test.js` | Existing public setup transaction seam; assert it publishes the tested canonical bytes |

Existing `tests/Shell/release_workflow_test.sh` already checks YAML validity, schema markers, byte equality, and release/back-merge separation. Preserve those checks and run them rather than duplicating their implementation.

## Task 1: Compare before creating and restore execution bounds

**Files:** Create `tests/Node/back-merge-workflow.test.js`; modify both back-merge YAML files.

**Interfaces:** The test driver consumes actual YAML `jobs['back-merge'].steps[0].run` plus ordered synthetic CLI responses. It produces exact process status/stdout/stderr and recorded argument arrays. No production API is added.

- [x] **Step 1: Add this offline driver and comparison tests.** The fake `gh` validates outbound argument arrays and evaluates the workflow's actual `--jq` filter with the existing `jq` binary. It never invokes GitHub CLI. Record mock failures separately so a wrapper's error normalization cannot hide a broken fixture.

```javascript
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const CANONICAL = path.join(ROOT, 'packages/prism-core/config/automation/back-merge.yml');
const workflowText = fs.readFileSync(CANONICAL, 'utf8');
const workflow = yaml.load(workflowText);
const job = workflow.jobs['back-merge'];
const mockSource = String.raw`
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.env.MOCK_ROOT;
try {
    const args = process.argv.slice(2);
    const callsPath = path.join(root, 'calls.json');
    const calls = JSON.parse(fs.readFileSync(callsPath, 'utf8'));
    const responses = JSON.parse(fs.readFileSync(path.join(root, 'responses.json'), 'utf8'));
    const response = responses[calls.length];
    calls.push(args);
    fs.writeFileSync(callsPath, JSON.stringify(calls));
    assert.ok(response, 'unexpected external call');
    const filterIndex = args.indexOf('--jq');
    const commands = {
        compare: ['api', 'repos/example/project/compare/develop...main'],
        list: ['pr', 'list', '--repo', 'example/project', '--base', 'develop',
            '--head', 'main', '--state', 'open', '--limit', '2', '--json', 'number'],
        create: ['pr', 'create', '--repo', 'example/project', '--base', 'develop',
            '--head', 'main', '--title', 'Back-merge main into develop',
            '--body', 'Automated back-merge pull request. Human review and merge required.'],
    };
    assert.deepEqual(filterIndex < 0 ? args : args.slice(0, filterIndex), commands[response.command]);
    if (response.command !== 'create') {
        assert.equal(filterIndex, args.length - 2);
        assert.ok(args[filterIndex + 1]);
    }
    if (response.status) {
        process.stderr.write('synthetic upstream failure\n');
        process.exit(response.status);
    }
    if (response.command === 'create') {
        process.stdout.write('synthetic PR URL\n');
        process.exit(0);
    }
    const projected = spawnSync('/usr/bin/jq', ['-r', args[filterIndex + 1]], {
        input: response.raw === undefined ? JSON.stringify(response.json) : response.raw,
        encoding: 'utf8', timeout: 1000,
    });
    assert.ifError(projected.error);
    process.stdout.write(projected.stdout);
    process.stderr.write(projected.stderr);
    process.exit(projected.status);
} catch (error) {
    fs.writeFileSync(path.join(root, 'mock-error.txt'), String(error));
    process.exit(93);
}
`;

function runCase(t, responses) {
    const parent = path.join(ROOT, '.pi/tmp');
    fs.mkdirSync(parent, {recursive: true});
    const root = fs.mkdtempSync(path.join(parent, 'back-merge-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.writeFileSync(path.join(root, 'mock.cjs'), mockSource);
    fs.writeFileSync(path.join(root, 'responses.json'), JSON.stringify(responses));
    fs.writeFileSync(path.join(root, 'calls.json'), '[]');
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e'], {
        input: 'gh() { "$MOCK_NODE" "$MOCK_ROOT/mock.cjs" "$@"; }\n' + job.steps[0].run,
        cwd: root,
        env: {PATH: '/nonexistent', HOME: root, GITHUB_REPOSITORY: 'example/project',
            GH_TOKEN: 'synthetic-token', MOCK_NODE: process.execPath, MOCK_ROOT: root},
        encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    const errorPath = path.join(root, 'mock-error.txt');
    assert.equal(fs.existsSync(errorPath), false,
        fs.existsSync(errorPath) ? fs.readFileSync(errorPath, 'utf8') : '');
    const calls = JSON.parse(fs.readFileSync(path.join(root, 'calls.json'), 'utf8'));
    assert.equal(calls.length, responses.length);
    return result;
}

function scenario(name, responses, status, stdout, stderr) {
    test(name, (t) => {
        const result = runCase(t, responses);
        assert.equal(result.status, status);
        assert.equal(result.stdout, stdout);
        assert.equal(result.stderr, stderr);
    });
}

scenario('zero ahead is an immediate no-op',
    [{command: 'compare', json: {ahead_by: 0}}], 0,
    'develop already contains main; nothing to do\n', '');
scenario('failed comparison stops before inspection',
    [{command: 'compare', status: 17}], 1, '',
    '::error::back-merge comparison failed\n');
scenario('invalid JSON comparison fails closed',
    [{command: 'compare', raw: '{'}], 1, '',
    '::error::back-merge comparison failed\n');
for (const json of [{}, null, [], {ahead_by: null}, {ahead_by: '1'},
    {ahead_by: -1}, {ahead_by: 1.5}, {ahead_by: true}]) {
    scenario('malformed comparison ' + JSON.stringify(json),
        [{command: 'compare', json}], 1, '',
        '::error::back-merge comparison was malformed\n');
}

test('execution is bounded and uses explicit strict Bash', () => {
    assert.equal(job['timeout-minutes'], 5);
    assert.deepEqual(job.permissions, {contents: 'read', 'pull-requests': 'write'});
    assert.equal(job.steps[0].shell, 'bash');
    assert.deepEqual(job.steps[0].env, {GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}'});
    assert.match(job.steps[0].run, /^set -euo pipefail\n/);
});
```

- [x] **Step 2: Run RED.** Run `node --test tests/Node/back-merge-workflow.test.js`. Expect the old workflow to call `pr list` instead of comparison and lack the execution bounds. The mock's argument mismatch is evidence of the missing comparison boundary, not an accepted negative-test result.
- [x] **Step 3: Repair the wrapper and prepend comparison.** Replace the `jobs:` wrapper through the `run: |` line in both files with this exact prefix, retaining the script beneath it. Preserve the existing top-level event, concurrency, and permissions.

```yaml
jobs:
  back-merge:
    if: github.event.pull_request.merged == true && github.event.pull_request.base.ref == 'main'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Open or reuse back-merge pull request
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
```

Prepend this block to `run`, ahead of the existing PR code, using the existing ten-space YAML script indentation:

```bash
set -euo pipefail

if ! ahead_by=$(gh api "repos/$GITHUB_REPOSITORY/compare/develop...main" --jq 'if type == "object" then if (.ahead_by | type) == "number" then if .ahead_by >= 0 and (.ahead_by | floor) == .ahead_by then .ahead_by else "invalid" end else "invalid" end else "invalid" end' 2>/dev/null); then
  echo "::error::back-merge comparison failed" >&2
  exit 1
fi
case "$ahead_by" in
  ''|*[!0-9]*)
    echo "::error::back-merge comparison was malformed" >&2
    exit 1
    ;;
esac
if [ "$ahead_by" = '0' ]; then
  echo "develop already contains main; nothing to do"
  exit 0
fi
```

Use string equality rather than shell integer arithmetic on external counts. No raw values enter diagnostics. JSON shape checks prevent numeric strings, nulls, arrays, fractions, or negative counts from authorizing work.

- [x] **Step 4: Run GREEN and refactor.** Repeat the focused Node command; require all comparison and wrapper tests green. Run `cmp .github/workflows/back-merge.yml packages/prism-core/config/automation/back-merge.yml`. Do not broaden into PR inspection yet.
- [x] **Step 5: Commit the vertical slice.** Load `conventional-commits`. Stage these three paths with `git add`, then run the commit as a separate exclusive tool call:

```bash
prism-tool commit create --type fix --scope automation --subject "compare protected refs before back-merge creation" --refs 517
```

## Task 2: Validate exact PR inspection and success states

**Files:** Modify the same three files.

**Interfaces:** A positive comparison reaches `gh pr list --repo "$GITHUB_REPOSITORY" --base develop --head main --state open --limit 2 --json number`. Two results suffice to establish ambiguity. A JSON array of objects with positive integer PR numbers projects to a count; other shapes project to the closed invalid sentinel.

- [x] **Step 1: Append these scenarios to the Node test.**

```javascript
const ahead = {command: 'compare', json: {ahead_by: 3}};
scenario('ahead and absent PR creates the intended PR',
    [ahead, {command: 'list', json: []}, {command: 'create'}], 0,
    'opened back-merge pull request\n', '');
scenario('one existing PR is reused',
    [ahead, {command: 'list', json: [{number: 7}]}], 0,
    'open back-merge pull request already exists; nothing to do\n', '');
scenario('multiple existing PRs are ambiguous',
    [ahead, {command: 'list', json: [{number: 7}, {number: 8}]}], 1, '',
    '::error::back-merge pull-request state is ambiguous\n');
scenario('failed PR query stops before create',
    [ahead, {command: 'list', status: 17}], 1, '',
    '::error::back-merge pull-request inspection failed\n');
scenario('invalid JSON PR query fails closed',
    [ahead, {command: 'list', raw: '{'}], 1, '',
    '::error::back-merge pull-request inspection failed\n');
for (const json of [null, {}, {number: 7}, [null], [{}], [{number: '7'}],
    [{number: 0}], [{number: -1}], [{number: 1.5}], [{number: true}]]) {
    scenario('malformed PR query ' + JSON.stringify(json),
        [ahead, {command: 'list', json}], 1, '',
        '::error::back-merge pull-request state was malformed\n');
}
```

- [x] **Step 2: Run RED.** Run `node --test tests/Node/back-merge-workflow.test.js`. New tests must expose the unqualified first-result query; comparison tests remain green.
- [x] **Step 3: Replace the original `existing=...` through the final create command in both YAML files with this block.** Keep the comparison from Task 1 above it.

```bash
inspect_open_prs() {
  gh pr list --repo "$GITHUB_REPOSITORY" \
    --base develop --head main --state open --limit 2 --json number \
    --jq 'if type == "array" then if all(.[]; if type == "object" then if (.number | type) == "number" then .number > 0 and (.number | floor) == .number else false end else false end) then length else "invalid" end else "invalid" end' 2>/dev/null
}

if ! open_count=$(inspect_open_prs); then
  echo "::error::back-merge pull-request inspection failed" >&2
  exit 1
fi
case "$open_count" in
  0) ;;
  1)
    echo "open back-merge pull request already exists; nothing to do"
    exit 0
    ;;
  ''|*[!0-9]*)
    echo "::error::back-merge pull-request state was malformed" >&2
    exit 1
    ;;
  *)
    echo "::error::back-merge pull-request state is ambiguous" >&2
    exit 1
    ;;
esac

if gh pr create --repo "$GITHUB_REPOSITORY" --base develop --head main \
  --title "Back-merge main into develop" \
  --body "Automated back-merge pull request. Human review and merge required." \
  >/dev/null 2>&1; then
  echo "opened back-merge pull request"
  exit 0
fi

echo "::error::back-merge pull-request creation failed" >&2
exit 1
```

The shared inspection function keeps initial and recovery queries identical. It is fixed workflow code, not a source/eval mechanism. The final two lines are the fail-closed baseline that Task 3 extends.

- [x] **Step 4: Run GREEN and refactor.** Repeat the focused Node command and byte-equality command. Expected: every comparison/inspection scenario passes; no real network calls.
- [x] **Step 5: Commit.** Stage the three paths, then use a separate exclusive call:

```bash
prism-tool commit create --type fix --scope automation --subject "validate exact back-merge pull-request state" --refs 517
```

## Task 3: Recover concurrent creation and lock down provisioning compatibility

**Files:** Modify both YAML files, `tests/Node/back-merge-workflow.test.js`, and `tests/Node/prism-tool-automation.test.js`.

**Interfaces:** Only one follow-up inspection is allowed after failed creation. Exactly one valid matching PR is success. Every other response is the specific creation-failed diagnostic and exit 1. The existing public automation transaction remains unchanged.

- [ ] **Step 1: Append the recovery and workflow contract tests below.**

```javascript
const createFailure = [ahead, {command: 'list', json: []}, {command: 'create', status: 17}];
scenario('one concurrently created PR resolves failed creation',
    [...createFailure, {command: 'list', json: [{number: 9}]}], 0,
    'back-merge pull request was created concurrently; nothing to do\n', '');
for (const response of [{command: 'list', status: 17}, {command: 'list', raw: '{'},
    ...[[], [{number: 9}, {number: 10}], null, {}, [null], [{}], [{number: '9'}],
        [{number: 0}], [{number: -1}], [{number: 1.5}]]
        .map(json => ({command: 'list', json}))]) {
    scenario('unresolved create fails closed ' + JSON.stringify(response),
        [...createFailure, response], 1, '',
        '::error::back-merge pull-request creation failed\n');
}

test('only the merged-main event receives limited creation authority', () => {
    assert.deepEqual(workflow.on, {pull_request: {branches: ['main'], types: ['closed']}});
    assert.deepEqual(workflow.permissions, {contents: 'read', 'pull-requests': 'write'});
    assert.deepEqual(Object.keys(workflow.jobs), ['back-merge']);
    assert.equal(job.if,
        "github.event.pull_request.merged == true && github.event.pull_request.base.ref == 'main'");
    assert.equal(job['runs-on'], 'ubuntu-latest');
    assert.deepEqual(workflow.concurrency,
        {group: 'back-merge-main-to-develop', 'cancel-in-progress': false});
    assert.equal(job.steps.length, 1);
    assert.deepEqual(job.steps[0].env, {GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}'});
    assert.equal(job.steps[0].uses, undefined);
    assert.doesNotMatch(workflowText,
        /git push|update-ref|force.push|gh pr merge|gh pr close|gh pr review|auto.merge/);
    assert.doesNotMatch(workflowText,
        /actions\/checkout|contents: write|gh release|eval|source |bash -c|sh -c/);
    assert.equal(fs.readFileSync(path.join(ROOT, '.github/workflows/back-merge.yml'), 'utf8'),
        workflowText);
});

test('managed candidate retains the established consumer back-merge contract', () => {
    assert.match(workflowText, /^on:\n  pull_request:\n    branches: \[main\]\n    types: \[closed\]/m);
    assert.match(workflowText, /^permissions:\n  contents: read\n  pull-requests: write/m);
    assert.match(workflowText, /GH_TOKEN: \$\{\{ secrets[.]GITHUB_TOKEN \}\}/);
    assert.match(workflowText, /compare\/develop[.][.][.]main/);
    assert.match(workflowText,
        /gh pr list --repo "\$GITHUB_REPOSITORY"[\s\\]+--base develop --head main --state open/);
    assert.match(workflowText,
        /gh pr create --repo "\$GITHUB_REPOSITORY" --base develop --head main/);
    assert.match(workflowText, /--title "Back-merge main into develop"/);
    assert.match(workflowText, /Human review and merge required[.]/);
    assert.match(workflowText, /case "\$ahead_by" in/);
    assert.match(workflowText, /case "\$open_count" in/);
    assert.match(workflowText, /pull-request creation failed/);
    assert.match(workflowText, /created concurrently; nothing to do/);
});
```

In `tests/Node/prism-tool-automation.test.js`, add this test beside the existing Core-only transaction tests. Reuse its existing fixture helpers; this test proves installation identity, while independent expected behavior lives in the new workflow suite.

```javascript
test('Core-only reconciliation publishes the behavior-tested back-merge candidate', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const metadataPath = writeEstablishedMetadata(fixture);
    const planned = planAutomation({...fixture, metadataPath});
    assert.equal(planned.status, 'GO');
    assert.equal(applyAutomation({...fixture, planPath: planned.planPath}).status, 'GO');
    const installed = fs.readFileSync(path.join(
        fixture.projectRoot, '.github/workflows/back-merge.yml'
    ));
    assert.deepEqual(installed, fs.readFileSync(path.join(
        CORE_ROOT, 'config/automation/back-merge.yml'
    )));
    const verified = verifyAutomation(fixture);
    assert.equal(verified.status, 'GO');
    assert.equal(verified.disposition, 'CURRENT');
    assert.equal(verified.composition, 'CORE_ONLY');
});
```

- [ ] **Step 2: Run RED.** Run `node --test tests/Node/back-merge-workflow.test.js tests/Node/prism-tool-automation.test.js`. Recovery tests must fail because the final inspection is absent. The new installation-identity test may already pass: it is coverage of an existing seam, not the behavioral RED proof.
- [ ] **Step 3: Insert this recovery block immediately before the terminal creation-failed diagnostic in both workflows.**

```bash
if ! open_count=$(inspect_open_prs); then
  echo "::error::back-merge pull-request creation failed" >&2
  exit 1
fi
if [ "$open_count" = '1' ]; then
  echo "back-merge pull request was created concurrently; nothing to do"
  exit 0
fi
```

Keep the final diagnostic and `exit 1` after this block. Do not retry creation, merge, or accept ambiguous/malformed recovery output.

- [ ] **Step 4: Run GREEN, compatibility, and refactor checks.** Repeat both Node test files, then run `bash tests/Shell/release_workflow_test.sh` and `npm run test:node`. Require zero failures and byte equality. The consumer back-merge assertions are retained locally without loading its source or changing its checkout; CI assertions in its seven-test file are unaffected by a back-merge-only replacement. Do not claim the consumer's full suite was run unless a separate authorized disposable consumer validation actually runs it.
- [ ] **Step 5: Commit the terminal implementation.** Stage the four changed paths and use a separate exclusive call:

```bash
prism-tool commit create --type fix --scope automation --subject "recover concurrent back-merge creation fail closed" --fixes 517
```

## Verification and finalization

- [ ] Load `verification-before-completion`; rerun the original zero-ahead behavior through the permanent suite and confirm all comparison, query, ambiguity, creation, and recovery cases pass with exact status/stdout/stderr.
- [ ] Confirm tests execute the YAML-selected script, use the actual JSON filters, and report fixture errors independently. `jq` is an offline projection oracle, not a live GitHub CLI/gojq integration test; do not claim actual Actions execution.
- [ ] Confirm `git diff -- .github/workflows/release.yml packages/prism-core/config/release.yml` is empty and the two back-merge files compare equal.
- [ ] Load `finishing-a-development-branch` and follow its artifact-history retention/cleanup, synchronization, full `/check`, initial four-axis review, chain validation, and preparation-only `/pr` sequence. Never substitute the focused tests for `/check`.
- [ ] Run the adapter's full coverage command during `/check`: `prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage`. The changed-PHP threshold remains 80% per file; this plan changes no PHP.
- [ ] Report remaining advisories, actual security-tool coverage, any unavailable environment checks, and human publication steps without claiming downstream setup or Actions ran.

## Acceptance coverage and plan self-review

| Issue requirement | Evidence |
| --- | --- |
| Exact comparison, zero-ahead no-op, malformed/failed compare | Task 1 executable scenarios |
| Exact repository/base/head; zero/one/multiple PRs | Task 2 boundary assertions and scenarios |
| Failed/malformed query fails closed | Task 2 raw JSON and transport fixtures |
| One concurrent PR only; unresolved creation diagnostic | Task 3 recovery matrix |
| Job/workflow permissions, timeout, token, Bash | Task 1 bounds and Task 3 YAML contract |
| No push, merge, checkout, release, contents-write | Task 3 positive structure plus prohibited-operation checks |
| Canonical/deployed equality | Every task and existing shell contract |
| Consumer back-merge compatibility | Task 3 ported consumer assertions; no sibling mutation |
| Setup publishes tested candidate and reports CURRENT | Task 3 public Core-only transaction test |

Self-review: scope is a localized existing-contract repair; no placeholders or new interfaces remain. All task code uses the same `scenario`, `runCase`, `ahead`, and workflow job identifiers. Exactly one terminal recipe has `--fixes 517`; the earlier two have `--refs 517`. Node and shell invocations use existing repository entry points; stack quality remains launcher-owned. The initial RED was observed twice; GREEN and full completion are explicitly deferred to approved execution.
