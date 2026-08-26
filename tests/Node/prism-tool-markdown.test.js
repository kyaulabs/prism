// $KYAULabs: prism-tool-markdown.test.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {markdownCommand} = require('../../packages/prism-core/scripts/prism-tool/markdown');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');

const root = path.resolve(__dirname, '../..');
const coreRoot = path.join(root, 'packages/prism-core');
const cli = path.join(coreRoot, 'scripts/prism-tool.js');

function readyExternalEnvironment(directory) {
    const bin = path.join(directory, 'external-bin');
    fs.mkdirSync(bin, {recursive: true});
    for (const [name, output] of [
        ['semgrep', '1.173.0'],
        ['ocr', 'open-code-review v1.9.1 linux/amd64'],
    ]) {
        const executable = path.join(bin, name);
        fs.writeFileSync(
            executable,
            `#!${process.execPath}\nif (process.argv[2] !== '--version') process.exit(97);\nprocess.stdout.write('${output}\\n');\n`,
            {mode: 0o755}
        );
        fs.chmodSync(executable, 0o755);
    }
    return {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`};
}

function git(projectRoot, args) {
    return execFileSync('git', args, {cwd: projectRoot, encoding: 'utf8'}).trim();
}

function initializeRepository(projectRoot) {
    git(projectRoot, ['init', '--quiet']);
    git(projectRoot, ['config', 'user.name', 'Prism Tests']);
    git(projectRoot, ['config', 'user.email', 'tests@example.com']);
}

function commitAll(projectRoot, message) {
    git(projectRoot, ['add', '--all']);
    git(projectRoot, ['commit', '--quiet', '-m', message]);
    return git(projectRoot, ['rev-parse', 'HEAD']);
}

function runMarkdown(projectRoot, args) {
    return spawnSync(process.execPath, [cli, 'markdown', 'lint', ...args], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: readyExternalEnvironment(projectRoot),
    });
}

function invalidMarkdown(title = 'Guide') {
    return `# ${title}\n\n### Broken jump\n`;
}

function readyProbe(executable) {
    const name = path.basename(executable);
    const stdout = name === 'semgrep'
        ? '1.173.0\n'
        : 'open-code-review v1.9.1 linux/amd64\n';
    return {error: null, status: 0, stderr: '', stdout, timedOut: false};
}

function captureWrites(action) {
    const stdout = [];
    const stderr = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout.push(String(chunk));
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr.push(String(chunk));
        return true;
    };
    try {
        return {status: action(), stderr: stderr.join(''), stdout: stdout.join('')};
    } finally {
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;
    }
}

test('cached mode lints the staged blob instead of the working tree', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n### Broken jump\n');
    execFileSync('git', ['add', 'docs/guide.md'], {cwd: projectRoot});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n## Fixed\n');

    const result = spawnSync(process.execPath, [cli, 'markdown', 'lint', '--cached'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: readyExternalEnvironment(projectRoot),
    });

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stdout + result.stderr, /docs\/guide\.md:3.*MD001/);
});

test('changed-from mode lints the HEAD blob instead of the working tree', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n## Valid\n');
    const base = commitAll(projectRoot, 'base');
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), invalidMarkdown());
    commitAll(projectRoot, 'break guide');
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n## Fixed locally\n');

    const result = runMarkdown(projectRoot, ['--changed-from', base]);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stdout + result.stderr, /docs\/guide\.md:3.*MD001/);
});

test('selects maintained Markdown paths and excludes runtime and historical paths', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    const eligible = [
        'adr/0091-test.md',
        'docs/guide.md',
        'README.md',
        'CONTEXT.md',
        'packages/example/README.md',
        'packages/example/docs/guide.md',
        'packages/example/extensions/safety/README.md',
    ];
    const excluded = [
        'AGENTS.md',
        'CHANGELOG.md',
        'CODE_OF_CONDUCT.md',
        'packages/example/skills/test/SKILL.md',
        'packages/example/prompts/check.md',
    ];
    for (const filePath of [...eligible, ...excluded]) {
        fs.mkdirSync(path.dirname(path.join(projectRoot, filePath)), {recursive: true});
        fs.writeFileSync(path.join(projectRoot, filePath), invalidMarkdown(filePath));
    }
    git(projectRoot, ['add', '--all']);

    const result = runMarkdown(projectRoot, ['--cached']);
    const output = result.stdout + result.stderr;

    assert.equal(result.status, 4, result.stderr);
    for (const filePath of eligible) assert.match(output, new RegExp(filePath.replaceAll('.', '\\.')));
    for (const filePath of excluded) assert.doesNotMatch(output, new RegExp(filePath.replaceAll('.', '\\.')));
});

test('reports an eligible path containing spaces project-relative', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'bad name.md'), invalidMarkdown());
    git(projectRoot, ['add', '--all']);

    const result = runMarkdown(projectRoot, ['--cached']);

    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stdout + result.stderr, /docs\/bad name\.md:3.*MD001/);
    assert.doesNotMatch(result.stdout + result.stderr, /prism-markdown-/);
});

test('does not load project-local executable Markdown configuration', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    const marker = path.join(projectRoot, 'loaded-marker');
    fs.writeFileSync(
        path.join(projectRoot, '.markdownlint-cli2.cjs'),
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'loaded'); module.exports = {};\n`
    );
    fs.writeFileSync(path.join(projectRoot, 'README.md'), invalidMarkdown());
    git(projectRoot, ['add', '--all']);

    const result = runMarkdown(projectRoot, ['--cached']);

    assert.equal(result.status, 4, result.stderr);
    assert.equal(fs.existsSync(marker), false);
});

test('rejects invalid command shapes and unsafe revisions as usage errors', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    const invocations = [
        [],
        ['--fix'],
        ['README.md'],
        ['--cached', '--cached'],
        ['--cached', '--changed-from', 'HEAD'],
        ['--changed-from'],
        ['--changed-from', '../main'],
        ['--changed-from', 'main@{upstream}'],
        ['--changed-from', 'main.lock'],
    ];

    for (const args of invocations) {
        const result = runMarkdown(projectRoot, args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
        assert.match(result.stderr, /usage:/);
    }
});

test('fails closed for a valid but unknown revision', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);

    const result = runMarkdown(projectRoot, ['--changed-from', 'missing-branch']);

    assert.equal(result.status, 4);
    assert.doesNotMatch(result.stdout + result.stderr, /ambiguous argument|unknown revision/i);
});

test('fails closed for staged symlinks and unsupported object modes', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
    fs.symlinkSync('target.md', path.join(projectRoot, 'docs', 'link.md'));
    git(projectRoot, ['add', 'docs/link.md']);

    let result = runMarkdown(projectRoot, ['--cached']);
    assert.equal(result.status, 4);
    assert.doesNotMatch(result.stdout + result.stderr, /target\.md/);

    git(projectRoot, ['reset']);
    fs.rmSync(path.join(projectRoot, 'docs', 'link.md'));
    const blob = git(projectRoot, ['hash-object', '-w', '--stdin']);
    git(projectRoot, ['update-index', '--add', '--cacheinfo', `100755,${blob},docs/executable.md`]);

    result = runMarkdown(projectRoot, ['--cached']);
    assert.equal(result.status, 4);
});

test('fails closed for malformed or traversing Git path output', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    const malicious = ['/docs/escape.md', 'docs/../escape.md', 'docs/control\u0001.md'];

    for (const filePath of malicious) {
        const result = captureWrites(() => markdownCommand(['lint', '--cached'], {
            coreRoot,
            projectRoot,
            runGit(command, args, options) {
                if (args[0] === 'diff') {
                    return {error: null, status: 0, stderr: '', stdout: `${filePath}\0`};
                }
                return runBounded(command, args, options);
            },
            runReadiness: readyProbe,
        }));
        assert.equal(result.status, 4);
        assert.doesNotMatch(result.stdout + result.stderr, /escape\.md|control/);
    }
});

test('suppresses partial linter output after timeout or output overflow', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), invalidMarkdown());
    git(projectRoot, ['add', '--all']);

    for (const failure of [
        {error: new Error('timeout'), status: null, timedOut: true},
        {error: Object.assign(new Error('overflow'), {code: 'ENOBUFS'}), status: null},
    ]) {
        const result = captureWrites(() => markdownCommand(['lint', '--cached'], {
            coreRoot,
            projectRoot,
            runGit: runBounded,
            runReadiness: readyProbe,
            runTool: () => ({...failure, stderr: 'SECRET DOCUMENT CONTENT', stdout: ''}),
        }));
        assert.equal(result.status, 4);
        assert.doesNotMatch(result.stdout + result.stderr, /SECRET DOCUMENT CONTENT/);
    }
});

test('returns success when no eligible Markdown changed', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    initializeRepository(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'CHANGELOG.md'), invalidMarkdown());
    git(projectRoot, ['add', '--all']);

    const result = runMarkdown(projectRoot, ['--cached']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
