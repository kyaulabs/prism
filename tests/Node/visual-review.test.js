// $KYAULabs: visual-review.test.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {pathToFileURL} = require('node:url');

const moduleUrl = pathToFileURL(path.resolve(
    __dirname,
    '../../packages/prism-php-web/config/bootstrap/visual-review/visual_review.mjs'
)).href;
const structuredClone = globalThis.structuredClone;

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

async function runVisualReview(t, html) {
    const repoRoot = path.resolve(__dirname, '../..');
    const sourceRoot = path.join(repoRoot, 'packages/prism-php-web/config/bootstrap/visual-review');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-visual-review-browser-'));
    const server = http.createServer((_request, response) => {
        response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
        response.end(html);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const {port} = server.address();
    fs.copyFileSync(path.join(sourceRoot, 'visual_review.mjs'), path.join(root, 'visual_review.mjs'));
    fs.copyFileSync(path.join(sourceRoot, 'visual_review.spec.mjs'), path.join(root, 'visual_review.spec.mjs'));
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'));
    const browserCase = structuredClone(valid.cases[0]);
    browserCase.states = [browserCase.states[0]];
    fs.writeFileSync(path.join(root, 'visual_review.json'), `${JSON.stringify({
        ...structuredClone(valid),
        baseUrl: `http://127.0.0.1:${port}`,
        cases: [browserCase],
    })}\n`, {mode: 0o600});
    const result = await new Promise((resolve) => {
        const child = spawn(path.join(repoRoot, 'node_modules/.bin/playwright'), [
            'test',
            'visual_review.spec.mjs',
            '--workers=1',
            '--reporter=line',
        ], {cwd: root, env: {...process.env, CI: '1'}});
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('close', (status) => resolve({status, stdout, stderr}));
    });
    return {root, result};
}

test('validates and expands mobile desktop and 320px reflow evidence', async () => {
    const module = await import(moduleUrl);
    const config = module.validateVisualReviewConfig(structuredClone(valid));
    const captures = module.expandVisualReviewCases(config);
    assert.equal(captures.length, 6);
    assert.deepEqual([...new Set(captures.map(({viewportId}) => viewportId))], ['mobile', 'desktop', 'reflow']);
    assert.equal(captures.find(({viewportId}) => viewportId === 'reflow').viewport.width, 320);
    assert.equal(captures.every(({url}) => url.startsWith('http://127.0.0.1:8080/')), true);
});

test('accepts IPv6 loopback and rejects credential-bearing case urls', async () => {
    const module = await import(moduleUrl);
    const ipv6 = structuredClone(valid);
    ipv6.baseUrl = 'http://[::1]:8080';
    assert.equal(module.validateVisualReviewConfig(ipv6).baseUrl, 'http://[::1]:8080/');
    const credentials = structuredClone(valid);
    credentials.cases[0].path = '//user:password@127.0.0.1:8080/';
    assert.throws(() => module.validateVisualReviewConfig(credentials), /visual review configuration is invalid/);
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

test('rejects a symlinked evidence root', async (t) => {
    const module = await import(moduleUrl);
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-visual-review-path-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const target = path.join(parent, 'target');
    const root = path.join(parent, 'evidence');
    fs.mkdirSync(target);
    fs.symlinkSync(target, root);
    const capture = module.expandVisualReviewCases(module.validateVisualReviewConfig(structuredClone(valid)))[0];
    assert.throws(() => module.evidencePaths(capture, root), /visual review output escapes working directory/);
});

test('loads bounded regular configuration files and rejects symlinks', async (t) => {
    const module = await import(moduleUrl);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-visual-review-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const configPath = path.join(root, 'visual_review.json');
    const linkPath = path.join(root, 'linked.json');
    fs.writeFileSync(configPath, `${JSON.stringify(valid)}\n`, {mode: 0o600});
    fs.symlinkSync(configPath, linkPath);
    assert.equal(module.loadVisualReviewConfig(configPath).cases[0].id, 'home');
    assert.throws(() => module.loadVisualReviewConfig(linkPath), /visual review configuration is invalid/);
});

test('fails uniformly for missing malformed and oversized configuration files', async (t) => {
    const module = await import(moduleUrl);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-visual-review-invalid-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const malformed = path.join(root, 'malformed.json');
    const oversized = path.join(root, 'oversized.json');
    fs.writeFileSync(malformed, '{', {mode: 0o600});
    fs.writeFileSync(oversized, 'x'.repeat(262145), {mode: 0o600});
    for (const candidate of [path.join(root, 'missing.json'), malformed, oversized]) {
        assert.throws(() => module.loadVisualReviewConfig(candidate), /visual review configuration is invalid/);
    }
});

test('rejects capture navigation away from the configured origin', async () => {
    const module = await import(moduleUrl);
    assert.doesNotThrow(() => module.assertCaptureOrigin(
        'http://127.0.0.1:8080/next',
        'http://127.0.0.1:8080/start'
    ));
    assert.throws(() => module.assertCaptureOrigin(
        'http://127.0.0.1:9090/escaped',
        'http://127.0.0.1:8080/start'
    ), /visual review capture left the configured origin/);
});

test('applies only the validated declarative browser actions in order', async () => {
    const module = await import(moduleUrl);
    const calls = [];
    const page = {
        locator(selector) {
            return {
                click: async () => calls.push(['click', selector]),
                hover: async () => calls.push(['hover', selector]),
                focus: async () => calls.push(['focus', selector]),
                press: async (key) => calls.push(['press', selector, key]),
                waitFor: async (options) => calls.push(['wait-for-selector', selector, options.state]),
            };
        },
    };
    await module.applyVisualReviewActions(page, [
        {type: 'click', selector: '#one'},
        {type: 'hover', selector: '#two'},
        {type: 'focus', selector: '#three'},
        {type: 'press', selector: '#four', key: 'Enter'},
        {type: 'wait-for-selector', selector: '#five'},
    ]);
    assert.deepEqual(calls, [
        ['click', '#one'],
        ['hover', '#two'],
        ['focus', '#three'],
        ['press', '#four', 'Enter'],
        ['wait-for-selector', '#five', 'visible'],
    ]);
});

test('reports revision identity without exposing repository content', async () => {
    const module = await import(moduleUrl);
    const revision = module.revisionIdentity(path.resolve(__dirname, '../..'));
    assert.match(revision.head, /^[0-9a-f]{40}$/);
    assert.equal(typeof revision.dirty, 'boolean');
});

test('captures deterministic mobile desktop and reflow evidence in Chromium', async (t) => {
    const {root, result} = await runVisualReview(
        t,
        '<!doctype html><html><body><main><h1>Visual review</h1></main></body></html>'
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidenceRoot = path.join(root, 'tests/Browser/Screenshots/visual-review');
    const images = fs.readdirSync(evidenceRoot).filter((name) => name.endsWith('.png')).sort();
    const metadata = fs.readdirSync(evidenceRoot).filter((name) => name.endsWith('.json')).sort();
    assert.deepEqual(images, [
        'home--default--desktop.png',
        'home--default--mobile.png',
        'home--default--reflow.png',
    ]);
    assert.equal(metadata.length, 3);
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'home--default--reflow.json'), 'utf8')).viewport.width, 320);
});

test('fails capture when a page reports a JavaScript console error', async (t) => {
    const {result} = await runVisualReview(
        t,
        '<!doctype html><html><body><main>Broken</main><script>console.error("client failure")</script></body></html>'
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /client failure/);
});

test('publishes the local-only capture inspection and milestone contract', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const skill = fs.readFileSync(path.join(repoRoot, 'packages/prism-php-web/skills/visual-review/SKILL.md'), 'utf8');
    const reference = fs.readFileSync(path.join(repoRoot, 'packages/prism-php-web/docs/visual-review.md'), 'utf8');
    const command = 'prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line';
    assert.match(skill, /Read every generated PNG/);
    assert.match(skill, /user confirmation/);
    assert.match(skill, /authenticated|storage state/);
    assert.equal(skill.includes(command), true);
    assert.match(reference, /click.*hover.*focus.*press.*wait-for-selector/s);
    assert.match(reference, /loopback/);
    assert.match(reference, /visual_review\.example\.json/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
