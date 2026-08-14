// $KYAULabs: workspace.js git@aura.kyaulabs 2026/08/14 -0700 Exp $







'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ADAPTER_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const MARKER_NAME = '.prism-workspace.json';

function isInside(root, candidate) {
	const relation = path.relative(root, candidate);
	return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function workspacePath(projectRoot) {
	const canonicalProject = fs.realpathSync(projectRoot);
	const piPath = path.join(canonicalProject, '.pi');
	if (fs.lstatSync(piPath).isSymbolicLink()) throw new Error('project Pi directory cannot be a symlink');
	const canonicalPi = fs.realpathSync(piPath);
	if (!isInside(canonicalProject, canonicalPi)) throw new Error('project Pi directory escapes project root');
	return {
		projectRoot: canonicalProject,
		root: path.join(canonicalPi, 'prism-tool', 'work'),
	};
}

function readOwnedWorkspace({projectRoot, adapter}) {
	if (!ADAPTER_NAME.test(adapter)) throw new Error('workspace adapter is invalid');
	const expected = workspacePath(projectRoot);
	if (!fs.existsSync(expected.root)) return null;
	const rootStat = fs.lstatSync(expected.root);
	if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
		throw new Error('workspace path is invalid');
	}
	const root = fs.realpathSync(expected.root);
	if (root !== expected.root) throw new Error('workspace path is invalid');
	const markerPath = path.join(root, MARKER_NAME);
	const markerStat = fs.lstatSync(markerPath);
	if (markerStat.isSymbolicLink() || !markerStat.isFile() || markerStat.size > 65536) {
		throw new Error('workspace ownership marker is invalid');
	}
	let marker;
	try {
		marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
	} catch {
		throw new Error('workspace ownership marker is invalid');
	}
	if (
		marker === null ||
		typeof marker !== 'object' ||
		Array.isArray(marker) ||
		Object.keys(marker).sort().join(',') !== 'adapter,projectRoot,schemaVersion' ||
		marker.schemaVersion !== 1 ||
		marker.adapter !== adapter ||
		typeof marker.projectRoot !== 'string'
	) {
		throw new Error('workspace ownership marker does not match');
	}
	let markerProject;
	try {
		markerProject = fs.realpathSync(marker.projectRoot);
	} catch {
		throw new Error('workspace ownership marker does not match');
	}
	if (markerProject !== expected.projectRoot) {
		throw new Error('workspace ownership marker does not match');
	}
	return {root, markerPath};
}

function recoverWorkspace({projectRoot, adapter}) {
	const workspace = readOwnedWorkspace({projectRoot, adapter});
	if (!workspace) return false;
	fs.rmSync(workspace.root, {recursive: true, force: false});
	return true;
}

function writeAtomic(filePath, content, mode, rename) {
	const tempPath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.prism-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
	);
	let descriptor;
	try {
		descriptor = fs.openSync(tempPath, 'wx', mode);
		fs.writeFileSync(descriptor, content);
		fs.fsyncSync(descriptor);
		fs.closeSync(descriptor);
		descriptor = undefined;
		fs.chmodSync(tempPath, mode);
		rename(tempPath, filePath);
	} catch (error) {
		if (descriptor !== undefined) fs.closeSync(descriptor);
		fs.rmSync(tempPath, {force: true});
		throw error;
	}
}

function replaceConsumerFiles({projectRoot, workspaceRoot, names, rename = fs.renameSync}) {
	const backupRoot = path.join(workspaceRoot, 'backups');
	const candidateRoot = path.join(workspaceRoot, 'candidate');
	fs.mkdirSync(backupRoot, {mode: 0o700});
	const originals = new Map();
	try {
		for (const name of names) {
			const targetPath = path.join(projectRoot, name);
			let targetStat;
			try {
				targetStat = fs.lstatSync(targetPath);
			} catch (error) {
				if (error.code !== 'ENOENT') throw error;
			}
			if (!targetStat) {
				originals.set(name, {exists: false, mode: 0o600});
				continue;
			}
			if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
				throw new Error('consumer file changed before replacement');
			}
			const mode = targetStat.mode & 0o777;
			const content = fs.readFileSync(targetPath);
			const backupPath = path.join(backupRoot, name);
			fs.writeFileSync(backupPath, content, {flag: 'wx', mode: 0o600});
			fs.chmodSync(backupPath, 0o600);
			originals.set(name, {exists: true, mode, backupPath});
		}
		for (const name of names) {
			const original = originals.get(name);
			const content = fs.readFileSync(path.join(candidateRoot, name));
			writeAtomic(path.join(projectRoot, name), content, original.mode, rename);
		}
		fs.rmSync(backupRoot, {recursive: true, force: false});
	} catch (error) {
		for (const name of names) {
			const original = originals.get(name);
			if (!original) continue;
			const targetPath = path.join(projectRoot, name);
			if (!original.exists) {
				fs.rmSync(targetPath, {force: true});
				continue;
			}
			writeAtomic(targetPath, fs.readFileSync(original.backupPath), original.mode, rename);
		}
		fs.rmSync(backupRoot, {recursive: true, force: true});
		throw error;
	}
}

function createWorkspace({projectRoot, adapter}) {
	if (!ADAPTER_NAME.test(adapter)) throw new Error('workspace adapter is invalid');
	const expected = workspacePath(projectRoot);
	if (fs.existsSync(expected.root)) throw new Error('workspace already exists');
	fs.mkdirSync(path.dirname(expected.root), {recursive: true, mode: 0o700});
	fs.mkdirSync(expected.root, {mode: 0o700});
	fs.chmodSync(expected.root, 0o700);
	const markerPath = path.join(expected.root, MARKER_NAME);
	const marker = {
		schemaVersion: 1,
		projectRoot: expected.projectRoot,
		adapter,
	};
	fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, {flag: 'wx', mode: 0o600});
	fs.chmodSync(markerPath, 0o600);
	return {root: fs.realpathSync(expected.root), markerPath};
}

module.exports = {createWorkspace, readOwnedWorkspace, recoverWorkspace, replaceConsumerFiles};







// vim: ft=javascript sts=4 sw=4 ts=4 noet :
