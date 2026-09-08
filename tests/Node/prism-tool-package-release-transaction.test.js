// $KYAULabs: prism-tool-package-release-transaction.test.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
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
# prism-release-schema: 4
name: Release
`;

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function makeFixture(t, {workflow = true} = {}) {
    const root = makeTempDir();
    const projectRoot = path.join(root, 'project');
    const coreRoot = path.join(root, 'core');
    fs.mkdirSync(projectRoot);
    fs.mkdirSync(path.join(coreRoot, 'config'), {recursive: true});
    fs.writeFileSync(path.join(coreRoot, 'config', 'release.yml'), CANONICAL_WORKFLOW);
    if (workflow) {
        fs.mkdirSync(path.join(projectRoot, '.github', 'workflows'), {recursive: true});
        fs.writeFileSync(
            path.join(projectRoot, '.github', 'workflows', 'release.yml'),
            CANONICAL_WORKFLOW
        );
    }
    writePackageJson(projectRoot, '.', {name: 'fixture-root', version: '1.2.3'});
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {coreRoot, projectRoot};
}

function installManagedConfiguration(projectRoot, packages = ['.'], adapterReleases = []) {
    writeJson(path.join(projectRoot, '.prism', 'release.json'), {
        schemaVersion: 3,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages,
        adapterReleases,
    });
}

function loadPackageReleaseWithConstants(constants) {
    const sourcePath = path.resolve(
        __dirname,
        '../../packages/prism-core/scripts/prism-tool/package-release.js'
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    const module = {exports: {}};
    const mockedFs = Object.create(fs);
    Object.defineProperty(mockedFs, 'constants', {value: constants});
    vm.runInNewContext(source, {
        Buffer,
        __dirname: path.dirname(sourcePath),
        __filename: sourcePath,
        module,
        process,
        require(identifier) {
            if (identifier === 'node:fs') return mockedFs;
            return require(identifier);
        },
    }, {filename: sourcePath});
    return module.exports;
}

test('requires current repository release management', (t) => {
    const fixture = makeFixture(t, {workflow: false});

    assert.equal(inspectReleaseCapability(fixture).disposition, 'CONFLICT');
    assert.equal(planReleaseCapability(fixture).planPath, null);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
});

test('plans only package metadata with a digest-bound workflow dependency', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const retained = JSON.parse(fs.readFileSync(plan.planPath, 'utf8'));

    assert.equal(plan.disposition, 'CREATE');
    assert.deepEqual(Object.keys(retained.files), ['.prism/release.json']);
    assert.equal(retained.inputs.workflow, sha256(Buffer.from(CANONICAL_WORKFLOW)));
    assert.equal(fs.existsSync(path.join(
        path.dirname(plan.planPath),
        'after',
        '.github',
        'workflows',
        'release.yml'
    )), false);
});

test('classifies absent, current, update, and unowned metadata', (t) => {
    const fixture = makeFixture(t);
    assert.equal(inspectReleaseCapability(fixture).disposition, 'CREATE');

    installManagedConfiguration(fixture.projectRoot);
    assert.equal(inspectReleaseCapability(fixture).disposition, 'UNCHANGED');

    writePackageJson(fixture.projectRoot, 'packages/extra', {
        name: '@fixture/extra',
        version: '1.2.3',
    });
    writePackageJson(fixture.projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
        workspaces: ['packages/*'],
    });
    assert.equal(inspectReleaseCapability(fixture).disposition, 'UPDATE');

    writeJson(path.join(fixture.projectRoot, '.prism', 'release.json'), {foreign: true});
    assert.equal(inspectReleaseCapability(fixture).disposition, 'CONFLICT');
});

test('migrates legacy package metadata without owning the workflow', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    writeJson(path.join(fixture.projectRoot, '.prism', 'release.json'), {packages: ['.']});

    const plan = planReleaseCapability(fixture);
    assert.equal(plan.disposition, 'MIGRATE');
    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'GO');
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(fixture.projectRoot, '.prism', 'release.json'))),
        {
            schemaVersion: 3,
            managedBy: '@kyaulabs/prism-core',
            versionPolicy: 'lockstep',
            packages: ['.'],
            adapterReleases: [],
        }
    );
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), CANONICAL_WORKFLOW);
});

test('rejects an outdated or unowned workflow dependency', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    fs.appendFileSync(workflowPath, '# drift\n');

    assert.equal(inspectReleaseCapability(fixture).disposition, 'CONFLICT');
    assert.equal(verifyReleaseCapability(fixture).status, 'NO-GO');
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), `${CANONICAL_WORKFLOW}# drift\n`);
});

test('migrates schema two adapter declarations while adding packages', (t) => {
    const fixture = makeFixture(t);
    writePackageJson(fixture.projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
        workspaces: ['packages/*'],
    });
    writePackageJson(fixture.projectRoot, 'packages/adapter', {
        name: '@fixture/adapter',
        version: '1.2.3',
        prism: {adapter: true, bootstrapProtocol: 1},
    });
    writeJson(path.join(fixture.projectRoot, '.prism', 'release.json'), {
        schemaVersion: 2,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.', 'packages/adapter'],
        adapterReleases: [{
            package: 'packages/adapter',
            id: 'fixture-adapter',
            displayName: 'Fixture adapter',
            coreRange: '>=1.2.3 <2.0.0',
            bootstrapProtocol: 1,
            status: 'ACTIVE',
        }],
    });
    writePackageJson(fixture.projectRoot, 'packages/extra', {
        name: '@fixture/extra',
        version: '1.2.3',
    });

    const plan = planReleaseCapability(fixture);
    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'GO');
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(fixture.projectRoot, '.prism', 'release.json'))),
        {
            schemaVersion: 3,
            managedBy: '@kyaulabs/prism-core',
            versionPolicy: 'lockstep',
            packages: ['.', 'packages/adapter', 'packages/extra'],
            adapterReleases: [{
                package: 'packages/adapter',
                id: 'fixture-adapter',
                displayName: 'Fixture adapter',
                bootstrapProtocol: 1,
                status: 'ACTIVE',
            }],
        }
    );
});

test('fails closed when package reconciliation would orphan a declaration', (t) => {
    const fixture = makeFixture(t);
    writePackageJson(fixture.projectRoot, 'packages/adapter', {
        name: '@fixture/adapter',
        version: '1.2.3',
        prism: {adapter: true, bootstrapProtocol: 1},
    });
    installManagedConfiguration(fixture.projectRoot, ['.', 'packages/adapter'], [{
        package: 'packages/adapter',
        id: 'fixture-adapter',
        displayName: 'Fixture adapter',
        bootstrapProtocol: 1,
        status: 'ACTIVE',
    }]);

    assert.equal(inspectReleaseCapability(fixture).disposition, 'CONFLICT');
});

test('applies and verifies package metadata without changing the workflow', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    const workflowIdentity = fs.statSync(workflowPath);
    const plan = planReleaseCapability(fixture);

    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'GO');
    assert.equal(verifyReleaseCapability(fixture).status, 'GO');
    assert.equal(fs.statSync(workflowPath).ino, workflowIdentity.ino);
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), CANONICAL_WORKFLOW);
    assert.equal(
        fs.statSync(path.join(fixture.projectRoot, '.prism', 'release.json')).mode & 0o777,
        0o600
    );
});

test('rejects package or workflow drift after plan approval', (t) => {
    const packageFixture = makeFixture(t);
    const packagePlan = planReleaseCapability(packageFixture);
    writePackageJson(packageFixture.projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.4',
    });
    assert.equal(applyReleaseCapability({
        ...packageFixture,
        planPath: packagePlan.planPath,
    }).status, 'NO-GO');

    const workflowFixture = makeFixture(t);
    const workflowPlan = planReleaseCapability(workflowFixture);
    fs.appendFileSync(
        path.join(workflowFixture.projectRoot, '.github', 'workflows', 'release.yml'),
        '# drift\n'
    );
    assert.equal(applyReleaseCapability({
        ...workflowFixture,
        planPath: workflowPlan.planPath,
    }).status, 'NO-GO');
    assert.equal(fs.existsSync(path.join(
        workflowFixture.projectRoot,
        '.prism',
        'release.json'
    )), false);
});

test('rejects a changed retained plan', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const retained = JSON.parse(fs.readFileSync(plan.planPath, 'utf8'));
    retained.inputs.workflow = '0'.repeat(64);
    fs.writeFileSync(plan.planPath, `${JSON.stringify(retained, null, 2)}\n`);

    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'NO-GO');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
});

test('does not follow symlinked managed parents or targets', (t) => {
    const parentFixture = makeFixture(t);
    const external = path.join(path.dirname(parentFixture.projectRoot), 'external');
    fs.mkdirSync(external);
    fs.symlinkSync(external, path.join(parentFixture.projectRoot, '.prism'));
    assert.equal(inspectReleaseCapability(parentFixture).disposition, 'CONFLICT');

    const targetFixture = makeFixture(t);
    fs.mkdirSync(path.join(targetFixture.projectRoot, '.prism'));
    fs.symlinkSync('missing.json', path.join(targetFixture.projectRoot, '.prism', 'release.json'));
    assert.equal(inspectReleaseCapability(targetFixture).disposition, 'CONFLICT');
});

test('rejects safe reads when no-follow filesystem support is unavailable', (t) => {
    const fixture = makeFixture(t);
    const isolated = loadPackageReleaseWithConstants({...fs.constants, O_NOFOLLOW: undefined});

    assert.throws(() => isolated.inspectReleaseCapability(fixture), /safe filesystem flags/);
});

test('preserves the previous configuration when publication fails', (t) => {
    const fixture = makeFixture(t);
    installManagedConfiguration(fixture.projectRoot, []);
    const configPath = path.join(fixture.projectRoot, '.prism', 'release.json');
    const before = fs.readFileSync(configPath);
    const plan = planReleaseCapability(fixture);

    const result = applyReleaseCapability({
        ...fixture,
        planPath: plan.planPath,
        rename() { throw new Error('publication failed'); },
    });
    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.readFileSync(configPath).equals(before), true);
});

test('refuses a concurrent package-release lock without removing it', (t) => {
    const fixture = makeFixture(t);
    const plan = planReleaseCapability(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'package-release.lock');
    fs.writeFileSync(lockPath, 'human lock\n');

    assert.equal(applyReleaseCapability({...fixture, planPath: plan.planPath}).status, 'NO-GO');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'human lock\n');
});

test('requires literal package-release approval through the CLI', (t) => {
    const fixture = makeFixture(t);
    const planned = captureWrites(() => main(['package-release', 'plan', '--json'], fixture));
    const plan = JSON.parse(planned.stdout);

    const rejected = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${plan.planPath}`,
        '--approval=true',
        '--json',
    ], fixture));
    assert.notEqual(rejected.status, 0);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);

    const applied = captureWrites(() => main([
        'package-release',
        'apply',
        `--plan=${plan.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).status, 'GO');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
