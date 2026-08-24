// $KYAULabs: prism-tool-bootstrap-plan.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    readBootstrapJournal,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-journal');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');

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

function planInput(projectRoot, input, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot, input, ...context}));
}

function planProject(projectRoot, input, context = {}) {
    return planInput(projectRoot, JSON.stringify(input), context);
}

function validatePlan(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'validate', `--attempt=${attemptId}`, `--digest=${planDigest}`, '--json',
    ], {projectRoot, ...context}));
}

function recoverProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'recover', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--json',
    ], {projectRoot, ...context}));
}

function applyProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, ...context}));
}

test('reports structured transaction failures when the project root is unavailable', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'missing-project');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    for (const operation of ['apply', 'recover']) {
        const result = operation === 'apply'
            ? applyProject(projectRoot, ATTEMPT_ID, '0'.repeat(64), {coreRoot: CORE_ROOT})
            : recoverProject(projectRoot, ATTEMPT_ID, '0'.repeat(64), {coreRoot: CORE_ROOT});
        const report = JSON.parse(result.stdout);

        assert.equal(result.status, 5);
        assert.equal(report.status, 'NO-GO');
        assert.equal(report.disposition, 'RECOVERY_REQUIRED');
        assert.equal(report.projectRoot, path.resolve(projectRoot));
    }
});

test('reports minimal metadata fields without changing a strict-empty root', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'example-project');
    fs.mkdirSync(projectRoot);
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot}));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup project metadata');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'METADATA_REQUIRED');
    assert.equal(report.projectRoot, fs.realpathSync(projectRoot));
    assert.equal(report.source, 'BLANK');
    assert.equal(report.adapter, null);
    assert.deepEqual(report.data.fields, [
        {
            id: 'displayName',
            required: true,
            suggestedValue: 'example-project',
            maximumLength: 100,
        },
        {
            id: 'summary',
            required: true,
            suggestedValue: null,
            maximumLength: 240,
        },
    ]);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('creates a digest-bound Blank Core-only project plan from edited metadata', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup project plan');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PLAN_READY');
    assert.deepEqual(report.source, {mode: 'BLANK', evidence: null});
    assert.equal(report.adapter, null);
    assert.deepEqual(report.capabilities, []);
    assert.equal(report.metadata.displayName, 'Editable Project Name');
    assert.match(report.metadataDigest, /^[0-9a-f]{64}$/);
    assert.match(report.planDigest, /^[0-9a-f]{64}$/);
    assert.equal(report.providers.length, 1);
    assert.equal(report.outputs.length, 7);
    assert.deepEqual(report.effects, []);
    assert.deepEqual(report.recovery, {
        beforeDurable: 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY',
        afterDurable: 'RETAIN_PROJECT_AND_RESUME',
    });
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
    assert.equal(path.isAbsolute(report.data.planPath), true);
    assert.deepEqual(fs.readdirSync(projectRoot), ['.pi']);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.prism', 'project.json')), false);

    const attemptRoot = path.dirname(path.dirname(report.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.equal(fs.statSync(journalPath).mode & 0o777, 0o600);
    assert.deepEqual(journal, {
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        projectRoot: fs.realpathSync(projectRoot),
        planDigest: report.planDigest,
        metadataDigest: report.metadataDigest,
        source: {mode: 'BLANK', evidence: null},
        adapter: null,
        phase: 'PREPARED',
        status: 'ACTIVE',
        reason: null,
        resumePhase: 'PROJECT_APPLICATION',
        applied: [],
        createdDirectories: [],
        appliedInventoryDigest: null,
    });
});

test('rejects non-canonical applied paths in retained journals', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.applied[0].path = '../outside';
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});

    assert.throws(
        () => readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID}),
        /bootstrap journal is invalid/
    );
});

test('reads retained journals through a bounded descriptor loop', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const originalReadFile = fs.readFileSync;
    fs.readFileSync = function rejectUnboundedDescriptorRead(file, ...args) {
        if (typeof file === 'number') throw new Error('unbounded descriptor read');
        return originalReadFile.call(this, file, ...args);
    };

    let journal;
    try {
        journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    } finally {
        fs.readFileSync = originalReadFile;
    }

    assert.equal(journal.phase, 'PREPARED');
});

test('restores strict emptiness when a prepared project plan is declined', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.equal(report.data.resumePhase, null);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves unowned root state when prepared recovery cannot prove emptiness', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const humanPath = path.join(projectRoot, 'human-note.txt');
    fs.writeFileSync(humanPath, 'preserve me\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'preserve me\n');
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    assert.equal(fs.existsSync(attemptRoot), true);
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'ROOT_STATE_CHANGED');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('applies an approved Blank Core-only plan and marks the project durable', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
    assert.deepEqual(
        plan.outputs.map(({path: outputPath}) => outputPath).sort(),
        journal.applied.map(({path: outputPath}) => outputPath).sort()
    );
    assert.equal(journal.phase, 'DURABLE');
    assert.equal(journal.status, 'ACTIVE');
    assert.equal(journal.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.match(journal.appliedInventoryDigest, /^[0-9a-f]{64}$/);
    for (const output of plan.outputs) {
        const targetPath = path.join(projectRoot, output.path);
        const stat = fs.lstatSync(targetPath);
        const contents = fs.readFileSync(targetPath);
        assert.equal(stat.isSymbolicLink(), false);
        assert.equal(stat.isFile(), true);
        assert.equal(stat.mode & 0o777, output.mode);
        assert.equal(crypto.createHash('sha256').update(contents).digest('hex'), output.sha256);
    }
});

test('does not follow a candidate intermediate directory substituted after plan validation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const candidateRoot = path.join(attemptRoot, 'candidate');
    const originalGithub = path.join(candidateRoot, '.github');
    const displacedGithub = path.join(candidateRoot, '.github-held');
    const originalOpen = fs.openSync;
    let candidateOpens = 0;
    let replaced = false;
    let openedSubstitutedOutput = false;
    fs.openSync = function replaceCandidateIntermediate(filePath, ...args) {
        if (
            replaced &&
            typeof filePath === 'string' &&
            path.basename(filePath) === 'commit-msg' &&
            fs.realpathSync(filePath).includes('/.github-held/')
        ) {
            openedSubstitutedOutput = true;
        }
        const descriptor = originalOpen.call(this, filePath, ...args);
        if (typeof filePath === 'string' && path.basename(filePath) === 'candidate') {
            candidateOpens += 1;
            if (candidateOpens === 10) {
                fs.renameSync(originalGithub, displacedGithub);
                fs.symlinkSync('.github-held', originalGithub, 'dir');
                replaced = true;
            }
        }
        return descriptor;
    };

    let result;
    try {
        result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(replaced, true);
    assert.equal(openedSubstitutedOutput, false);
    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not roll back durable outputs when apply-lock cleanup fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const originalUnlink = fs.unlinkSync;
    let rejected = false;
    fs.unlinkSync = function rejectFirstApplyLock(filePath, ...args) {
        if (!rejected && path.basename(filePath) === 'apply.lock') {
            rejected = true;
            throw new Error('injected lock cleanup failure');
        }
        return originalUnlink.call(this, filePath, ...args);
    };

    let result;
    try {
        result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.unlinkSync = originalUnlink;
    }
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(journal.phase, 'DURABLE');
    for (const output of plan.outputs) assert.equal(fs.existsSync(path.join(projectRoot, output.path)), true);
});

test('restores strict emptiness when application fails before durability', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                throw new Error('injected application failure');
            }
        },
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.equal(report.data.resumePhase, null);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('restores strict emptiness at every pre-durable application boundary', () => {
    const scenarios = [
        {attemptId: '10000000-0000-4000-8000-000000000000', event: 'after-output', index: 0},
        {attemptId: '20000000-0000-4000-8000-000000000000', event: 'after-output', index: 1},
        {attemptId: '30000000-0000-4000-8000-000000000000', event: 'after-output', index: 2},
        {attemptId: '40000000-0000-4000-8000-000000000000', event: 'after-output', index: 3},
        {attemptId: '50000000-0000-4000-8000-000000000000', event: 'after-output', index: 4},
        {attemptId: '60000000-0000-4000-8000-000000000000', event: 'after-output', index: 5},
        {attemptId: '70000000-0000-4000-8000-000000000000', event: 'after-output', index: 6},
        {attemptId: '80000000-0000-4000-8000-000000000000', event: 'before-durable'},
    ];
    for (const scenario of scenarios) {
        const projectRoot = makeTempDir();
        try {
            const planned = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => scenario.attemptId,
            });
            const plan = JSON.parse(planned.stdout);
            const result = applyProject(projectRoot, scenario.attemptId, plan.planDigest, {
                coreRoot: CORE_ROOT,
                bootstrapApplyFault(event) {
                    if (
                        event.name === scenario.event &&
                        (scenario.index === undefined || event.index === scenario.index)
                    ) {
                        throw new Error('injected application failure');
                    }
                },
            });
            const report = JSON.parse(result.stdout);
            assert.equal(report.disposition, 'ROOT_RESTORED');
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }
});

test('recovers exact recorded outputs from a crash-retained applying journal', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const output = plan.outputs[0];
    const candidatePath = path.join(attemptRoot, 'candidate', ...output.path.split('/'));
    const targetPath = path.join(projectRoot, ...output.path.split('/'));
    const createdDirectories = [];
    let parent = projectRoot;
    let relative = '';
    for (const segment of output.path.split('/').slice(0, -1)) {
        relative = relative === '' ? segment : `${relative}/${segment}`;
        parent = path.join(parent, segment);
        fs.mkdirSync(parent, {mode: 0o755});
        const stat = fs.lstatSync(parent);
        createdDirectories.push({path: relative, dev: stat.dev, ino: stat.ino});
    }
    fs.copyFileSync(candidatePath, targetPath);
    fs.chmodSync(targetPath, output.mode);
    const target = fs.lstatSync(targetPath);
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.phase = 'APPLYING';
    journal.applied = [{
        path: output.path,
        kind: output.kind,
        mode: output.mode,
        sha256: output.sha256,
        dev: target.dev,
        ino: target.ino,
    }];
    journal.createdDirectories = createdDirectories;
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});
    fs.writeFileSync(
        path.join(attemptRoot, 'apply.lock'),
        `${JSON.stringify({schemaVersion: 1, attemptId: ATTEMPT_ID})}\n`,
        {mode: 0o600}
    );

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves concurrent third-state content during failed application recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const humanPath = path.join(projectRoot, 'human-note.txt');

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                fs.writeFileSync(humanPath, 'preserve me\n');
                throw new Error('injected concurrent state');
            }
        },
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'preserve me\n');
    assert.equal(fs.existsSync(path.join(projectRoot, '.github', 'hooks', 'commit-msg')), false);
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'AMBIGUOUS_PROJECT_STATE');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('preserves an applied output that changes before rollback', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const changedPath = path.join(projectRoot, '.github', 'hooks', 'commit-msg');

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                fs.writeFileSync(changedPath, 'human replacement\n');
                throw new Error('injected changed output');
            }
        },
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(changedPath, 'utf8'), 'human replacement\n');
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.applied.length, 1);
});

test('revalidates and idempotently resumes a durable project', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const first = JSON.parse(applied.stdout);
    const readmePath = path.join(projectRoot, 'README.md');
    const before = fs.statSync(readmePath);

    const recovered = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const recovery = JSON.parse(recovered.stdout);
    const repeated = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const second = JSON.parse(repeated.stdout);
    const after = fs.statSync(readmePath);

    assert.equal(recovered.status, 0);
    assert.equal(recovery.disposition, 'PROJECT_DURABLE');
    assert.equal(recovery.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(repeated.status, 0);
    assert.equal(second.disposition, 'PROJECT_DURABLE');
    assert.equal(second.data.appliedInventoryDigest, first.data.appliedInventoryDigest);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeMs, before.mtimeMs);
});

test('retains a durable project when unexpected nested state appears', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const unexpectedPath = path.join(projectRoot, '.github', 'hooks', 'unexpected');
    fs.writeFileSync(unexpectedPath, 'preserve me\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(unexpectedPath, 'utf8'), 'preserve me\n');
});

test('retains a durable project when an applied output drifts', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const readmePath = path.join(projectRoot, 'README.md');
    fs.writeFileSync(readmePath, 'changed after durability\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(readmePath, 'utf8'), 'changed after durability\n');
    assert.equal(journal.phase, 'DURABLE');
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'AMBIGUOUS_PROJECT_STATE');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('requires literal approval before applying a project plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--approval=yes/);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
});

test('keeps semantic plan digests stable across roots and attempt IDs', () => {
    const roots = [makeTempDir(), makeTempDir()];
    try {
        const reports = roots.map((projectRoot, index) => {
            const result = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => index === 0
                    ? ATTEMPT_ID
                    : 'abcdefab-cdef-4abc-8def-abcdefabcdef',
            });
            return JSON.parse(result.stdout);
        });

        assert.equal(reports[0].planDigest, reports[1].planDigest);
        assert.equal(reports[0].metadataDigest, reports[1].metadataDigest);
        assert.equal(
            reports[0].filesystem.attemptInventoryDigest,
            reports[1].filesystem.attemptInventoryDigest
        );
        assert.deepEqual(reports[0].outputs, reports[1].outputs);
        assert.notEqual(reports[0].data.attempt.id, reports[1].data.attempt.id);
        assert.notEqual(reports[0].data.planPath, reports[1].data.planPath);
    } finally {
        for (const projectRoot of roots) fs.rmSync(projectRoot, {recursive: true, force: true});
    }
});

test('revalidates an unchanged active project plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PLAN_VALID');
    assert.equal(report.planDigest, plan.planDigest);
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
});

test('does not traverse the project manifest through an unheld intermediate directory', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const prismRoot = path.join(attemptRoot, 'candidate', '.prism');
    const displaced = path.join(attemptRoot, 'candidate', '.prism-held');
    const externalPrism = path.join(outside, '.prism');
    fs.cpSync(prismRoot, externalPrism, {recursive: true});
    const originalOpen = fs.openSync;
    let replaced = false;
    fs.openSync = function replaceManifestParent(filePath, ...args) {
        if (
            !replaced &&
            typeof filePath === 'string' &&
            filePath.endsWith(`${path.sep}.prism${path.sep}project.json`)
        ) {
            replaced = true;
            fs.renameSync(prismRoot, displaced);
            fs.symlinkSync(externalPrism, prismRoot, 'dir');
        }
        return originalOpen.call(this, filePath, ...args);
    };

    let result;
    try {
        result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }

    assert.equal(result.status, 0);
    assert.equal(replaced, false);
});

test('rejects a substituted attempt child before opening external state', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const reportsRoot = path.join(attemptRoot, 'reports');
    const externalReports = path.join(outside, 'reports');
    fs.cpSync(reportsRoot, externalReports, {recursive: true});
    fs.rmSync(reportsRoot, {recursive: true});
    fs.symlinkSync(externalReports, reportsRoot, 'dir');
    const originalOpen = fs.openSync;
    let externalOpens = 0;
    fs.openSync = function countExternalOpen(filePath, ...args) {
        if (typeof filePath === 'string' && filePath.startsWith(`${reportsRoot}${path.sep}`)) {
            externalOpens += 1;
        }
        return originalOpen.call(this, filePath, ...args);
    };

    let result;
    try {
        result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }

    assert.equal(result.status, 5);
    assert.equal(externalOpens, 0);
});

test('fails closed when any active project-plan state changes', () => {
    const cases = [
        {
            name: 'root entry',
            mutate: ({projectRoot}) => fs.writeFileSync(path.join(projectRoot, 'human.txt'), 'human'),
        },
        {
            name: 'candidate bytes',
            mutate: ({candidateRoot}) => fs.appendFileSync(path.join(candidateRoot, 'README.md'), 'changed'),
        },
        {
            name: 'candidate mode',
            mutate: ({candidateRoot}) => fs.chmodSync(path.join(candidateRoot, 'README.md'), 0o600),
        },
        {
            name: 'candidate symlink',
            mutate: ({candidateRoot}) => {
                fs.unlinkSync(path.join(candidateRoot, 'README.md'));
                fs.symlinkSync('commitlint.config.cjs', path.join(candidateRoot, 'README.md'));
            },
        },
        {
            name: 'metadata report',
            mutate: ({reportsRoot}) => {
                const filePath = path.join(reportsRoot, 'metadata.json');
                const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                value.unknown = true;
                fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'provider report',
            mutate: ({reportsRoot}) => {
                const filePath = path.join(reportsRoot, 'core-baseline.json');
                const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                value.unknown = true;
                fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'plan schema',
            disposition: 'INVALID_PLAN',
            mutate: ({planPath}) => {
                const value = JSON.parse(fs.readFileSync(planPath, 'utf8'));
                value.plan.unknown = true;
                fs.writeFileSync(planPath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'another attempt',
            mutate: ({bootstrapRoot}) => fs.mkdirSync(
                path.join(bootstrapRoot, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                {mode: 0o700}
            ),
        },
    ];

    for (const scenario of cases) {
        const projectRoot = makeTempDir();
        try {
            const planned = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => ATTEMPT_ID,
            });
            const plan = JSON.parse(planned.stdout);
            const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
            scenario.mutate({
                projectRoot,
                attemptRoot,
                candidateRoot: path.join(attemptRoot, 'candidate'),
                reportsRoot: path.join(attemptRoot, 'reports'),
                bootstrapRoot: path.dirname(attemptRoot),
                planPath: plan.data.planPath,
            });

            const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {
                coreRoot: CORE_ROOT,
            });
            const report = JSON.parse(result.stdout);

            assert.equal(result.status, 5, scenario.name);
            assert.equal(result.stderr, '', scenario.name);
            assert.equal(
                report.disposition,
                scenario.disposition ?? 'STALE_PROJECT_STATE',
                scenario.name
            );
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }

    const projectRoot = makeTempDir();
    try {
        const planned = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            randomUUID: () => ATTEMPT_ID,
        });
        const plan = JSON.parse(planned.stdout);
        for (const [attemptId, digest] of [
            ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan.planDigest],
            [ATTEMPT_ID, '0'.repeat(64)],
        ]) {
            const result = validatePlan(projectRoot, attemptId, digest, {coreRoot: CORE_ROOT});
            const report = JSON.parse(result.stdout);
            assert.equal(result.status, 5);
            assert.equal(report.disposition, 'STALE_PROJECT_STATE');
        }
    } finally {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    }
});

test('restores strict emptiness when planning fails before readiness', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({
        name: '@kyaulabs/not-prism-core',
        version: '0.3.1',
    }));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot,
        randomUUID: () => ATTEMPT_ID,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project planning failed/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects metadata outside the closed minimal schema', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const valid = {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    };
    const cases = [
        JSON.stringify({...valid, unknown: true}),
        JSON.stringify({...valid, schemaVersion: 2}),
        JSON.stringify({...valid, displayName: ''}),
        JSON.stringify({...valid, displayName: ' Project'}),
        JSON.stringify({...valid, displayName: 'Project\nName'}),
        JSON.stringify({...valid, displayName: 'x'.repeat(101)}),
        JSON.stringify({...valid, displayName: []}),
        JSON.stringify({...valid, summary: 'Two sentences. Another.'}),
        JSON.stringify({...valid, summary: 'No terminator'}),
        JSON.stringify({...valid, summary: 'x'.repeat(240) + '.'}),
        '{"schemaVersion":1,"displayName":"First","displayName":"Second","summary":"One sentence."}',
        `\ufeff${JSON.stringify(valid)}`,
        `${JSON.stringify(valid)} trailing`,
    ];

    for (const input of cases) {
        const result = planInput(projectRoot, input);
        assert.equal(result.status, 5, input);
        assert.equal(result.stdout, '', input);
        assert.match(result.stderr, /project metadata is invalid/, input);
        assert.deepEqual(fs.readdirSync(projectRoot), [], input);
    }
});

test('rejects malformed UTF-8 metadata bytes without changing the project root', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const input = Buffer.concat([
        Buffer.from('{"schemaVersion":1,"displayName":"Project'),
        Buffer.from([0xff]),
        Buffer.from('","summary":"One sentence."}'),
    ]);

    const result = planInput(projectRoot, input);

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project metadata is invalid/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('renders the trusted Core baseline into a launcher-designated candidate root', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

    const result = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PROVIDER_READY');
    assert.deepEqual(report.data.outputs.map(({path: outputPath}) => outputPath), [
        '.github/hooks/commit-msg',
        '.github/hooks/pre-commit',
        '.github/hooks/pre-push',
        '.github/hooks/prepare-commit-msg',
        '.prism/project.json',
        'README.md',
        'commitlint.config.cjs',
    ]);
    for (const output of report.data.outputs) {
        assert.match(output.sha256, /^[0-9a-f]{64}$/);
        assert.equal(path.isAbsolute(output.candidatePath), true);
        assert.equal(path.relative(candidateRoot, output.candidatePath).startsWith('..'), false);
    }
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects a symlinked candidate parent without writing through it', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.symlinkSync(outside, path.join(candidateRoot, '.github'));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not follow a candidate parent replaced at the file-creation boundary', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    const displaced = path.join(candidateRoot, '.github-held');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.mkdirSync(path.join(outside, 'hooks'));
    const originalOpen = fs.openSync;
    const originalWrite = fs.writeFileSync;
    let replaced = false;
    const replaceParent = (filePath) => {
        if (!replaced && typeof filePath === 'string' && path.basename(filePath) === 'commit-msg') {
            replaced = true;
            fs.renameSync(path.join(candidateRoot, '.github'), displaced);
            fs.symlinkSync(outside, path.join(candidateRoot, '.github'), 'dir');
        }
    };
    fs.openSync = function openWithReplacement(filePath, ...args) {
        replaceParent(filePath);
        return originalOpen.call(this, filePath, ...args);
    };
    fs.writeFileSync = function writeWithReplacement(filePath, ...args) {
        replaceParent(filePath);
        return originalWrite.call(this, filePath, ...args);
    };

    let result;
    try {
        result = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            bootstrapPlanStage: 'provider',
            bootstrapCandidateRoot: candidateRoot,
        });
    } finally {
        fs.openSync = originalOpen;
        fs.writeFileSync = originalWrite;
    }

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(path.join(outside, 'hooks')), []);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not re-resolve a candidate pathname after file identity validation', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const target = path.join(candidateRoot, '.github', 'hooks', 'commit-msg');
    const displaced = path.join(candidateRoot, 'commit-msg-held');
    const external = path.join(outside, 'commit-msg');
    fs.writeFileSync(external, 'external');
    const originalRealpath = fs.realpathSync;
    let replaced = false;
    fs.realpathSync = function replaceAtFinalResolution(filePath, ...args) {
        if (!replaced && filePath === target) {
            replaced = true;
            fs.renameSync(target, displaced);
            fs.symlinkSync(external, target);
        }
        return originalRealpath.call(this, filePath, ...args);
    };

    let result;
    try {
        result = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            bootstrapPlanStage: 'provider',
            bootstrapCandidateRoot: candidateRoot,
        });
    } finally {
        fs.realpathSync = originalRealpath;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(replaced, false);
    assert.equal(report.data.outputs[0].candidatePath, target);
});

test('rejects a packaged Core hook with a non-canonical mode', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({
        name: '@kyaulabs/prism-core',
        version: '0.3.1',
    }));
    fs.mkdirSync(path.join(coreRoot, 'config', 'bootstrap'), {recursive: true});
    fs.cpSync(path.join(CORE_ROOT, 'config', 'bootstrap', 'hooks'), path.join(
        coreRoot, 'config', 'bootstrap', 'hooks'
    ), {recursive: true});
    fs.copyFileSync(
        path.join(CORE_ROOT, 'config', 'commitlint.config.cjs'),
        path.join(coreRoot, 'config', 'commitlint.config.cjs')
    );
    fs.chmodSync(path.join(coreRoot, 'config', 'bootstrap', 'hooks', 'pre-commit'), 0o644);

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('validates provider identity and candidate bytes before composition', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const rendered = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const provider = JSON.parse(rendered.stdout).data;
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );

    const outputs = validateProviderReport({
        projectRoot,
        candidateRoot,
        registry: loadTrustedProviderRegistry({coreRoot: CORE_ROOT}),
        report: provider,
    });

    assert.equal(outputs.length, 7);
    assert.deepEqual(outputs[0].provider, {
        id: 'core-baseline',
        packageName: '@kyaulabs/prism-core',
        packageVersion: '0.3.1',
        protocolVersion: 1,
    });
    assert.equal(outputs.every(({kind}) => kind === 'file'), true);
});

test('rejects candidate bytes reached through a substituted intermediate parent', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const rendered = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const provider = JSON.parse(rendered.stdout).data;
    fs.cpSync(path.join(candidateRoot, '.github'), outside, {recursive: true});
    fs.rmSync(path.join(candidateRoot, '.github'), {recursive: true});
    fs.symlinkSync(outside, path.join(candidateRoot, '.github'), 'dir');
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );

    assert.throws(() => validateProviderReport({
        projectRoot,
        candidateRoot,
        registry: loadTrustedProviderRegistry({coreRoot: CORE_ROOT}),
        report: provider,
    }), /candidate/);
});

test('rejects malformed, untrusted, and stale provider reports', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const rendered = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const provider = JSON.parse(rendered.stdout).data;
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );
    const registry = loadTrustedProviderRegistry({coreRoot: CORE_ROOT});
    const copy = () => JSON.parse(JSON.stringify(provider));
    const cases = [
        (report) => { report.unknown = true; },
        (report) => { report.schemaVersion = 2; },
        (report) => { report.provider.id = 'unknown'; },
        (report) => { report.provider.packageName = '@kyaulabs/prism-other'; },
        (report) => { report.provider.packageVersion = '9.9.9'; },
        (report) => { report.provider.protocolVersion = 2; },
        (report) => { report.status = 'UNKNOWN'; },
        (report) => { report.outputs[0].unknown = true; },
        (report) => { report.outputs[0].path = '/absolute'; },
        (report) => { report.outputs[0].mode = 0o600; },
        (report) => { report.outputs[0].sha256 = '0'.repeat(64); },
        (report) => { report.effects = ['network']; },
        (report) => { report.checks[0].id = 'unknown'; },
        (report) => { report.verification[0].command = 'unknown'; },
    ];

    for (const mutate of cases) {
        const report = copy();
        mutate(report);
        assert.throws(
            () => validateProviderReport({projectRoot, candidateRoot, registry, report})
        );
    }

    fs.appendFileSync(provider.outputs.find(({path: outputPath}) => outputPath === 'README.md').candidatePath, 'changed');
    assert.throws(
        () => validateProviderReport({projectRoot, candidateRoot, registry, report: provider}),
        /candidate|digest/
    );
});

test('rejects exact and prefix provider ownership overlap', () => {
    const {composeProviderReports} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );
    const reportFor = (outputPath) => ({
        schemaVersion: 1,
        provider: {
            id: 'core-baseline',
            packageName: '@kyaulabs/prism-core',
            packageVersion: '0.3.1',
            protocolVersion: 1,
        },
        status: 'GO',
        outputs: [{
            path: outputPath,
            kind: 'file',
            mode: 0o644,
            sha256: 'a'.repeat(64),
            candidatePath: `/candidate/${outputPath}`,
        }],
        effects: [],
        checks: [{
            id: 'core-baseline-render',
            status: 'PASS',
            message: 'Core baseline candidate files were rendered',
        }],
        verification: [{
            id: 'core-baseline-inventory',
            command: 'setup project validate',
        }],
    });

    assert.throws(
        () => composeProviderReports({reports: [reportFor('README.md'), reportFor('README.md')]}),
        /provider ownership overlaps/
    );
    assert.throws(
        () => composeProviderReports({
            reports: [reportFor('.github'), reportFor('.github/hooks/pre-commit')],
        }),
        /provider ownership overlaps/
    );
    assert.throws(
        () => composeProviderReports({
            reports: [reportFor('.github/hooks/pre-commit'), reportFor('.github')],
        }),
        /provider ownership overlaps/
    );
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
