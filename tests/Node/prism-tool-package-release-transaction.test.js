// $KYAULabs: prism-tool-package-release-transaction.test.js kyau@aura.kyaulabs 2026/08/22 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {EXIT, main} = require('../../packages/prism-core/scripts/prism-tool/cli');
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

test('classifies a dangling managed release path as CONFLICT', (t) => {
    const fixture = makeFixture(t);
    const configPath = path.join(fixture.projectRoot, '.prism', 'release.json');
    fs.mkdirSync(path.dirname(configPath), {recursive: true});
    fs.symlinkSync('missing-release.json', configPath);

    const result = inspectReleaseCapability(fixture);

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.disposition, 'CONFLICT');
});

test('rejects a symlinked managed parent before inspection or planning', (t) => {
    const fixture = makeFixture(t);
    const externalPrism = path.join(path.dirname(fixture.projectRoot), 'external-prism');
    writeJson(path.join(externalPrism, 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    fs.symlinkSync(externalPrism, path.join(fixture.projectRoot, '.prism'));
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, `${CANONICAL_WORKFLOW}# outdated\n`);

    const inspection = inspectReleaseCapability(fixture);
    const plan = planReleaseCapability(fixture);

    assert.equal(inspection.status, 'NO-GO');
    assert.equal(inspection.disposition, 'CONFLICT');
    assert.equal(plan.status, 'NO-GO');
    assert.equal(plan.disposition, 'CONFLICT');
    assert.equal(plan.planPath, null);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi')), false);
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
    assert.match(result.planPath, /[.]pi\/prism-tool\/package-release\/plan-[a-f0-9]{64}[.]json$/);
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

test('does not let a replacement plan reuse an earlier approval path', (t) => {
    const fixture = makeFixture(t);
    const firstPlan = planReleaseCapability(fixture);
    writePackageJson(fixture.projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
        workspaces: ['packages/*'],
    });
    writePackageJson(fixture.projectRoot, 'packages/added', {
        name: 'fixture-added',
        version: '1.2.3',
    });

    const secondPlan = planReleaseCapability(fixture);
    const result = applyReleaseCapability({...fixture, planPath: firstPlan.planPath});

    assert.notEqual(secondPlan.planPath, firstPlan.planPath);
    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml')), false);
});

test('refuses to replace a plan while the package-release lock is held', (t) => {
    const fixture = makeFixture(t);
    const firstPlan = planReleaseCapability(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'package-release.lock');
    fs.writeFileSync(lockPath, 'concurrent\n', {flag: 'wx', mode: 0o600});

    assert.throws(() => planReleaseCapability(fixture), {code: 'EEXIST'});
    assert.equal(fs.existsSync(firstPlan.planPath), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'concurrent\n');
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

test('maps package-release apply setup failures to a controlled tool response', (t) => {
    const root = makeTempDir();
    const projectRoot = path.join(root, 'missing-project');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${path.join(projectRoot, '.pi', 'prism-tool', 'package-release', 'plan.json')}`,
        '--approval=yes',
    ], {projectRoot, coreRoot: root}));

    assert.equal(result.status, EXIT.TOOL);
    assert.equal(result.stderr, 'prism-tool: package-release operation failed\n');
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

test('preserves concurrent target edits during rollback', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    const concurrentContent = 'concurrent workflow edit\n';
    let renameCount = 0;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 2) {
                fs.writeFileSync(workflowPath, concurrentContent);
                throw new Error('fixture rename failure');
            }
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.recovery, 'manual recovery required');
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), concurrentContent);
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), true);
});

test('reports manual recovery when created-directory cleanup fails', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const configParent = path.join(fixture.projectRoot, '.prism');
    const movedConfigParent = path.join(path.dirname(fixture.projectRoot), 'moved-prism');
    let renameCount = 0;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 2) {
                fs.renameSync(configParent, movedConfigParent);
                fs.symlinkSync('missing-prism', configParent);
                throw new Error('fixture rename failure');
            }
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.recovery, 'manual recovery required');
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), true);
});

test('does not follow a replaced managed parent during atomic rename', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const workflowParent = path.join(fixture.projectRoot, '.github', 'workflows');
    const movedParent = path.join(path.dirname(fixture.projectRoot), 'moved-workflows');
    const externalParent = path.join(path.dirname(fixture.projectRoot), 'external-workflows');
    let renameCount = 0;
    let externalSentinelPath;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 1) {
                fs.renameSync(workflowParent, movedParent);
                fs.mkdirSync(externalParent);
                fs.symlinkSync(externalParent, workflowParent);
                externalSentinelPath = path.join(externalParent, path.basename(source));
                fs.writeFileSync(externalSentinelPath, 'external sentinel\n');
            }
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.existsSync(externalSentinelPath), true);
    assert.equal(fs.readFileSync(externalSentinelPath, 'utf8'), 'external sentinel\n');
    assert.equal(fs.existsSync(path.join(externalParent, 'release.yml')), false);
    assert.equal(result.data.recovery, 'manual recovery required');
    assert.equal(fs.existsSync(path.join(movedParent, 'release.yml')), false);
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), true);
});

test('restores existing managed bytes when a held parent moves after rename', (t) => {
    const fixture = makeFixture(t);
    const originalWorkflow = `${CANONICAL_WORKFLOW}# outdated\n`;
    installManagedFiles(fixture.projectRoot, originalWorkflow);
    const plan = planReleaseCapability(fixture);
    const workflowParent = path.join(fixture.projectRoot, '.github', 'workflows');
    const movedParent = path.join(path.dirname(fixture.projectRoot), 'moved-update-workflows');
    const externalParent = path.join(path.dirname(fixture.projectRoot), 'external-update-workflows');
    let renameCount = 0;
    let externalSentinelPath;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 1) {
                fs.renameSync(workflowParent, movedParent);
                fs.mkdirSync(externalParent);
                fs.symlinkSync(externalParent, workflowParent);
                externalSentinelPath = path.join(externalParent, path.basename(source));
                fs.writeFileSync(externalSentinelPath, 'external sentinel\n');
            }
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.recovery, 'manual recovery required');
    assert.equal(fs.existsSync(externalSentinelPath), true);
    assert.equal(fs.existsSync(path.join(externalParent, 'release.yml')), false);
    assert.equal(fs.existsSync(path.join(movedParent, 'release.yml')), true);
    assert.equal(fs.readFileSync(path.join(movedParent, 'release.yml'), 'utf8'), originalWorkflow);
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), true);
});

test('reports manual recovery when restoring an existing file fails', (t) => {
    const fixture = makeFixture(t);
    installManagedFiles(fixture.projectRoot, `${CANONICAL_WORKFLOW}# outdated\n`);
    const plan = planReleaseCapability(fixture);
    let renameCount = 0;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount >= 2) throw new Error('fixture persistent rename failure');
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.recovery, 'manual recovery required');
    assert.equal(fs.existsSync(path.dirname(plan.planPath)), true);
});

test('rejects target drift introduced between managed file replacements', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const configPath = path.join(fixture.projectRoot, '.prism', 'release.json');
    let renameCount = 0;

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename(source, destination) {
            fs.renameSync(source, destination);
            renameCount += 1;
            if (renameCount === 1) writeJson(configPath, {foreign: true});
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), {foreign: true});
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml')), false);
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
    assert.deepEqual(JSON.parse(inspect.stdout), {
        schemaVersion: 1,
        command: 'package-release inspect',
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

    const planned = captureWrites(() => main(['package-release', 'plan', '--json'], fixture));
    assert.equal(planned.status, 0);
    const planReport = JSON.parse(planned.stdout);
    assert.equal(planReport.disposition, 'CREATE');
    assert.match(planReport.planPath, /[.]pi\/prism-tool\/package-release\/plan-[a-f0-9]{64}[.]json$/);
    assert.match(planReport.diff, /[+] {2}"managedBy": "@kyaulabs\/prism-core"/);

    const applied = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${planReport.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0);
    assert.deepEqual(JSON.parse(applied.stdout), {
        schemaVersion: 1,
        command: 'package-release apply',
        status: 'GO',
        checks: [
            {id: 'package-release-application', status: 'PASS', message: 'managed release files applied'},
        ],
        data: {disposition: 'CREATE'},
    });

    const verified = captureWrites(() => main(['package-release', 'verify', '--json'], fixture));
    assert.equal(verified.status, 0);
    assert.deepEqual(JSON.parse(verified.stdout), {
        schemaVersion: 1,
        command: 'package-release verify',
        status: 'GO',
        checks: [
            {id: 'package-release-verification', status: 'PASS', message: 'managed release files are current'},
        ],
        data: {packages: ['.']},
    });
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
