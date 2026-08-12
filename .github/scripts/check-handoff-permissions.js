// $KYAULabs: check-handoff-permissions.js kyau@aura.kyaulabs 2026/08/12 -0700 Exp $








'use strict';

// Validate machine-readable prism-handoff declarations (ADR-0054) against the
// actor's effective OpenCode permissions. Autonomous skill/task/bash/edit/
// external_directory handoffs resolve global rules → agent Markdown frontmatter
// → inline opencode.jsonc agent overrides, last matching rule winning. allow
// passes, ask warns (exit 0), deny is a defect that fails validation, and
// malformed declarations, unknown actors/targets, and indeterminate
// composition fail closed. Human recommend-primary/recommend-subagent
// transitions validate target existence and mode after Markdown/inline
// composition.
//
// Usage: node check-handoff-permissions.js <opencode.jsonc> <.opencode-root>
// Emits stable `handoff-contract: ERROR:` / `handoff-contract: WARN:` lines and
// exits 1 when any error was emitted, else 0.

const fs = require('fs');
const path = require('path');
const { stripJsoncComments } = require('./jsonc-strip');
const { parseFrontmatter } = require('./frontmatter-parser');

const autonomousActions = new Set(['skill', 'task', 'bash', 'edit', 'external_directory']);
const recommendationActions = new Map([
	['recommend-primary', 'primary'],
	['recommend-subagent', 'subagent'],
]);
const errors = [];
const warnings = [];
const { globMatches } = require('./glob-match');

function applyPermission(value, target, state) {
	if (typeof value === 'string') return { verdict: value, determinate: true };
	if (value === undefined) return state;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return { verdict: 'deny', determinate: false };
	}
	let verdict = state.verdict;
	for (const [pattern, action] of Object.entries(value)) {
		if (!['allow', 'ask', 'deny'].includes(action)) return { verdict: 'deny', determinate: false };
		if (globMatches(pattern, target)) verdict = action;
	}
	return { verdict, determinate: state.determinate };
}

/**
 * Resolve an action's permission rules from a permission container.
 *
 * Distinguishes three shapes per ADR-0054 composition: an absent key
 * (undefined → fall through to the next layer), a flat-string verdict
 * (e.g. {"skill": "deny"} → passed to applyPermission as-is), and a
 * malformed container (non-object, array, or null → null so the caller
 * fails closed instead of indexing into it and silently allowing).
 *
 * @param  {*}        container  The permission block (may be undefined).
 * @param  {string}   action     Permission key to resolve (skill, task, ...).
 * @return {*|null}              Rules, flat verdict, undefined, or null.
 */
function permissionRules(container, action) {
	if (container === undefined) return undefined;
	// An explicit null (YAML empty value, or the null stored for a malformed
	// agent) must fail closed — never fall through to a lower layer where a
	// permissive allow could stand.
	if (container === null) return null;
	if (typeof container !== 'object' || Array.isArray(container)) return null;
	return container[action];
}

function effectivePermission(config, agents, actor, action, target) {
	let state = { verdict: 'allow', determinate: true };
	state = applyPermission(permissionRules(config.permission, action), target, state);
	state = applyPermission(permissionRules(agents[actor] && agents[actor].permission, action), target, state);
	state = applyPermission(
		permissionRules(config.agent && config.agent[actor] && config.agent[actor].permission, action),
		target,
		state,
	);
	return state;
}

function error(line) { errors.push(line); }
function warn(line) { warnings.push(line); }

// ── Input loading ───────────────────────────────────────────────────────────

function loadConfig(configPath) {
	const raw = fs.readFileSync(configPath, 'utf8');
	return JSON.parse(stripJsoncComments(raw));
}

function loadAgents(agentsDir) {
	const agents = {};
	if (!fs.existsSync(agentsDir)) return agents;
	for (const entry of fs.readdirSync(agentsDir)) {
		if (!entry.endsWith('.md')) continue;
		const name = entry.slice(0, -3);
		const content = fs.readFileSync(path.join(agentsDir, entry), 'utf8');
		let fm = null;
		try {
			fm = parseFrontmatter(content);
		} catch {
			// Unparseable frontmatter stays null → malformed agent below.
		}
		if (fm && typeof fm === 'object') {
			// Keep a missing permission:/mode: key as undefined (not null):
			// applyPermission treats null as a malformed record, but an absent
			// frontmatter block must fall through to the next composition
			// layer (inline agent override, then global) per ADR-0054.
			agents[name] = { mode: fm.mode, permission: fm.permission };
		} else {
			agents[name] = { mode: null, permission: null, malformed: true };
		}
	}
	return agents;
}

// Recursively collect every .md file under a root.
function collectMarkdown(dir, out) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir)) {
		const full = path.join(dir, entry);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) collectMarkdown(full, out);
		else if (entry.endsWith('.md')) out.push(full);
	}
	return out;
}

// Known skill: a directory named <target> containing SKILL.md under the root.
function skillExists(root, target) {
	return fs.existsSync(path.join(root, 'skills', target, 'SKILL.md'));
}

// ── Agent-mode composition ──────────────────────────────────────────────────
// Markdown frontmatter mode wins (the .md is the agent definition; inline
// entries only add model/variant config, ADR-0022). Inline-only agents default
// to 'primary' (OpenCode's implicit mode for config-defined agents).

function agentMode(config, agents, name) {
	// A malformed Markdown agent (unparseable frontmatter) stays unknown
	// regardless of an inline config.agent entry, which only adds
	// model/variant (ADR-0022) and must not promote a broken definition.
	if (agents[name] && agents[name].malformed) return null;
	if (agents[name] && agents[name].mode) return agents[name].mode;
	if (config.agent && config.agent[name]) {
		return config.agent[name].mode || 'primary';
	}
	// A known, well-formed Markdown agent without an explicit mode defaults
	// to 'primary' (OpenCode's implicit mode for agent definitions).
	if (agents[name]) return 'primary';
	return null;
}

function agentKnown(config, agents, name) {
	return Boolean(agents[name]) || Boolean(config.agent && config.agent[name]);
}

// ── Declaration scanning ────────────────────────────────────────────────────
// One-line HTML comments: <!-- prism-handoff {...} -->. A line containing
// 'prism-handoff' that does not match the full one-line shape is malformed
// (fail closed).

function scanDeclarations(root) {
	const declarations = [];
	for (const sub of ['agents', 'commands', 'skills']) {
		const files = collectMarkdown(path.join(root, sub), []);
		for (const file of files) {
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			const rel = path.join(root, path.relative(root, file));
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (!line.includes('prism-handoff')) continue;
				const match = line.match(/<!--\s*prism-handoff\s+(\{.*\})\s*-->/);
				if (!match) {
					declarations.push({ file: rel, line: i + 1, malformed: 'one-line <!-- prism-handoff {...} --> declaration expected' });
					continue;
				}
				let payload;
				try {
					payload = JSON.parse(match[1]);
				} catch (jsonErr) {
					declarations.push({ file: rel, line: i + 1, malformed: `invalid JSON: ${jsonErr.message}` });
					continue;
				}
				if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
					declarations.push({ file: rel, line: i + 1, malformed: 'payload is not a JSON object' });
					continue;
				}
				declarations.push({ file: rel, line: i + 1, payload });
			}
		}
	}
	return declarations;
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkRecommendation(config, agents, decl) {
	const { payload } = decl;
	const action = payload.action;
	const kind = action === 'recommend-primary' ? 'primary' : 'subagent';
	const label = `${decl.file}:${decl.line}:`;

	const unknown = Object.keys(payload).filter((k) => k !== 'action' && k !== 'target');
	if (unknown.length > 0) {
		error(`handoff-contract: ERROR: ${label} unknown prism-handoff key(s): ${unknown.join(', ')}`);
		return;
	}
	if (payload.target === undefined) {
		error(`handoff-contract: ERROR: ${label} recommendation prism-handoff requires exactly 'action' and 'target'`);
		return;
	}

	const mode = agentMode(config, agents, payload.target);
	if (!agentKnown(config, agents, payload.target) || mode === null) {
		error(`handoff-contract: ERROR: ${label} ${action} target '${payload.target}' is not a known agent`);
		return;
	}
	if (mode !== kind) {
		error(`handoff-contract: ERROR: ${label} ${action} target '${payload.target}' has mode '${mode}', expected '${kind}'`);
	}
}

function checkAutonomous(config, agents, root, decl) {
	const { payload } = decl;
	const label = `${decl.file}:${decl.line}:`;

	const unknown = Object.keys(payload).filter((k) => k !== 'actor' && k !== 'action' && k !== 'target');
	if (unknown.length > 0) {
		error(`handoff-contract: ERROR: ${label} unknown prism-handoff key(s): ${unknown.join(', ')}`);
		return;
	}
	if (payload.actor === undefined || payload.target === undefined) {
		error(`handoff-contract: ERROR: ${label} autonomous prism-handoff requires exactly 'actor', 'action', and 'target'`);
		return;
	}

	const actor = payload.actor;
	const action = payload.action;
	const target = payload.target;

	if (!agentKnown(config, agents, actor)) {
		error(`handoff-contract: ERROR: ${label} unknown prism-handoff actor '${actor}'`);
		return;
	}

	if (action === 'task') {
		const mode = agentMode(config, agents, target);
		if (!agentKnown(config, agents, target) || mode === null) {
			error(`handoff-contract: ERROR: ${label} task target '${target}' is not a known agent`);
			return;
		}
		if (mode !== 'subagent') {
			error(`handoff-contract: ERROR: ${label} task target '${target}' has mode '${mode}' — primary agents cannot be dispatched as subagents`);
			return;
		}
	} else if (action === 'skill') {
		if (!skillExists(root, target)) {
			error(`handoff-contract: ERROR: ${label} skill target '${target}' is not a known skill`);
			return;
		}
	}

	const state = effectivePermission(config, agents, actor, action, target);
	if (!state.determinate || !['allow', 'ask', 'deny'].includes(state.verdict)) {
		error(`handoff-contract: ERROR: ${label} ${actor} autonomous ${action} on '${target}' is indeterminate (malformed permission record)`);
		return;
	}
	if (state.verdict === 'deny') {
		error(`handoff-contract: ERROR: ${label} ${actor} autonomous ${action} on '${target}' is denied by effective permissions`);
		return;
	}
	if (state.verdict === 'ask') {
		warn(`handoff-contract: WARN: ${label} ${actor} autonomous ${action} on '${target}' is ask-gated and requires human approval`);
	}
}

function run(configPath, root) {
	let config;
	try {
		config = loadConfig(configPath);
	} catch (configErr) {
		error(`handoff-contract: ERROR: cannot parse config ${configPath}: ${configErr.message}`);
		return;
	}
	const agents = loadAgents(path.join(root, 'agents'));

	for (const decl of scanDeclarations(root)) {
		if (decl.malformed) {
			error(`handoff-contract: ERROR: ${decl.file}:${decl.line}: malformed prism-handoff declaration (${decl.malformed})`);
			continue;
		}
		const { action } = decl.payload;
		if (action === undefined) {
			error(`handoff-contract: ERROR: ${decl.file}:${decl.line}: malformed prism-handoff declaration (missing 'action')`);
			continue;
		}
		if (autonomousActions.has(action)) {
			checkAutonomous(config, agents, root, decl);
		} else if (recommendationActions.has(action)) {
			checkRecommendation(config, agents, decl);
		} else {
			error(`handoff-contract: ERROR: ${decl.file}:${decl.line}: unknown prism-handoff action '${action}'`);
		}
	}
}

const main = () => {
	const configPath = process.argv[2];
	const root = process.argv[3];
	if (!configPath || !root) {
		error('handoff-contract: ERROR: usage: node check-handoff-permissions.js <opencode.jsonc> <.opencode-root>');
		process.exitCode = 1;
		return;
	}

	run(configPath, root);

	for (const line of errors) console.error(line);
	for (const line of warnings) console.error(line);
	process.exitCode = errors.length > 0 ? 1 : 0;
};

if (require.main === module) {
	main();
}

module.exports = { globMatches, applyPermission, effectivePermission, agentMode, scanDeclarations };








// vim: ft=javascript sts=4 sw=4 ts=4 noet :
