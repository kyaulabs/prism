// $KYAULabs: cli.js git@aura.kyaulabs 2026/08/14 -0700 Exp $












'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {assertPackageParity, loadContract} = require('./contract');
const {discoverAdapter, loadAdapterHandler} = require('./discovery');
const {checkExternalTools, resolveExecutable, testOcrConnectivity} = require('./preflight');
const {runBounded} = require('./process');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});

function packageRootFor(packageName, coreRoot) {
	let current = fs.realpathSync(coreRoot);
	while (true) {
		const candidate = path.join(current, 'node_modules', packageName);
		const manifestPath = path.join(candidate, 'package.json');
		if (fs.existsSync(manifestPath)) {
			const root = fs.realpathSync(candidate);
			const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
			if (manifest.name === packageName) return {manifest, root};
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	throw new Error(`package root not found for ${packageName}`);
}

function resolveBundledComponent(coreRoot, component) {
	const resolved = packageRootFor(component.package, coreRoot);
	if (resolved.manifest.version !== component.version) {
		throw new Error(`package version drift for ${component.id}`);
	}
	const bin = resolved.manifest.bin;
	const relative = typeof bin === 'string' ? bin : bin?.[component.executable];
	if (typeof relative !== 'string') throw new Error(`package bin missing for ${component.id}`);
	const executable = fs.realpathSync(path.resolve(resolved.root, relative));
	const relation = path.relative(resolved.root, executable);
	if (relation.startsWith('..') || path.isAbsolute(relation)) {
		throw new Error(`package bin escapes root for ${component.id}`);
	}
	return executable;
}

function parseRun(args) {
	const toolId = args[0];
	const separator = args.indexOf('--');
	if (!toolId || separator < 1) {
		throw new Error('usage: prism-tool run TOOL_ID [--code-egress-approved=yes] -- ARGUMENTS');
	}
	let codeEgressApproved;
	for (const control of args.slice(1, separator)) {
		if (control !== '--code-egress-approved=yes' || codeEgressApproved) {
			throw new Error('usage: prism-tool run TOOL_ID [--code-egress-approved=yes] -- ARGUMENTS');
		}
		codeEgressApproved = 'yes';
	}
	return {codeEgressApproved, toolId, toolArgs: args.slice(separator + 1)};
}

function argumentsAllowed(component, args) {
	if (component.argumentPolicy.mode === 'passthrough') return true;
	return args.length > 0 && component.argumentPolicy.allowed.includes(args[0]);
}

function readBoundedStdin(context) {
	const limit = context.inputLimit ?? 1048576;
	if (Object.prototype.hasOwnProperty.call(context, 'input')) {
		const input = context.input ?? '';
		if (Buffer.byteLength(input) > limit) throw new Error('stdin exceeds limit');
		return input;
	}
	if (process.stdin.isTTY) return undefined;

	const chunks = [];
	let total = 0;
	const buffer = Buffer.alloc(16384);
	let count;
	while ((count = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
		total += count;
		if (total > limit) throw new Error('stdin exceeds limit');
		chunks.push(Buffer.from(buffer.subarray(0, count)));
	}
	return Buffer.concat(chunks);
}

function loadCoreContract(coreRoot) {
	const contract = loadContract(path.join(coreRoot, 'toolchain.json'));
	const packageJson = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
	assertPackageParity(contract, packageJson);
	return contract;
}

function parseDoctor(args) {
	const parsed = {json: false, localOnly: false, ocrTestApproved: undefined};
	for (const argument of args) {
		if (argument === '--json') parsed.json = true;
		else if (argument === '--local-only') parsed.localOnly = true;
		else if (argument === '--ocr-test-approved=yes') parsed.ocrTestApproved = 'yes';
		else throw new Error('usage: prism-tool doctor [--json] [--local-only] [--ocr-test-approved=yes]');
	}
	return parsed;
}

function renderDoctor(checks, json) {
	const status = checks.every((check) => check.status === 'PASS') ? 'GO' : 'NO-GO';
	if (json) {
		process.stdout.write(`${JSON.stringify({schemaVersion: 1, command: 'doctor', status, checks})}\n`);
		return;
	}
	for (const check of checks) {
		const fields = [check.id, check.status];
		if (check.expected) fields.push(`expected=${check.expected}`);
		if (check.actual) fields.push(`actual=${check.actual}`);
		fields.push(check.message);
		process.stdout.write(`${fields.join('\t')}\n`);
	}
	process.stdout.write(`${status}\n`);
}

function doctor(args, context) {
	let parsed;
	try {
		parsed = parseDoctor(args);
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		return EXIT.USAGE;
	}
	const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
	let contract;
	try {
		contract = loadCoreContract(coreRoot);
	} catch {
		process.stderr.write('prism-tool: invalid core toolchain contract\n');
		return EXIT.USAGE;
	}
	const checks = checkExternalTools({
		contract,
		env: context.env ?? process.env,
		run: context.run ?? runBounded,
	});
	if (checks.some((check) => check.status !== 'PASS')) {
		renderDoctor(checks, parsed.json);
		return EXIT.READINESS;
	}
	if (parsed.localOnly) {
		renderDoctor(checks, parsed.json);
		return EXIT.OK;
	}
	if (parsed.ocrTestApproved !== 'yes') {
		checks.push(testOcrConnectivity({approved: parsed.ocrTestApproved, run: context.run}));
		renderDoctor(checks, parsed.json);
		return EXIT.USAGE;
	}
	const env = context.env ?? process.env;
	const executable = resolveExecutable('ocr', env);
	const run = executable
		? (_command, liveArgs, options) => (context.run ?? runBounded)(executable, liveArgs, {...options, env})
		: () => ({status: null, error: {code: 'ENOENT'}});
	checks.push(testOcrConnectivity({approved: parsed.ocrTestApproved, run}));
	renderDoctor(checks, parsed.json);
	return checks.every((check) => check.status === 'PASS') ? EXIT.OK : EXIT.READINESS;
}

function setup(args, context) {
	if (args[0] === 'resolve') {
		const controls = args.slice(1);
		const networkApprovals = controls.filter((argument) => argument.startsWith('--network-approved='));
		if (networkApprovals.length !== 1 || networkApprovals[0] !== '--network-approved=yes') {
			process.stderr.write('prism-tool: network approval required\n');
			return EXIT.USAGE;
		}
		const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
		const jsonCount = controls.filter((argument) => argument === '--json').length;
		if (
			adapters.length !== 1 ||
			adapters[0].length === '--adapter='.length ||
			jsonCount > 1 ||
			controls.some((argument) =>
				!argument.startsWith('--network-approved=') &&
				!argument.startsWith('--adapter=') &&
				argument !== '--json'
			)
		) {
			process.stderr.write('usage: prism-tool setup resolve --adapter=PACKAGE [--json] --network-approved=yes\n');
			return EXIT.USAGE;
		}
		const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
		const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
		let coreContract;
		try {
			coreContract = loadCoreContract(coreRoot);
		} catch {
			process.stderr.write('prism-tool: invalid core toolchain contract\n');
			return EXIT.USAGE;
		}
		const readiness = checkExternalTools({
			contract: coreContract,
			env: context.env ?? process.env,
			run: context.run ?? runBounded,
		});
		if (readiness.some(({status}) => status !== 'PASS')) {
			process.stderr.write('prism-tool: mandatory external readiness failed\n');
			return EXIT.READINESS;
		}
		let registration;
		let handler;
		try {
			registration = discoverAdapter({
				projectRoot,
				piDir: context.piDir ?? path.join(projectRoot, '.pi'),
			});
			handler = loadAdapterHandler(registration);
		} catch {
			process.stderr.write('prism-tool: active adapter discovery failed\n');
			return EXIT.USAGE;
		}
		if (registration.packageName !== adapters[0].slice('--adapter='.length)) {
			process.stderr.write('prism-tool: requested adapter is not active\n');
			return EXIT.USAGE;
		}
		if (typeof handler.resolve !== 'function') {
			process.stderr.write('prism-tool: adapter resolve operation is unavailable\n');
			return EXIT.USAGE;
		}
		const result = handler.resolve({
			contract: registration.contract,
			projectRoot,
			workspaceRoot: path.join(projectRoot, '.pi', 'prism-tool', 'work'),
			run: context.run ?? runBounded,
		});
		const report = {
			schemaVersion: 1,
			command: 'setup resolve',
			adapter: registration.packageName,
			status: result.status,
			checks: [...readiness, ...result.checks],
			data: result.data,
		};
		if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
		else {
			for (const check of report.checks) {
				process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
			}
			process.stdout.write(`${report.status}\n`);
		}
		return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
	}
	if (args.length < 1 || args[0] !== 'inspect' || args.slice(1).some((argument) => argument !== '--json')) {
		process.stderr.write('usage: prism-tool setup inspect [--json]\n');
		return EXIT.USAGE;
	}
	if (args.slice(1).filter((argument) => argument === '--json').length > 1) {
		process.stderr.write('usage: prism-tool setup inspect [--json]\n');
		return EXIT.USAGE;
	}
	const json = args.includes('--json');
	const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
	let coreContract;
	try {
		coreContract = loadCoreContract(coreRoot);
	} catch {
		process.stderr.write('prism-tool: invalid core toolchain contract\n');
		return EXIT.USAGE;
	}
	const readiness = checkExternalTools({
		contract: coreContract,
		env: context.env ?? process.env,
		run: context.run ?? runBounded,
	});
	if (readiness.some(({status}) => status !== 'PASS')) {
		process.stderr.write('prism-tool: mandatory external readiness failed\n');
		return EXIT.READINESS;
	}
	const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
	let registration;
	let handler;
	try {
		registration = discoverAdapter({
			projectRoot,
			piDir: context.piDir ?? path.join(projectRoot, '.pi'),
		});
		handler = loadAdapterHandler(registration);
	} catch {
		process.stderr.write('prism-tool: active adapter discovery failed\n');
		return EXIT.USAGE;
	}
	const result = handler.inspect({
		contract: registration.contract,
		projectRoot,
		run: context.run ?? runBounded,
	});
	const report = {
		schemaVersion: 1,
		command: 'setup inspect',
		adapter: registration.packageName,
		status: result.status,
		checks: [...readiness, ...result.checks],
		data: result.data,
	};
	if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
	else {
		for (const check of report.checks) {
			process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
		}
		process.stdout.write(`${report.status}\n`);
	}
	return result.status === 'GO' ? EXIT.OK : EXIT.TOOL;
}

function runDeclaredTool(args, context) {
	let parsed;
	try {
		parsed = parseRun(args);
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		return EXIT.USAGE;
	}
	const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
	let contract;
	try {
		contract = loadCoreContract(coreRoot);
	} catch {
		process.stderr.write('prism-tool: invalid core toolchain contract\n');
		return EXIT.USAGE;
	}
	let component = contract.components.find(({id}) => id === parsed.toolId);
	let adapterHandler;
	const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
	if (!component) {
		try {
			const registration = discoverAdapter({
				projectRoot,
				piDir: context.piDir ?? path.join(projectRoot, '.pi'),
			});
			component = registration.contract.components.find(({id}) => id === parsed.toolId);
			adapterHandler = loadAdapterHandler(registration);
		} catch {
			process.stderr.write('prism-tool: active adapter discovery failed\n');
			return EXIT.USAGE;
		}
	}
	if (!component || component.kind !== 'command') {
		process.stderr.write('prism-tool: unknown tool id\n');
		return EXIT.USAGE;
	}
	if (!argumentsAllowed(component, parsed.toolArgs)) {
		process.stderr.write('prism-tool: arguments rejected by contract\n');
		return EXIT.USAGE;
	}
	let toolArgs = parsed.toolArgs;
	if (component.id === 'commitlint') {
		if (toolArgs.some((argument) =>
			argument === '--config' ||
			argument.startsWith('--config=') ||
			argument === '-g' ||
			argument.startsWith('-g=')
		)) {
			process.stderr.write('prism-tool: commitlint config override is not allowed\n');
			return EXIT.USAGE;
		}
		toolArgs = [...toolArgs, '--config', path.join(coreRoot, 'config', 'commitlint.config.cjs')];
	}
	const env = context.env ?? process.env;
	const readiness = checkExternalTools({contract, env, run: context.run ?? runBounded});
	if (readiness.some((check) => check.status !== 'PASS')) {
		process.stderr.write('prism-tool: mandatory external readiness failed\n');
		return EXIT.READINESS;
	}
	if (component.id === 'ocr' && parsed.codeEgressApproved !== 'yes') {
		process.stderr.write('prism-tool: OCR code egress approval required\n');
		return EXIT.USAGE;
	}
	let executable;
	if (component.provisioning === 'external') {
		executable = resolveExecutable(component.executable, env);
		if (!executable) {
			process.stderr.write('prism-tool: mandatory external readiness failed\n');
			return EXIT.READINESS;
		}
	} else if (component.provisioning === 'bundled') {
		try {
			executable = resolveBundledComponent(coreRoot, component);
		} catch {
			process.stderr.write('prism-tool: bundled tool is unavailable\n');
			return EXIT.TOOL;
		}
	} else {
		try {
			executable = adapterHandler.resolveTool({component, projectRoot});
		} catch {
			process.stderr.write('prism-tool: adapter tool is unavailable\n');
			return EXIT.TOOL;
		}
	}
	let input;
	try {
		input = readBoundedStdin(context);
	} catch {
		process.stderr.write('prism-tool: stdin exceeds limit\n');
		return EXIT.USAGE;
	}
	const result = (context.run ?? runBounded)(executable, toolArgs, {
		cwd: component.provisioning === 'consumer-dev'
			? fs.realpathSync(projectRoot)
			: context.cwd ?? process.cwd(),
		env,
		input,
		maxBuffer: context.maxBuffer,
		timeout: context.timeout ?? component.executionTimeoutMs,
	});
	if (result.error) {
		const reason = result.timedOut ? 'timeout' : 'output or process failure';
		process.stderr.write(`prism-tool: tool ${reason}\n`);
		return EXIT.TOOL;
	}
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	return result.status === 0 ? EXIT.OK : EXIT.TOOL;
}

function main(argv, context = {}) {
	const [command, ...args] = argv;
	if (command === 'run') return runDeclaredTool(args, context);
	if (command === 'doctor') return doctor(args, context);
	if (command === 'setup') return setup(args, context);
	process.stderr.write('prism-tool: unknown command\n');
	return EXIT.USAGE;
}

module.exports = {EXIT, doctor, main, resolveBundledComponent};












// vim: ft=javascript sts=4 sw=4 ts=4 noet :
