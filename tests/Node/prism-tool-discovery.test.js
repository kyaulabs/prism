// $KYAULabs: prism-tool-discovery.test.js kyau@aura.kyaulabs 2026/08/15 -0700 Exp $








'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeExecutable, writeJson} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
	discoverAdapter,
	loadAdapterHandler,
} = require('../../packages/prism-core/scripts/prism-tool/discovery');
const {
	inspect,
	resolveTool,
} = require('../../packages/prism-php-web/scripts/toolchain/project');

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

function adapterContract(packageName = '@fixture/adapter', componentId = 'fixture-tool') {
	return {
		schemaVersion: 1,
		package: packageName,
		role: 'adapter',
		components: [{
			id: componentId,
			kind: 'command',
			ecosystem: 'npm',
			package: 'fixture-tool',
			version: '1.0.0',
			provisioning: 'consumer-dev',
			authentication: 'none',
			executable: 'fixture-tool',
			versionArguments: ['--version'],
			argumentPolicy: {mode: 'passthrough'},
		}],
	};
}

function writeAdapter(packageRoot, packageName = '@fixture/adapter', componentId = 'fixture-tool') {
	writeJson(path.join(packageRoot, 'package.json'), {
		name: packageName,
		version: '1.0.0',
		prism: {
			adapter: true,
			toolchain: './toolchain.json',
			handler: './scripts/prism-tool-adapter.js',
		},
	});
	writeJson(path.join(packageRoot, 'toolchain.json'), adapterContract(packageName, componentId));
	fs.mkdirSync(path.join(packageRoot, 'scripts'), {recursive: true});
	fs.writeFileSync(
		path.join(packageRoot, 'scripts/prism-tool-adapter.js'),
		"'use strict';\nmodule.exports = {inspect() {}, resolveTool() {}};\n"
	);
}

test('runs adapter Composer and npm commands from their project while cwd is unrelated', (t) => {
	const projectRoot = makeTempDir();
	const unrelated = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	t.after(() => fs.rmSync(unrelated, {recursive: true, force: true}));
	const adapterRoot = path.resolve(__dirname, '../../packages/prism-php-web');
	writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
		skills: [path.join(adapterRoot, 'skills')],
	});
	const pest = path.join(projectRoot, 'vendor', 'bin', 'pest');
	const eslint = path.join(projectRoot, 'node_modules', '.bin', 'eslint');
	writeExecutable(pest, 'exit 0');
	writeExecutable(eslint, 'exit 0');
	const externalBin = path.join(projectRoot, 'external-bin');
	writeExecutable(path.join(externalBin, 'php'), 'exit 0');
	writeExecutable(path.join(externalBin, 'semgrep'), 'exit 0');
	writeExecutable(path.join(externalBin, 'ocr'), 'exit 0');
	const invocations = [];
	const run = (command, args, options) => {
		const executable = path.basename(command);
		if (executable === 'semgrep') {
			return {status: 0, stdout: '1.173.0', stderr: '', error: undefined};
		}
		if (executable === 'ocr') {
			return {status: 0, stdout: 'open-code-review v1.9.1 linux/amd64', stderr: '', error: undefined};
		}
		invocations.push({command, args, cwd: options.cwd});
		return {status: 0, stdout: 'Pest 5.1.1\n', stderr: '', error: undefined};
	};

	const results = [
		captureWrites(() => main(['run', 'pest', '--', '--version'], {
			projectRoot,
			cwd: unrelated,
			env: {PATH: externalBin},
			run,
			input: '',
		})),
		captureWrites(() => main(['run', 'eslint', '--', '--version'], {
			projectRoot,
			cwd: unrelated,
			env: {PATH: externalBin},
			run,
			input: '',
		})),
	];

	assert.deepEqual(results.map(({status}) => status), [0, 0]);
	assert.deepEqual(invocations, [
		{command: 'php', args: ['-d', 'pcov.enabled=1', fs.realpathSync(pest), '--version'], cwd: fs.realpathSync(projectRoot)},
		{command: fs.realpathSync(eslint), args: ['--version'], cwd: fs.realpathSync(projectRoot)},
	]);
});

test('fails closed when the argvPrefix command is unavailable', (t) => {
	const projectRoot = makeTempDir();
	const unrelated = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	t.after(() => fs.rmSync(unrelated, {recursive: true, force: true}));
	const adapterRoot = path.resolve(__dirname, '../../packages/prism-php-web');
	writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
		skills: [path.join(adapterRoot, 'skills')],
	});
	writeExecutable(path.join(projectRoot, 'vendor', 'bin', 'pest'), 'exit 0');
	// semgrep/ocr stubs satisfy the core readiness gate (in-range versions);
	// php is deliberately absent so the prefix check must fail closed
	// before any spawn. The stub dir carries its own node binary so the
	// stubs' node shebangs resolve with PATH limited to the stub dir.
	const externalBin = path.join(projectRoot, 'external-bin');
	fs.mkdirSync(externalBin, {recursive: true});
	fs.symlinkSync(process.execPath, path.join(externalBin, 'node'));
	fs.writeFileSync(path.join(externalBin, 'semgrep'), "#!/usr/bin/env node\nconsole.log('1.174.0')\n", {mode: 0o755});
	fs.writeFileSync(path.join(externalBin, 'ocr'), "#!/usr/bin/env node\nconsole.log('open-code-review v1.9.2 linux/amd64')\n", {mode: 0o755});

	const result = captureWrites(() => main(['run', 'pest', '--', '--version'], {
		projectRoot,
		cwd: unrelated,
		env: {PATH: externalBin},
		run: undefined,
		input: '',
	}));

	assert.equal(result.status, 3);
	assert.match(result.stderr, /command php required for tool pest is unavailable/);
	assert.equal(result.stdout, '');
});

test('setup inspect discovers the source adapter and emits a read-only JSON report', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const repositoryRoot = path.resolve(__dirname, '../..');
	const adapterRoot = path.join(repositoryRoot, 'packages', 'prism-php-web');
	writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
		skills: [path.join(adapterRoot, 'skills')],
	});
	for (const name of ['composer.json', 'composer.lock', 'package.json', 'package-lock.json']) {
		fs.writeFileSync(path.join(projectRoot, name), '{}\n');
	}
	for (const executable of ['php-cs-fixer', 'pest']) {
		writeExecutable(path.join(projectRoot, 'vendor', 'bin', executable), 'exit 0');
	}
	for (const executable of ['sass', 'uglifyjs', 'eslint', 'stylelint', 'playwright']) {
		writeExecutable(path.join(projectRoot, 'node_modules', '.bin', executable), 'exit 0');
	}
	const externalBin = path.join(projectRoot, 'external-bin');
	writeExecutable(path.join(externalBin, 'semgrep'), 'exit 0');
	writeExecutable(path.join(externalBin, 'ocr'), 'exit 0');
	const run = (command) => {
		const executable = path.basename(command);
		if (executable === 'semgrep') {
			return {status: 0, stdout: '1.173.0', stderr: '', error: undefined};
		}
		if (executable === 'ocr') {
			return {status: 0, stdout: 'open-code-review v1.9.1 linux/amd64', stderr: '', error: undefined};
		}
		if (command === 'php') {
			return {status: 0, stdout: '{"version":"8.5.9","sockets":true}', stderr: '', error: undefined};
		}
		throw new Error(`unexpected command ${command}`);
	};

	const result = captureWrites(() => main(['setup', 'inspect', '--json'], {
		projectRoot,
		env: {PATH: externalBin},
		run,
	}));

	assert.equal(result.status, 0);
	assert.equal(result.stderr, '');
	const report = JSON.parse(result.stdout);
	assert.equal(report.schemaVersion, 1);
	assert.equal(report.command, 'setup inspect');
	assert.equal(report.adapter, '@kyaulabs/prism-php-web');
	assert.equal(report.status, 'GO');
	assert.equal(report.data.phpVersion, '8.5.9');
});

test('inspects runtime, manifests, locks, and consumer command resolution without mutation', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	for (const name of ['composer.json', 'composer.lock', 'package.json', 'package-lock.json']) {
		fs.writeFileSync(path.join(projectRoot, name), '{}\n');
	}
	const executable = path.join(projectRoot, 'vendor', 'bin', 'pest');
	fs.mkdirSync(path.dirname(executable), {recursive: true});
	fs.writeFileSync(executable, '#!/usr/bin/env php\n', {mode: 0o755});
	fs.chmodSync(executable, 0o755);
	const invocations = [];
	const run = (command, args, options) => {
		invocations.push({command, args, options});
		return {
			status: 0,
			stdout: '{"version":"8.5.9","sockets":true}',
			stderr: '',
			error: undefined,
		};
	};
	const contract = {
		components: [{
			id: 'pest',
			kind: 'command',
			ecosystem: 'composer',
			provisioning: 'consumer-dev',
			executable: 'pest',
		}],
	};

	const result = inspect({contract, projectRoot, run});

	assert.equal(result.status, 'GO');
	assert.equal(result.data.phpVersion, '8.5.9');
	assert.equal(result.data.sockets, true);
	assert.deepEqual(result.data.manifests, {
		'composer.json': true,
		'composer.lock': true,
		'package.json': true,
		'package-lock.json': true,
	});
	assert.equal(result.data.components.pest, fs.realpathSync(executable));
	assert.equal(invocations.length, 1);
	assert.equal(invocations[0].command, 'php');
	assert.deepEqual(invocations[0].options, {maxBuffer: 1048576, timeout: 30000});
	assert.equal(fs.readFileSync(path.join(projectRoot, 'composer.json'), 'utf8'), '{}\n');
});

test('rejects absent, wrong-scope, and symlink-escaped consumer commands', (t) => {
	const projectRoot = makeTempDir();
	const outside = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
	const escaped = path.join(outside, 'pest');
	writeExecutable(escaped, 'exit 0');
	fs.mkdirSync(path.join(projectRoot, 'vendor', 'bin'), {recursive: true});
	fs.symlinkSync(escaped, path.join(projectRoot, 'vendor', 'bin', 'pest'));
	const component = {
		kind: 'command',
		ecosystem: 'composer',
		provisioning: 'consumer-dev',
		executable: 'pest',
	};

	assert.throws(
		() => resolveTool({component, projectRoot}),
		/consumer executable escapes project scope/
	);
	fs.unlinkSync(path.join(projectRoot, 'vendor', 'bin', 'pest'));
	fs.writeFileSync(path.join(projectRoot, 'vendor', 'bin', 'pest'), 'not executable\n', {mode: 0o600});
	assert.throws(
		() => resolveTool({component, projectRoot}),
		/EACCES/
	);
	assert.throws(
		() => resolveTool({component: {...component, executable: 'missing'}, projectRoot}),
		/ENOENT/
	);
	assert.throws(
		() => resolveTool({component: {...component, provisioning: 'external'}, projectRoot}),
		/outside the consumer tool scope/
	);
});

test('resolves a Composer command only from the canonical consumer project', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const executable = path.join(projectRoot, 'vendor', 'bin', 'pest');
	fs.mkdirSync(path.dirname(executable), {recursive: true});
	fs.writeFileSync(executable, '#!/usr/bin/env php\n', {mode: 0o755});
	fs.chmodSync(executable, 0o755);

	const resolved = resolveTool({
		component: {
			kind: 'command',
			ecosystem: 'composer',
			provisioning: 'consumer-dev',
			executable: 'pest',
		},
		projectRoot,
	});

	assert.equal(resolved, fs.realpathSync(executable));
});

test('discovers a direct project-local Pi npm adapter dependency', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(piDir, 'npm', 'node_modules', '@fixture', 'adapter');
	writeAdapter(packageRoot);
	fs.mkdirSync(path.join(packageRoot, 'skills'), {recursive: true});
	writeJson(path.join(piDir, 'npm', 'package.json'), {
		dependencies: {'@fixture/adapter': '1.0.0'},
	});
	writeJson(path.join(piDir, 'settings.json'), {
		skills: ['./npm/node_modules/@fixture/adapter/skills'],
	});

	const registration = discoverAdapter({projectRoot, piDir});

	assert.equal(registration.packageName, '@fixture/adapter');
	assert.equal(registration.packageRoot, fs.realpathSync(packageRoot));
	assert.equal(registration.contract.package, '@fixture/adapter');
	assert.equal(registration.contractPath, fs.realpathSync(path.join(packageRoot, 'toolchain.json')));
	assert.equal(
		registration.handlerPath,
		fs.realpathSync(path.join(packageRoot, 'scripts/prism-tool-adapter.js'))
	);
});

test('loads only the validated adapter handler interface', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(piDir, 'npm', 'node_modules', '@fixture', 'adapter');
	writeAdapter(packageRoot);
	writeJson(path.join(piDir, 'npm', 'package.json'), {
		dependencies: {'@fixture/adapter': '1.0.0'},
	});
	const registration = discoverAdapter({projectRoot, piDir});

	const handler = loadAdapterHandler(registration);

	assert.equal(typeof handler.inspect, 'function');
	assert.equal(typeof handler.resolveTool, 'function');
});

test('rejects unsafe or unsupported adapter package metadata', (t) => {
	const roots = [];
	t.after(() => {
		for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
	});
	for (const handler of ['/tmp/untrusted-handler.js', '../outside-handler.js']) {
		const projectRoot = makeTempDir();
		roots.push(projectRoot);
		const piDir = path.join(projectRoot, '.pi');
		const packageRoot = path.join(piDir, 'npm', 'node_modules', '@fixture', 'adapter');
		writeAdapter(packageRoot);
		const manifestPath = path.join(packageRoot, 'package.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		manifest.prism.handler = handler;
		writeJson(manifestPath, manifest);
		writeJson(path.join(piDir, 'npm', 'package.json'), {
			dependencies: {'@fixture/adapter': '1.0.0'},
		});

		assert.throws(() => discoverAdapter({projectRoot, piDir}), /adapter handler/);
	}
	const projectRoot = makeTempDir();
	roots.push(projectRoot);
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(piDir, 'npm', 'node_modules', '@fixture', 'adapter');
	writeAdapter(packageRoot);
	const manifestPath = path.join(packageRoot, 'package.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	manifest.prism.unknown = true;
	writeJson(manifestPath, manifest);
	writeJson(path.join(piDir, 'npm', 'package.json'), {
		dependencies: {'@fixture/adapter': '1.0.0'},
	});
	assert.throws(() => discoverAdapter({projectRoot, piDir}), /metadata is unsupported/);
});

test('discovers one canonical local adapter through Pi resource paths', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(projectRoot, 'packages', 'adapter');
	writeAdapter(packageRoot);
	fs.mkdirSync(path.join(packageRoot, 'skills'), {recursive: true});
	fs.mkdirSync(path.join(packageRoot, 'prompts'), {recursive: true});
	writeJson(path.join(piDir, 'settings.json'), {
		packages: [{source: '../packages/adapter'}],
		skills: ['../packages/adapter/skills'],
		prompts: ['../packages/adapter/prompts'],
	});

	const registration = discoverAdapter({projectRoot, piDir});

	assert.equal(registration.packageName, '@fixture/adapter');
	assert.equal(registration.packageRoot, fs.realpathSync(packageRoot));
});

test('rejects a settings resource symlink that escapes its adapter package', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(projectRoot, 'packages', 'adapter');
	const outside = path.join(projectRoot, 'outside-skills');
	writeAdapter(packageRoot);
	fs.mkdirSync(outside, {recursive: true});
	fs.symlinkSync(outside, path.join(packageRoot, 'skills'));
	writeJson(path.join(piDir, 'settings.json'), {
		skills: ['../packages/adapter/skills'],
	});

	assert.throws(
		() => discoverAdapter({projectRoot, piDir}),
		/settings resource escapes adapter package/
	);
});

test('fails closed without invoking pi list when no project adapter is active', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
	const marker = path.join(projectRoot, 'pi-invoked');
	const bin = path.join(projectRoot, 'bin');
	writeExecutable(path.join(bin, 'pi'), `printf invoked > ${JSON.stringify(marker)}`);

	const result = captureWrites(() => main(['run', 'fixture-tool', '--'], {
		projectRoot,
		env: {PATH: bin},
	}));

	assert.equal(result.status, 2);
	assert.equal(fs.existsSync(marker), false);
});

test('returns usage failure for two active adapters declaring the same tool ID', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const firstRoot = path.join(projectRoot, 'first-adapter');
	const secondRoot = path.join(projectRoot, 'second-adapter');
	writeAdapter(firstRoot, '@fixture/first-adapter');
	writeAdapter(secondRoot, '@fixture/second-adapter');
	fs.mkdirSync(path.join(firstRoot, 'skills'), {recursive: true});
	fs.mkdirSync(path.join(secondRoot, 'skills'), {recursive: true});
	writeJson(path.join(piDir, 'settings.json'), {
		skills: ['../first-adapter/skills', '../second-adapter/skills'],
	});

	const result = captureWrites(() => main(['run', 'fixture-tool', '--'], {projectRoot}));

	assert.equal(result.status, 2);
	assert.match(result.stderr, /active adapter discovery failed/);
});

test('rejects an adapter component ID that collides with the core contract', (t) => {
	const projectRoot = makeTempDir();
	t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
	const piDir = path.join(projectRoot, '.pi');
	const packageRoot = path.join(projectRoot, 'adapter');
	writeAdapter(packageRoot, '@fixture/adapter', 'commitlint');
	fs.mkdirSync(path.join(packageRoot, 'skills'), {recursive: true});
	writeJson(path.join(piDir, 'settings.json'), {skills: ['../adapter/skills']});

	assert.throws(
		() => discoverAdapter({projectRoot, piDir}),
		/adapter component collides with core component commitlint/
	);
});








// vim: ft=javascript sts=4 sw=4 ts=4 noet :
