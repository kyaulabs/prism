// $KYAULabs: prism-tool-package-release-transaction.test.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    inspectReleaseCapability,
    planReleaseCapability,
    sha256,
} = require('../../packages/prism-core/scripts/prism-tool/package-release');
const {makeTempDir, writeJson, writePackageJson} = require('./helpers');

const CANONICAL_WORKFLOW = `# prism-managed: @kyaulabs/prism-core
# prism-release-schema: 1
name: Release
`;

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

test('records existing file digests in UPDATE plans without changing target bytes', (t) => {
    const fixture = makeFixture(t);
    installManagedFiles(fixture.projectRoot, `${CANONICAL_WORKFLOW}# outdated\n`);
    const configPath = path.join(fixture.projectRoot, '.prism', 'release.json');
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    const originalConfig = fs.readFileSync(configPath);
    const originalWorkflow = fs.readFileSync(workflowPath);

    const result = planReleaseCapability(fixture);
    const plan = JSON.parse(fs.readFileSync(result.planPath, 'utf8'));

    assert.equal(result.disposition, 'UPDATE');
    assert.match(plan.files['.prism/release.json'].before, /^[a-f0-9]{64}$/);
    assert.match(plan.files['.github/workflows/release.yml'].before, /^[a-f0-9]{64}$/);
    assert.deepEqual(fs.readFileSync(configPath), originalConfig);
    assert.deepEqual(fs.readFileSync(workflowPath), originalWorkflow);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
