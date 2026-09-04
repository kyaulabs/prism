// $KYAULabs: git-snapshot.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {digestJson} = require('./canonical-json');
const {LIMIT} = require('./constants');
const {safeRelativePath} = require('./schema');
const {
    loadAdditionalSensitivePaths,
    sensitivePathMatch,
} = require('../sensitive-path-policy');

const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const RAW = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/;
const TREE = /^(\d{6}) (blob|commit) ([0-9a-f]+)\t(.+)$/;
const FULL_OBJECT = /^[0-9a-f]{40,64}$/;
const ZERO_OBJECT = /^0+$/;
const RAW_STATUSES = new Set(['A', 'B', 'C', 'D', 'M', 'R', 'T', 'U', 'X']);
const MAX_SYMLINK_TARGET_BYTES = 4096;

function digest(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function defaultRun(command, args, options) {
    return childProcess.spawnSync(command, args, {
        cwd: options.cwd,
        input: options.input,
        encoding: null,
        maxBuffer: options.maxBuffer,
        timeout: options.timeout,
    });
}

function resultBytes(value) {
    if (Buffer.isBuffer(value)) return value;
    return Buffer.from(value ?? '', 'utf8');
}

function gitRunner(repositoryRoot, injected) {
    const run = injected ?? defaultRun;
    return (args, options = {}) => {
        const result = run('git', args, {
            cwd: repositoryRoot,
            input: options.input,
            maxBuffer: options.maxBuffer ?? LIMIT.OUTPUT_BYTES,
            timeout: options.timeout ?? 10000,
        });
        const stdout = resultBytes(result.stdout);
        const outputOverflow = stdout.length > (options.maxBuffer ?? LIMIT.OUTPUT_BYTES) ||
            result.error?.code === 'ENOBUFS';
        if (result.error || result.status !== 0 || outputOverflow) {
            if (options.allowFailure) return null;
            if (outputOverflow) throw new Error('Git snapshot output exceeds limit');
            throw new Error(result.error?.code === 'ETIMEDOUT'
                ? 'Git snapshot timed out'
                : 'Git snapshot command failed');
        }
        return stdout;
    };
}

function text(bytes, label) {
    try {
        return decoder.decode(bytes);
    } catch {
        throw new Error(`${label} is not valid UTF-8`);
    }
}

function nulFields(bytes, label) {
    if (bytes.length === 0) return [];
    if (bytes[bytes.length - 1] !== 0) throw new Error(`${label} is malformed`);
    const value = text(bytes, label);
    const fields = value.split('\0');
    fields.pop();
    if (fields.some((field) => field.includes('\0'))) throw new Error(`${label} is malformed`);
    return fields;
}

function objectId(value, label) {
    if (!FULL_OBJECT.test(value)) throw new Error(`${label} object ID is malformed`);
    return value;
}

function resolveCommit(runGit, revision) {
    if (typeof revision !== 'string' || !FULL_OBJECT.test(revision)) {
        throw new Error('revision is invalid');
    }
    return objectId(text(runGit(['rev-parse', '--verify', `${revision}^{commit}`]), 'revision').trim(), 'revision');
}

function emptyTree(runGit) {
    return objectId(
        text(runGit(['hash-object', '-t', 'tree', '--stdin'], {input: Buffer.alloc(0)}), 'empty tree').trim(),
        'empty tree'
    );
}

function commitParent(runGit, commit) {
    const fields = text(runGit(['rev-list', '--parents', '-n', '1', commit]), 'commit parents')
        .trim().split(/\s+/);
    if (fields[0] !== commit || fields.length > 2) throw new Error('merge commits are unsupported');
    return fields[1] ?? null;
}

function rawEntries(bytes) {
    const fields = nulFields(bytes, 'raw diff');
    const entries = [];
    for (let index = 0; index < fields.length;) {
        const match = fields[index++].match(RAW);
        if (match === null) throw new Error('raw diff is malformed');
        const [, oldMode, newMode, oldId, newId, status, score] = match;
        if (!RAW_STATUSES.has(status)) throw new Error('raw diff status is malformed');
        if (((status === 'R' || status === 'C') && Number(score) > 100) ||
            (status !== 'R' && status !== 'C' && score !== '')) {
            throw new Error('raw diff score is malformed');
        }
        if ((!ZERO_OBJECT.test(oldId) && !FULL_OBJECT.test(oldId)) ||
            (!ZERO_OBJECT.test(newId) && !FULL_OBJECT.test(newId))) {
            throw new Error('raw diff object ID is malformed');
        }
        const firstPath = fields[index++];
        if (!firstPath) throw new Error('raw diff is malformed');
        let oldPath;
        let newPath;
        if (status === 'R' || status === 'C') {
            const secondPath = fields[index++];
            if (!secondPath || score === '') throw new Error('raw diff is malformed');
            oldPath = firstPath;
            newPath = secondPath;
        } else {
            oldPath = status === 'A' ? null : firstPath;
            newPath = status === 'D' ? null : firstPath;
        }
        entries.push({
            status,
            score: score === '' ? null : Number(score),
            oldMode: oldMode === '000000' ? null : oldMode,
            newMode: newMode === '000000' ? null : newMode,
            oldObjectId: ZERO_OBJECT.test(oldId) ? null : oldId,
            newObjectId: ZERO_OBJECT.test(newId) ? null : newId,
            oldPath,
            newPath,
        });
    }
    return entries;
}

function numstatEntries(bytes) {
    const fields = nulFields(bytes, 'numstat diff');
    const entries = [];
    for (let index = 0; index < fields.length;) {
        const parts = fields[index++].split('\t');
        if (parts.length !== 3 || !/^(?:-|\d+)$/.test(parts[0]) ||
            !/^(?:-|\d+)$/.test(parts[1])) throw new Error('numstat diff is malformed');
        if (parts[2] === '') {
            const oldPath = fields[index++];
            const newPath = fields[index++];
            if (!oldPath || !newPath) throw new Error('numstat diff is malformed');
            entries.push({oldPath, newPath, added: parts[0], deleted: parts[1]});
        } else {
            entries.push({oldPath: parts[2], newPath: parts[2], added: parts[0], deleted: parts[1]});
        }
    }
    return entries;
}

function pathKey(oldPath, newPath) {
    return `${oldPath ?? ''}\0${newPath ?? ''}`;
}

function matchNumstat(raw, stats) {
    if (raw.length !== stats.length) throw new Error('patch and manifest disagree');
    const exact = new Map(stats.map((entry) => [pathKey(entry.oldPath, entry.newPath), entry]));
    if (exact.size !== stats.length) throw new Error('numstat diff is malformed');
    const used = new Set();
    const matched = raw.map((entry) => {
        let stat = exact.get(pathKey(entry.oldPath, entry.newPath));
        if (stat === undefined && entry.oldPath === null) {
            stat = stats.find((item) => item.newPath === entry.newPath && item.oldPath === item.newPath);
        }
        if (stat === undefined && entry.newPath === null) {
            stat = stats.find((item) => item.oldPath === entry.oldPath && item.oldPath === item.newPath);
        }
        if (stat === undefined || used.has(stat)) throw new Error('patch and manifest disagree');
        used.add(stat);
        return {...entry, lineCount: stat.added === '-' || stat.deleted === '-'
            ? null
            : Object.freeze({added: Number(stat.added), deleted: Number(stat.deleted)})};
    });
    if (used.size !== stats.length) throw new Error('patch and manifest disagree');
    return matched;
}

function relativePaths(entry) {
    return [entry.oldPath, entry.newPath].filter((value) => value !== null);
}

function sensitivityOptions(options, root) {
    return {
        projectDir: root,
        home: options.home ?? os.homedir(),
        extraPaths: loadAdditionalSensitivePaths(
            options.sensitivePaths ?? options.env?.PRISM_SENSITIVE_PATHS
        ),
    };
}

function assertSafePaths(entries, root, options) {
    const policy = sensitivityOptions(options, root);
    for (const entry of entries) {
        for (const relativePath of relativePaths(entry)) {
            safeRelativePath(relativePath, 'Git path');
            if (sensitivePathMatch(path.join(root, relativePath), policy) !== null) {
                throw new Error('review scope contains a sensitive path');
            }
        }
    }
}

function assertSafeSymlinkTargets(entries, root, options, runGit) {
    const policy = sensitivityOptions(options, root);
    for (const entry of entries) {
        const sides = Object.hasOwn(entry, 'mode')
            ? [{mode: entry.mode, objectId: entry.objectId, relativePath: entry.path}]
            : [
                {mode: entry.oldMode, objectId: entry.oldObjectId, relativePath: entry.oldPath},
                {mode: entry.newMode, objectId: entry.newObjectId, relativePath: entry.newPath},
            ];
        for (const side of sides) {
            if (side.mode !== '120000' || side.objectId === null || side.relativePath === null) continue;
            const targetBytes = runGit(
                ['show', side.objectId],
                {maxBuffer: MAX_SYMLINK_TARGET_BYTES + 1}
            );
            if (targetBytes.length > MAX_SYMLINK_TARGET_BYTES) {
                throw new Error('symbolic link target is invalid');
            }
            const target = text(targetBytes, 'symbolic link target');
            if (target === '' || /[\u0000-\u001f\u007f]/.test(target)) {
                throw new Error('symbolic link target is invalid');
            }
            const targetPath = path.isAbsolute(target)
                ? path.normalize(target)
                : path.resolve(root, path.dirname(side.relativePath), target);
            if (sensitivePathMatch(targetPath, policy) !== null) {
                throw new Error('review scope contains a sensitive symbolic link target');
            }
        }
    }
}

function modeKind(mode) {
    if (mode === '100644' || mode === '100755') return 'regular';
    if (mode === '120000') return 'symlink';
    if (mode === '160000') return 'gitlink';
    return 'unsupported-mode';
}

function showObject(runGit, object) {
    const bytes = runGit(['show', object], {maxBuffer: LIMIT.FILE_BYTES + 1});
    if (bytes.length > LIMIT.FILE_BYTES) throw new Error('review file exceeds limit');
    return bytes;
}

function classifyRegular(bytes) {
    if (bytes.includes(0)) return {kind: 'binary', value: null};
    return {kind: 'text', value: text(bytes, 'review file')};
}

function patchArgs(scope, entry, baseTree, headTree) {
    const paths = relativePaths(entry);
    const common = [
        '--unified=0', '--no-color', '--no-ext-diff', '--no-textconv', '--find-renames', '--find-copies',
    ];
    if (scope === 'staged') return ['diff', '--cached', ...common, '--', ...paths];
    return ['diff', ...common, baseTree, headTree, '--', ...paths];
}

function lineStarts(value) {
    const bytes = Buffer.from(value, 'utf8');
    const starts = [0];
    for (let index = 0; index < bytes.length; index += 1) {
        if (bytes[index] === 0x0a) starts.push(index + 1);
    }
    return Object.freeze(starts);
}

function hunkRanges(diffText) {
    const ranges = [];
    const pattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match;
    while ((match = pattern.exec(diffText)) !== null) {
        ranges.push({
            oldStart: Number(match[1]),
            oldLines: match[2] === undefined ? 1 : Number(match[2]),
            newStart: Number(match[3]),
            newLines: match[4] === undefined ? 1 : Number(match[4]),
        });
    }
    return ranges;
}

function requiredSides(entry, modeOnly, scope) {
    if (scope === 'path') return ['head'];
    if (entry.status === 'D') return ['base'];
    if (entry.status === 'R' || entry.status === 'C' || modeOnly) return ['base', 'head'];
    return ['head'];
}

function freezeDiffEntries(raw, scope, baseTree, headTree, runGit) {
    let aggregate = 0;
    const frozen = [];
    for (const rawEntry of raw) {
        const existingMode = rawEntry.newMode ?? rawEntry.oldMode;
        let kind = modeKind(existingMode);
        if (rawEntry.oldMode !== null && rawEntry.newMode !== null &&
            modeKind(rawEntry.oldMode) !== modeKind(rawEntry.newMode)) {
            kind = 'unsupported-mode';
        }
        let baseText = null;
        let headText = null;
        let baseBytes = 0;
        let headBytes = 0;
        const modeOnly = rawEntry.oldMode !== rawEntry.newMode &&
            rawEntry.oldObjectId !== null && rawEntry.oldObjectId === rawEntry.newObjectId &&
            modeKind(rawEntry.oldMode) === 'regular' && modeKind(rawEntry.newMode) === 'regular';
        const sides = requiredSides(rawEntry, modeOnly, scope);
        if (kind === 'regular') {
            const loaded = {};
            for (const side of sides) {
                const object = side === 'base' ? rawEntry.oldObjectId : rawEntry.newObjectId;
                if (object === null) throw new Error('regular entry object is missing');
                const bytes = showObject(runGit, object);
                loaded[side] = classifyRegular(bytes);
                if (loaded[side].kind === 'binary') kind = 'binary';
                if (side === 'base') baseBytes = bytes.length;
                else headBytes = bytes.length;
                aggregate += bytes.length;
            }
            if (kind === 'regular') kind = 'text';
            if (kind === 'text') {
                baseText = loaded.base?.value ?? null;
                headText = loaded.head?.value ?? null;
            } else {
                baseBytes = 0;
                headBytes = 0;
            }
        }
        const patchBytes = runGit(patchArgs(scope, rawEntry, baseTree, headTree));
        aggregate += patchBytes.length;
        if (aggregate > LIMIT.INPUT_BYTES) throw new Error('review input exceeds limit');
        const patchText = text(patchBytes, 'review diff');
        const exposedDiff = kind === 'text' ? patchText : '';
        const digestValue = digestJson({
            status: rawEntry.status,
            score: rawEntry.score,
            oldPath: rawEntry.oldPath,
            newPath: rawEntry.newPath,
            oldMode: rawEntry.oldMode,
            newMode: rawEntry.newMode,
            oldObjectId: rawEntry.oldObjectId,
            newObjectId: rawEntry.newObjectId,
            kind,
            lineCount: rawEntry.lineCount,
            objectDigests: {
                base: baseText === null ? null : digest(Buffer.from(baseText)),
                head: headText === null ? null : digest(Buffer.from(headText)),
            },
            diffDigest: digest(patchBytes),
        });
        frozen.push(Object.freeze({
            ...rawEntry,
            path: rawEntry.newPath ?? rawEntry.oldPath,
            kind,
            modeOnly,
            baseText,
            headText,
            baseLineStarts: baseText === null ? null : lineStarts(baseText),
            headLineStarts: headText === null ? null : lineStarts(headText),
            diffText: exposedDiff,
            baseBytes,
            headBytes,
            diffBytes: Buffer.byteLength(exposedDiff),
            byteCount: baseBytes + headBytes + Buffer.byteLength(exposedDiff),
            diffDigest: digest(patchBytes),
            entryDigest: digestValue,
            hunks: Object.freeze(hunkRanges(patchText).map((range) => Object.freeze(range))),
            requiredSides: Object.freeze(kind === 'text' ? sides : []),
        }));
    }
    return frozen.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function diffArguments(scope, baseTree, headTree, kind) {
    const flags = kind === 'raw'
        ? ['--raw', '-z', '--abbrev=64']
        : ['--numstat', '-z'];
    const common = ['--no-ext-diff', '--no-textconv', '--find-renames', '--find-copies'];
    if (scope === 'staged') return ['diff', '--cached', ...flags, ...common, '--'];
    return ['diff', ...flags, ...common, baseTree, headTree, '--'];
}

function stagedBase(runGit) {
    const result = runGit(['rev-parse', '--verify', 'HEAD^{commit}'], {allowFailure: true});
    return result === null ? null : objectId(text(result, 'HEAD').trim(), 'HEAD');
}

function branchFingerprint(runGit) {
    const branch = text(runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']), 'branch identity').trim();
    const head = text(runGit(['rev-parse', '--verify', 'HEAD^{commit}']), 'branch HEAD').trim();
    if (branch === '' || /[\x00-\x1f\x7f]/.test(branch) || !FULL_OBJECT.test(head)) {
        throw new Error('branch identity is invalid');
    }
    return {
        branch,
        head,
        worktreeDigest: digest(runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all'])),
    };
}

function indexFingerprint(root, runGit) {
    const rawPath = text(runGit(['rev-parse', '--git-path', 'index']), 'Git index path').trim();
    const indexPath = path.isAbsolute(rawPath) ? rawPath : path.join(root, rawPath);
    const canonicalParent = fs.realpathSync(path.dirname(indexPath));
    const resolved = path.join(canonicalParent, path.basename(indexPath));
    const bytes = fs.existsSync(resolved) ? fs.readFileSync(resolved) : Buffer.alloc(0);
    return Object.freeze({path: resolved, digest: digest(bytes)});
}

function treeEntries(bytes) {
    return nulFields(bytes, 'tree inventory').map((field) => {
        const match = field.match(TREE);
        if (match === null) throw new Error('tree inventory is malformed');
        return {
            mode: match[1],
            type: match[2],
            objectId: objectId(match[3], 'tree'),
            path: match[4],
        };
    });
}

function assertNoSymlinkTraversal(root, relativePath) {
    const segments = relativePath.split('/');
    let current = root;
    for (const segment of segments.slice(0, -1)) {
        current = path.join(current, segment);
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
            throw new Error('path scope traverses a symbolic link');
        }
    }
}

function freezePathEntries(items, runGit) {
    let aggregate = 0;
    const entries = items.map((item) => {
        const kindByMode = modeKind(item.mode);
        let kind = kindByMode;
        let headText = null;
        let headBytes = 0;
        if (kind === 'regular') {
            const bytes = showObject(runGit, item.objectId);
            aggregate += bytes.length;
            const classified = classifyRegular(bytes);
            kind = classified.kind;
            if (kind === 'text') {
                headText = classified.value;
                headBytes = bytes.length;
            }
        }
        if (aggregate > LIMIT.INPUT_BYTES) throw new Error('review input exceeds limit');
        const value = {
            status: 'P',
            score: null,
            oldPath: null,
            newPath: item.path,
            path: item.path,
            oldMode: null,
            newMode: item.mode,
            oldObjectId: null,
            newObjectId: item.objectId,
            kind,
            modeOnly: false,
            lineCount: null,
            baseText: null,
            headText,
            baseLineStarts: null,
            headLineStarts: headText === null ? null : lineStarts(headText),
            diffText: '',
            baseBytes: 0,
            headBytes,
            diffBytes: 0,
            byteCount: headBytes,
            diffDigest: digest(Buffer.alloc(0)),
            hunks: Object.freeze([]),
            requiredSides: Object.freeze(kind === 'text' ? ['head'] : []),
        };
        return Object.freeze({...value, entryDigest: digestJson({
            path: value.path,
            mode: value.newMode,
            objectId: value.newObjectId,
            kind: value.kind,
            objectDigest: headText === null ? null : digest(Buffer.from(headText)),
        })});
    });
    return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function finishSnapshot(value) {
    if (value.entries.length > LIMIT.CHANGED_PATHS ||
        new Set(value.entries.flatMap(relativePaths)).size > LIMIT.CHANGED_PATHS) {
        throw new Error('review path count exceeds limit');
    }
    const manifest = value.entries.map((entry) => Object.freeze({
        entryDigest: entry.entryDigest,
        status: entry.status,
        oldPath: entry.oldPath,
        newPath: entry.newPath,
        oldMode: entry.oldMode,
        newMode: entry.newMode,
        oldObjectId: entry.oldObjectId,
        newObjectId: entry.newObjectId,
        kind: entry.kind,
        lineCount: entry.lineCount,
        byteCount: entry.byteCount,
        diffDigest: entry.diffDigest,
    }));
    const diffDigest = digestJson(value.entries.map(({entryDigest, diffDigest: patchDigest}) => ({
        entryDigest,
        diffDigest: patchDigest,
    })));
    return Object.freeze({
        schemaVersion: 1,
        ...value,
        entries: Object.freeze(value.entries),
        manifest: Object.freeze(manifest),
        diffDigest,
        manifestDigest: digestJson(manifest),
    });
}

function createSnapshot(options) {
    const root = fs.realpathSync(options.repositoryRoot);
    const runGit = gitRunner(root, options.run);
    if (options.mode === 'path') {
        safeRelativePath(options.path, 'path scope');
        if (options.path === '.git' || options.path.startsWith('.git/')) {
            throw new Error('path scope is invalid');
        }
        assertNoSymlinkTraversal(root, options.path);
        assertSafePaths([{oldPath: null, newPath: options.path}], root, options);
        const headCommit = objectId(text(
            runGit(['rev-parse', '--verify', 'HEAD^{commit}']),
            'HEAD'
        ).trim(), 'HEAD');
        const items = treeEntries(runGit(['ls-tree', '-r', '-z', headCommit, '--', options.path]));
        if (items.length === 0) throw new Error('path scope is not tracked');
        if (items.length > LIMIT.CHANGED_PATHS) throw new Error('review path count exceeds limit');
        assertSafePaths(items.map((item) => ({oldPath: null, newPath: item.path})), root, options);
        assertSafeSymlinkTargets(items, root, options, runGit);
        return finishSnapshot({
            mode: 'path',
            repositoryRoot: root,
            baseCommit: null,
            headCommit,
            path: options.path,
            freshness: null,
            entries: freezePathEntries(items, runGit),
        });
    }
    let baseCommit;
    let headCommit;
    let baseTree;
    let headTree;
    let freshness = null;
    if (options.mode === 'staged') {
        baseCommit = stagedBase(runGit);
        headCommit = null;
        baseTree = baseCommit ?? emptyTree(runGit);
        headTree = null;
        freshness = indexFingerprint(root, runGit);
    } else if (options.mode === 'commit') {
        headCommit = resolveCommit(runGit, options.commit);
        baseCommit = commitParent(runGit, headCommit);
        baseTree = baseCommit ?? emptyTree(runGit);
        headTree = headCommit;
    } else if (options.mode === 'branch') {
        baseCommit = resolveCommit(runGit, options.base);
        headCommit = resolveCommit(runGit, options.head);
        baseTree = baseCommit;
        headTree = headCommit;
        if (options.trackBranchFreshness === true) {
            freshness = branchFingerprint(runGit);
            if (freshness.head !== headCommit) throw new Error('branch HEAD changed while freezing snapshot');
        }
    } else {
        throw new Error('snapshot mode is invalid');
    }
    const raw = rawEntries(runGit(diffArguments(options.mode, baseTree, headTree, 'raw')));
    const stats = numstatEntries(runGit(diffArguments(options.mode, baseTree, headTree, 'numstat')));
    if (raw.length > LIMIT.CHANGED_PATHS) throw new Error('review path count exceeds limit');
    const matched = matchNumstat(raw, stats);
    if (new Set(matched.flatMap(relativePaths)).size > LIMIT.CHANGED_PATHS) {
        throw new Error('review path count exceeds limit');
    }
    assertSafePaths(matched, root, options);
    assertSafeSymlinkTargets(matched, root, options, runGit);
    const entries = freezeDiffEntries(matched, options.mode, baseTree, headTree, runGit);
    if (options.mode === 'staged') {
        const after = indexFingerprint(root, runGit);
        if (after.path !== freshness.path || after.digest !== freshness.digest) {
            throw new Error('Git index changed while freezing snapshot');
        }
    } else if (options.mode === 'branch' && freshness !== null) {
        const after = branchFingerprint(runGit);
        if (JSON.stringify(after) !== JSON.stringify(freshness)) {
            throw new Error('branch changed while freezing snapshot');
        }
    }
    return finishSnapshot({
        mode: options.mode,
        repositoryRoot: root,
        baseCommit,
        headCommit,
        freshness,
        entries,
    });
}

function assertFresh(snapshot) {
    if (!['staged', 'branch'].includes(snapshot.mode)) return true;
    try {
        if (snapshot.mode === 'branch') {
            return snapshot.freshness === null || snapshot.freshness === undefined ||
                JSON.stringify(branchFingerprint(
                    gitRunner(snapshot.repositoryRoot)
                )) === JSON.stringify(snapshot.freshness);
        }
        const bytes = fs.existsSync(snapshot.freshness.path)
            ? fs.readFileSync(snapshot.freshness.path)
            : Buffer.alloc(0);
        const currentHead = stagedBase(gitRunner(snapshot.repositoryRoot));
        return digest(bytes) === snapshot.freshness.digest && currentHead === snapshot.baseCommit;
    } catch {
        return false;
    }
}

module.exports = {assertFresh, createSnapshot};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
