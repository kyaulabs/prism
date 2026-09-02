// $KYAULabs: prism-review-snapshot.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    assertFresh,
    createSnapshot,
} = require('../../packages/prism-core/scripts/prism-review/git-snapshot');
const {createSnapshotTools} = require('../../packages/prism-core/scripts/prism-review/snapshot-tools');

function repository(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-git-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    git(root, ['init', '-q']);
    git(root, ['config', 'user.email', 'fixture@example.test']);
    git(root, ['config', 'user.name', 'Fixture']);
    return root;
}

function git(root, args, options = {}) {
    return execFileSync('git', args, {cwd: root, encoding: options.encoding ?? 'utf8', input: options.input});
}

function write(root, relativePath, value, mode) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, value);
    if (mode !== undefined) fs.chmodSync(target, mode);
}

function commit(root, subject) {
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', subject]);
    return git(root, ['rev-parse', 'HEAD']).trim();
}

function assertDigest(value) {
    assert.match(value, /^[0-9a-f]{64}$/);
}

const METADATA_EXEMPTIONS = {
    binary: 'metadata.binary',
    symlink: 'metadata.symlink',
    gitlink: 'metadata.gitlink',
    'unsupported-mode': 'metadata.unsupported-mode',
};

test('freezes staged index entries with canonical metadata and ignores worktree drift', async (t) => {
    const root = repository(t);
    write(root, 'modify.txt', 'before\n');
    write(root, 'delete.txt', 'delete me\n');
    write(root, 'rename.txt', 'rename me\n');
    write(root, 'copy.txt', 'copy me\n');
    write(root, 'mode.sh', '#!/bin/sh\necho ok\n', 0o644);
    commit(root, 'base');

    write(root, 'modify.txt', 'after café\n');
    fs.rmSync(path.join(root, 'delete.txt'));
    fs.renameSync(path.join(root, 'rename.txt'), path.join(root, 'renamed.txt'));
    fs.copyFileSync(path.join(root, 'copy.txt'), path.join(root, 'copied.txt'));
    fs.chmodSync(path.join(root, 'mode.sh'), 0o755);
    write(root, 'added.txt', 'added\n');
    write(root, 'binary.dat', Buffer.from([0, 1, 2, 3]));
    fs.symlinkSync('modify.txt', path.join(root, 'link'));
    git(root, ['add', '-A']);
    const gitlinkObject = git(root, ['rev-parse', 'HEAD']).trim();
    git(root, ['update-index', '--add', '--cacheinfo', `160000,${gitlinkObject},vendor/submodule`]);
    write(root, 'modify.txt', 'unstaged replacement\n');
    write(root, 'untracked.txt', 'not in scope\n');

    const snapshot = createSnapshot({mode: 'staged', repositoryRoot: root});

    assert.deepEqual(snapshot.entries.map(({path: entryPath}) => entryPath),
        [...snapshot.entries.map(({path: entryPath}) => entryPath)].sort());
    assert.equal(snapshot.entries.some(({path: entryPath}) => entryPath === 'untracked.txt'), false);
    const modified = snapshot.entries.find(({path: entryPath}) => entryPath === 'modify.txt');
    assert.equal(modified.status, 'M');
    assert.equal(modified.kind, 'text');
    assert.equal(modified.headText, 'after café\n');
    assert.deepEqual(modified.headLineStarts, [0, 12]);
    assert.equal(modified.lineCount.added, 1);
    assert.equal(modified.lineCount.deleted, 1);
    const modeOnly = snapshot.entries.find(({path: entryPath}) => entryPath === 'mode.sh');
    assert.equal(modeOnly.modeOnly, true);
    assert.equal(modeOnly.baseText, modeOnly.headText);
    assert.equal(snapshot.entries.find(({path: entryPath}) => entryPath === 'added.txt').status, 'A');
    assert.equal(snapshot.entries.find(({path: entryPath}) => entryPath === 'delete.txt').status, 'D');
    const renamed = snapshot.entries.find(({path: entryPath}) => entryPath === 'renamed.txt');
    assert.equal(renamed.status, 'R');
    assert.equal(renamed.oldPath, 'rename.txt');
    const copied = snapshot.entries.find(({path: entryPath}) => entryPath === 'copied.txt');
    assert.equal(copied.status, 'C');
    assert.equal(copied.oldPath, 'copy.txt');
    assert.equal(snapshot.entries.find(({path: entryPath}) => entryPath === 'binary.dat').kind, 'binary');
    assert.equal(snapshot.entries.find(({path: entryPath}) => entryPath === 'link').kind, 'symlink');
    assert.equal(snapshot.entries.find(({path: entryPath}) => entryPath === 'vendor/submodule').kind, 'gitlink');
    for (const entry of snapshot.entries) {
        assertDigest(entry.entryDigest);
        assertDigest(entry.diffDigest);
        if (entry.oldObjectId !== null) assert.match(entry.oldObjectId, /^[0-9a-f]{40,64}$/);
        if (entry.newObjectId !== null) assert.match(entry.newObjectId, /^[0-9a-f]{40,64}$/);
    }
    assertDigest(snapshot.diffDigest);
    assertDigest(snapshot.manifestDigest);
    assert.equal(assertFresh(snapshot), true);
    write(root, 'copy.txt', 'unrelated worktree edit\n');
    assert.equal(assertFresh(snapshot), true);
    git(root, ['add', 'copy.txt']);
    assert.equal(assertFresh(snapshot), false);

    const {tools, ledger} = createSnapshotTools(snapshot, {metadataExemptions: METADATA_EXEMPTIONS});
    for (const entry of snapshot.entries.filter(({kind}) => kind === 'text')) {
        for (const side of entry.requiredSides) {
            let offset = 0;
            do {
                const result = await tools.read_file.execute('call-file', {
                    entryDigest: entry.entryDigest,
                    side,
                    offset,
                    limit: 5,
                });
                assert.match(result.content, /^UNTRUSTED REVIEW FILE/);
                assert.equal(result.offset, offset);
                offset = result.nextOffset;
            } while (offset < (side === 'base' ? entry.baseBytes : entry.headBytes));
        }
        let offset = 0;
        while (offset < entry.diffBytes) {
            const result = await tools.read_diff.execute('call-diff', {
                entryDigest: entry.entryDigest,
                offset,
                limit: 7,
            });
            assert.match(result.content, /^UNTRUSTED REVIEW DIFF/);
            offset = result.nextOffset;
        }
    }
    assert.equal(ledger.isComplete(), true);
});

test('freezes exact commit and branch scopes including a root commit', (t) => {
    const root = repository(t);
    write(root, 'root.txt', 'root\n');
    const first = commit(root, 'root');
    write(root, 'root.txt', 'second\n');
    write(root, 'new.txt', 'new\n');
    const second = commit(root, 'second');

    const rootSnapshot = createSnapshot({mode: 'commit', repositoryRoot: root, commit: first});
    const commitSnapshot = createSnapshot({mode: 'commit', repositoryRoot: root, commit: second});
    const branchSnapshot = createSnapshot({mode: 'branch', repositoryRoot: root, base: first, head: second});
    assert.equal(rootSnapshot.entries[0].status, 'A');
    assert.equal(rootSnapshot.baseCommit, null);
    assert.equal(commitSnapshot.baseCommit, first);
    assert.equal(commitSnapshot.headCommit, second);
    assert.equal(branchSnapshot.baseCommit, first);
    assert.equal(branchSnapshot.headCommit, second);

    write(root, 'root.txt', 'worktree changed\n');
    assert.equal(assertFresh(rootSnapshot), true);
    assert.equal(assertFresh(commitSnapshot), true);
    assert.equal(assertFresh(branchSnapshot), true);
    assert.equal(
        createSnapshot({mode: 'branch', repositoryRoot: root, base: first, head: second}).manifestDigest,
        branchSnapshot.manifestDigest
    );
});

test('path scope inventories tracked HEAD objects and rejects unsafe or mutable paths', (t) => {
    const root = repository(t);
    write(root, 'docs/a.txt', 'alpha\n');
    write(root, 'docs/b.txt', 'beta\n');
    write(root, '.gitignore', 'ignored.txt\n');
    commit(root, 'base');
    write(root, 'ignored.txt', 'ignored\n');
    write(root, 'untracked.txt', 'untracked\n');
    fs.symlinkSync('docs', path.join(root, 'linked-docs'));

    const snapshot = createSnapshot({mode: 'path', repositoryRoot: root, path: 'docs'});

    assert.deepEqual(snapshot.entries.map(({path: entryPath}) => entryPath), ['docs/a.txt', 'docs/b.txt']);
    assert.equal(snapshot.entries.every(({diffBytes}) => diffBytes === 0), true);
    assert.equal(assertFresh(snapshot), true);
    write(root, 'docs/a.txt', 'worktree only\n');
    assert.equal(assertFresh(snapshot), true);
    for (const candidate of ['ignored.txt', 'untracked.txt', '.git', '/etc/passwd', '../outside', 'linked-docs/a.txt']) {
        assert.throws(() => createSnapshot({mode: 'path', repositoryRoot: root, path: candidate}), undefined, candidate);
    }
});

test('rejects sensitive paths before requesting patches or object bytes', () => {
    const calls = [];
    const run = (_command, args) => {
        calls.push(args);
        if (args[0] === 'rev-parse') return {status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: ''};
        if (args[0] === 'diff' && args.includes('--raw')) {
            return {status: 0, stdout: Buffer.from(`:000000 100644 ${'0'.repeat(40)} ${'b'.repeat(40)} A\0.env\0`), stderr: Buffer.alloc(0)};
        }
        if (args[0] === 'diff' && args.includes('--numstat')) {
            return {status: 0, stdout: Buffer.from('1\t0\t.env\0'), stderr: Buffer.alloc(0)};
        }
        throw new Error('bytes requested');
    };

    assert.throws(() => createSnapshot({
        mode: 'branch',
        repositoryRoot: process.cwd(),
        base: 'a'.repeat(40),
        head: 'b'.repeat(40),
        run,
        home: os.homedir(),
    }), /sensitive/i);
    assert.equal(calls.some((args) => args[0] === 'show'), false);
    assert.equal(calls.some((args) => args.includes('--unified=0')), false);
});

test('fails closed on limits, invalid UTF-8, and malformed Git output', (t) => {
    const oversized = repository(t);
    write(oversized, 'large.txt', 'x'.repeat(262145));
    git(oversized, ['add', 'large.txt']);
    assert.throws(() => createSnapshot({mode: 'staged', repositoryRoot: oversized}), /limit|large/i);

    const invalid = repository(t);
    write(invalid, 'bad.txt', Buffer.from([0xff, 0xfe]));
    git(invalid, ['add', 'bad.txt']);
    assert.throws(() => createSnapshot({mode: 'staged', repositoryRoot: invalid}), /UTF-8/i);

    const run = (_command, args) => {
        if (args[0] === 'rev-parse') return {status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: ''};
        if (args[0] === 'diff' && args.includes('--raw')) {
            return {status: 0, stdout: Buffer.from('not-nul-terminated'), stderr: Buffer.alloc(0)};
        }
        throw new Error('unexpected Git call');
    };
    assert.throws(() => createSnapshot({
        mode: 'branch', repositoryRoot: process.cwd(), base: 'a'.repeat(40), head: 'b'.repeat(40), run,
    }), /malformed/i);
});

test('fails closed on path-count, aggregate-input, timeout, output, and disagreement bounds', (t) => {
    const many = repository(t);
    for (let index = 0; index < 513; index += 1) {
        write(many, `many/${String(index).padStart(3, '0')}.txt`, 'x\n');
    }
    git(many, ['add', '-A']);
    assert.throws(() => createSnapshot({mode: 'staged', repositoryRoot: many}), /path count/);

    const aggregate = repository(t);
    for (let index = 0; index < 5; index += 1) {
        write(aggregate, `large-${index}.txt`, `${'x'.repeat(220000)}\n`);
    }
    git(aggregate, ['add', '-A']);
    assert.throws(() => createSnapshot({mode: 'staged', repositoryRoot: aggregate}), /input exceeds/);

    const timeoutRun = () => ({status: null, stdout: Buffer.alloc(0), error: {code: 'ETIMEDOUT'}});
    assert.throws(() => createSnapshot({
        mode: 'branch', repositoryRoot: process.cwd(), base: 'a'.repeat(40), head: 'b'.repeat(40),
        run: timeoutRun,
    }), /timed out/);

    const overflowRun = () => ({status: 0, stdout: Buffer.alloc(1048577), stderr: Buffer.alloc(0)});
    assert.throws(() => createSnapshot({
        mode: 'branch', repositoryRoot: process.cwd(), base: 'a'.repeat(40), head: 'b'.repeat(40),
        run: overflowRun,
    }), /output/i);

    const disagreementRun = (_command, args) => {
        if (args[0] === 'rev-parse') return {status: 0, stdout: `${'a'.repeat(40)}\n`};
        if (args.includes('--raw')) {
            return {status: 0, stdout: Buffer.from(`:000000 100644 ${'0'.repeat(40)} ${'b'.repeat(40)} A\0a.txt\0`)};
        }
        if (args.includes('--numstat')) return {status: 0, stdout: Buffer.from('1\t0\tb.txt\0')};
        throw new Error('unexpected call');
    };
    assert.throws(() => createSnapshot({
        mode: 'branch', repositoryRoot: process.cwd(), base: 'a'.repeat(40), head: 'b'.repeat(40),
        run: disagreementRun,
    }), /disagree/);
});

test('retains unsupported Git modes as metadata-only entries', () => {
    const run = (_command, args) => {
        if (args[0] === 'rev-parse') return {status: 0, stdout: `${'a'.repeat(40)}\n`};
        if (args.includes('--raw')) {
            return {status: 0, stdout: Buffer.from(`:000000 100664 ${'0'.repeat(40)} ${'b'.repeat(40)} A\0odd.txt\0`)};
        }
        if (args.includes('--numstat')) return {status: 0, stdout: Buffer.from('0\t0\todd.txt\0')};
        if (args.includes('--unified=0')) return {status: 0, stdout: Buffer.from('mode-only metadata\n')};
        throw new Error('unexpected call');
    };

    const snapshot = createSnapshot({
        mode: 'branch', repositoryRoot: process.cwd(), base: 'a'.repeat(40), head: 'b'.repeat(40), run,
    });

    assert.equal(snapshot.entries[0].kind, 'unsupported-mode');
    assert.deepEqual(snapshot.entries[0].requiredSides, []);
});

test('snapshot tools reject invented parameters and mark failed ledgers', async (t) => {
    const root = repository(t);
    write(root, 'unicode.txt', 'éx\n');
    commit(root, 'base');
    const snapshot = createSnapshot({mode: 'path', repositoryRoot: root, path: 'unicode.txt'});
    const {tools, ledger} = createSnapshotTools(snapshot, {metadataExemptions: METADATA_EXEMPTIONS});
    const entry = snapshot.entries[0];
    const first = await tools.read_file.execute('first', {
        entryDigest: entry.entryDigest,
        side: 'head',
        offset: 0,
        limit: 1,
    });
    assert.equal(first.nextOffset, 2);
    assert.match(first.content, /é/);

    await assert.rejects(() => tools.read_file.execute('bad', {
        entryDigest: entry.entryDigest,
        side: 'head',
        offset: 1,
        limit: 1,
    }));
    await assert.rejects(() => tools.read_file.execute('bad', {
        entryDigest: entry.entryDigest,
        side: 'head',
        offset: 0,
        limit: 32769,
        path: 'unicode.txt',
    }));
    await assert.rejects(() => tools.read_diff.execute('bad', {
        entryDigest: 'f'.repeat(64), offset: 0, limit: 1,
    }));
    assert.equal(ledger.failed, true);
    assert.equal(ledger.isComplete(), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
