// $KYAULabs: back-merge-workflow.test.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

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
    assert.match(workflowText, /^on:\n {2}pull_request:\n {4}branches: \[main\]\n {4}types: \[closed\]/m);
    assert.match(workflowText, /^permissions:\n {2}contents: read\n {2}pull-requests: write/m);
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

// vim: ft=javascript sts=4 sw=4 ts=4 et :
