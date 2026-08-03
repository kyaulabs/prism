// $KYAULabs: check-frontend-agent-contract.js kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $


// Check the FRONTEND agent routing contract (ADR-0049).
// Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md>
// Emits one stable 'frontend-contract: ' diagnostic per violation and exits 1;
// emits nothing and exits 0 when the contract holds. Parses JSONC with the
// same string-aware comment stripping as inline-agent-permissions.js, parses
// both Markdown frontmatters with js-yaml, and preserves object key order via
// Object.keys() — rule order matters because the last matching rule wins.

'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

const frontendSkills = [
	'frontend-design',
	'frontend-architecture',
	'scss-mobile-first',
	'accessibility',
];

const expectedGlobalSkillKeys = ['*', ...frontendSkills];
const expectedTddTaskKeys = ['*', 'frontend'];
const expectedFrontendSkillKeys = frontendSkills;

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

const credentialRules = {
	'*.env': 'deny',
	'*.env.*': 'deny',
	'*.env.example': 'allow',
	'*auth.json*': 'deny',
	'*mcp-auth.json*': 'deny',
};

const gitWriteKeys = ['git add*', 'git stage*', 'git commit*', 'git push*', 'git tag*'];

const forbiddenAllowPatterns = ['npm install', 'pip install', 'sass', 'uglifyjs', 'cdn/css', 'cdn/javascript'];

const violations = [];

function violation(message) {
	violations.push(`frontend-contract: ${message}`);
}

function sameKeys(actual, expected) {
	const keys = Object.keys(actual);
	return keys.length === expected.length && expected.every((key, i) => keys[i] === key);
}

function sameValues(actual, expected) {
	return Object.keys(expected).every((key) => actual[key] === expected[key]);
}

// Strip JSONC comments (// line comments and /* */ block comments) while
// preserving string content. Mirrors inline-agent-permissions.js.
function stripJsoncComments(content) {
	let stripped = '';
	let i = 0;
	let inString = false;
	while (i < content.length) {
		const ch = content[i];
		if (inString) {
			if (ch === '\\' && i + 1 < content.length) {
				stripped += ch + content[i + 1];
				i += 2;
				continue;
			}
			if (ch === '"') inString = false;
			stripped += ch;
			i++;
			continue;
		}
		if (ch === '"') { inString = true; stripped += ch; i++; continue; }
		if (ch === '/' && content[i + 1] === '/') {
			i += 2;
			while (i < content.length && content[i] !== '\n') i++;
			continue;
		}
		if (ch === '/' && content[i + 1] === '*') {
			i += 2;
			while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
			i += 2;
			continue;
		}
		stripped += ch;
		i++;
	}
	return stripped;
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
	let content;
	try {
		content = fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
	content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = content.split('\n');
	if (lines[0] !== '---') return null;
	const fmLines = [];
	let foundClosing = false;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === '---') {
			foundClosing = true;
			break;
		}
		fmLines.push(lines[i]);
	}
	if (!foundClosing) return null;
	try {
		const doc = yaml.load(fmLines.join('\n'));
		return doc && typeof doc === 'object' ? doc : null;
	} catch {
		return null;
	}
}

const file = process.argv[2];
const frontendAgentFile = process.argv[3];
const tddAgentFile = process.argv[4];

if (!file || !frontendAgentFile || !tddAgentFile) {
	console.error('Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md>');
	process.exit(2);
}

const cfg = readJsoncFile(file);
const frontend = readFrontmatter(frontendAgentFile);
const tdd = readFrontmatter(tddAgentFile);

if (cfg === null) violation(`cannot parse JSONC config ${file}`);
if (frontend === null) violation(`cannot parse frontmatter ${frontendAgentFile}`);
if (tdd === null) violation(`cannot parse frontmatter ${tddAgentFile}`);

if (cfg !== null) {
	// ── subagent_depth ──────────────────────────────────────────────────────
	if (cfg.subagent_depth !== 3) {
		violation('subagent_depth must be exactly 3');
	}

	// ── Global skill rules: catch-all '*' first, then the exact four denies ─
	const skill = cfg.permission && cfg.permission.skill;
	if (!skill || typeof skill !== 'object' || !sameKeys(skill, expectedGlobalSkillKeys)
		|| skill['*'] !== 'allow' || !frontendSkills.every((name) => skill[name] === 'deny')) {
		violation("global skill rules must allow '*' first and deny exactly the four frontend skills");
	}

	// ── @frontend tier config: model, variant, literal temperature, hidden ──
	const frontendConfig = cfg.agent && cfg.agent.frontend;
	if (!frontendConfig || typeof frontendConfig !== 'object'
		|| frontendConfig.model !== '{env:OPENCODE_MODEL_FRONTEND}'
		|| frontendConfig.variant !== '{env:OPENCODE_VARIANT_FRONTEND}'
		|| frontendConfig.temperature !== 0.3
		|| frontendConfig.hidden !== true) {
		violation('@frontend config must set model, variant, temperature 0.3, and hidden true');
	}
}

if (tdd !== null) {
	// ── @tdd task rules: catch-all '*' deny first, then the exact frontend allow ─
	const tddTask = tdd.permission && tdd.permission.task;
	if (!tddTask || typeof tddTask !== 'object' || !sameKeys(tddTask, expectedTddTaskKeys)
		|| tddTask['*'] !== 'deny' || tddTask.frontend !== 'allow') {
		violation("@tdd task rules must deny '*' first and allow only frontend");
	}
}

if (frontend !== null) {
	// ── @frontend frontmatter: mode, literal temperature, LSP access ────────
	if (frontend.mode !== 'subagent' || frontend.temperature !== 0.3
		|| !(frontend.permission && frontend.permission.lsp === 'allow')) {
		violation('@frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow');
	}

	const perm = frontend.permission || {};

	// ── @frontend is terminal: no task dispatch, web, or external dirs ──────
	if (perm.task !== 'deny' || perm.webfetch !== 'deny' || perm.websearch !== 'deny'
		|| perm.external_directory !== 'deny') {
		violation('@frontend must deny task, webfetch, websearch, and external_directory');
	}

	// ── @frontend edit rules: catch-all '*' first, exact keys/values, and
	// generated assets denied ───────────────────────────────────────────────
	const edit = perm.edit;
	if (!edit || typeof edit !== 'object' || !sameKeys(edit, expectedEditKeys)
		|| !sameValues(edit, expectedEditValues)) {
		violation("@frontend edit rules must keep '*' first and generated assets denied");
	}

	// ── @frontend bash rules: catch-all '*' deny first, credential denies,
	// all git-write denies, and no install/asset-build allows ───────────────
	const bash = perm.bash;
	const bashKeys = bash && typeof bash === 'object' ? Object.keys(bash) : [];
	const bashOk = bash && typeof bash === 'object'
		&& bashKeys.length > 0 && bashKeys[0] === '*' && bash['*'] === 'deny'
		&& sameValues(bash, credentialRules)
		&& gitWriteKeys.every((key) => bash[key] === 'deny')
		&& !Object.keys(bash).some((key) => bash[key] === 'allow'
			&& forbiddenAllowPatterns.some((pattern) => key.includes(pattern)));
	if (!bashOk) {
		violation('@frontend bash rules may not allow git writes, installs, or asset builds');
	}

	// ── @frontend skill rules: exactly the four frontend skills at allow ───
	const frontendSkill = perm.skill;
	if (!frontendSkill || typeof frontendSkill !== 'object'
		|| !sameKeys(frontendSkill, expectedFrontendSkillKeys)
		|| !frontendSkills.every((name) => frontendSkill[name] === 'allow')) {
		violation('@frontend must allow exactly the four frontend skills');
	}
}

if (violations.length > 0) {
	for (const line of violations) process.stdout.write(`${line}\n`);
	process.exit(1);
}

process.exit(0);


// vim: ft=javascript sts=4 sw=4 ts=4 noet :
