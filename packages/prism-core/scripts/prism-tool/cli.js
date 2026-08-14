// $KYAULabs: cli.js git@aura.kyaulabs 2026/08/13 -0700 Exp $



'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {assertPackageParity, loadContract} = require('./contract');
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
	if (!toolId || separator !== 1) throw new Error('usage: prism-tool run TOOL_ID -- ARGUMENTS');
	return {toolId, toolArgs: args.slice(separator + 1)};
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
		contract = loadContract(path.join(coreRoot, 'toolchain.json'));
		const packageJson = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
		assertPackageParity(contract, packageJson);
	} catch {
		process.stderr.write('prism-tool: invalid core toolchain contract\n');
		return EXIT.USAGE;
	}
	const component = contract.components.find(({id}) => id === parsed.toolId);
	if (!component || component.kind !== 'command') {
		process.stderr.write('prism-tool: unknown tool id\n');
		return EXIT.USAGE;
	}
	if (!argumentsAllowed(component, parsed.toolArgs)) {
		process.stderr.write('prism-tool: arguments rejected by contract\n');
		return EXIT.USAGE;
	}
	if (component.provisioning !== 'bundled') {
		process.stderr.write('prism-tool: tool resolution is not implemented for this scope\n');
		return EXIT.USAGE;
	}

	let executable;
	try {
		executable = resolveBundledComponent(coreRoot, component);
	} catch {
		process.stderr.write('prism-tool: bundled tool is unavailable\n');
		return EXIT.TOOL;
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
	let input;
	try {
		input = readBoundedStdin(context);
	} catch {
		process.stderr.write('prism-tool: stdin exceeds limit\n');
		return EXIT.USAGE;
	}
	const result = (context.run ?? runBounded)(executable, toolArgs, {
		cwd: context.cwd ?? process.cwd(),
		env: context.env ?? process.env,
		input,
		maxBuffer: context.maxBuffer,
		timeout: context.timeout,
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
	if (command === 'doctor' || command === 'setup') {
		process.stderr.write(`prism-tool: ${command} is not implemented\n`);
		return EXIT.USAGE;
	}
	process.stderr.write('prism-tool: unknown command\n');
	return EXIT.USAGE;
}

module.exports = {EXIT, main, resolveBundledComponent};



// vim: ft=javascript sts=4 sw=4 ts=4 noet :
