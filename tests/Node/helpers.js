// $KYAULabs: helpers.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-tool-test-'));
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
}

function writeExecutable(filePath, body) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `#!/usr/bin/env bash\n${body}\n`, {mode: 0o755});
    fs.chmodSync(filePath, 0o755);
}

function writePackageJson(projectRoot, relativeDirectory, manifest) {
    const directory = relativeDirectory === '.'
        ? projectRoot
        : path.join(projectRoot, relativeDirectory);
    writeJson(path.join(directory, 'package.json'), manifest);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function createSignedAdapterSelection({
    t,
    projectRoot,
    coreRoot,
    adapterRoot,
    attemptId,
    integrity = 'sha512-BBBB',
}) {
    const coreVersion = JSON.parse(
        fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8')
    ).version;
    const adapterManifest = JSON.parse(
        fs.readFileSync(path.join(adapterRoot, 'package.json'), 'utf8')
    );
    const fixtureCoreRoot = makeTempDir();
    const cacheRoot = makeTempDir();
    t.after(() => fs.rmSync(fixtureCoreRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(cacheRoot, {recursive: true, force: true}));
    writeJson(path.join(fixtureCoreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version: coreVersion,
    });
    fs.copyFileSync(
        path.join(coreRoot, 'toolchain.json'),
        path.join(fixtureCoreRoot, 'toolchain.json')
    );
    const pair = crypto.generateKeyPairSync('ed25519');
    const publicKeyBytes = pair.publicKey.export({type: 'spki', format: 'der'});
    const trust = {
        schemaVersion: 1,
        keys: [{
            id: 'test-key',
            algorithm: 'Ed25519',
            publicKeySpki: publicKeyBytes.toString('base64'),
            sha256: sha256(publicKeyBytes),
        }],
    };
    const catalogue = {
        schemaVersion: 1,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: adapterManifest.name,
            releases: [{
                version: adapterManifest.version,
                coreRange: coreVersion,
                bootstrapProtocol: 1,
                integrity,
                publishedAt: '2026-08-26T00:00:00Z',
                status: 'ACTIVE',
            }],
        }],
    };
    const payloadBytes = Buffer.from(JSON.stringify(catalogue), 'utf8');
    const envelopeBytes = Buffer.from(JSON.stringify({
        schemaVersion: 1,
        keyId: 'test-key',
        algorithm: 'Ed25519',
        payload: payloadBytes.toString('base64'),
        signature: crypto.sign(null, payloadBytes, pair.privateKey).toString('base64'),
    }), 'utf8');
    const digest = sha256(envelopeBytes);
    const catalogueCachePath = path.join(cacheRoot, 'cache.json');
    writeJson(
        path.join(fixtureCoreRoot, 'config', 'adapter-catalogue-trust.json'),
        trust
    );
    writeJson(catalogueCachePath, {
        schemaVersion: 1,
        entries: [{
            digest,
            sequence: catalogue.sequence,
            envelope: envelopeBytes.toString('base64'),
            cachedAt: '2026-08-27T12:00:00.000Z',
        }],
    });
    return {
        digest,
        context: {
            projectRoot,
            coreRoot: fixtureCoreRoot,
            catalogueCachePath,
            catalogueTrust: trust,
            now: new Date('2026-08-27T12:00:00Z'),
            piExecutable: '/usr/bin/pi',
            randomUUID: () => attemptId,
            run() {
                const installSource = `npm:${adapterManifest.name}@${adapterManifest.version}`;
                writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
                    packages: [installSource],
                });
                writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
                    name: 'pi-extensions',
                    private: true,
                    dependencies: {[adapterManifest.name]: adapterManifest.version},
                });
                writeJson(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), {
                    name: 'pi-extensions',
                    lockfileVersion: 3,
                    packages: {
                        '': {dependencies: {[adapterManifest.name]: adapterManifest.version}},
                        [`node_modules/${adapterManifest.name}`]: {
                            version: adapterManifest.version,
                            integrity,
                        },
                    },
                });
                fs.writeFileSync(
                    path.join(projectRoot, '.pi', 'npm', '.gitignore'),
                    '*\n!.gitignore\n'
                );
                fs.cpSync(
                    adapterRoot,
                    path.join(
                        projectRoot,
                        '.pi',
                        'npm',
                        'node_modules',
                        ...adapterManifest.name.split('/')
                    ),
                    {recursive: true}
                );
                return {status: 0, stdout: '', stderr: '', error: undefined};
            },
        },
    };
}

module.exports = {
    createSignedAdapterSelection,
    makeTempDir,
    sha256,
    writeExecutable,
    writeJson,
    writePackageJson,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
