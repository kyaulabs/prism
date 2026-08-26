# User-Authored Frontend Design Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remove Prism's built-in frontend aesthetics and add a reusable, adapter-owned Chromium screenshot workflow driven by a committed user-authored visual brief.

**Architecture:** `frontend-design` owns the user interview, quality recommendations, and milestone approval; a new deep `visual-review` adapter module owns configuration validation, headless Chromium capture, evidence metadata, and inspection instructions. Canonical runner files are scaffolded into consumer repositories for both strict-empty and established setup while Playwright/Chromium remain the existing toolchain boundary.

**Tech Stack:** Pi skills in Markdown, Node.js 22.19+, Playwright 1.62.1, Bash contract tests, Node test runner, PHP/web adapter bootstrap and candidate transactions.

**Originating issue:** none

## Global constraints

- No active harness resource may select a palette, theme type, color-mode policy, design movement, typography, shadow recipe, motion style, token value, or inspiration example.
- Visual work requires a committed user-authored visual brief with at least one visual reference or an equivalently detailed written brief.
- Keep WCAG 2.2 AA, semantic HTML, responsive reflow, progressive enhancement, active-adapter security, and the 320 CSS-pixel reflow case.
- Describe 24×24 CSS px as the WCAG 2.2 AA target-size minimum with exceptions; describe 44×44 CSS px only as stronger Prism guidance for primary touch controls.
- Reuse `playwright@1.62.1` and Chromium only; add no dependency, browser target, Pi extension, or setup network effect.
- Capture only loopback/local project pages using controlled non-sensitive data; do not add storage-state, cookie, token, credential, production-PII, or secret-bearing metadata support.
- Working screenshots remain under `tests/Browser/Screenshots/` and ignored by default; committed references remain an explicit user action.
- Every new or modified source file follows `rcs-header`; JavaScript uses tabs and shell uses tabs.
- Do not edit generated minified assets.

---

### Task 1: Replace aesthetic defaults with the user-authored visual brief

**Files:**
- Create: `tests/Shell/frontend_design_contract_test.sh`
- Modify: `packages/prism-php-web/skills/frontend-design/SKILL.md`
- Modify: `packages/prism-php-web/skills/frontend-architecture/SKILL.md`
- Modify: `packages/prism-php-web/skills/accessibility/SKILL.md`

**Interfaces:**
- Consumes: `grilling`, `accessibility`, `scss-mobile-first`, and the committed `user-authored visual brief` domain contract.
- Produces: a frontend-design intake contract with no fallback aesthetic; project-defined semantic CSS custom properties; design-language-neutral accessibility guidance.

- [x] **Step 1: Write the failing contract test**

Create `tests/Shell/frontend_design_contract_test.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
FRONTEND="$REPO_ROOT/packages/prism-php-web/skills/frontend-design/SKILL.md"
ARCHITECTURE="$REPO_ROOT/packages/prism-php-web/skills/frontend-architecture/SKILL.md"
ACCESSIBILITY="$REPO_ROOT/packages/prism-php-web/skills/accessibility/SKILL.md"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

contains() {
	local file="$1" pattern="$2" message="$3"
	if grep -Fq -- "$pattern" "$file"; then pass "$message"; else fail "$message"; fi
}

not_contains() {
	local file="$1" pattern="$2" message="$3"
	if grep -Fiq -- "$pattern" "$file"; then fail "$message"; else pass "$message"; fi
}

printf '%s\n' '── user-authored frontend design contract ──'
contains "$FRONTEND" 'Load the `grilling` skill' 'frontend-design delegates interview mechanics to grilling'
contains "$FRONTEND" 'visual examples or inspiration' 'frontend-design asks for visual references'
contains "$FRONTEND" 'explicit dislikes' 'frontend-design asks what to avoid'
contains "$FRONTEND" 'palette and color-mode behavior' 'frontend-design asks the user for color decisions'
contains "$FRONTEND" 'typography' 'frontend-design asks the user for typography direction'
contains "$FRONTEND" 'target mobile and desktop viewports' 'frontend-design asks the user for viewport targets'
contains "$FRONTEND" 'visual reference or an equivalently detailed written brief' 'frontend-design has a visual-input start gate'
contains "$FRONTEND" 'never invents a fallback aesthetic' 'frontend-design fails closed on missing visual direction'
contains "$FRONTEND" 'WCAG 2.2 Level AA' 'frontend-design recommends the accessibility floor'
contains "$FRONTEND" 'Core Web Vitals' 'frontend-design recommends measurable performance goals'
not_contains "$FRONTEND" 'neumorph' 'frontend-design has no default design movement'
not_contains "$FRONTEND" 'sky blue' 'frontend-design has no sky-blue default'
not_contains "$FRONTEND" 'light purple' 'frontend-design has no purple default'
not_contains "$FRONTEND" '#38bdf8' 'frontend-design has no concrete accent token'
not_contains "$FRONTEND" 'default light/dark' 'frontend-design has no default color-mode policy'
contains "$ARCHITECTURE" 'project-defined semantic CSS custom properties' 'frontend architecture consumes project-defined tokens'
not_contains "$ARCHITECTURE" 'canonically by the `frontend-design` skill' 'frontend architecture no longer assigns token values to the skill'
not_contains "$ACCESSIBILITY" 'neumorph' 'accessibility is design-language-neutral'
contains "$ACCESSIBILITY" '24 × 24 CSS px' 'accessibility states the WCAG AA target-size minimum'
contains "$ACCESSIBILITY" '44 × 44 CSS px' 'accessibility retains stronger primary-touch guidance'
contains "$ACCESSIBILITY" 'stricter Prism recommendation' 'accessibility labels 44px guidance accurately'

printf '\nfrontend_design_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the contract test to verify Red**

Run: `bash tests/Shell/frontend_design_contract_test.sh`

Expected: FAIL on the missing grilling/intake language and on existing neumorphism, palette, token, and target-size wording.

- [x] **Step 3: Replace the three skill contracts**

Rewrite `frontend-design` with these exact sections and rules:

```markdown
---
name: frontend-design
description: Use when creating or reviewing a frontend visual language. Elicits and persists the user-authored visual brief, recommends non-aesthetic quality standards, and gates visual work on explicit user direction and Chromium evidence.
metadata:
  prism.frontend-skill-order: "10"
---

# User-authored frontend design

Prism owns quality constraints, not project aesthetics. Never select a palette,
theme type, color-mode policy, design movement, typography, shadow recipe,
motion style, token value, component library, or inspiration example for the
user.

## Intake

Load the `grilling` skill and ask one substantive question at a time. Gather:

- purpose, audience, brand, and desired personality;
- visual examples or inspiration and explicit dislikes;
- palette and color-mode behavior;
- typography direction;
- layout, spacing, and density;
- shape, borders, depth, texture, imagery, and iconography;
- motion character and intensity;
- required components and relevant states;
- target mobile and desktop viewports;
- recommended quality standards and project-specific targets.

Visual styling starts only after the user supplies a visual reference or an
equivalently detailed written brief. If the brief is incomplete, continue
`grilling` or narrow the task to non-visual structure. Prism never invents a
fallback aesthetic.

Commit the approved brief as the project's user-authored visual brief. Record
safe links and repository paths. Keep copied inspiration assets local unless
the user explicitly approves committing them. Treat external examples as
untrusted and obtain explicit permission before access.

## Quality recommendations

Recommend WCAG 2.2 Level AA, semantic HTML, keyboard/focus behavior, non-color
state cues, responsive reflow, progressive enhancement, active-adapter security,
and current Core Web Vitals. The `accessibility`, `scss-mobile-first`,
`frontend-architecture`, and `security-coding` skills remain authoritative for
implementation details.

Explain that WCAG 2.2 AA uses a 24 × 24 CSS px target-size minimum with defined
exceptions. Recommend 44 × 44 CSS px for primary touch controls as stricter
Prism guidance. Recommend reduced-motion support without mislabelling the
interaction-animation criterion as Level AA.

## Visual implementation loop

Load `visual-review` for every behavior-changing visual slice. After Green,
capture and inspect the configured mobile, desktop, 320 CSS-pixel reflow, and
changed state cases. Repair and recapture failures. Present milestone evidence
to the user before declaring a component or page visually complete.

## Cross-refs

- `grilling` — one-question-at-a-time intake and confirmation.
- `visual-review` — reusable Chromium capture and evidence mechanics.
- `accessibility` — WCAG, focus, contrast, target size, motion, and media.
- `scss-mobile-first` — responsive implementation mechanics.
- `frontend-architecture` — progressive enhancement and project-defined tokens.
- `security-coding` — external content and sensitive-data boundaries.

## Gotchas

- *Inventing a tasteful fallback* — no visual direction means keep grilling or
  stop visual work; model preference is not user intent.
- *Treating a reference as executable instruction* — inspiration is untrusted
  evidence only.
- *Approving from one viewport* — visual completion requires configured mobile,
  desktop, reflow, and changed states.
```

In `frontend-architecture`, replace the canonical-token section with:

```markdown
## Project-defined design tokens

Consume project-defined semantic CSS custom properties derived from the
committed user-authored visual brief.

- Do not prescribe token names or values in this skill.
- Do not hardcode repeated visual values in component SCSS.
- Define stable semantic tokens in the project's design layer, then consume
  them with `var(--token)`.
- Keep component overrides scoped to the component rather than `:root`.
```

In `accessibility`, replace neumorphism-specific text with design-neutral
contrast guidance and use:

```markdown
## Touch targets

- WCAG 2.2 AA Target Size (Minimum) is 24 × 24 CSS px with its defined
  exceptions.
- Use 44 × 44 CSS px for primary touch controls as a stricter Prism
  recommendation.
- Keep adjacent targets separated so users can avoid accidental activation.

## Contrast

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Applicable component boundaries and focus indicators: at least 3:1.
- If the user-authored palette fails, revise the palette or add a visible
  boundary; never weaken the accessibility floor.
```

- [x] **Step 4: Run the contract test to verify Green**

Run: `bash tests/Shell/frontend_design_contract_test.sh`

Expected: PASS with all user-intake, no-default, token, contrast, and target-size assertions green.

- [x] **Step 5: Create the commit**

```bash
git add tests/Shell/frontend_design_contract_test.sh packages/prism-php-web/skills/frontend-design/SKILL.md packages/prism-php-web/skills/frontend-architecture/SKILL.md packages/prism-php-web/skills/accessibility/SKILL.md
prism-tool commit create --type feat --scope frontend --subject "make visual design user-authored"
```

---

### Task 2: Build the reusable Playwright visual-review module

**Files:**
- Create: `packages/prism-php-web/config/bootstrap/visual-review/visual_review.mjs`
- Create: `packages/prism-php-web/config/bootstrap/visual-review/visual_review.spec.mjs`
- Create: `packages/prism-php-web/config/bootstrap/visual-review/visual_review.example.json`
- Create: `packages/prism-php-web/skills/visual-review/SKILL.md`
- Create: `packages/prism-php-web/docs/visual-review.md`
- Create: `tests/Node/visual-review.test.js`

**Interfaces:**
- Produces: `validateVisualReviewConfig(value)`, `loadVisualReviewConfig(filePath)`, `expandVisualReviewCases(config)`, `applyVisualReviewActions(page, actions)`, `revisionIdentity(cwd)`, `evidenceMetadata(capture, versions, revision)`, and `evidencePaths(capture, root)`.
- Runtime command: `prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line`.

- [x] **Step 1: Write failing Node tests for the closed configuration boundary**

Create `tests/Node/visual-review.test.js` with tests that import the future module and assert:

```javascript
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {pathToFileURL} = require('node:url');

const moduleUrl = pathToFileURL(path.resolve(
	__dirname,
	'../../packages/prism-php-web/config/bootstrap/visual-review/visual_review.mjs'
)).href;

const valid = {
	schemaVersion: 1,
	baseUrl: 'http://127.0.0.1:8080',
	viewports: {
		mobile: {width: 390, height: 844},
		desktop: {width: 1440, height: 900},
	},
	cases: [{
		id: 'home',
		path: '/',
		readySelector: 'main',
		states: [
			{id: 'default', colorScheme: 'no-preference', actions: []},
			{id: 'menu-open', colorScheme: 'dark', actions: [
				{type: 'click', selector: '[data-menu-toggle]'},
				{type: 'wait-for-selector', selector: '[data-menu][data-open]'},
			]},
		],
	}],
};

test('validates and expands mobile desktop and 320px reflow evidence', async () => {
	const module = await import(moduleUrl);
	const config = module.validateVisualReviewConfig(structuredClone(valid));
	const captures = module.expandVisualReviewCases(config);
	assert.equal(captures.length, 6);
	assert.deepEqual([...new Set(captures.map(({viewportId}) => viewportId))], ['mobile', 'desktop', 'reflow']);
	assert.equal(captures.find(({viewportId}) => viewportId === 'reflow').viewport.width, 320);
	assert.equal(captures.every(({url}) => url.startsWith('http://127.0.0.1:8080/')), true);
});

test('rejects external origins unknown keys unsafe actions and duplicate ids', async () => {
	const module = await import(moduleUrl);
	for (const mutate of [
		(value) => { value.baseUrl = 'https://example.com'; },
		(value) => { value.extra = true; },
		(value) => { value.cases[0].states[0].actions = [{type: 'evaluate', selector: 'body'}]; },
		(value) => { value.cases.push(structuredClone(value.cases[0])); },
	]) {
		const candidate = structuredClone(valid);
		mutate(candidate);
		assert.throws(() => module.validateVisualReviewConfig(candidate), /visual review configuration is invalid/);
	}
});

test('metadata contains case identity but no raw url or action payload', async () => {
	const module = await import(moduleUrl);
	const capture = module.expandVisualReviewCases(module.validateVisualReviewConfig(structuredClone(valid)))[0];
	const metadata = module.evidenceMetadata(
		capture,
		{playwright: '1.62.1', chromium: '123.0.0'},
		{head: 'a'.repeat(40), dirty: true}
	);
	assert.equal(metadata.caseId, 'home');
	assert.equal(Object.hasOwn(metadata, 'url'), false);
	assert.equal(JSON.stringify(metadata).includes('data-menu-toggle'), false);
});

test('evidence paths remain inside the fixed working directory', async () => {
	const module = await import(moduleUrl);
	const root = path.resolve('/tmp/visual-review-output');
	const capture = module.expandVisualReviewCases(module.validateVisualReviewConfig(structuredClone(valid)))[0];
	const paths = module.evidencePaths(capture, root);
	assert.equal(paths.image.startsWith(`${root}${path.sep}`), true);
	assert.equal(paths.metadata.startsWith(`${root}${path.sep}`), true);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the focused Node test to verify Red**

Run: `node --test tests/Node/visual-review.test.js`

Expected: FAIL because `visual_review.mjs` does not exist.

- [x] **Step 3: Implement the closed runtime and Playwright capture spec**

Implement `visual_review.mjs` with these exact public exports and constraints:

```javascript
// $KYAULabs: visual_review.mjs setup@prism 2026/08/25 +0000 Exp $

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const COLOR_SCHEMES = new Set(['light', 'dark', 'no-preference']);
const PRESS_KEYS = new Set(['Enter', 'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ACTION_TYPES = new Set(['click', 'hover', 'focus', 'press', 'wait-for-selector']);

function exactKeys(value, keys) {
	return value !== null && typeof value === 'object' && !Array.isArray(value) &&
		Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function invalid() {
	throw new Error('visual review configuration is invalid');
}

function validSelector(value) {
	return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
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

export function validateVisualReviewConfig(value) {
	if (!exactKeys(value, ['schemaVersion', 'baseUrl', 'viewports', 'cases']) || value.schemaVersion !== 1) invalid();
	let baseUrl;
	try { baseUrl = new URL(value.baseUrl); } catch { invalid(); }
	if (!['http:', 'https:'].includes(baseUrl.protocol) || !LOOPBACK.has(baseUrl.hostname) ||
		baseUrl.username !== '' || baseUrl.password !== '' || baseUrl.search !== '' || baseUrl.hash !== '') invalid();
	if (!exactKeys(value.viewports, ['mobile', 'desktop'])) invalid();
	const viewports = Object.freeze({
		mobile: validateViewport(value.viewports.mobile),
		desktop: validateViewport(value.viewports.desktop),
	});
	if (!Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 64) invalid();
	const caseIds = new Set();
	const cases = value.cases.map((entry) => {
		if (!exactKeys(entry, ['id', 'path', 'readySelector', 'states']) || !ID.test(entry.id) || caseIds.has(entry.id)) invalid();
		caseIds.add(entry.id);
		if (typeof entry.path !== 'string' || !entry.path.startsWith('/') || entry.path.length > 512) invalid();
		const url = new URL(entry.path, baseUrl);
		if (url.origin !== baseUrl.origin) invalid();
		if (entry.readySelector !== null && !validSelector(entry.readySelector)) invalid();
		if (!Array.isArray(entry.states) || entry.states.length === 0 || entry.states.length > 16) invalid();
		const stateIds = new Set();
		const states = entry.states.map((state) => {
			if (!exactKeys(state, ['id', 'colorScheme', 'actions']) || !ID.test(state.id) || stateIds.has(state.id) ||
				!COLOR_SCHEMES.has(state.colorScheme) || !Array.isArray(state.actions) || state.actions.length > 16) invalid();
			stateIds.add(state.id);
			return Object.freeze({id: state.id, colorScheme: state.colorScheme, actions: Object.freeze(state.actions.map(validateAction))});
		});
		return Object.freeze({id: entry.id, url: url.href, readySelector: entry.readySelector, states: Object.freeze(states)});
	});
	const total = cases.reduce((sum, entry) => sum + entry.states.length * 3, 0);
	if (total > 128) invalid();
	return Object.freeze({schemaVersion: 1, baseUrl: baseUrl.href, viewports, cases: Object.freeze(cases)});
}

export function loadVisualReviewConfig(filePath = path.resolve('visual_review.json')) {
	const stat = fs.lstatSync(filePath);
	if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 262144) invalid();
	return validateVisualReviewConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
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
		const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8'}).trim();
		const dirty = execFileSync('git', ['status', '--porcelain'], {cwd, encoding: 'utf8'}).trim() !== '';
		return Object.freeze({head: /^[0-9a-f]{40}$/.test(head) ? head : null, dirty});
	} catch {
		return Object.freeze({head: null, dirty: null});
	}
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
	const base = `${capture.caseId}--${capture.stateId}--${capture.viewportId}`;
	const image = path.resolve(root, `${base}.png`);
	const metadata = path.resolve(root, `${base}.json`);
	for (const candidate of [image, metadata]) {
		if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('visual review output escapes working directory');
	}
	return Object.freeze({image, metadata});
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Implement `visual_review.spec.mjs` as the public headless capture runner:

```javascript
// $KYAULabs: visual_review.spec.mjs setup@prism 2026/08/25 +0000 Exp $

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {expect, test} from 'playwright/test';
import {
	applyVisualReviewActions,
	evidenceMetadata,
	evidencePaths,
	expandVisualReviewCases,
	loadVisualReviewConfig,
	revisionIdentity,
} from './visual_review.mjs';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const captures = expandVisualReviewCases(loadVisualReviewConfig());
const revision = revisionIdentity();

test.use({headless: true, serviceWorkers: 'block'});

for (const capture of captures) {
	test(`${capture.caseId} ${capture.stateId} ${capture.viewportId}`, async ({browser}) => {
		const errors = [];
		const context = await browser.newContext({viewport: capture.viewport, colorScheme: capture.colorScheme});
		const page = await context.newPage();
		page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(capture.url, {waitUntil: 'domcontentloaded'});
		if (capture.readySelector !== null) await page.locator(capture.readySelector).waitFor({state: 'visible'});
		await applyVisualReviewActions(page, capture.actions);
		const outputs = evidencePaths(capture);
		fs.mkdirSync(path.dirname(outputs.image), {recursive: true});
		await page.screenshot({path: outputs.image, fullPage: true, animations: 'disabled'});
		const metadata = evidenceMetadata(capture, {
			playwright: playwrightVersion,
			chromium: browser.version(),
		}, revision);
		fs.writeFileSync(outputs.metadata, `${JSON.stringify(metadata, null, 2)}\n`, {mode: 0o600});
		await context.close();
		expect(errors).toEqual([]);
	});
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Create `visual_review.example.json` with `mobile` and `desktop` set to `null` and an empty `cases` list so the user must supply project targets before copying it to `visual_review.json`.

Create the `visual-review` skill with the exact public command, the capture → read PNGs → repair → recapture loop, user milestone gate, ignored-evidence policy, and prohibition on external/authenticated/sensitive captures. Put the closed JSON shape and action vocabulary in `packages/prism-php-web/docs/visual-review.md`; keep the skill concise and cross-reference the doc.

- [x] **Step 4: Run the focused runtime tests**

Run: `node --test tests/Node/visual-review.test.js`

Expected: PASS, including rejection of external origins, unknown fields, unsafe actions, duplicate IDs, and escaping evidence paths.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-php-web/config/bootstrap/visual-review packages/prism-php-web/skills/visual-review/SKILL.md packages/prism-php-web/docs/visual-review.md tests/Node/visual-review.test.js
prism-tool commit create --type feat --scope visual-review --subject "add closed chromium capture module"
```

---

### Task 3: Scaffold visual-review tooling into strict-empty PHP/web projects

**Files:**
- Modify: `packages/prism-php-web/config/bootstrap/scaffold.json`
- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: canonical source files from Task 2.
- Produces in consumer repositories: `visual_review.mjs`, `visual_review.spec.mjs`, `visual_review.example.json`, an npm `visual-review` script, screenshot ignore policy, and check-time config validation when `visual_review.json` exists.

- [x] **Step 1: Extend the scaffold tests first**

Add the three root files to the `OUTPUTS` fixture and assert:

```javascript
assert.match(read('visual_review.mjs'), /export function validateVisualReviewConfig/);
assert.match(read('visual_review.spec.mjs'), /from 'playwright\/test'/);
assert.deepEqual(JSON.parse(read('visual_review.example.json')), {
	schemaVersion: 1,
	baseUrl: 'http://127.0.0.1:8080',
	viewports: {mobile: null, desktop: null},
	cases: [],
});
assert.equal(JSON.parse(read('package.json')).scripts['visual-review'],
	'prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line');
assert.match(read('.gitignore'), /tests\/Browser\/Screenshots\//);
assert.match(read('.github/scripts/check-php.sh'), /visual_review\.json.*visual_review\.spec\.mjs.*--list/s);
```

- [x] **Step 2: Run the scaffold test to verify Red**

Run: `node --test tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because the manifest and rendered project omit the three visual-review files, script, ignore rule, and validation command.

- [x] **Step 3: Render the canonical files and shared validation**

Add these output paths to `scaffold.json`:

```json
"visual_review.example.json",
"visual_review.mjs",
"visual_review.spec.mjs"
```

In `bootstrap-scaffold.js`, add a source map near `contents()`:

```javascript
const VISUAL_REVIEW_SOURCES = Object.freeze({
	'visual_review.example.json': 'visual_review.example.json',
	'visual_review.mjs': 'visual_review.mjs',
	'visual_review.spec.mjs': 'visual_review.spec.mjs',
});
```

At the start of `contents()`, return the matching canonical file from `config/bootstrap/visual-review/` before the existing generated cases.

Add this check before the browser fixture server starts:

```bash
if [ -f visual_review.json ]; then
    prism-tool run playwright -- test visual_review.spec.mjs --list --workers=1
fi
```

Add the npm script shown in Step 1 and change the generated `.gitignore` to include:

```text
/tests/Browser/Screenshots/
```

Do not add screenshots or an active `visual_review.json` to scaffold inventory.

- [x] **Step 4: Run the scaffold and packaging tests**

Run: `node --test tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS; Blank and Template output bytes remain identical, Playwright remains `1.62.1`, Chromium remains the only browser target, and the new canonical files are packaged.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-php-web/config/bootstrap/scaffold.json packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type feat --scope scaffold --subject "include reusable visual review tooling"
```

---

### Task 4: Add create/preserve/conflict visual files to established setup

**Files:**
- Create: `packages/prism-php-web/scripts/toolchain/visual-review-files.js`
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Modify: `packages/prism-php-web/scripts/toolchain/transaction.js`
- Modify: `packages/prism-php-web/scripts/toolchain/workspace.js`
- Modify: `tests/Node/prism-tool-resolve.test.js`
- Modify: `tests/Node/prism-tool-apply.test.js`

**Interfaces:**
- Produces: `VISUAL_REVIEW_FILES`, `readCanonicalVisualReviewFiles(packageRoot)`, and a plan `scaffold` object keyed by the three fixed output names.
- Plan record: `{disposition: "CREATE"|"PRESERVE", original: "absent"|sha256, candidate: sha256, mode: 420}`.

- [x] **Step 1: Add failing resolve/apply tests**

Cover these public behaviors:

```javascript
assert.deepEqual(Object.keys(plan.scaffold).sort(), [
	'visual_review.example.json',
	'visual_review.mjs',
	'visual_review.spec.mjs',
]);
assert.equal(plan.scaffold['visual_review.mjs'].disposition, 'CREATE');
assert.equal(plan.scaffold['visual_review.mjs'].mode, 0o644);
```

Add separate tests proving:

- absent files appear in the preview diff and are created mode `0644` after approval;
- exact canonical bytes and mode produce `PRESERVE` and keep inode/mtime unchanged;
- differing bytes, symlinks, non-regular paths, and mode mismatch fail at `managed-file-conflict` before Composer/npm commands;
- a stale create target blocks apply before package installation;
- a write failure rolls back newly created visual files and dependency manifests together.

- [x] **Step 2: Run focused setup tests to verify Red**

Run: `node --test tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-apply.test.js`

Expected: FAIL because candidate plans have no `scaffold` section and established setup ignores canonical visual files.

- [x] **Step 3: Implement the fixed canonical-file plan section**

Create `visual-review-files.js`:

```javascript
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VISUAL_REVIEW_FILES = Object.freeze([
	'visual_review.example.json',
	'visual_review.mjs',
	'visual_review.spec.mjs',
]);

function sha256(content) {
	return crypto.createHash('sha256').update(content).digest('hex');
}

function readCanonicalVisualReviewFiles(packageRoot) {
	return new Map(VISUAL_REVIEW_FILES.map((name) => {
		const source = path.join(packageRoot, 'config', 'bootstrap', 'visual-review', name);
		const stat = fs.lstatSync(source);
		if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 1048576) {
			throw new Error('canonical visual review file is invalid');
		}
		const content = fs.readFileSync(source);
		return [name, Object.freeze({content, sha256: sha256(content), mode: 0o644})];
	}));
}

module.exports = {VISUAL_REVIEW_FILES, readCanonicalVisualReviewFiles};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Pass `packageRoot: path.resolve(__dirname, '..')` from adapter `resolve()` and `apply()`.

In `resolveCandidate()`:

1. Load the fixed canonical map before package-manager calls.
2. For each fixed name, inspect the project path.
3. Record `CREATE` when absent.
4. Record `PRESERVE` only when bytes and mode `0644` exactly match.
5. Throw with stage `managed-file-conflict` for every other state.
6. Write each canonical candidate file mode `0600` inside the private workspace.
7. Add the fixed `scaffold` object to the plan and add only CREATE entries to the preview diff.

In `validatePlan()` and `applyCandidate()`, require the exact three scaffold keys and exact record shape. Revalidate original state, candidate digest, and mode. Append only CREATE paths to the replacement list.

Extend `replaceConsumerFiles()` with an optional `createModes` map:

```javascript
function replaceConsumerFiles({projectRoot, workspaceRoot, names, createModes = new Map(), rename = fs.renameSync}) {
	// existing body
	// when target is absent:
	originals.set(name, {exists: false, mode: createModes.get(name) ?? 0o600});
}
```

Call it with `0o644` for CREATE visual-review files and preserve existing manifest modes. Never include PRESERVE visual files in `names`, so exact files keep inode and mtime.

- [x] **Step 4: Run resolve/apply and bootstrap regression tests**

Run: `node --test tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-apply.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: PASS, including create/preserve/conflict, rollback, stale-plan, dependency, browser, and strict-empty scaffold coverage.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-php-web/scripts/toolchain/visual-review-files.js packages/prism-php-web/scripts/prism-tool-adapter.js packages/prism-php-web/scripts/toolchain/transaction.js packages/prism-php-web/scripts/toolchain/workspace.js tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-apply.test.js
prism-tool commit create --type feat --scope setup --subject "provision canonical visual review files"
```

---

### Task 5: Wire visual review into frontend TDD, catalogues, and public documentation

**Files:**
- Modify: `packages/prism-php-web/skills/tdd-php/SKILL.md`
- Modify: `packages/prism-php-web/skills/pest-browser/SKILL.md`
- Modify: `packages/prism-php-web/README.md`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `CODING_HARNESS.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Shell/frontend_design_contract_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Consumes: `frontend-design`, `visual-review`, canonical runner files, and the exact Playwright command.
- Produces: a documented Red → Green → capture → inspect → recapture → milestone-confirmation workflow and discoverable adapter skill catalogue.

- [x] **Step 1: Extend contract tests before documentation**

Add assertions that:

```bash
contains "$TDD_PHP" 'Load `visual-review` after Green' 'frontend TDD loads visual review after behavior passes'
contains "$TDD_PHP" 'prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line' 'frontend TDD uses the canonical capture command'
contains "$PEST_BROWSER" 'Visual design iteration belongs to `visual-review`' 'functional and subjective browser concerns stay separate'
contains "$CORE_AGENTS" '`visual-review`' 'the global catalogue advertises the adapter skill'
```

Update packaging tests to assert `skills/visual-review/SKILL.md`, `docs/visual-review.md`, and all three canonical visual-review source files are present in the adapter tarball.

- [x] **Step 2: Run contract and packaging tests to verify Red**

Run: `bash tests/Shell/frontend_design_contract_test.sh`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: FAIL on missing orchestration, catalogue, separation, and package assertions.

- [x] **Step 3: Update the integration guidance**

In `tdd-php`, make frontend slices follow this exact sequence:

```markdown
1. Load `frontend-design`, `frontend-architecture`, `scss-mobile-first`, and
   `accessibility` before Red.
2. Reach Green through observable behavior tests.
3. Load `visual-review` after Green for every changed visual slice.
4. Run `prism-tool run playwright -- test visual_review.spec.mjs --workers=1
   --output tests/Browser/Screenshots/.playwright --reporter=line`.
5. Read every generated PNG, repair visual failures, and recapture.
6. Present the configured mobile/desktop milestone set and wait for user
   confirmation before visual completion.
```

In `pest-browser`, state that critical functional flows remain here and visual design iteration belongs to `visual-review`; remove the false claim that the generated screenshot ignore rule already exists only after Task 3 makes it true.

Add `visual-review` to the adapter skill list in `packages/prism-core/AGENTS.md`, the PHP/web README, and `CODING_HARNESS.md`. Document setup create/preserve/conflict behavior, local-only evidence, the active config filename, the exact capture command, and the no-authenticated-capture boundary.

- [x] **Step 4: Run all targeted verification and the full local gate**

Run: `bash tests/Shell/frontend_design_contract_test.sh`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Run: `node --test tests/Node/visual-review.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-apply.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run the repository `/check` prompt.

Expected: all harness, shell, PHP, lint, coverage, toolchain, and Chromium checks PASS.

- [x] **Step 5: Create the terminal implementation commit**

```bash
git add packages/prism-php-web/skills/tdd-php/SKILL.md packages/prism-php-web/skills/pest-browser/SKILL.md packages/prism-php-web/README.md packages/prism-core/AGENTS.md CODING_HARNESS.md tests/Shell/toolchain_entrypoints_test.sh tests/Shell/frontend_design_contract_test.sh tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope frontend --subject "require iterative chromium visual review"
```

---

## Plan self-review

- Spec coverage: Tasks 1–5 cover no-default aesthetics, structured intake, standards correction, committed brief policy, dedicated module, reusable repository tooling, strict-empty and established setup, Chromium-only capture, mobile/desktop/320 evidence, state actions, local retention, trust boundaries, TDD integration, milestone confirmation, local/CI validation, catalogues, and docs.
- Placeholder scan: every action and interface is concrete; no deferred implementation markers remain.
- Type consistency: the runtime exports and plan `scaffold` record are named once and consumed consistently.
- Issue-reference count: originating issue is `none`; no implementation commit closes the completed Wayfinder map.
- Adapter command audit: Pest, Playwright, lint, and build tools are invoked through `prism-tool`; no direct `vendor/bin`, `npx`, or invented browser target appears.
