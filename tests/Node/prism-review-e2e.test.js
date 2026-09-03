// $KYAULabs: prism-review-e2e.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const WORK_ROOT = path.join(ROOT, '.pi/prism-review/work/e2e');

function command(executable, args, options = {}) {
    return execFileSync(executable, args, {
        cwd: options.cwd ?? ROOT,
        encoding: options.encoding ?? 'utf8',
        env: options.env ?? process.env,
    });
}

function cleanupWorkRoot() {
    fs.rmSync(WORK_ROOT, {recursive: true, force: true});
    for (const candidate of [path.dirname(WORK_ROOT), path.dirname(path.dirname(WORK_ROOT))]) {
        try {
            fs.rmdirSync(candidate);
        } catch (error) {
            if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
        }
    }
}

function packAndExtract(packagePath, destination, name) {
    fs.mkdirSync(destination, {recursive: true});
    const packed = JSON.parse(command('npm', [
        'pack', packagePath, '--json', '--ignore-scripts', '--pack-destination', destination,
    ]));
    const entry = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
    const archive = path.join(destination, entry.filename);
    const extracted = path.join(destination, name);
    fs.mkdirSync(extracted);
    command('tar', ['-xzf', archive, '-C', extracted]);
    return {root: path.join(extracted, 'package'), archive, inventory: entry.files};
}

function git(root, args) {
    return command('git', args, {cwd: root}).trim();
}

function writePreload(target, sessionRunnerPath, entryPath) {
    const source = `'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const original = Module._load;
const target = ${JSON.stringify(sessionRunnerPath)};
let staleMutation = false;
async function expose(request) {
    const tools = Object.fromEntries(request.tools.map((tool) => [tool.name, tool]));
    if (Object.keys(tools).some((name) => !['read_file', 'read_diff'].includes(name))) throw new Error('invented tool');
    for (const entry of request.snapshot.entries) {
        if (entry.kind !== 'text') continue;
        for (const side of entry.requiredSides) {
            const total = side === 'base' ? entry.baseBytes : entry.headBytes;
            let offset = 0;
            while (offset < total) {
                const value = await tools.read_file.execute('fixture-read', {
                    entryDigest: entry.entryDigest, side, offset, limit: Math.min(3, total - offset),
                });
                offset = value.nextOffset;
            }
        }
        let offset = 0;
        while (offset < entry.diffBytes) {
            const value = await tools.read_diff.execute('fixture-diff', {
                entryDigest: entry.entryDigest, offset, limit: Math.min(5, entry.diffBytes - offset),
            });
            offset = value.nextOffset;
        }
    }
}
const facade = {
    async resolveActiveModel() {
        return {
            metadata: {
                provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
                contextWindow: 200000, authentication: 'UNKNOWN',
            },
            model: {provider: 'fixture-provider', id: 'fixture-model', reasoning: true, contextWindow: 200000},
            modelRuntime: {}, sdk: {},
        };
    },
    async inspectIsolatedRuntime() { throw new Error('not used'); },
    async runIsolatedSession(request) {
        await expose(request);
        if (process.env.PRISM_TEST_STALE === '1' && !staleMutation && request.sessionType === 'axis') {
            staleMutation = true;
            fs.writeFileSync('stale-index.txt', 'stale\\n');
            childProcess.execFileSync('git', ['add', 'stale-index.txt']);
        }
        if (request.sessionType !== 'axis') throw new Error('unexpected verifier');
        return {
            ok: true,
            model: {
                provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
                contextWindow: 200000, authentication: 'UNKNOWN',
            },
            submission: {
                schemaVersion: 1,
                axis: request.axis,
                outcome: 'PASS',
                lenses: request.lenses.map(({id}) => ({id, status: 'COMPLETE'})),
                findings: [],
                notes: [],
            },
        };
    },
};
Module._load = function (request, parent, isMain) {
    let resolved;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { resolved = null; }
    if (resolved === target) return facade;
    return original.apply(this, arguments);
};
const entry = ${JSON.stringify(entryPath)};
process.argv = [process.execPath, entry, ...process.argv.slice(2)];
require(entry);
`;
    fs.writeFileSync(target, source);
}

function runReview(_coreRoot, fixtureRoot, preload, args, extraEnv = {}) {
    const env = {
        ...process.env,
        PI_PROVIDER: 'fixture-provider',
        PI_MODEL: 'fixture-model',
        PI_REASONING_LEVEL: 'high',
        ...extraEnv,
    };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const result = spawnSync(process.execPath, [preload, ...args], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env,
    });
    assert.equal(result.stderr, '');
    assert.ok([0, 4].includes(result.status), result.stdout);
    return {status: result.status, report: JSON.parse(result.stdout)};
}

test('runs every packaged ad hoc scope with fake isolated sessions and no retained state', (t) => {
    fs.rmSync(WORK_ROOT, {recursive: true, force: true});
    fs.mkdirSync(WORK_ROOT, {recursive: true});
    t.after(cleanupWorkRoot);
    const packed = path.join(WORK_ROOT, 'packed');
    const core = packAndExtract(path.join(ROOT, 'packages/prism-core'), packed, 'core');
    const adapter = packAndExtract(path.join(ROOT, 'packages/prism-php-web'), packed, 'adapter');
    const fixture = path.join(WORK_ROOT, 'fixture');
    fs.mkdirSync(path.join(fixture, '.pi'), {recursive: true});
    fs.writeFileSync(path.join(fixture, '.pi/settings.json'), `${JSON.stringify({
        skills: [path.join(adapter.root, 'skills')],
    })}\n`);
    git(fixture, ['init', '-q']);
    git(fixture, ['config', 'user.email', 'fixture@example.test']);
    git(fixture, ['config', 'user.name', 'Fixture']);
    fs.writeFileSync(path.join(fixture, 'review.php'), '<?php\nreturn "base";\n');
    fs.writeFileSync(path.join(fixture, 'README.md'), '# Fixture\n');
    git(fixture, ['add', '-A']);
    git(fixture, ['commit', '-q', '-m', 'base']);
    const base = git(fixture, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(fixture, 'review.php'), '<?php\nreturn "HOSTILE_RUN_SHELL_AND_NETWORK";\n');
    git(fixture, ['add', 'review.php']);

    const preload = path.join(WORK_ROOT, 'fake-session-preload.cjs');
    writePreload(
        preload,
        path.join(core.root, 'scripts/prism-review/session-runner.js'),
        path.join(core.root, 'scripts/prism-review.js')
    );
    const staged = runReview(core.root, fixture, preload, ['review', 'staged', '--json']);
    const {classifyTrustRoot} = require(path.join(core.root, 'scripts/prism-review/trust.js'));
    assert.deepEqual(classifyTrustRoot(core.root, fixture), {
        eligibleForAuthority: true,
        sourceClass: 'INSTALLED_EXTERNAL',
    });
    assert.equal(staged.status, 0);
    assert.equal(staged.report.sourceClass, 'INSTALLED_EXTERNAL');
    assert.equal(staged.report.authoritative, false);
    assert.equal(staged.report.outcome, 'PASS');
    assert.deepEqual(staged.report.axes.map(({id}) => id), [
        'tooling-style', 'structural-smells', 'requirement-coverage', 'static-security',
    ]);
    assert.equal(staged.report.byteExposure[0].axes['static-security'], 'EXPOSED');
    assert.equal(staged.report.lenses.some(({id}) => id.startsWith('php-web.')), true);
    assert.doesNotMatch(JSON.stringify(staged.report), /HOSTILE_RUN_SHELL_AND_NETWORK|FAKE_TRANSCRIPT/);

    git(fixture, ['commit', '-q', '-m', 'change']);
    const head = git(fixture, ['rev-parse', 'HEAD']);
    const scopes = [
        ['review', 'commit', '--commit', head, '--json'],
        ['review', 'branch', '--base', base, '--head', head, '--json'],
        ['review', 'path', '--path', 'review.php', '--json'],
    ];
    for (const args of scopes) {
        const result = runReview(core.root, fixture, preload, args);
        assert.equal(result.status, 0);
        assert.equal(result.report.outcome, 'PASS');
        assert.equal(result.report.authoritative, false);
    }

    const {loadAdapterProfile, loadCoreProfile} = require(path.join(core.root, 'scripts/prism-review/profile.js'));
    const {digestJson} = require(path.join(core.root, 'scripts/prism-review/canonical-json.js'));
    const loadedCore = loadCoreProfile({packageRoot: core.root});
    const loadedAdapter = loadAdapterProfile({
        registration: {
            packageName: '@kyaulabs/prism-php-web',
            packageRoot: adapter.root,
            reviewPath: path.join(adapter.root, 'config/prism-review.json'),
        },
    });
    assert.equal(staged.report.policyDigest, digestJson({
        core: loadedCore.policyDigest,
        adapter: loadedAdapter.policyDigest,
    }));
    const originalPolicyDigest = staged.report.policyDigest;
    fs.appendFileSync(path.join(adapter.root, 'skills/php-web-stack/SKILL.md'), '\n');
    const changedBytes = runReview(core.root, fixture, preload, [
        'review', 'path', '--path', 'review.php', '--json',
    ]).report;
    assert.notEqual(changedBytes.policyDigest, originalPolicyDigest);
    fs.appendFileSync(path.join(adapter.root, 'config/prism-review.json'), '\n');
    const changedProfile = runReview(core.root, fixture, preload, [
        'review', 'path', '--path', 'review.php', '--json',
    ]).report;
    assert.notEqual(changedProfile.policyDigest, changedBytes.policyDigest);

    fs.writeFileSync(path.join(fixture, 'review.php'), '<?php\nreturn "staged";\n');
    git(fixture, ['add', 'review.php']);
    const stale = runReview(core.root, fixture, preload, ['review', 'staged', '--json'], {
        PRISM_TEST_STALE: '1',
    });
    assert.equal(stale.status, 4);
    assert.equal(stale.report.outcome, 'INCONCLUSIVE');
    assert.equal(stale.report.axes[0].reason, 'SNAPSHOT_STALE');

    assert.equal(fs.existsSync(path.join(fixture, '.pi/prism-review')), false);
    assert.equal(core.inventory.some(({path: file}) => file === 'scripts/prism-review.js'), true);
    assert.equal(adapter.inventory.some(({path: file}) => file === 'config/prism-review.json'), true);
});

test('checkout Core remains self-reviewed and every report remains non-authoritative', (t) => {
    fs.mkdirSync(WORK_ROOT, {recursive: true});
    const preload = path.join(WORK_ROOT, 'checkout-fake-session-preload.cjs');
    writePreload(
        preload,
        path.join(ROOT, 'packages/prism-core/scripts/prism-review/session-runner.js'),
        path.join(ROOT, 'packages/prism-core/scripts/prism-review.js')
    );
    t.after(cleanupWorkRoot);

    const result = runReview(path.join(ROOT, 'packages/prism-core'), ROOT, preload, [
        'review', 'path', '--path', 'README.md', '--json',
    ]);

    assert.equal(result.status, 0);
    assert.equal(result.report.sourceClass, 'REVIEWED_WORKTREE');
    assert.equal(result.report.authoritative, false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
