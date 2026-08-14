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

module.exports = {createWorkspace, recoverWorkspace};





// vim: ft=javascript sts=4 sw=4 ts=4 noet :
