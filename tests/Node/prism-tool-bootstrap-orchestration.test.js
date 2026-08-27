// $KYAULabs: prism-tool-bootstrap-orchestration.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const ADAPTER_VERSION = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'package.json'), 'utf8')
).version;

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

test('established project status preserves the existing setup route without bootstrap state', (t) => {
    const projectRoot = makeTempDir();
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Established\n');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const routed = captureWrites(() => main([
        'setup', 'route', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    const status = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(routed.status, 0, routed.stderr);
    assert.equal(JSON.parse(routed.stdout).route, 'ESTABLISHED_SETUP');
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).disposition, 'NO_ACTIVE_BOOTSTRAP');
    assert.deepEqual(fs.readdirSync(projectRoot), ['README.md']);
    assert.equal(fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8'), '# Established\n');
});

test('active bootstrap status reports no retained attempt without mutation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'setup project status',
        status: 'GO',
        disposition: 'NO_ACTIVE_BOOTSTRAP',
        projectRoot: fs.realpathSync(projectRoot),
        checks: [{
            id: 'bootstrap-status',
            status: 'PASS',
            message: 'no active empty-project bootstrap attempt exists',
        }],
        data: null,
    });
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('active bootstrap status reports one provisioned adapter without mutation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const provisioned = captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        piExecutable: '/usr/bin/pi',
        randomUUID: () => ATTEMPT_ID,
        run(command) {
            assert.equal(command, '/usr/bin/pi');
            fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
            fs.writeFileSync(
                path.join(projectRoot, '.pi', 'settings.json'),
                `${JSON.stringify({packages: [ADAPTER_ROOT]}, null, 2)}\n`
            );
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    }));
    assert.equal(provisioned.status, 0, provisioned.stderr);
    const before = fs.readFileSync(
        path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'adapter.json')
    );

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'ADAPTER_PROVISIONED');
    assert.equal(report.projectRoot, fs.realpathSync(projectRoot));
    assert.deepEqual(report.data, {
        attempt: {id: ATTEMPT_ID},
        source: 'BLANK',
        adapter: {
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: ADAPTER_VERSION,
            bootstrapProtocol: 1,
        },
        planDigest: null,
        phase: 'PROVISIONED',
        resumePhase: 'SOURCE_INSPECTION',
        retainedState: 'provisional adapter package and project-local activation',
        blockingCondition: null,
        nextAction: 'Continue strict-empty source and metadata selection.',
    });
    assert.deepEqual(
        fs.readFileSync(
            path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'adapter.json')
        ),
        before
    );
});

test('active bootstrap status preserves a dangling bootstrap root for manual recovery', (t) => {
    const projectRoot = makeTempDir();
    fs.mkdirSync(path.join(projectRoot, '.pi', 'prism-tool'), {recursive: true});
    fs.symlinkSync(
        path.join(projectRoot, 'missing-bootstrap-state'),
        path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap')
    );
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.lstatSync(
        path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap')
    ).isSymbolicLink(), true);
});

test('active bootstrap status preserves ambiguous attempts for manual recovery', (t) => {
    const projectRoot = makeTempDir();
    const bootstrapRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap');
    fs.mkdirSync(path.join(bootstrapRoot, ATTEMPT_ID), {recursive: true, mode: 0o700});
    fs.mkdirSync(
        path.join(bootstrapRoot, '87654321-4321-4321-8321-cba987654321'),
        {mode: 0o700}
    );
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'setup project status',
        status: 'NO-GO',
        disposition: 'RECOVERY_REQUIRED',
        projectRoot: fs.realpathSync(projectRoot),
        checks: [{
            id: 'bootstrap-status',
            status: 'FAIL',
            message: 'active empty-project bootstrap state is ambiguous or unsafe',
        }],
        data: {
            attempt: null,
            source: null,
            adapter: null,
            planDigest: null,
            phase: 'UNKNOWN',
            resumePhase: 'MANUAL_RECOVERY',
            retainedState: 'ambiguous bootstrap operational state',
            blockingCondition: 'ACTIVE_BOOTSTRAP_STATE_INVALID',
            nextAction: 'Inspect the retained .pi/prism-tool/bootstrap state before rerunning setup.',
        },
    });
    assert.deepEqual(fs.readdirSync(bootstrapRoot).sort(), [
        ATTEMPT_ID,
        '87654321-4321-4321-8321-cba987654321',
    ].sort());
});

test('active bootstrap status reports a retained plan ready for approval', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Retained Project',
            summary: 'A retained project awaiting approval.',
        }),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'PLAN_READY');
    assert.deepEqual(report.data, {
        attempt: {id: ATTEMPT_ID},
        source: 'BLANK',
        adapter: null,
        planDigest: plan.planDigest,
        phase: 'PREPARED',
        resumePhase: 'PROJECT_APPLICATION',
        retainedState: 'private candidate plan and strict-empty transaction state',
        blockingCondition: null,
        nextAction: 'Revalidate and display the retained plan before requesting approval.',
    });
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
});

test('active bootstrap status preserves unexpected attempt artifacts for manual recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Unexpected State Project',
            summary: 'A project preserving unexpected attempt state.',
        }),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const attemptRoot = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID
    );
    fs.writeFileSync(path.join(attemptRoot, 'unexpected.txt'), 'preserve me\n');

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(path.join(attemptRoot, 'unexpected.txt'), 'utf8'), 'preserve me\n');
});

test('active bootstrap status preserves wrong-type attempt entries for manual recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Wrong Type Project',
            summary: 'A project preserving wrong-type attempt state.',
        }),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const candidateRoot = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'candidate'
    );
    fs.rmSync(candidateRoot, {recursive: true});
    fs.symlinkSync(path.join(projectRoot, 'missing-candidate'), candidateRoot);

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.lstatSync(candidateRoot).isSymbolicLink(), true);
});

test('active bootstrap status rejects stable artifacts outside their journal phase', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Out Of Phase Project',
            summary: 'A project preserving out-of-phase attempt state.',
        }),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const attemptRoot = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID
    );
    fs.writeFileSync(path.join(attemptRoot, 'seed-attestation.json'), '{}\n');

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
});

test('active bootstrap status reports a durable project ready for repository creation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Durable Project',
            summary: 'A durable project awaiting Git creation.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    const applied = captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    assert.equal(applied.status, 0, applied.stderr);

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).data, {
        attempt: {id: ATTEMPT_ID},
        source: 'BLANK',
        adapter: null,
        planDigest: plan.planDigest,
        phase: 'DURABLE',
        resumePhase: 'REPOSITORY_BOOTSTRAP',
        retainedState: 'complete durable project without repository state',
        blockingCondition: null,
        nextAction: 'Create the deterministic local repository for this bootstrap attempt.',
    });
    assert.equal(JSON.parse(result.stdout).disposition, 'PROJECT_DURABLE');
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
});

test('active bootstrap status reports repository and hook resume phases', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Hook Project',
            summary: 'A project exercising resumable hook activation.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    assert.equal(captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).status, 0);
    assert.equal(captureWrites(() => main([
        'setup', 'repository', 'create', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).status, 0);

    const repositoryStatus = JSON.parse(captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).stdout);
    assert.equal(repositoryStatus.disposition, 'REPOSITORY_CREATED');
    assert.equal(repositoryStatus.data.resumePhase, 'HOOK_ACTIVATION');
    assert.equal(repositoryStatus.data.nextAction, 'Inspect and separately approve canonical hook activation.');

    assert.equal(captureWrites(() => main([
        'setup', 'hooks', 'inspect', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).status, 0);
    assert.equal(captureWrites(() => main([
        'setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).status, 0);

    const hooksStatus = JSON.parse(captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).stdout);
    assert.equal(hooksStatus.disposition, 'HOOKS_ACTIVE');
    assert.equal(hooksStatus.data.resumePhase, 'ROOT_SEED_PREPARATION');
    assert.equal(hooksStatus.data.nextAction, 'Prepare and verify the exact staged root-seed inventory.');
});

test('active bootstrap status reports a seed ready for the exclusive root commit', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Seed Project',
            summary: 'A project ready for its exclusive root commit.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    const commands = [
        ['setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`, `--digest=${plan.planDigest}`, '--approval=yes', '--json'],
        ['setup', 'repository', 'create', `--attempt=${ATTEMPT_ID}`, `--digest=${plan.planDigest}`, '--json'],
        ['setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`, `--digest=${plan.planDigest}`, '--approval=yes', '--json'],
    ];
    for (const command of commands) {
        assert.equal(captureWrites(() => main(command, {
            projectRoot,
            coreRoot: CORE_ROOT,
        })).status, 0, command.join(' '));
    }
    const prepared = captureWrites(() => main([
        'setup', 'seed', 'prepare', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        bootstrapSeedToolRun() {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    }));
    assert.equal(prepared.status, 0, prepared.stderr);

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'SEED_READY');
    assert.equal(report.data.phase, 'POST_APPLICATION');
    assert.equal(report.data.resumePhase, 'ROOT_SEED_COMMIT');
    assert.equal(report.data.retainedState, 'verified staged inventory and one-use seed attestation');
    assert.equal(report.data.nextAction, 'Create the exclusive signed root seed without retrying on failure.');
});

test('active bootstrap status reports retained manual recovery evidence', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Recovery Project',
            summary: 'A project retaining ambiguous human state.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    fs.writeFileSync(path.join(projectRoot, 'human-note.txt'), 'preserve me\n');
    const recovered = captureWrites(() => main([
        'setup', 'project', 'recover', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    assert.equal(recovered.status, 5, recovered.stderr);

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
    assert.equal(report.data.planDigest, plan.planDigest);
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(report.data.blockingCondition, 'ROOT_STATE_CHANGED');
    assert.equal(report.data.nextAction, 'Inspect the retained project and bootstrap attempt state before retrying setup.');
    assert.equal(fs.readFileSync(path.join(projectRoot, 'human-note.txt'), 'utf8'), 'preserve me\n');
});

test('active bootstrap status reports retained post-durable verification phases', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Verification Project',
            summary: 'A project retaining post-durable verification state.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    assert.equal(captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT})).status, 0);
    const journalPath = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'journal.json'
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.resumePhase = 'BOOTSTRAP_VERIFICATION';
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, {mode: 0o600});

    const result = captureWrites(() => main([
        'setup', 'project', 'status', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'BOOTSTRAP_VERIFICATION');
    assert.equal(report.data.retainedState, 'complete durable project with pending post-application effects');
    assert.equal(report.data.nextAction, 'Resume the exact retained phase through bootstrap project application.');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
