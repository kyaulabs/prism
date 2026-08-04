// $KYAULabs: check-frontend-agent-contract.js kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $





// Check the FRONTEND agent routing contract (ADR-0049).
// Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md> <skills-root>
// Emits one stable 'frontend-contract: ' diagnostic per violation and exits 1;
// emits nothing and exits 0 when the contract holds. Parses JSONC with the
// shared string-aware comment stripper (./jsonc-strip), parses
// both Markdown frontmatters with the shared parser (./frontmatter-parser),
// and preserves object key order via Object.keys() — permission rule order
// matters because the last matching rule wins. The ordered frontend skill set
// is derived from the recognized `metadata.prism.frontend-skill-order` string
// values in <skills-root>/*/SKILL.md; only the non-permission frontend tier
// config record is compared order-insensitively.

'use strict';

const fs = require('fs');
const path = require('path');
const { stripJsoncComments } = require('./jsonc-strip');
const { parseFrontmatter } = require('./frontmatter-parser');

const expectedEditKeys = [
	'*',
	'<app>/*.php', '<app>/**/*.php',
	'<app>/*.html', '<app>/**/*.html',
	'cdn/sass/**', 'cdn/js/**',
	'cdn/css/**', 'cdn/javascript/**',
];

const expectedEditValues = {
	'*': 'deny',
	'<app>/*.php': 'allow',
	'<app>/**/*.php': 'allow',
	'<app>/*.html': 'allow',
	'<app>/**/*.html': 'allow',
	'cdn/sass/**': 'allow',
	'cdn/js/**': 'allow',
	'cdn/css/**': 'deny',
	'cdn/javascript/**': 'deny',
};

const expectedBashKeys = [
	'*',
	'git status*', 'git diff*',
	'php -l*', 'php vendor/bin/pest*',
	'npx --no-install stylelint*', 'npx --no-install eslint*',
	'git add*', 'git stage*', 'git commit*', 'git push*', 'git tag*',
	'*.env', '*.env.*', '*.env.example', '*auth.json*', '*mcp-auth.json*',
];

const expectedBashValues = {
	'*': 'deny',
	'git status*': 'allow',
	'git diff*': 'allow',
	'php -l*': 'allow',
	'php vendor/bin/pest*': 'allow',
	'npx --no-install stylelint*': 'allow',
	'npx --no-install eslint*': 'allow',
	'git add*': 'deny',
	'git stage*': 'deny',
	'git commit*': 'deny',
	'git push*': 'deny',
	'git tag*': 'deny',
	'*.env': 'deny',
	'*.env.*': 'deny',
	'*.env.example': 'allow',
	'*auth.json*': 'deny',
	'*mcp-auth.json*': 'deny',
};

const violations = [];

function violation(message) {
	violations.push(`frontend-contract: ${message}`);
}

function matchesOrderedEntries(actual, expected) {
	if (!actual || typeof actual !== 'object') return false;
	const keys = Object.keys(actual);
	return keys.length === expected.length
		&& expected.every(([key, value], index) => keys[index] === key && actual[key] === value);
}

function matchesUnorderedRecord(actual, expected) {
	if (!actual || typeof actual !== 'object') return false;
	const keys = Object.keys(actual);
	return keys.length === Object.keys(expected).length
		&& Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function readJsoncFile(file) {
	let content;
	try {
		content = fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
	content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	try {
		return JSON.parse(stripJsoncComments(content));
	} catch {
		return null;
	}
}

function readFrontmatter(file) {
	try {
		return parseFrontmatter(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

function readFrontendSkills(skillsRoot) {
	const marked = [];
	for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillFile = path.join(skillsRoot, entry.name, 'SKILL.md');
		if (!fs.existsSync(skillFile)) continue;
		const doc = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
		const order = doc && doc.metadata && doc.metadata['prism.frontend-skill-order'];
		if (order === undefined) continue;
		if (typeof doc.name !== 'string' || typeof order !== 'string' || !/^[1-9]\d*$/.test(order)) {
			throw new Error('invalid frontend skill metadata');
		}
		marked.push({ name: doc.name, order: Number(order) });
	}

	if (marked.length === 0 || new Set(marked.map(({ order }) => order)).size !== marked.length) {
		throw new Error('missing or duplicate frontend skill metadata');
	}

	return marked.sort((a, b) => a.order - b.order).map(({ name }) => name);
}

const file = process.argv[2];
const frontendAgentFile = process.argv[3];
const tddAgentFile = process.argv[4];
const skillsRoot = process.argv[5];

if (!file || !frontendAgentFile || !tddAgentFile || !skillsRoot) {
	console.error('Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md> <skills-root>');
	process.exit(2);
}

const cfg = readJsoncFile(file);
const frontend = readFrontmatter(frontendAgentFile);
const tdd = readFrontmatter(tddAgentFile);

if (cfg === null) violation(`cannot parse JSONC config ${file}`);
if (frontend === null) violation(`cannot parse frontmatter ${frontendAgentFile}`);
if (tdd === null) violation(`cannot parse frontmatter ${tddAgentFile}`);

// ── Derive the ordered frontend skill set from self-declared metadata ──────
let frontendSkills = null;
try {
	frontendSkills = readFrontendSkills(skillsRoot);
} catch {
	violation(`cannot derive ordered frontend skills from ${skillsRoot}`);
}

const globalSkillRules = frontendSkills === null
	? []
	: [['*', 'allow'], ...frontendSkills.map((name) => [name, 'deny'])];
const tddTaskRules = [['*', 'deny'], ['frontend', 'allow']];
const frontendSkillRules = frontendSkills === null
	? []
	: frontendSkills.map((name) => [name, 'allow']);
const editRules = expectedEditKeys.map((key) => [key, expectedEditValues[key]]);
const bashRules = expectedBashKeys.map((key) => [key, expectedBashValues[key]]);
const expectedFrontendConfig = {
	model: '{env:OPENCODE_MODEL_FRONTEND}',
	variant: '{env:OPENCODE_VARIANT_FRONTEND}',
	temperature: 0.3,
	hidden: true,
};

const skill = cfg && cfg.permission && cfg.permission.skill;
const frontendConfig = cfg && cfg.agent && cfg.agent.frontend;
const tddTask = tdd && tdd.permission && tdd.permission.task;
const perm = (frontend && frontend.permission) || {};
const edit = perm.edit;
const bash = perm.bash;

// ── The nine contract clauses, evaluated in one loop ────────────────────────
// Permission objects stay insertion-sensitive (last-match-wins, ADR-0048):
// global skill, TDD task, edit, bash, and frontend skill rules use
// matchesOrderedEntries(). Only the non-permission @frontend tier config
// record (model/variant/temperature/hidden) is an order-insensitive exact
// record. Skill-dependent clauses are skipped when metadata derivation fails
// so the source diagnostic does not cascade into misleading allow/deny
// violations.
const clauses = [
	{ enabled: cfg !== null, ok: cfg !== null && cfg.subagent_depth === 3, message: 'subagent_depth must be exactly 3' },
	{ enabled: cfg !== null && frontendSkills !== null, ok: matchesOrderedEntries(skill, globalSkillRules), message: "global skill rules must allow '*' first and deny exactly the four frontend skills" },
	{ enabled: cfg !== null, ok: matchesUnorderedRecord(frontendConfig, expectedFrontendConfig), message: '@frontend config must be exactly model, variant, temperature 0.3, and hidden true with no permission override' },
	{ enabled: tdd !== null, ok: matchesOrderedEntries(tddTask, tddTaskRules), message: "@tdd task rules must deny '*' first and allow only frontend" },
	{ enabled: frontend !== null, ok: frontend.mode === 'subagent' && frontend.temperature === 0.3 && frontend.permission && frontend.permission.lsp === 'allow' && !('model' in frontend) && !('variant' in frontend), message: '@frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow and omit model and variant' },
	{ enabled: frontend !== null, ok: perm.task === 'deny' && perm.webfetch === 'deny' && perm.websearch === 'deny' && perm.external_directory === 'deny', message: '@frontend must deny task, webfetch, websearch, and external_directory' },
	{ enabled: frontend !== null, ok: matchesOrderedEntries(edit, editRules), message: "@frontend edit rules must keep '*' first and generated assets denied" },
	{ enabled: frontend !== null, ok: matchesOrderedEntries(bash, bashRules), message: '@frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)' },
	{ enabled: frontend !== null && frontendSkills !== null, ok: matchesOrderedEntries(perm.skill, frontendSkillRules), message: '@frontend must allow exactly the four frontend skills' },
];

for (const clause of clauses) {
	if (clause.enabled && !clause.ok) violation(clause.message);
}

if (violations.length > 0) {
	for (const line of violations) process.stdout.write(`${line}\n`);
	process.exit(1);
}

process.exit(0);





// vim: ft=javascript sts=4 sw=4 ts=4 noet :
