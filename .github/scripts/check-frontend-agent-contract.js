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

const expectedFrontendConfigKeys = ['model', 'variant', 'temperature', 'hidden'];

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

	// ── @frontend tier config: exactly model, variant, literal temperature,
	// and hidden — no permission override. Config sources deep-merge, so an
	// inline permission block would silently override the terminal
	// frontmatter contract (ADR-0049). ─────────────────────────────────────
	const frontendConfig = cfg.agent && cfg.agent.frontend;
	const configOk = frontendConfig && typeof frontendConfig === 'object'
		&& sameKeys(frontendConfig, expectedFrontendConfigKeys)
		&& frontendConfig.model === '{env:OPENCODE_MODEL_FRONTEND}'
		&& frontendConfig.variant === '{env:OPENCODE_VARIANT_FRONTEND}'
		&& frontendConfig.temperature === 0.3
		&& frontendConfig.hidden === true;
	if (!configOk) {
		violation('@frontend config must be exactly model, variant, temperature 0.3, and hidden true with no permission override');
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
	// ── @frontend frontmatter: mode, literal temperature, LSP access; model
	// and variant live in opencode.jsonc config only (ADR-0022) ─────────────
	if (frontend.mode !== 'subagent' || frontend.temperature !== 0.3
		|| !(frontend.permission && frontend.permission.lsp === 'allow')
		|| 'model' in frontend || 'variant' in frontend) {
		violation('@frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow and omit model and variant');
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

	// ── @frontend bash rules: the exact ordered focused-check allowlist —
	// catch-all '*' deny first, only git status/diff, php -l, pest,
	// stylelint, and eslint allows, then the exact git-write and credential
	// denies. Missing, extra, reordered, or re-valued keys all violate the
	// contract (last-match-wins ordering). ──────────────────────────────────
	const bash = perm.bash;
	const bashOk = bash && typeof bash === 'object'
		&& sameKeys(bash, expectedBashKeys)
		&& sameValues(bash, expectedBashValues);
	if (!bashOk) {
		violation('@frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)');
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
