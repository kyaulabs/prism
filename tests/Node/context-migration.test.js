'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {deployContext} = require('../../packages/prism-core/scripts/deploy-context');

const begin = '<!-- prism-core:begin APPEND_SYSTEM.md do not edit; managed by install-global.sh -->';
const end = '<!-- prism-core:end APPEND_SYSTEM.md -->';
const block = `${begin}\nOld Prism reminder\n${end}`;

function fixture(t, content) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-context-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const source = path.join(root, 'core');
    const agent = path.join(root, 'agent');
    fs.mkdirSync(source, {mode: 0o700});
    fs.mkdirSync(agent, {mode: 0o700});
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({name: '@kyaulabs/prism-core'}));
    fs.writeFileSync(path.join(source, 'AGENTS.md'), '# Core\n');
    const file = path.join(agent, 'APPEND_SYSTEM.md');
    if (content !== undefined) fs.writeFileSync(file, content, {mode: 0o600});
    return {source, agent, file, run: () => deployContext(source, agent)};
}

for (const content of [undefined, block, `${block}\n`]) {
    test(`removes only wholly owned reminder (${content === undefined ? 'missing' : content === block ? 'block' : 'wrapper'}) idempotently`, t => {
        const target = fixture(t, content);
        target.run();
        assert.equal(fs.existsSync(target.file), false);
        target.run();
        assert.equal(fs.existsSync(target.file), false);
        assert.match(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), /# Core/);
    });
}

for (const [before, after] of [
    ['<!-- user -->\n\n', ''], ['', '\nUser tail\n'], ['User prefix\r\n', '\n\nUser tail  \n'],
    ['', '\n\n'], [' \t', '\n'],
]) {
    test(`preserves every outside byte ${JSON.stringify([before, after])}`, t => {
        const target = fixture(t, before + block + after);
        target.run();
        assert.deepEqual(fs.readFileSync(target.file), Buffer.from(before + after));
        target.run();
        assert.deepEqual(fs.readFileSync(target.file), Buffer.from(before + after));
    });
}

for (const [content, problem] of [
    [begin, 'partial'], [end, 'partial'], [end + begin, 'reversed'],
    [block + block, 'duplicate'], [begin + block, 'duplicate'], [block + end, 'duplicate'],
]) {
    test(`prevalidates ${problem} markers without writing either file`, t => {
        const target = fixture(t, content);
        assert.throws(target.run, error => error.message.includes(target.file) && error.message.includes(problem));
        assert.equal(fs.readFileSync(target.file, 'utf8'), content);
        assert.equal(fs.existsSync(path.join(target.agent, 'AGENTS.md')), false);
    });
}

for (const kind of ['symlink', 'directory', 'fifo']) {
    test(`preserves a ${kind} and identifies its path without contents`, t => {
        const target = fixture(t);
        if (kind === 'symlink') fs.symlinkSync(path.join(target.source, 'AGENTS.md'), target.file);
        else if (kind === 'directory') fs.mkdirSync(target.file);
        else require('node:child_process').execFileSync('mkfifo', [target.file]);
        assert.throws(target.run, error => error.message.includes(target.file) &&
            error.message.includes(kind === 'symlink' ? 'symlink' : 'nonregular') && !error.message.includes('# Core'));
        assert.equal(fs.existsSync(path.join(target.agent, 'AGENTS.md')), false);
        assert.equal(kind === 'symlink' ? fs.lstatSync(target.file).isSymbolicLink() : fs.existsSync(target.file), true);
    });
}

test('preserves non-UTF8 outside bytes and existing permissions', t => {
    const outside = Buffer.from([0xff, 0x0d, 0x0a]);
    const target = fixture(t, Buffer.concat([outside, Buffer.from(block), outside]));
    fs.chmodSync(target.file, 0o640);
    target.run();
    assert.deepEqual(fs.readFileSync(target.file), Buffer.concat([outside, outside]));
    assert.equal(fs.statSync(target.file).mode & 0o777, 0o640);
    assert.equal(fs.statSync(path.join(target.agent, 'AGENTS.md')).mode & 0o777, 0o600);
});

for (const change of ['edit', 'identical-replacement', 'symlink']) {
    test(`does not delete a reminder changed after planning (${change}) and reports partial progress`, t => {
        const target = fixture(t, `${block}\n`);
        const rename = fs.renameSync;
        t.mock.method(fs, 'renameSync', (from, to) => {
            rename(from, to);
            if (path.basename(to) === 'AGENTS.md') {
                if (change === 'edit') fs.appendFileSync(target.file, 'User concurrent edit\n');
                else {
                    fs.unlinkSync(target.file);
                    if (change === 'symlink') fs.symlinkSync(path.join(target.source, 'AGENTS.md'), target.file);
                    else fs.writeFileSync(target.file, `${block}\n`);
                }
            }
        });
        assert.throws(target.run, error => error.message.includes(target.file) &&
            /changed|symlink/.test(error.message) && error.message.includes('not rolled back'));
        assert.equal(fs.lstatSync(target.file).isSymbolicLink(), change === 'symlink');
        if (change === 'edit') assert.ok(fs.readFileSync(target.file, 'utf8').endsWith('User concurrent edit\n'));
        assert.match(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), /# Core/);
    });
}

for (const operation of ['writeFileSync', 'renameSync', 'unlinkSync']) {
    test(`a ${operation} failure is retryable, cleans temporary files, and reports the affected path`, t => {
        const target = fixture(t, `${block}\n`);
        const original = fs[operation];
        const mock = t.mock.method(fs, operation, (...args) => {
            if ((operation !== 'unlinkSync' || args[0] === target.file)) throw Object.assign(new Error('do not print arbitrary contents'), {code: 'EACCES'});
            return original(...args);
        });
        assert.throws(target.run, error => error.message.includes(operation === 'unlinkSync' ? target.file : 'AGENTS.md') &&
            error.message.includes('EACCES') && !error.message.includes('arbitrary contents'));
        assert.equal(fs.readFileSync(target.file, 'utf8'), `${block}\n`);
        assert.equal(fs.readdirSync(target.agent).some(name => name.endsWith('.tmp')), false);
        mock.mock.restore();
        target.run();
        target.run();
        assert.equal(fs.existsSync(target.file), false);
    });
}

test('exclusive temporary collision is preserved rather than removed', t => {
    const target = fixture(t);
    const open = fs.openSync;
    let collision;
    t.mock.method(fs, 'openSync', (file, flags, ...rest) => {
        if (String(file).endsWith('.tmp') && !collision) {
            collision = file;
            fs.writeFileSync(file, 'unrelated collision\n');
        }
        return open(file, flags, ...rest);
    });
    assert.throws(target.run, /EEXIST/);
    assert.equal(fs.readFileSync(collision, 'utf8'), 'unrelated collision\n');
    assert.equal(fs.existsSync(path.join(target.agent, 'AGENTS.md')), false);
});

test('partial temporary write failure cleans the owned file', t => {
    const target = fixture(t);
    const write = fs.writeFileSync;
    t.mock.method(fs, 'writeFileSync', (descriptor, ...args) => {
        write(descriptor, ...args);
        if (typeof descriptor === 'number') throw Object.assign(new Error('partial write'), {code: 'EIO'});
    });
    assert.throws(target.run, /EIO/);
    assert.deepEqual(fs.readdirSync(target.agent), []);
});

test('CLI honors the selected Pi directory, reports malformed paths without contents, and falls back to the documented default', t => {
    const target = fixture(t, begin + '\nDO_NOT_PRINT_USER_TEXT\n');
    const {spawnSync} = require('node:child_process');
    const script = path.resolve(__dirname, '../../packages/prism-core/scripts/deploy-context.js');
    const run = overrides => spawnSync(process.execPath, [script, target.source], {
        encoding: 'utf8', env: {...process.env, HOME: path.dirname(target.agent), PI_CODING_AGENT_DIR: target.agent, ...overrides},
    });
    const rejected = run({});
    assert.notEqual(rejected.status, 0);
    assert.ok(rejected.stderr.includes(target.file));
    assert.match(rejected.stderr, /partial Prism marker/);
    assert.doesNotMatch(rejected.stderr, /DO_NOT_PRINT/);
    fs.unlinkSync(target.file);
    assert.equal(run({}).status, 0);
    assert.equal(run({PI_CODING_AGENT_DIR: ''}).status, 0);
    assert.equal(fs.existsSync(path.join(path.dirname(target.agent), '.pi/agent/AGENTS.md')), true);
});

test('concurrent AGENTS creation is not overwritten', t => {
    const target = fixture(t);
    const write = fs.writeFileSync;
    t.mock.method(fs, 'writeFileSync', (...args) => {
        write(...args);
        if (typeof args[0] === 'number') write(path.join(target.agent, 'AGENTS.md'), 'User won\n');
    });
    assert.throws(target.run, /context changed/);
    assert.equal(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), 'User won\n');
});

test('unmarked user content and old-looking prose are not guessed to be owned', t => {
    const content = '# Prism\nUse skills on demand.\n\n<!-- user comment -->\n';
    const target = fixture(t, content);
    target.run();
    assert.equal(fs.readFileSync(target.file, 'utf8'), content);
});
