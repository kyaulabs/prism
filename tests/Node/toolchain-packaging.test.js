// $KYAULabs: toolchain-packaging.test.js git@aura.kyaulabs 2026/08/14 -0700 Exp $


'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {writeExecutable, writeJson} = require('./helpers');

const root = path.resolve(__dirname, '../..');
const CORE_PKG = path.join(root, 'packages/prism-core');
const ADAPTER_PKG = path.join(root, 'packages/prism-php-web');
const FAKE_BIN = path.join(root, 'tests/Shell/fixtures/bin');

function packPackage(packagePath) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pack-'));
	const output = execFileSync('npm', [
		'pack', packagePath, '--json', '--ignore-scripts', '--pack-destination', dir,
	], {encoding: 'utf8'});
	const parsed = JSON.parse(output);
	const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
	const tarball = path.join(dir, entry.filename);
	const files = new Map(entry.files.map((file) => [file.path, file.mode]));
	const listing = execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'})
		.split('\n').filter(Boolean);
	return {dir, files, listing, tarball};
}

function tarPaths(packagePath, prefix) {
	return packagePath.listing
		.filter((entry) => entry.startsWith(prefix))
		.map((entry) => entry.slice(prefix.length));
}

function extractTarball(tarball, destination) {
	fs.mkdirSync(destination, {recursive: true});
	execFileSync('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1']);
	return destination;
}

function captureWrites(action) {
	let stdout = '';
	let stderr = '';
	const stdoutWrite = process.stdout.write;
	const stderrWrite = process.stderr.write;
	process.stdout.write = (chunk) => {
		stdout += chunk;
		return true;
	};
	process.stderr.write = (chunk) => {
		stderr += chunk;
		return true;
	};
	try {
		return {status: action(), stdout, stderr};
	} finally {
		process.stdout.write = stdoutWrite;
		process.stderr.write = stderrWrite;
	}
}

function fakeExternalRun(invocations) {
	return (command, args, options) => {
		invocations.push({command, args, cwd: options.cwd});
		const name = path.basename(command);
		if (name === 'semgrep') {
			return {status: 0, stdout: '1.173.0', stderr: '', error: undefined};
		}
		if (name === 'ocr') {
			return {status: 0, stdout: 'open-code-review v1.9.1 linux/amd64', stderr: '', error: undefined};
		}
		if (command === 'php') {
			return {status: 0, stdout: '{"version":"8.5.0","sockets":true}', stderr: '', error: undefined};
		}
		return {status: 0, stdout: '', stderr: '', error: undefined};
	};
}

test('packs the core package with every owned resource and executable modes', () => {
	const packed = packPackage(CORE_PKG);
	assert.equal(packed.files.has('toolchain.json'), true);
	assert.equal(packed.files.has('config/commitlint.config.cjs'), true);
	assert.equal(packed.files.has('safe-dirs.json'), true);
	assert.equal(packed.files.has('AGENTS.md'), true);
	assert.equal(packed.files.has('APPEND_SYSTEM.md'), true);
	assert.notEqual(packed.files.get('scripts/prism-tool.js') & 0o111, 0, 'bin is executable');
	assert.notEqual(packed.files.get('scripts/install-global.sh') & 0o111, 0, 'installer is executable');
	assert.notEqual(packed.files.get('scripts/install-hooks.sh') & 0o111, 0, 'hook installer is executable');
	assert.equal(packed.files.get('toolchain.json') & 0o111, 0, 'contract is not executable');
	assert.equal(packed.files.get('safe-dirs.json') & 0o111, 0, 'safe data is not executable');
	for (const module of ['cli', 'contract', 'discovery', 'preflight', 'process']) {
		assert.equal(packed.files.has(`scripts/prism-tool/${module}.js`), true, module);
	}
	assert.equal(tarPaths(packed, 'package/prompts/').length >= 15, true, 'prompts present');
	assert.equal(tarPaths(packed, 'package/skills/').filter((p) => p.endsWith('SKILL.md')).length >= 35, true, 'skills present');
	assert.equal(tarPaths(packed, 'package/extensions/safety/').length >= 4, true, 'safety extension data present');
	assert.equal(tarPaths(packed, 'package/scripts/prism-tool/').length >= 5, true, 'CLI modules packaged');
});

test('packs the adapter with contract, handler, modules, prompts, skills, and safe data', () => {
	const packed = packPackage(ADAPTER_PKG);
	assert.equal(packed.files.has('toolchain.json'), true);
	assert.equal(packed.files.has('safe-dirs.json'), true);
	assert.notEqual(packed.files.get('scripts/prism-tool-adapter.js') & 0o111, 0, 'handler is executable');
	for (const module of ['audit', 'project', 'transaction', 'workspace']) {
		assert.equal(packed.files.has(`scripts/toolchain/${module}.js`), true, module);
	}
	assert.equal(tarPaths(packed, 'package/prompts/').length >= 3, true, 'prompts present');
	assert.equal(tarPaths(packed, 'package/skills/').filter((p) => p.endsWith('SKILL.md')).length >= 10, true, 'skills present');
	assert.equal(tarPaths(packed, 'package/docs/').length >= 4, true, 'docs present');
});

test('tracks executable modes in the git index for the CLI, handler, and installers', () => {
	const entries = [
		'packages/prism-core/scripts/prism-tool.js',
		'packages/prism-core/scripts/install-global.sh',
		'packages/prism-core/scripts/install-hooks.sh',
		'packages/prism-php-web/scripts/prism-tool-adapter.js',
	];
	const listing = execFileSync('git', ['ls-files', '-s', ...entries], {cwd: root, encoding: 'utf8'});
	const modes = new Map(listing.split('\n').filter(Boolean).map((line) => {
		const parts = line.split(/\s+/);
		return [parts[3], parts[0]];
	}));
	for (const entry of entries) {
		assert.equal(modes.get(entry), '100755', `${entry} is 100755 in the git index`);
	}
});

test('resolves a bundled core tool from an unrelated working directory', (t) => {
	const packed = packPackage(CORE_PKG);
	t.after(() => fs.rmSync(packed.dir, {recursive: true, force: true}));
	const coreRoot = extractTarball(packed.tarball, path.join(packed.dir, 'core'));
	const fakePackage = path.join(coreRoot, 'node_modules', 'git-cliff');
	writeJson(path.join(fakePackage, 'package.json'), {
		name: 'git-cliff',
		version: '2.13.1',
		bin: {'git-cliff': 'bin/git-cliff.js'},
	});
	writeExecutable(path.join(fakePackage, 'bin', 'git-cliff.js'), '#!/usr/bin/env node\nprocess.exit(0);');

	const invocations = [];
	const unrelated = path.join(packed.dir, 'unrelated-cwd');
	fs.mkdirSync(unrelated, {recursive: true});
	const result = captureWrites(() => main(['run', 'git-cliff', '--', '--version'], {
		coreRoot,
		cwd: unrelated,
		env: {PATH: FAKE_BIN},
		input: '',
		run: fakeExternalRun(invocations),
	}));

	assert.equal(result.status, 0);
	assert.equal(result.stderr, '');
	const cliffRun = invocations.find(({command}) => command.endsWith('git-cliff.js'));
	assert.ok(cliffRun, 'git-cliff was invoked through the bundled resolver');
	assert.equal(cliffRun.command, fs.realpathSync(path.join(fakePackage, 'bin', 'git-cliff.js')));
	assert.deepEqual(cliffRun.args, ['--version']);
	assert.notEqual(cliffRun.cwd, coreRoot);
});

test('discovers the managed adapter from an unrelated project and inspects it', (t) => {
	const corePacked = packPackage(CORE_PKG);
	const adapterPacked = packPackage(ADAPTER_PKG);
	t.after(() => fs.rmSync(corePacked.dir, {recursive: true, force: true}));
	t.after(() => fs.rmSync(adapterPacked.dir, {recursive: true, force: true}));
	const coreRoot = extractTarball(corePacked.tarball, path.join(corePacked.dir, 'core'));
	const adapterRoot = extractTarball(adapterPacked.tarball, path.join(adapterPacked.dir, 'adapter'));

	const projectRoot = path.join(adapterPacked.dir, 'consumer-project');
	fs.mkdirSync(path.join(projectRoot, '.pi', 'npm', 'node_modules', '@kyaulabs'), {recursive: true});
	writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
		dependencies: {'@kyaulabs/prism-php-web': '0.1.0'},
	});
	fs.cpSync(adapterRoot, path.join(projectRoot, '.pi', 'npm', 'node_modules', '@kyaulabs', 'prism-php-web'), {recursive: true});

	const invocations = [];
	const result = captureWrites(() => main(['setup', 'inspect', '--json'], {
		projectRoot,
		coreRoot,
		env: {PATH: FAKE_BIN},
		input: '',
		run: fakeExternalRun(invocations),
	}));

	assert.equal(result.stderr, '');
	const report = JSON.parse(result.stdout);
	assert.equal(report.command, 'setup inspect');
	assert.equal(report.adapter, '@kyaulabs/prism-php-web');
	assert.equal(report.data.phpVersion, '8.5.0');
	assert.equal(report.data.sockets, true);
});

test('discovers the local adapter through Pi settings from an unrelated project', (t) => {
	const corePacked = packPackage(CORE_PKG);
	const adapterPacked = packPackage(ADAPTER_PKG);
	t.after(() => fs.rmSync(corePacked.dir, {recursive: true, force: true}));
	t.after(() => fs.rmSync(adapterPacked.dir, {recursive: true, force: true}));
	const coreRoot = extractTarball(corePacked.tarball, path.join(corePacked.dir, 'core'));
	const adapterRoot = extractTarball(adapterPacked.tarball, path.join(adapterPacked.dir, 'adapter'));

	const projectRoot = path.join(adapterPacked.dir, 'local-project');
	fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
	writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
		skills: [path.join(adapterRoot, 'skills')],
	});

	const invocations = [];
	const result = captureWrites(() => main(['setup', 'inspect', '--json'], {
		projectRoot,
		coreRoot,
		env: {PATH: FAKE_BIN},
		input: '',
		run: fakeExternalRun(invocations),
	}));

	assert.equal(result.stderr, '');
	const report = JSON.parse(result.stdout);
	assert.equal(report.adapter, '@kyaulabs/prism-php-web');
	assert.equal(report.data.phpVersion, '8.5.0');
});

test('ships the launcher ownership guard so unrelated executables are never replaced', () => {
	const packed = packPackage(CORE_PKG);
	const coreRoot = extractTarball(packed.tarball, path.join(packed.dir, 'core'));
	const installer = fs.readFileSync(path.join(coreRoot, 'scripts', 'install-global.sh'), 'utf8');
	assert.match(installer, /prism-core:managed-launcher begin/);
	assert.match(installer, /launcher_is_managed/);
	assert.match(installer, /refusing to replace an unmanaged launcher/);
	assert.match(installer, /refusing to remove an unmanaged launcher/);
});



// vim: ft=javascript sts=4 sw=4 ts=4 noet :
