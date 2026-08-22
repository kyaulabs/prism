// $KYAULabs: prism-tool-package-release-transaction.test.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    applyReleaseCapability,
    inspectReleaseCapability,
    planReleaseCapability,
    sha256,
    verifyReleaseCapability,
} = require('../../packages/prism-core/scripts/prism-tool/package-release');
const {makeTempDir, writeJson, writePackageJson} = require('./helpers');

const CANONICAL_WORKFLOW = `# prism-managed: @kyaulabs/prism-core
# prism-release-schema: 1
name: Release
`;

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

function makeFixture(t) {
    const root = makeTempDir();
    const projectRoot = path.join(root, 'project');
    const coreRoot = path.join(root, 'core');
    fs.mkdirSync(projectRoot);
    fs.mkdirSync(path.join(coreRoot, 'config'), {recursive: true});
    fs.writeFileSync(path.join(coreRoot, 'config', 'release.yml'), CANONICAL_WORKFLOW);
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
    });
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {coreRoot, projectRoot};
}

function installManagedFiles(projectRoot, workflow = CANONICAL_WORKFLOW) {
    writeJson(path.join(projectRoot, '.prism', 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    const workflowPath = path.join(projectRoot, '.github', 'workflows', 'release.yml');
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, workflow);
}

test('classifies two absent managed release files as CREATE', (t) => {
    const fixture = makeFixture(t);

    assert.deepEqual(inspectReleaseCapability(fixture), {
        status: 'GO',
        disposition: 'CREATE',
        candidates: [
            {name: 'fixture-root', path: '.', version: '1.2.3', tagPrefix: 'fixture-root'},
        ],
        configuredPackages: [],
        checks: [
            {id: 'package-release-ownership', status: 'PASS', message: 'managed release files can be created'},
        ],
    });
});

test('classifies owned outdated, legacy, and mixed ownership states', (t) => {
    const updateFixture = makeFixture(t);
    installManagedFiles(
        updateFixture.projectRoot,
        `${CANONICAL_WORKFLOW}# outdated\n`
    );
    assert.equal(inspectReleaseCapability(updateFixture).disposition, 'UPDATE');

    const legacyFixture = makeFixture(t);
    writeJson(path.join(legacyFixture.projectRoot, '.prism', 'release.json'), {packages: ['.']});
    const legacyWorkflow = Buffer.from('name: legacy release\n');
    const legacyWorkflowPath = path.join(legacyFixture.projectRoot, '.github', 'workflows', 'release.yml');
    fs.mkdirSync(path.dirname(legacyWorkflowPath), {recursive: true});
    fs.writeFileSync(legacyWorkflowPath, legacyWorkflow);
    assert.equal(inspectReleaseCapability({
        ...legacyFixture,
        legacyWorkflowSha256: sha256(legacyWorkflow),
    }).disposition, 'MIGRATE');

    const conflictFixture = makeFixture(t);
    writeJson(path.join(conflictFixture.projectRoot, '.prism', 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    assert.deepEqual(inspectReleaseCapability(conflictFixture), {
        status: 'NO-GO',
        disposition: 'CONFLICT',
        candidates: [
            {name: 'fixture-root', path: '.', version: '1.2.3', tagPrefix: 'fixture-root'},
        ],
        configuredPackages: [],
        checks: [
            {id: 'package-release-ownership', status: 'FAIL', message: 'managed release files conflict'},
        ],
    });
});

test('classifies owned canonical release files as UNCHANGED', (t) => {
    const fixture = makeFixture(t);
    installManagedFiles(fixture.projectRoot);

    const result = inspectReleaseCapability(fixture);

    assert.equal(result.status, 'GO');
    assert.equal(result.disposition, 'UNCHANGED');
    assert.deepEqual(result.configuredPackages, ['.']);
    assert.deepEqual(result.candidates.map(({path: packagePath}) => packagePath), ['.']);
    assert.deepEqual(result.checks, [
        {id: 'package-release-ownership', status: 'PASS', message: 'managed release files are current'},
    ]);
});

test('does not create a plan for UNCHANGED or CONFLICT states', (t) => {
    const unchangedFixture = makeFixture(t);
    installManagedFiles(unchangedFixture.projectRoot);
    const unchanged = planReleaseCapability(unchangedFixture);
    assert.equal(unchanged.disposition, 'UNCHANGED');
    assert.equal(unchanged.planPath, null);
    assert.equal(fs.existsSync(path.join(unchangedFixture.projectRoot, '.pi')), false);

    const conflictFixture = makeFixture(t);
    writeJson(path.join(conflictFixture.projectRoot, '.prism', 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    const conflict = planReleaseCapability(conflictFixture);
    assert.equal(conflict.disposition, 'CONFLICT');
    assert.equal(conflict.planPath, null);
    assert.equal(fs.existsSync(path.join(conflictFixture.projectRoot, '.pi')), false);
});

test('creates a bounded CREATE plan with exact before and after digests', (t) => {
    const fixture = makeFixture(t);

    const result = planReleaseCapability(fixture);

    assert.equal(result.status, 'GO');
    assert.equal(result.disposition, 'CREATE');
    assert.match(result.planPath, /[.]pi\/prism-tool\/package-release\/plan[.]json$/);
    assert.match(result.diff, /[+] {2}"schemaVersion": 1/);
    const plan = JSON.parse(fs.readFileSync(result.planPath, 'utf8'));
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.managedBy, '@kyaulabs/prism-core');
    assert.equal(plan.projectRoot, fs.realpathSync(fixture.projectRoot));
    assert.equal(plan.disposition, 'CREATE');
    assert.deepEqual(Object.keys(plan.files).sort(), [
        '.github/workflows/release.yml',
        '.prism/release.json',
    ]);
    for (const file of Object.values(plan.files)) {
        assert.equal(file.before, 'absent');
        assert.match(file.after, /^[a-f0-9]{64}$/);
    }
});

test('rejects non-literal package-release mutation approval before changing files', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);

    const result = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${plan.planPath}`,
        '--approval=no',
    ], fixture));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /mutation approval required/);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml')), false);
});

test('applies a CREATE plan and installs both canonical owned files', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);

    const result = applyReleaseCapability({...fixture, planPath: plan.planPath});

    assert.equal(result.status, 'GO');
    assert.deepEqual(result.checks, [
        {id: 'package-release-application', status: 'PASS', message: 'managed release files applied'},
    ]);
    assert.equal(
        fs.readFileSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml'), 'utf8'),
        CANONICAL_WORKFLOW
    );
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(fixture.projectRoot, '.prism', 'release.json'), 'utf8')),
        {
            schemaVersion: 1,
            managedBy: '@kyaulabs/prism-core',
            versionPolicy: 'lockstep',
            packages: ['.'],
        }
    );
    assert.equal(
        fs.statSync(path.join(fixture.projectRoot, '.prism', 'release.json')).mode & 0o777,
        0o600
    );
    assert.equal(
        fs.statSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml')).mode & 0o777,
        0o644
    );
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), false);
});

test('rolls back a partial CREATE when the second atomic rename fails', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    let renameCount = 0;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 2) throw new Error('fixture rename failure');
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'transaction failure');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml')), false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism')), false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('verifies the installed owned configuration and canonical workflow', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'GO');

    assert.deepEqual(verifyReleaseCapability(fixture), {
        status: 'GO',
        checks: [
            {id: 'package-release-verification', status: 'PASS', message: 'managed release files are current'},
        ],
        data: {packages: ['.']},
    });
});

test('dispatches inspect, plan, approved apply, and verify as stable JSON reports', (t) => {
    const fixture = makeFixture(t);
    const inspect = captureWrites(() => main(['package-release', 'inspect', '--json'], fixture));
    assert.equal(inspect.status, 0);
    assert.equal(JSON.parse(inspect.stdout).disposition, 'CREATE');

    const planned = captureWrites(() => main(['package-release', 'plan', '--json'], fixture));
    assert.equal(planned.status, 0);
    const planReport = JSON.parse(planned.stdout);
    assert.equal(planReport.disposition, 'CREATE');

    const applied = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${planReport.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0);
    assert.equal(JSON.parse(applied.stdout).status, 'GO');

    const verified = captureWrites(() => main(['package-release', 'verify', '--json'], fixture));
    assert.equal(verified.status, 0);
    assert.deepEqual(JSON.parse(verified.stdout).data.packages, ['.']);
});

test('rejects plan drift and preserves an ownership-ambiguous operation marker', (t) => {
    const staleFixture = makeFixture(t);
    const stalePlan = planReleaseCapability(staleFixture);
    writeJson(path.join(staleFixture.projectRoot, '.prism', 'release.json'), {foreign: true});
    const staleResult = applyReleaseCapability({...staleFixture, planPath: stalePlan.planPath});
    assert.equal(staleResult.status, 'NO-GO');
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(staleFixture.projectRoot, '.prism', 'release.json'), 'utf8')),
        {foreign: true}
    );
    assert.equal(fs.existsSync(path.join(staleFixture.projectRoot, '.github', 'workflows', 'release.yml')), false);

    const markerFixture = makeFixture(t);
    const markerPlan = planReleaseCapability(markerFixture);
    const operationRoot = path.dirname(markerPlan.planPath);
    writeJson(path.join(operationRoot, '.prism-package-release.json'), {
        schemaVersion: 1,
        managedBy: '@fixture/other',
        projectRoot: fs.realpathSync(markerFixture.projectRoot),
    });
    const markerResult = applyReleaseCapability({...markerFixture, planPath: markerPlan.planPath});
    assert.equal(markerResult.status, 'NO-GO');
    assert.equal(fs.existsSync(operationRoot), true);
    assert.equal(fs.existsSync(path.join(markerFixture.projectRoot, '.prism', 'release.json')), false);
});

test('reports verification drift without repairing managed files', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'GO');
    fs.appendFileSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml'), '# drift\n');

    const result = verifyReleaseCapability(fixture);

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'UPDATE');
});

test('refuses a concurrent package-release lock without removing it', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'package-release.lock');
    fs.writeFileSync(lockPath, 'concurrent\n', {flag: 'wx', mode: 0o600});

    const result = applyReleaseCapability({...fixture, planPath: plan.planPath});

    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'concurrent\n');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
});

test('records existing file digests in UPDATE plans without changing target bytes', (t) => {
    const fixture = makeFixture(t);
    installManagedFiles(fixture.projectRoot, `${CANONICAL_WORKFLOW}# outdated\n`);
    const configPath = path.join(fixture.projectRoot, '.prism', 'release.json');
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    const originalConfig = fs.readFileSync(configPath);
    const originalWorkflow = fs.readFileSync(workflowPath);
    fs.chmodSync(configPath, 0o640);
    fs.chmodSync(workflowPath, 0o660);

    const result = planReleaseCapability(fixture);
    const plan = JSON.parse(fs.readFileSync(result.planPath, 'utf8'));

    assert.equal(result.disposition, 'UPDATE');
    assert.match(plan.files['.prism/release.json'].before, /^[a-f0-9]{64}$/);
    assert.match(plan.files['.github/workflows/release.yml'].before, /^[a-f0-9]{64}$/);
    assert.deepEqual(fs.readFileSync(configPath), originalConfig);
    assert.deepEqual(fs.readFileSync(workflowPath), originalWorkflow);
    assert.equal(applyReleaseCapability({...fixture, planPath: result.planPath}).status, 'GO');
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o640);
    assert.equal(fs.statSync(workflowPath).mode & 0o777, 0o660);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
