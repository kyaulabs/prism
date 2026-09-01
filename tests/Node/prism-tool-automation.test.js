// $KYAULabs: prism-tool-automation.test.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    applyAutomation,
    inspectAutomation,
    planAutomation,
    verifyAutomation,
} = require('../../packages/prism-core/scripts/prism-tool/automation');
const {renderCoreAutomationProvider} = require(
    '../../packages/prism-core/scripts/prism-tool/automation-providers'
);
const adapterHandler = require('../../packages/prism-php-web/scripts/prism-tool-adapter');
const {makeTempDir, writeJson} = require('./helpers');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const ADAPTER_CONTRACT = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'toolchain.json'), 'utf8')
);

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

function makeFixture(t, adapterRoot = ADAPTER_ROOT) {
    const projectRoot = makeTempDir();
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: [path.join(adapterRoot, 'skills')],
    });
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
}

function makeGitFixture(t, adapterRoot = ADAPTER_ROOT) {
    const fixture = makeFixture(t, adapterRoot);
    fs.writeFileSync(path.join(fixture.projectRoot, '.gitignore'), '.pi/prism-tool/\n');
    execFileSync('git', ['init', '-b', 'feat/tester-abcd-automation'], {
        cwd: fixture.projectRoot,
        stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], {cwd: fixture.projectRoot});
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: fixture.projectRoot});
    execFileSync('git', ['add', '.'], {cwd: fixture.projectRoot});
    execFileSync('git', ['commit', '-m', 'test fixture'], {
        cwd: fixture.projectRoot,
        stdio: 'ignore',
    });
    return fixture;
}

function installCanonicalAutomation(fixture) {
    renderCoreAutomationProvider({
        coreRoot: fixture.coreRoot,
        candidateRoot: fixture.projectRoot,
    });
    adapterHandler.prepareAutomation({
        candidateRoot: fixture.projectRoot,
        contract: ADAPTER_CONTRACT,
    });
}

test('adds repository release management only when enabled', (t) => {
    const fixture = makeGitFixture(t);
    const disabled = planAutomation(fixture);
    assert.equal(disabled.providers.some(({id}) => id === 'core-repository-release'), false);
    fs.rmSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation'), {
        recursive: true,
        force: true,
    });

    const enabled = planAutomation({...fixture, releaseRepository: 'example/project'});
    const release = enabled.providers.find(({id}) => id === 'core-repository-release');
    assert.deepEqual(release.outputs.map(({path: outputPath}) => outputPath), [
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
    ]);
    assert.equal(applyAutomation({...fixture, planPath: enabled.planPath}).status, 'GO');
    assert.equal(verifyAutomation({
        ...fixture,
        releaseRepository: 'example/project',
    }).status, 'GO');
    assert.match(fs.readFileSync(path.join(fixture.projectRoot, 'cliff.toml'), 'utf8'),
        /github\.com\/example\/project\/releases/);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
});

test('exposes repository release selection through automation CLI controls', (t) => {
    const fixture = makeGitFixture(t);
    const planned = captureWrites(() => main([
        'automation',
        'plan',
        '--release-repository=example/project',
        '--json',
    ], fixture));

    assert.equal(planned.status, 0, planned.stderr);
    const report = JSON.parse(planned.stdout);
    assert.equal(report.providers.some(({id}) => id === 'core-repository-release'), true);
    const applied = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${report.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    const verified = captureWrites(() => main([
        'automation',
        'verify',
        '--release-repository=example/project',
        '--json',
    ], fixture));
    assert.equal(verified.status, 0, verified.stderr);
});

test('classifies an older owned release workflow as migratable', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(
        workflowPath,
        fs.readFileSync(path.join(CORE_ROOT, 'config', 'release.yml'), 'utf8')
            .replace('# prism-release-schema: 3', '# prism-release-schema: 2')
    );

    const inspected = inspectAutomation({
        ...fixture,
        releaseRepository: 'example/project',
    });
    const release = inspected.providers.find(({id}) => id === 'core-repository-release');
    assert.equal(release.outputs.find(({path: outputPath}) =>
        outputPath === '.github/workflows/release.yml'
    ).disposition, 'MIGRATE');
});

test('rejects an unowned repository release output', (t) => {
    const fixture = makeGitFixture(t);
    fs.writeFileSync(path.join(fixture.projectRoot, 'CHANGELOG.md'), '# Human changelog\n');

    assert.throws(() => planAutomation({
        ...fixture,
        releaseRepository: 'example/project',
    }), /ownership conflicts/);
    assert.equal(fs.readFileSync(path.join(fixture.projectRoot, 'CHANGELOG.md'), 'utf8'),
        '# Human changelog\n');
});

test('exposes the approved automation transaction through the CLI', (t) => {
    const fixture = makeGitFixture(t);
    const planned = captureWrites(() => main(['automation', 'plan', '--json'], fixture));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);

    const rejected = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${plan.planPath}`,
        '--json',
    ], fixture));
    assert.equal(rejected.status, 2);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    )), false);

    const applied = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${plan.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).command, 'automation apply');
    const verified = captureWrites(() => main(['automation', 'verify', '--json'], fixture));
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).disposition, 'CURRENT');
});

test('rejects stale ownership without changing project automation', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, 'name: Human workflow\n');

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), 'name: Human workflow\n');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'scripts',
        'check-php.sh'
    )), false);
});

test('rejects a stale Git worktree precondition', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    fs.appendFileSync(path.join(fixture.projectRoot, '.gitignore'), '# changed\n');

    assert.throws(
        () => applyAutomation({...fixture, planPath: planned.planPath}),
        /Git precondition changed/
    );
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('preserves a competing automation lock', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    fs.writeFileSync(lockPath, 'competing lock\n', {mode: 0o600});

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'competing lock\n');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rolls back published outputs after a rename failure', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    let renames = 0;

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename(source, destination) {
            renames += 1;
            if (renames === 2) throw new Error('injected rename failure');
            fs.renameSync(source, destination);
        },
    }), /injected rename failure/);
    assert.equal(renames, 2);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation.lock'
    )), false);
});

test('does not follow a substituted automation destination parent', (t) => {
    const fixture = makeGitFixture(t);
    const outside = makeTempDir();
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planAutomation(fixture);
    fs.symlinkSync(outside, path.join(fixture.projectRoot, '.github'), 'dir');

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.lstatSync(path.join(fixture.projectRoot, '.github')).isSymbolicLink(), true);
});

test('does not read through a substituted automation candidate', (t) => {
    const fixture = makeGitFixture(t);
    const outside = path.join(makeTempDir(), 'outside.txt');
    t.after(() => fs.rmSync(path.dirname(outside), {recursive: true, force: true}));
    fs.writeFileSync(outside, 'outside\n');
    const planned = planAutomation(fixture);
    const candidatePath = path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation',
        'candidate',
        '.github',
        'scripts',
        'check-php.sh'
    );
    fs.unlinkSync(candidatePath);
    fs.symlinkSync(outside, candidatePath);
    const originalRead = fs.readFileSync;
    let followed = false;
    fs.readFileSync = function observeCandidate(filePath, ...args) {
        if (filePath === candidatePath) followed = true;
        return originalRead.call(this, filePath, ...args);
    };

    try {
        assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    } finally {
        fs.readFileSync = originalRead;
    }
    assert.equal(followed, false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects provider identity drift after planning', (t) => {
    const adapterRoot = makeTempDir();
    fs.cpSync(ADAPTER_ROOT, adapterRoot, {recursive: true});
    t.after(() => fs.rmSync(adapterRoot, {recursive: true, force: true}));
    const fixture = makeGitFixture(t, adapterRoot);
    const planned = planAutomation(fixture);
    const manifestPath = path.join(adapterRoot, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '9.9.9';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('refuses to replace a plan while the automation lock is held', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    fs.writeFileSync(lockPath, 'held\n', {mode: 0o600});

    assert.throws(() => planAutomation(fixture), /locked/);
    assert.equal(fs.existsSync(planned.planPath), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'held\n');
});

test('preserves unowned automation operation state', (t) => {
    const fixture = makeGitFixture(t);
    const operationRoot = path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation'
    );
    fs.mkdirSync(operationRoot, {recursive: true});
    const humanPath = path.join(operationRoot, 'human.txt');
    fs.writeFileSync(humanPath, 'human state\n');

    assert.throws(() => planAutomation(fixture));
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'human state\n');
});

test('preserves a replacement automation lock during cleanup', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename() {
            fs.unlinkSync(lockPath);
            fs.writeFileSync(lockPath, 'replacement\n', {mode: 0o600});
            throw new Error('replace lock');
        },
    }));
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'replacement\n');
});

test('preserves concurrently changed output during rollback', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    let renames = 0;
    let changedPath;

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename(source, destination) {
            renames += 1;
            if (renames === 1) {
                fs.renameSync(source, destination);
                fs.appendFileSync(destination, 'concurrent change\n');
                changedPath = destination;
                return;
            }
            throw new Error('stop publication');
        },
    }));
    assert.match(fs.readFileSync(changedPath, 'utf8'), /concurrent change/);
});

test('rejects a changed immutable automation plan', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    envelope.plan.outputs[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(planned.planPath, `${JSON.stringify(envelope, null, 2)}\n`);

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects an automation plan output that escapes the project', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const escapedPath = path.join(path.dirname(fixture.projectRoot), 'escaped-automation.txt');
    t.after(() => fs.rmSync(escapedPath, {force: true}));
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    envelope.plan.outputs[0].path = '../escaped-automation.txt';
    envelope.planDigest = crypto.createHash('sha256')
        .update(JSON.stringify(envelope.plan))
        .digest('hex');
    const changedPlanPath = path.join(
        path.dirname(planned.planPath),
        `plan-${envelope.planDigest}.json`
    );
    fs.writeFileSync(changedPlanPath, `${JSON.stringify(envelope, null, 2)}\n`, {mode: 0o600});

    assert.throws(() => applyAutomation({...fixture, planPath: changedPlanPath}));
    assert.equal(fs.existsSync(escapedPath), false);
});

test('plans, applies, and verifies established automation atomically', (t) => {
    const fixture = makeGitFixture(t);

    const planned = planAutomation(fixture);

    assert.equal(planned.status, 'GO');
    assert.match(
        planned.planPath,
        /[.]pi\/prism-tool\/automation\/plan-[a-f0-9]{64}[.]json$/
    );
    assert.equal(
        planned.planDigest,
        path.basename(planned.planPath).slice('plan-'.length, -'.json'.length)
    );
    assert.equal(fs.statSync(planned.planPath).mode & 0o777, 0o600);
    const applied = applyAutomation({...fixture, planPath: planned.planPath});
    assert.equal(applied.status, 'GO');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    )), true);
    assert.equal(verifyAutomation(fixture).status, 'GO');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation'
    )), false);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation.lock'
    )), false);
});

test('inspects absent Core and adapter automation as createable', (t) => {
    const fixture = makeFixture(t);

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report), [
        'schemaVersion', 'command', 'status', 'disposition', 'providers', 'checks',
    ]);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'automation inspect');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'CREATE');
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-repository-automation',
        'php-web-quality',
    ]);
    assert.deepEqual(report.providers[0].outputs[0], {
        path: '.github/workflows/back-merge.yml',
        disposition: 'CREATE',
        owner: '@kyaulabs/prism-core',
    });
});

test('inspects owned legacy automation as migratable', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, [
        '# prism-managed: @kyaulabs/prism-core',
        '# prism-automation-schema: 0',
        'name: Legacy back-merge',
        '',
    ].join('\n'));

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'MIGRATE');
    assert.equal(report.providers[0].outputs[0].disposition, 'MIGRATE');
});

test('inspects drifted owned automation as migratable', (t) => {
    const fixture = makeFixture(t);
    installCanonicalAutomation(fixture);
    fs.appendFileSync(
        path.join(fixture.projectRoot, '.github', 'workflows', 'back-merge.yml'),
        '# changed\n'
    );

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'MIGRATE');
    assert.equal(report.providers[0].outputs[0].disposition, 'MIGRATE');
});

test('rejects an unowned automation collision', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, 'name: Human workflow\n');

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'CONFLICT');
    assert.deepEqual(report.providers[0].outputs[0], {
        path: '.github/workflows/back-merge.yml',
        disposition: 'CONFLICT',
        owner: null,
    });
});

test('fails closed when no trusted automation adapter is active', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], {
        projectRoot,
        coreRoot: CORE_ROOT,
    }));

    assert.equal(result.status, 5);
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'automation inspect',
        status: 'NO-GO',
        disposition: 'CONFLICT',
        providers: [],
        checks: [{
            id: 'automation-inspect',
            status: 'FAIL',
            message: 'automation inspect failed',
        }],
    });
});

test('inspects canonical automation as current', (t) => {
    const fixture = makeFixture(t);
    installCanonicalAutomation(fixture);

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'CURRENT');
    assert.equal(report.providers.every(({outputs}) =>
        outputs.every(({disposition}) => disposition === 'CURRENT')
    ), true);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
