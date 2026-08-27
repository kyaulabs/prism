// $KYAULabs: markdown.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {loadCoreContract, resolveBundledComponent} = require('./core-toolchain');
const {checkExternalTools} = require('./preflight');
const {runBounded} = require('./process');

const USAGE = 'usage: prism-tool markdown lint --cached|--changed-from REVISION';
const ROOT_DOCUMENTS = new Set([
    'README.md',
    'CODING_HARNESS.md',
    'CONTRIBUTING.md',
    'NPM.md',
    'SECURITY.md',
    'CONTEXT.md',
]);

function git(run, projectRoot, args, options = {}) {
    return run('git', args, {cwd: projectRoot, maxBuffer: 1048576, timeout: 30000, ...options});
}

function requireSuccess(result) {
    if (result.error || result.status !== 0) throw new Error('Git operation failed');
    return result.stdout;
}

function decodeUtf8(value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    return new TextDecoder('utf-8', {fatal: true}).decode(buffer);
}

function parsePathList(output) {
    return decodeUtf8(output).split('\0').filter(Boolean);
}

function safeRevision(revision) {
    return (
        typeof revision === 'string' &&
        revision.length >= 1 &&
        revision.length <= 256 &&
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(revision) &&
        !revision.includes('..') &&
        !revision.includes('@{') &&
        !revision.includes('//') &&
        !revision.endsWith('/') &&
        !revision.endsWith('.') &&
        !revision.endsWith('.lock')
    );
}

function parseArgs(args) {
    if (args.length === 2 && args[0] === 'lint' && args[1] === '--cached') {
        return {mode: 'cached'};
    }
    if (
        args.length === 3 &&
        args[0] === 'lint' &&
        args[1] === '--changed-from' &&
        safeRevision(args[2])
    ) {
        return {mode: 'changed-from', revision: args[2]};
    }
    throw new Error(USAGE);
}

function eligiblePath(filePath) {
    if (ROOT_DOCUMENTS.has(filePath)) return true;
    if ((filePath.startsWith('adr/') || filePath.startsWith('docs/')) && filePath.endsWith('.md')) {
        return true;
    }
    const segments = filePath.split('/');
    if (segments[0] !== 'packages' || segments.length < 3) return false;
    if (segments.length === 3 && segments[2] === 'README.md') return true;
    if (segments[2] === 'docs' && segments.length >= 4 && filePath.endsWith('.md')) return true;
    return (
        segments[2] === 'extensions' &&
        segments.length >= 5 &&
        segments.at(-1) === 'README.md'
    );
}

function validatePath(filePath) {
    if (
        filePath.length === 0 ||
        Buffer.byteLength(filePath) > 4096 ||
        filePath !== filePath.normalize('NFC') ||
        filePath.includes('\uFFFD') ||
        path.posix.isAbsolute(filePath) ||
        filePath.includes('\\') ||
        /[\x00-\x1f\x7f]/.test(filePath)
    ) {
        throw new Error('Markdown path is invalid');
    }
    const segments = filePath.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
        throw new Error('Markdown path is invalid');
    }
}

function parseObjectListing(output, expectedPath, source) {
    const text = decodeUtf8(output);
    const pattern = source === 'index'
        ? /^([0-9]{6}) ([0-9a-f]{40,64}) ([0-3])\t([^\0]+)\0$/
        : /^([0-9]{6}) ([a-z]+) ([0-9a-f]{40,64})\t([^\0]+)\0$/;
    const match = text.match(pattern);
    if (!match) throw new Error('Markdown object is invalid');
    if (source === 'index') {
        if (match[1] !== '100644' || match[3] !== '0' || match[4] !== expectedPath) {
            throw new Error('Markdown object is invalid');
        }
        return match[2];
    }
    if (match[1] !== '100644' || match[2] !== 'blob' || match[4] !== expectedPath) {
        throw new Error('Markdown object is invalid');
    }
    return match[3];
}

function indexObject(run, projectRoot, filePath) {
    const listing = requireSuccess(git(run, projectRoot, [
        '--literal-pathspecs', 'ls-files', '--stage', '-z', '--', filePath,
    ], {encoding: null}));
    return parseObjectListing(listing, filePath, 'index');
}

function headObject(run, projectRoot, filePath) {
    const listing = requireSuccess(git(run, projectRoot, [
        '--literal-pathspecs', 'ls-tree', '-z', 'HEAD', '--', filePath,
    ], {encoding: null}));
    return parseObjectListing(listing, filePath, 'tree');
}

function readBlob(run, projectRoot, objectId) {
    const type = decodeUtf8(requireSuccess(git(run, projectRoot, [
        'cat-file', '-t', objectId,
    ]))).trim();
    if (type !== 'blob') throw new Error('Markdown object is invalid');
    const blob = requireSuccess(git(run, projectRoot, ['cat-file', 'blob', objectId], {
        encoding: null,
    }));
    if (!Buffer.isBuffer(blob)) throw new Error('Markdown blob is invalid');
    return blob;
}

function canonicalRepository(requestedRoot, run) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const top = decodeUtf8(requireSuccess(git(
        run,
        projectRoot,
        ['rev-parse', '--show-toplevel']
    ))).trim();
    if (fs.realpathSync(top) !== projectRoot) throw new Error('Repository root changed');
    return projectRoot;
}

function resolveChangedBase(run, projectRoot, revision) {
    const resolved = decodeUtf8(requireSuccess(git(run, projectRoot, [
        'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`,
    ]))).trim();
    if (!/^[0-9a-f]{40,64}$/.test(resolved)) throw new Error('Revision resolution failed');
    const mergeBase = decodeUtf8(requireSuccess(git(run, projectRoot, [
        'merge-base', resolved, 'HEAD',
    ]))).trim();
    if (!/^[0-9a-f]{40,64}$/.test(mergeBase)) throw new Error('Merge base failed');
    return mergeBase;
}

function selectPaths(run, projectRoot, parsed) {
    let result;
    if (parsed.mode === 'cached') {
        result = git(run, projectRoot, [
            'diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '--', '*.md',
        ], {encoding: null});
    } else {
        const mergeBase = resolveChangedBase(run, projectRoot, parsed.revision);
        result = git(run, projectRoot, [
            'diff', '--name-only', '-z', '--diff-filter=ACMR', mergeBase, 'HEAD', '--', '*.md',
        ], {encoding: null});
    }
    const paths = parsePathList(requireSuccess(result));
    const selected = [];
    for (const filePath of paths) {
        validatePath(filePath);
        if (eligiblePath(filePath)) selected.push(filePath);
    }
    return [...new Set(selected)];
}

function materialize({parsed, projectRoot, runGit, selected, workspace}) {
    for (const filePath of selected) {
        const objectId = parsed.mode === 'cached'
            ? indexObject(runGit, projectRoot, filePath)
            : headObject(runGit, projectRoot, filePath);
        const target = path.join(workspace, ...filePath.split('/'));
        const relation = path.relative(workspace, target);
        if (relation.startsWith('..') || path.isAbsolute(relation)) {
            throw new Error('Markdown path escapes workspace');
        }
        fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o700});
        fs.writeFileSync(target, readBlob(runGit, projectRoot, objectId), {mode: 0o600});
    }
}

function lintSelected({coreRoot, env, executable, parsed, projectRoot, runGit, runTool, selected}) {
    if (selected.length === 0) return 0;
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-markdown-'));
    try {
        materialize({parsed, projectRoot, runGit, selected, workspace});
        const result = runTool(executable, [
            '--config', path.join(coreRoot, 'config', 'markdownlint-cli2.json'),
            '--no-globs',
            ...selected,
        ], {
            cwd: workspace,
            env,
            maxBuffer: 1048576,
            timeout: 30000,
        });
        if (result.error) {
            const reason = result.timedOut ? 'timeout' : 'output or process failure';
            process.stderr.write(`prism-tool: Markdown tool ${reason}\n`);
            return 4;
        }
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        return result.status === 0 ? 0 : 4;
    } finally {
        fs.rmSync(workspace, {recursive: true, force: true});
    }
}

function markdownCommand(args, context = {}) {
    let parsed;
    try {
        parsed = parseArgs(args);
    } catch {
        process.stderr.write(`${USAGE}\n`);
        return 2;
    }
    try {
        const coreRoot = fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..'));
        const env = context.env ?? process.env;
        const runGit = context.runGit ?? runBounded;
        const contract = loadCoreContract(coreRoot);
        const readiness = checkExternalTools({
            contract,
            env,
            run: context.runReadiness ?? runBounded,
        });
        if (readiness.some(({status}) => status !== 'PASS')) {
            process.stderr.write('prism-tool: mandatory external readiness failed\n');
            return 3;
        }
        const component = contract.components.find(({id}) => id === 'markdownlint-cli2');
        if (!component) throw new Error('Markdown component is unavailable');
        const executable = resolveBundledComponent(coreRoot, component);
        const projectRoot = canonicalRepository(
            context.projectRoot ?? context.cwd ?? process.cwd(),
            runGit
        );
        const selected = selectPaths(runGit, projectRoot, parsed);
        return lintSelected({
            coreRoot,
            env,
            executable,
            parsed,
            projectRoot,
            runGit,
            runTool: context.runTool ?? runBounded,
            selected,
        });
    } catch {
        process.stderr.write('prism-tool: Markdown lint failed\n');
        return 4;
    }
}

module.exports = {markdownCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
