// $KYAULabs: prism-review-sdk.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {loadSdk, validateSdkVersion, validateSdkApi, requireMethods} = require('../../packages/prism-core/scripts/prism-review/sdk');
const {readinessError, diagnostic, atStage, atStageAsync} = require('../../packages/prism-core/scripts/prism-review/readiness');

test('admits stable SDK versions within the inclusive supported interval', () => {
    for (const version of ['0.84.1', '0.85.1', '0.86.0', '1.0.0', '5.0.0', '5.0.0+build.1']) {
        assert.equal(validateSdkVersion(version), version);
    }
});

test('rejects malformed, prerelease, and out-of-range SDK versions', () => {
    for (const version of ['0.84.0', '5.0.1', '6.0.0', '0.85.1-beta.1', 'garbage', null, '01.0.0', 'v0.85.1']) {
        assert.throws(() => validateSdkVersion(version), error => diagnostic(error).reason === 'SDK_VERSION_UNSUPPORTED');
    }
});

test('only branded failures supply trusted diagnostics', () => {
    assert.deepEqual(diagnostic(readinessError('SDK_VERSION_UNSUPPORTED')), {
        reason: 'SDK_VERSION_UNSUPPORTED',
        remediation: 'Install a Pi SDK version within >=0.84.1 <=5.0.0 through the supported Core dependency graph.',
    });
    const forged = Object.assign(new Error('PRIVATE_CANARY'), {code: 'SDK_MISSING'});
    assert.deepEqual(diagnostic(forged), {
        reason: 'RUNTIME_READINESS_FAILED',
        remediation: 'Verify local reviewer prerequisites; no review attempt was started.',
    });
    assert.doesNotMatch(JSON.stringify(diagnostic(forged)), /PRIVATE_CANARY/);
});

test('readiness diagnostics accept only the closed stage vocabulary', () => {
    for (const code of ['SDK_MISSING', 'SDK_METADATA_INVALID', 'SDK_PROVENANCE_INVALID',
        'SDK_VERSION_UNSUPPORTED', 'SDK_API_UNSUPPORTED', 'SDK_LOAD_FAILED', 'AUTHORITY_INELIGIBLE',
        'MODEL_CONTROLS_INVALID', 'MODEL_UNAVAILABLE', 'MODEL_REASONING_UNSUPPORTED',
        'MODEL_RUNTIME_FAILED', 'RESOURCE_ISOLATION_FAILED', 'PROFILE_INVALID',
        'ADAPTER_PROVIDER_INVALID', 'RECEIPT_STATE_UNSAFE', 'CLEANUP_FAILED', 'RUNTIME_READINESS_FAILED']) {
        const report = diagnostic(readinessError(code));
        assert.equal(report.reason, code);
        assert.equal(typeof report.remediation, 'string');
        assert.ok(report.remediation.length > 0);
        assert.deepEqual(Object.keys(report).sort(), ['reason', 'remediation']);
    }
    assert.throws(() => readinessError('PRIVATE_CANARY'), /unknown readiness code/);
    assert.equal(diagnostic(null, 'PRIVATE_CANARY').reason, 'RUNTIME_READINESS_FAILED');
    assert.equal(diagnostic(null, 'SDK_MISSING').reason, 'SDK_MISSING');
});

test('stage boundaries preserve branded errors and redact arbitrary failures', async () => {
    for (const wrap of [atStage, atStageAsync]) {
        assert.equal(await wrap('PROFILE_INVALID', () => 42), 42);
        const branded = readinessError('SDK_MISSING');
        await assert.rejects(async () => wrap('PROFILE_INVALID', () => { throw branded; }), error => error === branded);
        await assert.rejects(async () => wrap('PROFILE_INVALID', () => { throw new Error('PRIVATE_CANARY'); }), error => {
            assert.equal(diagnostic(error).reason, 'PROFILE_INVALID');
            assert.doesNotMatch(JSON.stringify(diagnostic(error)), /PRIVATE_CANARY/);
            assert.equal(Object.hasOwn(error, 'cause'), false);
            return true;
        });
    }
    await assert.rejects(() => atStageAsync('SDK_LOAD_FAILED', async () => {
        throw new Error('PRIVATE_CANARY');
    }), error => diagnostic(error).reason === 'SDK_LOAD_FAILED');
});

function sdkNamespace() {
    return {
        ModelRuntime: {create() {}},
        DefaultResourceLoader: class {},
        SettingsManager: {inMemory() {}},
        SessionManager: {inMemory() {}},
        createAgentSession() {},
    };
}

test('returns an SDK providing the required public API', () => {
    const sdk = sdkNamespace();
    assert.equal(validateSdkApi(sdk), sdk);
});

test('an in-range version does not excuse absent or incompatible public APIs', () => {
    validateSdkVersion('5.0.0');
    for (const candidate of [null, {}, ...Object.keys(sdkNamespace()).map(key => {
        const sdk = sdkNamespace();
        sdk[key] = undefined;
        return sdk;
    }), {...sdkNamespace(), DefaultResourceLoader: () => ({})},
    {...sdkNamespace(), get ModelRuntime() { throw new Error('PRIVATE_CANARY'); }}]) {
        assert.throws(() => validateSdkApi(candidate), error => diagnostic(error).reason === 'SDK_API_UNSUPPORTED');
    }
});

test('returned objects must expose callable methods without throwing getters', () => {
    requireMethods({getModel() {}}, ['getModel']);
    for (const value of [null, {}, {getModel: true}, {get getModel() { throw new Error('PRIVATE_CANARY'); }}]) {
        assert.throws(() => requireMethods(value, ['getModel']), error => diagnostic(error).reason === 'SDK_API_UNSUPPORTED');
    }
});

function sdkFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-metadata-'));
    const manifest = path.join(root, 'package.json');
    const entry = path.join(root, 'dist/index.js');
    fs.mkdirSync(path.dirname(entry), {mode: 0o700});
    const write = version => fs.writeFileSync(manifest,
        JSON.stringify({name: '@earendil-works/pi-coding-agent', version}), {mode: 0o600});
    write('0.85.1');
    fs.writeFileSync(entry, 'export {};\n', {mode: 0o600});
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const namespace = sdkNamespace();
    return {root, manifest, entry, write, namespace,
        options: {resolveEntry: () => pathToFileURL(entry).href, importSdk: async () => namespace}};
}

test('valid package metadata and API evidence returns the imported SDK', async t => {
    const fixture = sdkFixture(t);
    const result = await loadSdk(fixture.options);
    assert.equal(result.version, '0.85.1');
    assert.equal(result.sdk, fixture.namespace);
});

const cases = [
    ['directory metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.unlinkSync(fixture.manifest);
        fs.mkdirSync(fixture.manifest, {mode: 0o700});
    }],
    ['nonconstructible loader after import', 'SDK_API_UNSUPPORTED', fixture => {
        fixture.namespace.DefaultResourceLoader = () => ({});
    }],
    ['missing APIs after import', 'SDK_API_UNSUPPORTED', fixture => {
        fixture.options.importSdk = async () => ({});
    }],
    ['unsupported version before import', 'SDK_VERSION_UNSUPPORTED', fixture => {
        fixture.write('5.0.1');
        fixture.options.importSdk = async () => { throw new Error('import must not run'); };
    }],
    ['dangling nearest metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.symlinkSync('absent-manifest.json', path.join(path.dirname(fixture.entry), 'package.json'));
    }],
    ['changed metadata', 'SDK_METADATA_INVALID', fixture => {
        fixture.options.importSdk = async () => { fixture.write('0.85.2'); return fixture.namespace; };
    }],
    ['reviewed SDK source', 'SDK_PROVENANCE_INVALID', fixture => {
        fixture.options.repositoryRoot = fixture.root;
        fixture.options.importSdk = async () => { throw new Error('import must not run'); };
    }],
    ['invalid utf8', 'SDK_METADATA_INVALID', fixture => {
        fs.writeFileSync(fixture.manifest, Buffer.concat([
            Buffer.from('{"name":"@earendil-works/pi-coding-agent","version":"0.85.1","extra":"'),
            Buffer.from([255]), Buffer.from('"}'),
        ]));
    }],
    ['symlink metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.renameSync(fixture.manifest, path.join(fixture.root, 'manifest-target.json'));
        fs.symlinkSync('manifest-target.json', fixture.manifest);
    }],
    ['oversized metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.writeFileSync(fixture.manifest, JSON.stringify({name: '@earendil-works/pi-coding-agent',
            version: '0.85.1', padding: 'x'.repeat(65537)}));
    }],
    ['malformed metadata', 'SDK_METADATA_INVALID', fixture => fs.writeFileSync(fixture.manifest, '{')],
    ['transitive failure', 'SDK_LOAD_FAILED', fixture => {
        fixture.options.importSdk = async () => {
            throw Object.assign(new Error('PRIVATE_CANARY'), {code: 'ERR_MODULE_NOT_FOUND'});
        };
    }],
    ['missing package', 'SDK_MISSING', fixture => {
        fixture.options.resolveEntry = () => {
            throw Object.assign(new Error('PRIVATE_CANARY'), {code: 'ERR_MODULE_NOT_FOUND'});
        };
    }],
];

for (const [name, expected, arrange] of cases) {
    test(name, async t => {
        const fixture = sdkFixture(t);
        arrange(fixture);
        await assert.rejects(() => loadSdk(fixture.options), error => {
            const report = diagnostic(error);
            assert.equal(report.reason, expected);
            assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CANARY/);
            return true;
        });
    });
}

test('bounds metadata that grows after inspection but before opening', async t => {
    const fixture = sdkFixture(t);
    const open = fs.openSync;
    let changed = false;
    t.mock.method(fs, 'openSync', (file, ...args) => {
        if (file === fixture.manifest && !changed) {
            changed = true;
            fs.writeFileSync(file, JSON.stringify({name: '@earendil-works/pi-coding-agent',
                version: '0.85.1', padding: 'x'.repeat(65537)}));
        }
        return open(file, ...args);
    });
    await assert.rejects(() => loadSdk(fixture.options), error => diagnostic(error).reason === 'SDK_METADATA_INVALID');
    assert.equal(changed, true);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
