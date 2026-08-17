// $KYAULabs: source-toolchain-parity.test.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const composerJson = readJson('composer.json');
const composerLock = readJson('composer.lock');
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');

const COMPOSER_CONTRACT = {
    'friendsofphp/php-cs-fixer': '3.95.18',
    'pestphp/pest': '5.1.1',
    'pestphp/pest-plugin-browser': '5.0.1',
};

const NPM_CONTRACT = {
    '@commitlint/config-conventional': '21.2.2',
    '@eslint/js': '10.0.1',
    commitlint: '21.2.2',
    eslint: '10.8.1',
    'git-cliff': '2.13.1',
    playwright: '1.62.1',
    sass: '1.102.0',
    stylelint: '17.14.1',
    'stylelint-config-standard-scss': '17.0.0',
    'uglify-js': '3.19.3',
};

function stripV(version) {
    return typeof version === 'string' ? version.replace(/^v/, '') : version;
}

test('root Composer require-dev pins the three adapter tools exactly', () => {
    for (const [name, version] of Object.entries(COMPOSER_CONTRACT)) {
        assert.equal(composerJson['require-dev'][name], version, `composer.json require-dev ${name}`);
    }
});

test('the Composer lock resolves those exact versions in packages-dev', () => {
    const locked = new Map(
        (composerLock['packages-dev'] ?? [])
            .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.version === 'string')
            .map((entry) => [entry.name, stripV(entry.version)])
    );
    for (const [name, version] of Object.entries(COMPOSER_CONTRACT)) {
        assert.equal(locked.get(name), version, `composer.lock packages-dev ${name}`);
    }
});

test('the Composer lock resolves PHPUnit 13 as the test baseline', () => {
    const phpunit = (composerLock['packages-dev'] ?? []).find(
        (entry) => entry?.name === 'phpunit/phpunit'
    );
    assert.ok(phpunit, 'phpunit/phpunit is present in packages-dev');
    assert.match(stripV(phpunit.version), /^13\./, `PHPUnit major is 13, got ${phpunit.version}`);
});

test('root npm devDependencies pin every approved tool exactly', () => {
    for (const [name, version] of Object.entries(NPM_CONTRACT)) {
        assert.equal(packageJson.devDependencies[name], version, `package.json devDependencies ${name}`);
    }
});

test('the npm lock resolves every approved direct tool at its exact version', () => {
    for (const [name, version] of Object.entries(NPM_CONTRACT)) {
        const locked = packageLock.packages?.[`node_modules/${name}`]?.version;
        assert.equal(locked, version, `package-lock packages node_modules/${name}`);
    }
});

test('the unowned language server is absent from the package and lock', () => {
    assert.equal(packageJson.devDependencies['@stylelint/language-server'], undefined);
    const hits = Object.keys(packageLock.packages ?? {}).filter(
        (key) => key.includes('language-server') || key.includes('stylelint-language')
    );
    assert.deepEqual(hits, []);
});

test('the runtime satisfies PHP 8.5 and ext-sockets', () => {
    const probe = JSON.parse(
        require('node:child_process').execFileSync('php', [
            '-r',
            "echo json_encode([PHP_MAJOR_VERSION, PHP_MINOR_VERSION, extension_loaded('sockets')]);",
        ], {encoding: 'utf8'})
    );
    assert.ok(
        probe[0] > 8 || (probe[0] === 8 && probe[1] >= 5),
        `PHP is at least 8.5, got ${probe[0]}.${probe[1]}`
    );
    assert.equal(probe[2], true, 'ext-sockets is loaded');
});


// vim: ft=javascript sts=4 sw=4 ts=4 et :
