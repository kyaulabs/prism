// $KYAULabs: prism-review-e2e.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

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

function writeAuthorityPreload(target, coreRoot, externalAdapter) {
    const source = `'use strict';
const Module = require('node:module');
const fs = require('node:fs');
const crypto = require('node:crypto');
const original = Module._load;
const sessionTarget = ${JSON.stringify(path.join(coreRoot, 'scripts/prism-review/session-runner.js'))};
const qualityTarget = ${JSON.stringify(path.join(coreRoot, 'scripts/prism-review/quality-provider.js'))};
const coreQualityTarget = ${JSON.stringify(path.join(coreRoot, 'scripts/prism-review/core-quality.js'))};
const externalAdapter = ${JSON.stringify(externalAdapter)};
const qualityOriginal = require(qualityTarget);
const coreQualityOriginal = require(coreQualityTarget);
const coreManifest = require(${JSON.stringify(path.join(coreRoot, 'package.json'))});
const emptyDigest = crypto.createHash('sha256').update('').digest('hex');
function gate(id) {
    return {id, status: 'PASS', command: ['fixture', id], tools: [],
        stdout: {bytes: 0, sha256: emptyDigest}, stderr: {bytes: 0, sha256: emptyDigest}, artifacts: []};
}
async function expose(request) {
    const tools = Object.fromEntries(request.tools.map((tool) => [tool.name, tool]));
    if (Object.keys(tools).some((name) => !['read_file', 'read_diff', 'read_criteria'].includes(name))) {
        throw new Error('invented tool');
    }
    for (const entry of request.snapshot.entries) {
        if (entry.kind !== 'text') continue;
        for (const side of entry.requiredSides) {
            const total = side === 'base' ? entry.baseBytes : entry.headBytes;
            let offset = 0;
            while (offset < total) {
                const value = await tools.read_file.execute('fixture-read', {
                    entryDigest: entry.entryDigest, side, offset, limit: Math.min(7, total - offset),
                });
                offset = value.nextOffset;
            }
        }
        let offset = 0;
        while (offset < entry.diffBytes) {
            const value = await tools.read_diff.execute('fixture-diff', {
                entryDigest: entry.entryDigest, offset, limit: Math.min(11, entry.diffBytes - offset),
            });
            offset = value.nextOffset;
        }
    }
    for (const criteria of request.evidence.criteria?.sources ?? []) {
        let offset = 0;
        while (offset < criteria.byteCount) {
            const value = await tools.read_criteria.execute('fixture-criteria', {
                sourceDigest: criteria.sha256, offset, limit: Math.min(5, criteria.byteCount - offset),
            });
            offset = value.nextOffset;
        }
    }
}
const sessionFacade = {
    async resolveActiveModel() {
        return {metadata: {provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN'},
            model: {provider: 'fixture-provider', id: 'fixture-model', reasoning: true,
                contextWindow: 200000}, modelRuntime: {}, sdk: {}};
    },
    async inspectIsolatedRuntime() {
        return {provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN'};
    },
    async runIsolatedSession(request) {
        fs.appendFileSync(process.env.PRISM_TEST_SESSION_COUNT, request.sessionType + '\\n');
        await expose(request);
        const model = {provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN'};
        if (request.sessionType === 'verifier') {
            return {ok: true, model, submission: {schemaVersion: 1,
                dispositions: request.findings.map(({fingerprint}) => ({fingerprint,
                    disposition: 'CONFIRMED', rationale: 'The fixture confirms this finding.', duplicateOf: null}))}};
        }
        if (request.sessionType === 'closure-verifier') {
            return {ok: true, model, submission: {schemaVersion: 1,
                dispositions: request.evidence.repair.proposals.map(({fingerprint}) => ({fingerprint,
                    disposition: 'CONFIRMED', rationale: 'The fixture confirms the repair.'}))}};
        }
        const findings = [];
        if (process.env.PRISM_TEST_BLOCKING === '1' && request.axis === 'tooling-style') {
            const entry = request.snapshot.entries.find((candidate) => candidate.kind === 'text');
            const line = entry.hunks[0].newStart;
            findings.push({axis: request.axis, lensId: request.lenses[0].id, classification: 'BLOCKING',
                path: entry.newPath, side: 'head', line, summary: 'The fixture change is blocked.',
                evidence: entry.headText.split('\\n')[line - 1],
                causality: 'The reviewed change directly introduces this line.',
                relevance: 'The finding is limited to the reviewed fixture delta.',
                workflowImpact: 'The fixture cannot pass authority review.'});
        }
        return {ok: true, model, submission: {schemaVersion: 1, axis: request.axis,
            outcome: findings.length === 0 ? 'PASS' : 'BLOCKING',
            lenses: request.lenses.map(({id}) => ({id, status: 'COMPLETE'})), findings, notes: []}};
    },
};
const qualityFacade = {...qualityOriginal,
    resolveQualityProvider(options) {
        const resolved = qualityOriginal.resolveQualityProvider({...options,
            resolvePackage: () => externalAdapter});
        return {...resolved, async run() {
            return {schemaVersion: 1, provider: {id: resolved.identity.id,
                packageName: resolved.identity.packageName, packageVersion: resolved.identity.packageVersion,
                protocolVersion: resolved.identity.protocolVersion}, status: 'PASS',
                gates: resolved.identity.gates.map(gate)};
        }};
    },
};
const coreQualityFacade = {...coreQualityOriginal,
    async runCoreQuality() {
        return {schemaVersion: 1, core: {packageName: coreManifest.name,
            packageVersion: coreManifest.version}, status: 'PASS',
            gates: coreQualityOriginal.CORE_GATE_IDS.map(gate)};
    },
};
Module._load = function (request, parent, isMain) {
    let resolved;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { resolved = null; }
    if (resolved === sessionTarget) return sessionFacade;
    if (resolved === qualityTarget) return qualityFacade;
    if (resolved === coreQualityTarget) return coreQualityFacade;
    return original.apply(this, arguments);
};
const entry = ${JSON.stringify(path.join(coreRoot, 'scripts/prism-review.js'))};
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

test('proves packaged criteria, check, initial, reuse, repair, and preflight authority', (t) => {
    fs.rmSync(WORK_ROOT, {recursive: true, force: true});
    fs.mkdirSync(WORK_ROOT, {recursive: true});
    t.after(cleanupWorkRoot);
    const packed = path.join(WORK_ROOT, 'authority-packed');
    const core = packAndExtract(path.join(ROOT, 'packages/prism-core'), packed, 'authority-core');
    const adapter = packAndExtract(path.join(ROOT, 'packages/prism-php-web'), packed, 'authority-adapter');
    const externalAdapter = path.join(core.root, 'node_modules/@kyaulabs/prism-php-web');
    fs.mkdirSync(path.dirname(externalAdapter), {recursive: true});
    fs.cpSync(adapter.root, externalAdapter, {recursive: true});
    const preload = path.join(WORK_ROOT, 'authority-preload.cjs');
    const sessionCount = path.join(WORK_ROOT, 'session-count');
    fs.writeFileSync(sessionCount, '');
    writeAuthorityPreload(preload, core.root, externalAdapter);

    const makeFixture = (name) => {
        const fixture = path.join(WORK_ROOT, name);
        const localAdapter = path.join(fixture, 'packages/prism-php-web');
        fs.mkdirSync(path.dirname(localAdapter), {recursive: true});
        fs.cpSync(adapter.root, localAdapter, {recursive: true});
        fs.mkdirSync(path.join(fixture, '.pi'), {recursive: true});
        fs.writeFileSync(path.join(fixture, '.pi/settings.json'), `${JSON.stringify({
            skills: [path.join(localAdapter, 'skills')],
        })}\n`);
        fs.writeFileSync(path.join(fixture, '.gitignore'), '.pi/\n');
        fs.writeFileSync(path.join(fixture, 'criteria.md'), '# Approved fixture criteria\n');
        fs.mkdirSync(path.join(fixture, 'tests/Node'), {recursive: true});
        fs.writeFileSync(path.join(fixture, 'tests/Node/fixture.test.js'), 'fixture test evidence\n');
        fs.writeFileSync(path.join(fixture, 'review.js'), 'module.exports = "base";\n');
        git(fixture, ['init', '-q']);
        git(fixture, ['config', 'user.email', 'fixture@example.test']);
        git(fixture, ['config', 'user.name', 'Fixture']);
        git(fixture, ['add', '-A']);
        git(fixture, ['commit', '-q', '-m', 'base']);
        const base = git(fixture, ['rev-parse', 'HEAD']);
        git(fixture, ['update-ref', 'refs/remotes/origin/develop', base]);
        git(fixture, ['switch', '-q', '-c', `feat/tester-abcd-${name}`]);
        fs.writeFileSync(path.join(fixture, 'review.js'), 'module.exports = "changed";\n');
        git(fixture, ['commit', '-qam', 'change']);
        return {base, fixture};
    };
    const env = {PRISM_TEST_SESSION_COUNT: sessionCount};
    const passFixture = makeFixture('authority-pass');
    const {discoverOptionalAdapter} = require(path.join(core.root, 'scripts/prism-tool/discovery.js'));
    const {resolveQualityProvider} = require(path.join(core.root, 'scripts/prism-review/quality-provider.js'));
    const registration = discoverOptionalAdapter({projectRoot: passFixture.fixture,
        piDir: path.join(passFixture.fixture, '.pi')});
    const provider = resolveQualityProvider({repositoryRoot: passFixture.fixture, coreRoot: core.root,
        protectedBase: passFixture.base, registration, resolvePackage: () => externalAdapter});
    assert.equal(provider.identity.sourceClass, 'INSTALLED_EXTERNAL');
    const criteria = runReview(core.root, passFixture.fixture, preload, [
        'criteria', 'record', '--source', `SPEC:${passFixture.base}:criteria.md`, '--json',
    ], env);
    assert.equal(criteria.status, 0);
    assert.equal(criteria.report.receiptDigest.length, 64);
    const doctor = runReview(core.root, passFixture.fixture, preload, ['doctor', '--json'], env);
    assert.equal(doctor.status, 0);
    assert.equal(doctor.report.sourceClass, 'INSTALLED_EXTERNAL');
    assert.equal(doctor.report.eligibleForAuthority, true);
    assert.equal(doctor.report.authority.core.packageVersion, '0.4.3');
    assert.equal(doctor.report.authority.adapter.protected.packageName, '@kyaulabs/prism-php-web');
    assert.equal(doctor.report.authority.adapter.provider.id, 'php-web-quality');
    assert.equal(doctor.report.authority.adapter.provider.protocolVersion, 1);
    assert.equal(doctor.report.model.authentication, 'UNKNOWN');
    const check = runReview(core.root, passFixture.fixture, preload,
        ['check', '--base-ref', 'origin/develop', '--json'], env);
    assert.equal(check.status, 0);
    const initial = runReview(core.root, passFixture.fixture, preload,
        ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'], env);
    assert.equal(initial.status, 0);
    assert.equal(initial.report.version, 2);
    const callsBeforeReuse = fs.readFileSync(sessionCount, 'utf8').trim().split('\n').filter(Boolean).length;
    const reused = runReview(core.root, passFixture.fixture, preload,
        ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'], env);
    const callsAfterReuse = fs.readFileSync(sessionCount, 'utf8').trim().split('\n').filter(Boolean).length;
    assert.equal(reused.status, 0);
    assert.equal(callsAfterReuse, callsBeforeReuse);
    const preflight = spawnSync(process.execPath, [
        path.join(core.root, 'scripts/prism-tool.js'), 'pr', 'preflight',
    ], {cwd: passFixture.fixture, encoding: 'utf8', env: {
        ...process.env,
        NODE_PATH: path.join(ROOT, 'node_modules'),
        PATH: `${path.join(ROOT, 'tests/Shell/fixtures/bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    }});
    assert.equal(preflight.status, 0, preflight.stderr);
    assert.match(preflight.stdout, /REVIEW_CHAIN_VERSION\t2/);

    const blockedFixture = makeFixture('authority-repair');
    runReview(core.root, blockedFixture.fixture, preload, [
        'criteria', 'record', '--source', `SPEC:${blockedFixture.base}:criteria.md`, '--json',
    ], env);
    runReview(core.root, blockedFixture.fixture, preload,
        ['check', '--base-ref', 'origin/develop', '--json'], env);
    const blocked = runReview(core.root, blockedFixture.fixture, preload,
        ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'],
        {...env, PRISM_TEST_BLOCKING: '1'});
    assert.equal(blocked.status, 4);
    assert.equal(blocked.report.outcome, 'BLOCKING');
    const chainPath = path.join(blockedFixture.fixture,
        '.pi/prism-tool/code-review/review-chain.json');
    const blockedChain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    const fingerprint = blockedChain.openBlocking[0];
    fs.writeFileSync(path.join(blockedFixture.fixture, 'review.js'), 'module.exports = "repaired";\n');
    git(blockedFixture.fixture, ['commit', '-qam', 'repair']);
    runReview(core.root, blockedFixture.fixture, preload,
        ['check', '--base-ref', 'origin/develop', '--json'], env);
    const closurePath = path.join(blockedFixture.fixture, '.pi/closures.json');
    fs.writeFileSync(closurePath, JSON.stringify({schemaVersion: 1, closures: [{fingerprint,
        evidence: 'The repaired fixture now passes.',
        tests: [{path: 'tests/Node/fixture.test.js', gateId: 'php-web.node-tests'}]}]}));
    const repair = runReview(core.root, blockedFixture.fixture, preload, [
        'review', 'repair', '--base-ref', 'origin/develop', '--closures', '.pi/closures.json', '--json',
    ], env);
    assert.equal(repair.status, 0);
    const repairedChain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
    assert.deepEqual(repairedChain.openBlocking, []);
    assert.equal(repairedChain.segments.length, 2);

    for (const fixture of [passFixture.fixture, blockedFixture.fixture]) {
        const records = [];
        for (const name of ['criteria.json', 'check.json', 'review-chain.json']) {
            const recordPath = path.join(fixture, '.pi/prism-tool/code-review', name);
            assert.equal(fs.statSync(recordPath).mode & 0o777, 0o600);
            records.push(fs.readFileSync(recordPath, 'utf8'));
        }
        assert.equal(fs.existsSync(path.join(fixture, '.pi/prism-review')), false);
        assert.doesNotMatch(records.join('\n'),
            /Approved fixture criteria|fixture test evidence|FAKE_TRANSCRIPT/);
    }
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
