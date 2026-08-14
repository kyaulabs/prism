// $KYAULabs: toolchain-contract.test.js git@aura.kyaulabs 2026/08/13 -0700 Exp $



'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {
	assertPackageParity,
	loadContract,
	validateContract,
} = require('../../packages/prism-core/scripts/prism-tool/contract');

const root = path.resolve(__dirname, '../..');
const coreContract = path.join(root, 'packages/prism-core/toolchain.json');
const adapterContract = path.join(root, 'packages/prism-php-web/toolchain.json');

test('loads both schema-v1 package contracts', () => {
	assert.equal(loadContract(coreContract).role, 'core');
	assert.equal(loadContract(adapterContract).role, 'adapter');
});

test('rejects a component version range', () => {
	const invalid = {
		schemaVersion: 1,
		package: '@kyaulabs/example',
		role: 'core',
		components: [{
			id: 'library',
			kind: 'library',
			ecosystem: 'npm',
			package: 'library',
			version: '^1.0.0',
			provisioning: 'bundled',
			authentication: 'none',
		}],
	};

	assert.throws(() => validateContract(invalid, 'fixture.json'), /exact version/);
});

test('rejects a duplicate component id', () => {
	const component = {
		id: 'same',
		kind: 'library',
		ecosystem: 'npm',
		package: 'library',
		version: '1.0.0',
		provisioning: 'bundled',
		authentication: 'none',
	};
	const invalid = {
		schemaVersion: 1,
		package: '@kyaulabs/example',
		role: 'core',
		components: [component, {...component, package: 'other'}],
	};

	assert.throws(() => validateContract(invalid, 'fixture.json'), /duplicate component/);
});

test('requires bundled npm components to match exact package dependencies', () => {
	const contract = loadContract(coreContract);

	assert.doesNotThrow(() => {
		assertPackageParity(
			contract,
			require('../../packages/prism-core/package.json')
		);
	});
	assert.throws(
		() => assertPackageParity(contract, {
			name: '@kyaulabs/prism-core',
			dependencies: {commitlint: '^21'},
		}),
		/package dependency drift/
	);
});

test('pins every approved root npm tool exactly and drops the unowned language server', () => {
	const rootPackage = require('../../package.json');
	const expected = {
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

	const lock = require('../../package-lock.json');
	for (const [name, version] of Object.entries(expected)) {
		assert.equal(rootPackage.devDependencies[name], version);
		assert.equal(lock.packages[`node_modules/${name}`].version, version);
	}
	assert.equal(rootPackage.devDependencies['@stylelint/language-server'], undefined);
	assert.equal(lock.packages['node_modules/@stylelint/language-server'], undefined);
});

test('rejects malformed contract shapes at the boundary', () => {
	const library = {
		id: 'library',
		kind: 'library',
		ecosystem: 'npm',
		package: 'library',
		version: '1.0.0',
		provisioning: 'bundled',
		authentication: 'none',
	};
	const command = {
		...library,
		id: 'command',
		kind: 'command',
		executable: 'command',
		versionArguments: ['--version'],
		argumentPolicy: {mode: 'passthrough'},
	};
	const valid = {
		schemaVersion: 1,
		package: '@kyaulabs/example',
		role: 'core',
		components: [command],
	};
	const invalidContracts = [
		null,
		{...valid, schemaVersion: 2},
		{...valid, unknown: true},
		{...valid, role: 'worker'},
		{...valid, components: [{...command, kind: 'binary'}]},
		{...valid, components: [{...command, ecosystem: 'cargo'}]},
		{...valid, components: [{...command, provisioning: 'global'}]},
		{...valid, components: [{...command, authentication: 'token'}]},
		{...valid, components: [{...command, executable: undefined}]},
		{...valid, components: [{...library, executable: 'library'}]},
		{...valid, components: [{...command, argumentPolicy: {mode: 'first-token', allowed: []}}]},
		{...valid, components: [{...command, argumentPolicy: {mode: 'first-token', allowed: ['review now']}}]},
		{...valid, components: [{...command, provisioning: 'consumer-dev'}]},
		{...valid, browserTargets: ['chromium']},
		{
			...valid,
			role: 'adapter',
			components: [{...command, provisioning: 'consumer-dev'}],
			browserTargets: ['firefox'],
		},
	];

	for (const invalid of invalidContracts) {
		assert.throws(() => validateContract(invalid, 'fixture.json'), /fixture\.json/);
	}
});

test('loads contracts through a bounded immutable file boundary', (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const value = {
		schemaVersion: 1,
		package: '@kyaulabs/example',
		role: 'core',
		components: [{
			id: 'library',
			kind: 'library',
			ecosystem: 'npm',
			package: 'library',
			version: '1.0.0',
			provisioning: 'bundled',
			authentication: 'none',
		}],
	};
	const validPath = path.join(directory, 'valid.json');
	writeJson(validPath, value);
	const contract = loadContract(validPath);

	assert.equal(Object.isFrozen(contract), true);
	assert.equal(Object.isFrozen(contract.components), true);
	assert.equal(Object.isFrozen(contract.components[0]), true);

	const malformedPath = path.join(directory, 'malformed.json');
	fs.writeFileSync(malformedPath, '{invalid');
	assert.throws(() => loadContract(malformedPath), /malformed\.json: invalid JSON/);

	const oversizedPath = path.join(directory, 'oversized.json');
	fs.writeFileSync(oversizedPath, 'x'.repeat(1048577));
	assert.throws(() => loadContract(oversizedPath), /oversized\.json: contract exceeds 1048576 bytes/);

	const symlinkPath = path.join(directory, 'symlink.json');
	fs.symlinkSync(validPath, symlinkPath);
	assert.throws(() => loadContract(symlinkPath), /symlink\.json: symbolic links are not allowed/);
});

test('declares the exact PHP web adapter components and registration', () => {
	const contract = loadContract(adapterContract);
	const packageJson = require('../../packages/prism-php-web/package.json');
	const expected = new Map([
		['php-cs-fixer', '3.95.18'],
		['pest', '5.1.1'],
		['pest-browser', '5.0.1'],
		['sass', '1.102.0'],
		['uglify-js', '3.19.3'],
		['eslint', '10.8.1'],
		['eslint-js', '10.0.1'],
		['stylelint', '17.14.1'],
		['stylelint-config-scss', '17.0.0'],
		['playwright', '1.62.1'],
	]);

	assert.deepEqual(
		new Map(contract.components.map(({id, version}) => [id, version])),
		expected
	);
	assert.deepEqual(contract.browserTargets, ['chromium']);
	assert.deepEqual(packageJson.prism, {
		adapter: true,
		toolchain: './toolchain.json',
		handler: './scripts/prism-tool-adapter.js',
	});
});



// vim: ft=javascript sts=4 sw=4 ts=4 noet :
