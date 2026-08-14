// $KYAULabs: transaction.js git@aura.kyaulabs 2026/08/14 -0700 Exp $





'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeComposerAudit, normalizeNpmAudit} = require('./audit');
const {createWorkspace, recoverWorkspace} = require('./workspace');

const CONSUMER_FILES = ['composer.json', 'composer.lock', 'package.json', 'package-lock.json'];
const COMMAND_OPTIONS = Object.freeze({maxBuffer: 1048576, timeout: 300000});

function digestFile(filePath) {
	return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertConsumerFiles(projectRoot) {
	for (const name of CONSUMER_FILES) {
		const filePath = path.join(projectRoot, name);
		if (!fs.existsSync(filePath)) {
			if (name.endsWith('.lock') || name === 'package-lock.json') continue;
			throw new Error('required consumer manifest is missing');
		}
		const stat = fs.lstatSync(filePath);
		if (stat.isSymbolicLink() || !stat.isFile()) {
			throw new Error('consumer manifest or lock is invalid');
		}
	}
}

function exactPairs(contract, ecosystem, separator) {
	return contract.components
		.filter((component) => component.ecosystem === ecosystem)
		.map((component) => `${component.package}${separator}${component.version}`);
}

function runRequired(run, command, args, cwd) {
	const result = run(command, args, {...COMMAND_OPTIONS, cwd});
	if (result.error || result.status !== 0) throw new Error('candidate command failed');
	return result;
}

function combinedTotals(composer, npm) {
	return Object.fromEntries(
		['critical', 'high', 'moderate', 'low'].map((severity) => [
			severity,
			composer.totals[severity] + npm.totals[severity],
		])
	);
}

function resolveCandidate({contract, projectRoot, workspaceRoot, run}) {
	const canonicalProject = fs.realpathSync(projectRoot);
	const expectedWorkspace = path.join(canonicalProject, '.pi', 'prism-tool', 'work');
	if (workspaceRoot !== undefined && path.resolve(workspaceRoot) !== expectedWorkspace) {
		return {
			status: 'NO-GO',
			checks: [{id: 'candidate-resolution', status: 'FAIL', message: 'candidate resolution failed'}],
			data: {reason: 'tool failure'},
		};
	}
	let workspace;
	try {
		assertConsumerFiles(canonicalProject);
		recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
		workspace = createWorkspace({projectRoot: canonicalProject, adapter: contract.package});
		const originalRoot = path.join(workspace.root, 'original');
		const candidateRoot = path.join(workspace.root, 'candidate');
		fs.mkdirSync(originalRoot, {mode: 0o700});
		fs.mkdirSync(candidateRoot, {mode: 0o700});
		const original = {};
		for (const name of CONSUMER_FILES) {
			const sourcePath = path.join(canonicalProject, name);
			if (!fs.existsSync(sourcePath)) {
				original[name] = 'absent';
				continue;
			}
			original[name] = digestFile(sourcePath);
			fs.copyFileSync(sourcePath, path.join(originalRoot, name));
			fs.copyFileSync(sourcePath, path.join(candidateRoot, name));
		}

		const composerPairs = exactPairs(contract, 'composer', ':');
		const npmPairs = exactPairs(contract, 'npm', '@');
		runRequired(run, 'composer', [
			'require',
			'--dev',
			'--no-update',
			'--no-scripts',
			'--no-interaction',
			...composerPairs,
		], candidateRoot);
		runRequired(run, 'composer', [
			'update',
			...composerPairs,
			'--with-all-dependencies',
			'--no-install',
			'--no-scripts',
			'--no-interaction',
		], candidateRoot);
		runRequired(run, 'npm', [
			'install',
			'--package-lock-only',
			'--ignore-scripts',
			'--save-dev',
			'--save-exact',
			...npmPairs,
		], candidateRoot);

		const composerAudit = normalizeComposerAudit(run(
			'composer',
			['audit', '--locked', '--format=json'],
			{...COMMAND_OPTIONS, cwd: candidateRoot}
		));
		const npmAudit = normalizeNpmAudit(run(
			'npm',
			['audit', '--package-lock-only', '--json'],
			{...COMMAND_OPTIONS, cwd: candidateRoot}
		));
		const audit = combinedTotals(composerAudit, npmAudit);
		if (Object.values(audit).some((total) => total !== 0)) {
			recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
			workspace = null;
			return {
				status: 'NO-GO',
				checks: [{id: 'candidate-audit', status: 'FAIL', message: 'advisories found'}],
				data: {reason: 'advisory'},
			};
		}

		const candidate = {};
		let diff = '';
		for (const name of CONSUMER_FILES) {
			const candidatePath = path.join(candidateRoot, name);
			if (!fs.existsSync(candidatePath) || fs.lstatSync(candidatePath).isSymbolicLink()) {
				throw new Error('candidate manifest or lock is missing');
			}
			candidate[name] = digestFile(candidatePath);
			const originalPath = original[name] === 'absent'
				? '/dev/null'
				: path.join(originalRoot, name);
			const diffResult = run('git', ['diff', '--no-index', '--', originalPath, candidatePath], {
				...COMMAND_OPTIONS,
				cwd: workspace.root,
			});
			if (diffResult.error || ![0, 1].includes(diffResult.status)) {
				throw new Error('candidate diff failed');
			}
			diff += diffResult.stdout;
		}
		const plan = {
			schemaVersion: 1,
			adapter: contract.package,
			projectRoot: canonicalProject,
			original,
			candidate,
			audit,
			browserTargets: [...contract.browserTargets],
		};
		const planPath = path.join(workspace.root, 'candidate-plan.json');
		fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, {flag: 'wx', mode: 0o600});
		fs.chmodSync(planPath, 0o600);
		return {
			status: 'GO',
			checks: [{id: 'candidate-audit', status: 'PASS', message: 'zero advisories'}],
			data: {planPath, diff},
		};
	} catch {
		if (workspace) {
			recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
		}
		return {
			status: 'NO-GO',
			checks: [{id: 'candidate-resolution', status: 'FAIL', message: 'candidate resolution failed'}],
			data: {reason: 'tool failure'},
		};
	}
}

module.exports = {resolveCandidate};





// vim: ft=javascript sts=4 sw=4 ts=4 noet :
