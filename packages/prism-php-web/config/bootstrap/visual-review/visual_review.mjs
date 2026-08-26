// $KYAULabs: visual_review.mjs setup@prism 2026/08/25 +0000 Exp $

import {Buffer} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {TextDecoder} from 'node:util';
import {URL} from 'node:url';

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);
const COLOR_SCHEMES = new Set(['light', 'dark', 'no-preference']);
const PRESS_KEYS = new Set(['Enter', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ACTION_TYPES = new Set(['click', 'hover', 'focus', 'press', 'wait-for-selector']);

function exactKeys(value, keys) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function invalid() {
	throw new Error('visual review configuration is invalid');
}

function validSelector(value) {
	return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
		![...value].some((character) => character.codePointAt(0) < 32);
}

function validateViewport(value) {
	if (!exactKeys(value, ['width', 'height'])) invalid();
	if (![value.width, value.height].every((part) => Number.isInteger(part) && part >= 240 && part <= 4096)) invalid();
	return Object.freeze({width: value.width, height: value.height});
}

function validateAction(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value) || !ACTION_TYPES.has(value.type)) invalid();
	const keys = value.type === 'press' ? ['type', 'selector', 'key'] : ['type', 'selector'];
	if (!exactKeys(value, keys) || !validSelector(value.selector)) invalid();
	if (value.type === 'press' && !PRESS_KEYS.has(value.key)) invalid();
	return Object.freeze({...value});
}

function validateState(state, stateIds) {
	if (!exactKeys(state, ['id', 'colorScheme', 'actions']) || !ID.test(state.id) || stateIds.has(state.id) ||
		!COLOR_SCHEMES.has(state.colorScheme) || !Array.isArray(state.actions) || state.actions.length > 16) invalid();
	stateIds.add(state.id);
	return Object.freeze({
		id: state.id,
		colorScheme: state.colorScheme,
		actions: Object.freeze(state.actions.map(validateAction)),
	});
}

function validateCase(entry, baseUrl, caseIds) {
	if (!exactKeys(entry, ['id', 'path', 'readySelector', 'states']) || !ID.test(entry.id) || caseIds.has(entry.id)) invalid();
	caseIds.add(entry.id);
	if (typeof entry.path !== 'string' || !entry.path.startsWith('/') || entry.path.length > 512) invalid();
	const url = new URL(entry.path, baseUrl);
	if (url.origin !== baseUrl.origin || url.username !== '' || url.password !== '') invalid();
	if (entry.readySelector !== null && !validSelector(entry.readySelector)) invalid();
	if (!Array.isArray(entry.states) || entry.states.length === 0 || entry.states.length > 16) invalid();
	const stateIds = new Set();
	const states = entry.states.map((state) => validateState(state, stateIds));
	return Object.freeze({id: entry.id, url: url.href, readySelector: entry.readySelector, states: Object.freeze(states)});
}

export function validateVisualReviewConfig(value) {
	if (!exactKeys(value, ['schemaVersion', 'baseUrl', 'viewports', 'cases']) || value.schemaVersion !== 1) invalid();
	let baseUrl;
	try {
		baseUrl = new URL(value.baseUrl);
	} catch {
		invalid();
	}
	if (!['http:', 'https:'].includes(baseUrl.protocol) || !LOOPBACK.has(baseUrl.hostname) ||
		baseUrl.username !== '' || baseUrl.password !== '' || baseUrl.search !== '' || baseUrl.hash !== '') invalid();
	if (!exactKeys(value.viewports, ['mobile', 'desktop'])) invalid();
	const viewports = Object.freeze({
		mobile: validateViewport(value.viewports.mobile),
		desktop: validateViewport(value.viewports.desktop),
	});
	if (!Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 64) invalid();
	const caseIds = new Set();
	const cases = value.cases.map((entry) => validateCase(entry, baseUrl, caseIds));
	const total = cases.reduce((sum, entry) => sum + entry.states.length * 3, 0);
	if (total > 128) invalid();
	return Object.freeze({schemaVersion: 1, baseUrl: baseUrl.href, viewports, cases: Object.freeze(cases)});
}

export function loadVisualReviewConfig(filePath = path.resolve('visual_review.json')) {
	let descriptor;
	let value;
	try {
		if (typeof fs.constants.O_NOFOLLOW !== 'number') invalid();
		descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		const stat = fs.fstatSync(descriptor);
		if (!stat.isFile() || stat.size > 262144) invalid();
		const raw = Buffer.alloc(262145);
		let bytesRead = 0;
		while (bytesRead < raw.length) {
			const count = fs.readSync(descriptor, raw, bytesRead, raw.length - bytesRead, bytesRead);
			if (count === 0) break;
			bytesRead += count;
		}
		if (bytesRead > 262144) invalid();
		value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw.subarray(0, bytesRead)));
		fs.closeSync(descriptor);
		descriptor = undefined;
	} catch {
		if (descriptor !== undefined) {
			try {
				fs.closeSync(descriptor);
			} catch {
				invalid();
			}
		}
		invalid();
	}
	return validateVisualReviewConfig(value);
}

export function expandVisualReviewCases(config) {
	const viewports = [
		['mobile', config.viewports.mobile],
		['desktop', config.viewports.desktop],
		['reflow', Object.freeze({width: 320, height: config.viewports.mobile.height})],
	];
	return Object.freeze(config.cases.flatMap((entry) => entry.states.flatMap((state) => viewports.map(([viewportId, viewport]) => Object.freeze({
		caseId: entry.id,
		stateId: state.id,
		viewportId,
		viewport,
		colorScheme: state.colorScheme,
		url: entry.url,
		readySelector: entry.readySelector,
		actions: state.actions,
	})))));
}

export function assertCaptureOrigin(actualUrl, configuredUrl) {
	if (new URL(actualUrl).origin !== new URL(configuredUrl).origin) {
		throw new Error('visual review capture left the configured origin');
	}
}

export async function applyVisualReviewActions(page, actions) {
	for (const action of actions) {
		const locator = page.locator(action.selector);
		if (action.type === 'click') await locator.click();
		else if (action.type === 'hover') await locator.hover();
		else if (action.type === 'focus') await locator.focus();
		else if (action.type === 'press') await locator.press(action.key);
		else await locator.waitFor({state: 'visible'});
	}
}

export function revisionIdentity(cwd = process.cwd()) {
	try {
		const options = {cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 1048576};
		const head = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
		const dirty = execFileSync('git', ['status', '--porcelain'], options).trim() !== '';
		return Object.freeze({head: /^[0-9a-f]{40}$/.test(head) ? head : null, dirty});
	} catch {
		return Object.freeze({head: null, dirty: null});
	}
}

function assertNoPageErrors(errors) {
	if (errors.length > 0) {
		throw new Error(`visual review page errors: ${errors.join('\n')}`);
	}
}

function closeQuietly(descriptor) {
	try {
		fs.closeSync(descriptor);
		return true;
	} catch {
		return false;
	}
}

function assertEvidenceDirectory(directory) {
	const stat = fs.lstatSync(directory.root);
	if (
		stat.isSymbolicLink() ||
		!stat.isDirectory() ||
		stat.dev !== directory.dev ||
		stat.ino !== directory.ino ||
		fs.realpathSync(directory.root) !== directory.root
	) {
		throw new Error('visual review output escapes working directory');
	}
}

function openEvidenceDirectory(root) {
	const outputRoot = path.resolve(root);
	let descriptor;
	try {
		if (
			typeof fs.constants.O_DIRECTORY !== 'number' ||
			typeof fs.constants.O_NOFOLLOW !== 'number'
		) {
			throw new Error();
		}
		fs.mkdirSync(outputRoot, {recursive: true, mode: 0o700});
		descriptor = fs.openSync(
			outputRoot,
			fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
		);
		const stat = fs.fstatSync(descriptor);
		if (!stat.isDirectory() || fs.realpathSync(outputRoot) !== outputRoot) throw new Error();
		let heldPath = null;
		for (const prefix of ['/proc/self/fd', '/dev/fd']) {
			const candidate = path.join(prefix, String(descriptor));
			try {
				if (fs.realpathSync(candidate) === outputRoot) {
					heldPath = candidate;
					break;
				}
			} catch {
				continue;
			}
		}
		if (heldPath === null) throw new Error();
		const directory = {root: outputRoot, heldPath, descriptor, dev: stat.dev, ino: stat.ino};
		assertEvidenceDirectory(directory);
		return directory;
	} catch {
		if (descriptor !== undefined) closeQuietly(descriptor);
		throw new Error('visual review output escapes working directory');
	}
}

function writeEvidenceFile(directory, filePath, content) {
	if (path.dirname(filePath) !== directory.root) {
		throw new Error('visual review output escapes working directory');
	}
	const name = path.basename(filePath);
	const temporary = path.join(
		directory.heldPath,
		`.${name}.prism-${randomBytes(16).toString('hex')}.tmp`
	);
	const destination = path.join(directory.heldPath, name);
	let descriptor;
	let temporaryExists = false;
	try {
		descriptor = fs.openSync(
			temporary,
			fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
			0o600
		);
		temporaryExists = true;
		fs.writeFileSync(descriptor, content);
		fs.fchmodSync(descriptor, 0o600);
		fs.fsyncSync(descriptor);
		fs.closeSync(descriptor);
		descriptor = undefined;
		assertEvidenceDirectory(directory);
		fs.renameSync(temporary, destination);
		temporaryExists = false;
		fs.fsyncSync(directory.descriptor);
		assertEvidenceDirectory(directory);
	} catch {
		if (descriptor !== undefined) closeQuietly(descriptor);
		if (temporaryExists) fs.rmSync(temporary, {force: true});
		throw new Error('visual review evidence publication failed');
	}
}

export async function publishVisualReviewEvidence(
	page,
	capture,
	versions,
	revision,
	errors,
	root = path.resolve('tests/Browser/Screenshots/visual-review')
) {
	assertNoPageErrors(errors);
	const image = await page.screenshot({fullPage: true, animations: 'disabled'});
	assertNoPageErrors(errors);
	const outputs = evidencePaths(capture, root);
	const metadata = evidenceMetadata(capture, versions, revision);
	const directory = openEvidenceDirectory(path.dirname(outputs.image));
	try {
		writeEvidenceFile(directory, outputs.image, image);
		writeEvidenceFile(directory, outputs.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
	} finally {
		closeQuietly(directory.descriptor);
	}
	return outputs;
}

export function evidenceMetadata(capture, versions, revision) {
	return Object.freeze({
		schemaVersion: 1,
		caseId: capture.caseId,
		stateId: capture.stateId,
		viewportId: capture.viewportId,
		viewport: capture.viewport,
		colorScheme: capture.colorScheme,
		browser: Object.freeze({name: 'chromium', version: versions.chromium}),
		playwrightVersion: versions.playwright,
		revision,
		fullPage: true,
	});
}

export function evidencePaths(capture, root = path.resolve('tests/Browser/Screenshots/visual-review')) {
	const outputRoot = path.resolve(root);
	const parsed = path.parse(outputRoot);
	let cursor = parsed.root;
	for (const segment of outputRoot.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
		cursor = path.join(cursor, segment);
		if (!fs.existsSync(cursor)) continue;
		const stat = fs.lstatSync(cursor);
		if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('visual review output escapes working directory');
	}
	const base = `${capture.caseId}--${capture.stateId}--${capture.viewportId}`;
	const image = path.resolve(outputRoot, `${base}.png`);
	const metadata = path.resolve(outputRoot, `${base}.json`);
	for (const candidate of [image, metadata]) {
		if (!candidate.startsWith(`${outputRoot}${path.sep}`)) throw new Error('visual review output escapes working directory');
		if (fs.existsSync(candidate)) {
			const stat = fs.lstatSync(candidate);
			if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('visual review output escapes working directory');
		}
	}
	return Object.freeze({image, metadata});
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
