// $KYAULabs: prism-tool-run.test.js git@aura.kyaulabs 2026/08/13 -0700 Exp $



'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');

const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'packages/prism-core/scripts/prism-tool.js');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {extractVersion, runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');

const corePackage = require('../../packages/prism-core/package.json');
const rootPackage = require('../../package.json');

async function captureWrites(action) {
	const stdout = [];
	const stderr = [];
	const originalStdout = process.stdout.write;
	const originalStderr = process.stderr.write;
	process.stdout.write = (chunk) => {
		stdout.push(String(chunk));
		return true;
	};
	process.stderr.write = (chunk) => {
		stderr.push(String(chunk));
		return true;
	};
	try {
		return {status: await action(), stderr: stderr.join(''), stdout: stdout.join('')};
	} finally {
		process.stdout.write = originalStdout;
		process.stderr.write = originalStderr;
	}
}

function writeBundledFixture(directory, options) {
	const contractPackage = options.contractPackage ?? '@kyaulabs/fixture-core';
	const rootPackageName = options.rootPackageName ?? contractPackage;
	const declaredVersion = options.declaredVersion ?? '1.0.0';
	const installedVersion = options.installedVersion ?? declaredVersion;
	writeJson(path.join(directory, 'package.json'), {
		name: rootPackageName,
		dependencies: {[options.packageName]: declaredVersion},
	});
	writeJson(path.join(directory, 'toolchain.json'), {
		schemaVersion: 1,
		package: contractPackage,
		role: 'core',
		components: [{
			id: options.id,
			kind: 'command',
			ecosystem: 'npm',
			package: options.packageName,
			version: declaredVersion,
			provisioning: 'bundled',
			authentication: 'none',
			executable: options.id,
			versionArguments: ['--version'],
			argumentPolicy: {mode: 'passthrough'},
		}],
	});
	const packageRoot = path.join(directory, 'node_modules', options.packageName);
	writeJson(path.join(packageRoot, 'package.json'), {
		name: options.packageName,
		version: installedVersion,
		bin: {[options.id]: 'cli.js'},
	});
	const executable = path.join(packageRoot, 'cli.js');
	fs.writeFileSync(executable, `#!${process.execPath}\n${options.source}`, {mode: 0o755});
	fs.chmodSync(executable, 0o755);
}

test('registers the Node test suite in the source checkout', () => {
	assert.equal(rootPackage.scripts?.['test:node'], 'node --test tests/Node/*.test.js');
});

test('publishes an executable prism-tool bin with its core config', () => {
	assert.deepEqual(corePackage.bin, {'prism-tool': 'scripts/prism-tool.js'});
	assert.equal(corePackage.files.includes('config'), true);
	assert.equal(fs.statSync(cli).mode & 0o111, 0o111);
});

test('runs bundled git-cliff from an unrelated working directory', (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));

	const result = spawnSync(
		process.execPath,
		[cli, 'run', 'git-cliff', '--', '--version'],
		{cwd: directory, encoding: 'utf8'}
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /git-cliff 2\.13\.1/);
});

test('applies the core commit policy outside the Prism checkout', (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	assert.equal(spawnSync('git', ['init', '--quiet'], {cwd: directory}).status, 0);
	const message = path.join(directory, 'message.txt');
	fs.writeFileSync(
		message,
		'feat: missing implementation attribution\n\nAuthored-by: model\nTested-by: model\nSigned-off-by: user <user@example.com>\n'
	);

	const result = spawnSync(
		process.execPath,
		[cli, 'run', 'commitlint', '--', '--edit', message],
		{cwd: directory, encoding: 'utf8'}
	);

	assert.equal(result.status, 4);
	assert.match(result.stdout + result.stderr, /Implemented-by/);
});

test('rejects undeclared, library, malformed, and policy-bypassing runs', () => {
	const invocations = [
		['run', 'missing', '--'],
		['run', 'commitlint-config-conventional', '--'],
		['run', 'ocr', '--', 'config'],
		['run', 'git-cliff', '--version'],
	];

	for (const invocation of invocations) {
		const result = spawnSync(process.execPath, [cli, ...invocation], {encoding: 'utf8'});
		assert.equal(result.status, 2, `${invocation.join(' ')}: ${result.stderr}`);
	}
});

test('extracts one exact version and reports subprocess timeout', () => {
	assert.equal(extractVersion('@commitlint/cli@21.2.2'), '21.2.2');
	assert.equal(extractVersion('versions 1.2.3 and 2.0.0'), null);
	assert.equal(extractVersion('no version'), null);

	const result = runBounded(
		process.execPath,
		['-e', 'setTimeout(() => {}, 1000)'],
		{timeout: 20}
	);
	assert.equal(result.timedOut, true);
	assert.notEqual(result.error, undefined);
});

test('rejects commitlint configuration overrides', (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	assert.equal(spawnSync('git', ['init', '--quiet'], {cwd: directory}).status, 0);
	const message = path.join(directory, 'message.txt');
	fs.writeFileSync(
		message,
		'feat: valid attribution\n\nAuthored-by: model\nImplemented-by: model\nTested-by: model\nSigned-off-by: user <user@example.com>\n'
	);

	const result = spawnSync(
		process.execPath,
		[cli, 'run', 'commitlint', '--', `--config=${path.join(directory, 'other.js')}`, '--edit', message],
		{cwd: directory, encoding: 'utf8'}
	);

	assert.equal(result.status, 2);
	assert.match(result.stderr, /config override is not allowed/);
});

test('rejects contract and package manifest drift before execution', async (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const marker = path.join(directory, 'executed');
	writeBundledFixture(directory, {
		id: 'fixture',
		packageName: 'fixture',
		rootPackageName: '@kyaulabs/different-core',
		source: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes');\n`,
	});

	const result = await captureWrites(() => main(['run', 'fixture', '--'], {
		coreRoot: directory,
		input: '',
	}));

	assert.equal(result.status, 2);
	assert.match(result.stderr, /invalid core toolchain contract/);
	assert.equal(fs.existsSync(marker), false);
});

test('rejects a bundled package version that differs from its contract', async (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const marker = path.join(directory, 'executed');
	writeBundledFixture(directory, {
		id: 'fixture',
		packageName: 'fixture',
		installedVersion: '2.0.0',
		source: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes');\n`,
	});

	const result = await captureWrites(() => main(['run', 'fixture', '--'], {
		coreRoot: directory,
		input: '',
	}));

	assert.equal(result.status, 4);
	assert.match(result.stderr, /bundled tool is unavailable/);
	assert.equal(fs.existsSync(marker), false);
});

test('fails closed without relaying output that exceeds the bound', async (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	writeBundledFixture(directory, {
		id: 'noisy',
		packageName: 'noisy',
		source: "process.stdout.write('x'.repeat(1048577));\n",
	});

	const result = await captureWrites(() => main(['run', 'noisy', '--'], {
		coreRoot: directory,
		input: '',
		maxBuffer: 1024,
		timeout: 1000,
	}));

	assert.equal(result.status, 4);
	assert.equal(result.stdout, '');
	assert.match(result.stderr, /tool output or process failure/);
});

test('enforces stdin and execution timeout bounds', async (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const marker = path.join(directory, 'executed');
	writeBundledFixture(directory, {
		id: 'bounded',
		packageName: 'bounded',
		source: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes');\nsetTimeout(() => {}, 1000);\n`,
	});

	const oversized = await captureWrites(() => main(['run', 'bounded', '--'], {
		coreRoot: directory,
		input: '12345',
		inputLimit: 4,
	}));
	assert.equal(oversized.status, 2);
	assert.match(oversized.stderr, /stdin exceeds limit/);
	assert.equal(fs.existsSync(marker), false);

	const timedOut = await captureWrites(() => main(['run', 'bounded', '--'], {
		coreRoot: directory,
		input: '',
		timeout: 20,
	}));
	assert.equal(timedOut.status, 4);
	assert.match(timedOut.stderr, /tool timeout/);
});

test('forwards bounded stdin and arguments as inert data', async (t) => {
	const directory = makeTempDir();
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	writeBundledFixture(directory, {
		id: 'echo-input',
		packageName: 'echo-input',
		source: "let input = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (chunk) => { input += chunk; });\nprocess.stdin.on('end', () => process.stdout.write(JSON.stringify({args: process.argv.slice(2), input})));\n",
	});
	const payload = 'value with spaces;$(printf injected)\nsecond-line';
	const result = await captureWrites(() => main(['run', 'echo-input', '--', payload], {
		coreRoot: directory,
		input: 'staged content\n',
	}));

	assert.equal(result.status, 0);
	assert.deepEqual(JSON.parse(result.stdout), {
		args: [payload],
		input: 'staged content\n',
	});
});



// vim: ft=javascript sts=4 sw=4 ts=4 noet :
