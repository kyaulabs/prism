// $KYAULabs: check-frontend-agent-contract.js kyau@aura.kyaulabs 2026/08/11 -0700 Exp $







// Check the FRONTEND agent routing contract (ADR-0049).
// Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md> <skills-root> <app>
// Emits one stable 'frontend-contract: ' diagnostic per violation and exits 1;
// emits nothing and exits 0 when the contract holds. Parses JSONC with the
// shared string-aware comment stripper (./jsonc-strip), parses
// both Markdown frontmatters with the shared parser (./frontmatter-parser),
// and preserves object key order via Object.keys() — permission rule order
// matters because the last matching rule wins. The ordered frontend skill set
// is derived from the recognized `metadata.prism.frontend-skill-order` string
// values in <skills-root>/*/SKILL.md; only the non-permission frontend tier
// config record is compared order-insensitively. The tracked frontend agent
// carries only the five static containment edit rules; the four literal
// app-scoped PHP/HTML leaves are composed at runtime (ADR-0051) and validated
// here against the configured app argument. The global skill rules also deny
// the two Design-owned skills (`brainstorming`, `prototype`) with a
// Design-only local re-allow (ADR-0054).

'use strict';

const fs = require('fs');
const path = require('path');
const { stripJsoncComments } = require('./jsonc-strip');
const { parseFrontmatter } = require('./frontmatter-parser');

const editRules = [
	['*', 'deny'],
	['cdn/sass/**', 'allow'],
	['cdn/js/**', 'allow'],
	['cdn/css/**', 'deny'],
	['cdn/javascript/**', 'deny'],
];

const bashRules = [
	['*', 'deny'],
	['git status*', 'allow'],
	['git diff*', 'allow'],
	['php -l*', 'allow'],
	['php vendor/bin/pest*', 'allow'],
	['npx --no-install stylelint*', 'allow'],
	['npx --no-install eslint*', 'allow'],
	['git add*', 'deny'],
	['git stage*', 'deny'],
	['git commit*', 'deny'],
	['git push*', 'deny'],
	['git tag*', 'deny'],
	['*.env', 'deny'],
	['*.env.*', 'deny'],
	['*.env.example', 'allow'],
	['*auth.json*', 'deny'],
	['*mcp-auth.json*', 'deny'],
];

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

const protectedAppRoots = new Set([
	'adr', 'aurora', 'backend', 'cdn', 'docs', 'node_modules', 'tests', 'vendor',
]);

function isSafeAppName(value) {
	return typeof value === 'string'
		&& /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(value)
		&& !protectedAppRoots.has(value.toLowerCase());
}

function appEditRules(app) {
	return [
		[`${app}/*.php`, 'allow'],
		[`${app}/**/*.php`, 'allow'],
		[`${app}/*.html`, 'allow'],
		[`${app}/**/*.html`, 'allow'],
	];
}

function globMatches(pattern, value) {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`).test(value);
}

function permissionVerdict(rules, value) {
	let verdict = null;
	if (!rules || typeof rules !== 'object') return verdict;
	for (const [pattern, action] of Object.entries(rules)) {
		if (globMatches(pattern, value)) verdict = action;
	}
	return verdict;
}

function entryVerdict(entries, value) {
	let verdict = null;
	for (const [pattern, action] of entries) {
		if (globMatches(pattern, value)) verdict = action;
	}
	return verdict;
}

function effectiveSkillPermission(config, agentName, skillName) {
	const globalVerdict = permissionVerdict(config.permission && config.permission.skill, skillName);
	const agent = config.agent && config.agent[agentName];
	const agentVerdict = permissionVerdict(agent && agent.permission && agent.permission.skill, skillName);
	return agentVerdict === null ? globalVerdict : agentVerdict;
}

function collectTemplateViolations(permission, owner, output) {
	if (!permission || typeof permission !== 'object') return;
	for (const [tool, rules] of Object.entries(permission)) {
		if (!rules || typeof rules !== 'object' || Array.isArray(rules)) continue;
		for (const pattern of Object.keys(rules)) {
			if (/<[^>]+>|\{(?:env|file):[^}]+\}/.test(pattern)) {
				output.push(`${owner}.${tool}:${pattern}`);
			}
		}
	}
}

function deniedFrontendPromptLoads(config, frontendSkills) {
	const found = [];
	for (const [agentName, agent] of Object.entries(config.agent || {})) {
		const prompt = typeof agent.prompt === 'string' ? agent.prompt : '';
		const pattern = /\bload(?:\s+the)?\s+([a-z0-9-]+)\s+skill\b/gi;
		for (const match of prompt.matchAll(pattern)) {
			const skillName = match[1].toLowerCase();
			if (frontendSkills.includes(skillName)
				&& effectiveSkillPermission(config, agentName, skillName) !== 'allow') {
				found.push(`${agentName}:${skillName}`);
			}
		}
	}
	return found;
}

const file = process.argv[2];
const frontendAgentFile = process.argv[3];
const tddAgentFile = process.argv[4];
const skillsRoot = process.argv[5];
const app = process.argv[6];

if (!file || !frontendAgentFile || !tddAgentFile || !skillsRoot || !app) {
	console.error('Usage: node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md> <skills-root> <app>');
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

const designOwnedSkills = ['brainstorming', 'prototype'];
const globalSkillRules = frontendSkills === null
	? []
	: [
		['*', 'allow'],
		...designOwnedSkills.map((name) => [name, 'deny']),
		...frontendSkills.map((name) => [name, 'deny']),
	];
const tddTaskRules = [['*', 'deny'], ['frontend', 'allow']];
const designSkillRules = designOwnedSkills.map((name) => [name, 'allow']);
const designSkill = cfg && cfg.agent && cfg.agent.design
	&& cfg.agent.design.permission && cfg.agent.design.permission.skill;
const frontendSkillRules = frontendSkills === null
	? []
	: frontendSkills.map((name) => [name, 'allow']);
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

// ── Split static/runtime contract surface (ADR-0051) ────────────────────────
// The tracked frontend agent carries only the five static containment rules;
// the four literal app-scoped PHP/HTML leaves are composed at runtime. Collect
// unresolved template tokens from every permission map (global, inline agents,
// tdd.md, frontend.md), guard denied frontend-skill load instructions in
// inline agent prompts, and pin the build → @tdd → @frontend routing handoff.

const templateViolations = [];
collectTemplateViolations(cfg && cfg.permission, 'global', templateViolations);
for (const [name, agent] of Object.entries((cfg && cfg.agent) || {})) {
	collectTemplateViolations(agent.permission, `agent.${name}`, templateViolations);
}
collectTemplateViolations(tdd && tdd.permission, 'agent.tdd', templateViolations);
collectTemplateViolations(frontend && frontend.permission, 'agent.frontend', templateViolations);

const promptLoads = cfg !== null && frontendSkills !== null
	? deniedFrontendPromptLoads(cfg, frontendSkills)
	: [];
const buildPrompt = cfg && cfg.agent && cfg.agent.build && cfg.agent.build.prompt;
const effectiveEditRules = isSafeAppName(app)
	? [...editRules, ...appEditRules(app)]
	: [];
const appScopeHolds = isSafeAppName(app)
	&& [
		`${app}/index.php`,
		`${app}/pages/home.php`,
		`${app}/index.html`,
		`${app}/pages/home.html`,
	].every((candidate) => entryVerdict(effectiveEditRules, candidate) === 'allow')
	&& [
		'backend/index.php',
		'tests/Feature/HomeTest.php',
		'aurora/index.php',
		'vendor/index.php',
		'opencode.jsonc',
		'.github/scripts/check-frontend-agent-contract.js',
	].every((candidate) => entryVerdict(effectiveEditRules, candidate) === 'deny');

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
	{ enabled: cfg !== null && frontendSkills !== null, ok: matchesOrderedEntries(skill, globalSkillRules), message: "global skill rules must allow '*' first and deny exactly the two Design-owned and four frontend skills" },
	{ enabled: cfg !== null, ok: matchesOrderedEntries(designSkill, designSkillRules), message: 'design agent skill rules must allow exactly brainstorming and prototype' },
	{ enabled: cfg !== null, ok: matchesUnorderedRecord(frontendConfig, expectedFrontendConfig), message: '@frontend config must be exactly model, variant, temperature 0.3, and hidden true with no permission override' },
	{ enabled: tdd !== null, ok: matchesOrderedEntries(tddTask, tddTaskRules), message: "@tdd task rules must deny '*' first and allow only frontend" },
	{ enabled: frontend !== null, ok: frontend.mode === 'subagent' && frontend.temperature === 0.3 && frontend.permission && frontend.permission.lsp === 'allow' && !('model' in frontend) && !('variant' in frontend), message: '@frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow and omit model and variant' },
	{ enabled: frontend !== null, ok: perm.task === 'deny' && perm.webfetch === 'deny' && perm.websearch === 'deny' && perm.external_directory === 'deny', message: '@frontend must deny task, webfetch, websearch, and external_directory' },
	{ enabled: frontend !== null, ok: matchesOrderedEntries(edit, editRules), message: "@frontend edit rules must keep '*' first and generated assets denied" },
	{ enabled: frontend !== null, ok: matchesOrderedEntries(bash, bashRules), message: '@frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)' },
	{ enabled: frontend !== null && frontendSkills !== null, ok: matchesOrderedEntries(perm.skill, frontendSkillRules), message: '@frontend must allow exactly the four frontend skills' },
	{ enabled: true, ok: isSafeAppName(app), message: 'configured app must be a safe project-local webroot name' },
	{ enabled: true, ok: templateViolations.length === 0, message: 'permission patterns must not contain unresolved template tokens' },
	{ enabled: frontend !== null && isSafeAppName(app), ok: appScopeHolds, message: '@frontend composed edit rules must resolve to the configured app scope' },
	{ enabled: cfg !== null && frontendSkills !== null, ok: promptLoads.length === 0, message: 'agent prompts must not instruct loading frontend skills denied by effective permissions' },
	{ enabled: typeof buildPrompt === 'string', ok: /@tdd\s*(?:→|->)\s*@frontend/.test(buildPrompt), message: 'build prompt must route frontend work through @tdd → @frontend' },
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
