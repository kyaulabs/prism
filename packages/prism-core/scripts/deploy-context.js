// $KYAULabs: deploy-context.js kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

class ContextError extends Error {}

function errorCode(error) {
    return typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'I/O error';
}

function failure(file, problem) {
    return new ContextError(`${JSON.stringify(file)}: ${problem}`);
}

function sameStat(left, right) {
    return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode'].every(key => left[key] === right[key]);
}

function snapshot(file, optional = false) {
    let stat;
    try { stat = fs.lstatSync(file, {bigint: true}); }
    catch (error) {
        if (optional && error.code === 'ENOENT') return null;
        throw failure(file, `cannot inspect file (${errorCode(error)})`);
    }
    if (stat.isSymbolicLink()) throw failure(file, 'symlink preserved; expected a regular file');
    if (!stat.isFile()) throw failure(file, 'nonregular file preserved');
    let descriptor;
    try {
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        if (!sameStat(stat, fs.fstatSync(descriptor, {bigint: true}))) throw failure(file, 'file changed while opening');
        const content = fs.readFileSync(descriptor);
        if (!sameStat(stat, fs.fstatSync(descriptor, {bigint: true})) ||
            !sameStat(stat, fs.lstatSync(file, {bigint: true}))) throw failure(file, 'file changed while reading');
        return {stat, content};
    } catch (error) {
        if (error instanceof ContextError) throw error;
        throw failure(file, `cannot read file (${errorCode(error)})`);
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function markers(content, name, file) {
    const begin = `<!-- prism-core:begin ${name} do not edit; managed by install-global.sh -->`;
    const end = `<!-- prism-core:end ${name} -->`;
    const start = content.indexOf(begin);
    const finish = content.indexOf(end);
    if ((start < 0) !== (finish < 0)) throw failure(file, 'partial Prism marker pair; file preserved');
    if (start >= 0) {
        if (finish < start) throw failure(file, 'reversed Prism markers; file preserved');
        if (content.indexOf(begin, start + begin.length) >= 0 || content.indexOf(end, finish + end.length) >= 0) {
            throw failure(file, 'duplicate Prism markers; file preserved');
        }
    }
    return {begin, end, start, finish: finish < 0 ? -1 : finish + end.length};
}

function planContext(source, destination) {
    const manifestFile = path.join(source, 'package.json');
    const manifest = JSON.parse(snapshot(manifestFile).content.toString('utf8'));
    if (manifest.name !== '@kyaulabs/prism-core') throw failure(manifestFile, 'not a Core package');
    const input = snapshot(path.join(source, 'AGENTS.md')).content.toString('utf8');
    return ['AGENTS.md', 'APPEND_SYSTEM.md'].map(name => {
        const target = path.join(destination, name);
        const current = snapshot(target, true);
        const content = current?.content ?? Buffer.alloc(0);
        const {begin, end, start, finish} = markers(content, name, target);
        let output;
        if (name === 'APPEND_SYSTEM.md') {
            // Only the exact block and the old installer's single trailing LF
            // can justify deleting the file. All mixed-file outside bytes survive.
            if (start < 0) return {target, current, output: content};
            output = Buffer.concat([content.subarray(0, start), content.subarray(finish)]);
            if (start === 0 && (finish === content.length ||
                (finish === content.length - 1 && content[finish] === 0x0a))) output = null;
        } else {
            const block = Buffer.from(`${begin}\n${input.trimEnd()}\n${end}`);
            output = start < 0
                ? Buffer.concat([content, Buffer.from(content.length && content.at(-1) !== 0x0a ? '\n' : ''), block, Buffer.from('\n')])
                : Buffer.concat([content.subarray(0, start), block, content.subarray(finish)]);
        }
        return {target, current, output};
    });
}

function assertUnchanged(target, expected) {
    const actual = snapshot(target, true);
    if (expected === null ? actual !== null : actual === null ||
        !sameStat(expected.stat, actual.stat) || !expected.content.equals(actual.content)) {
        throw failure(target, 'context changed during deployment; concurrent edit preserved');
    }
}

function cleanupTemporary(file) {
    try { fs.unlinkSync(file); }
    catch (error) {
        if (error.code !== 'ENOENT') throw failure(file, `cannot clean temporary file (${errorCode(error)})`);
    }
}

function deployContext(source, destination = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent')) {
    destination = path.resolve(destination.replace(/^~(?=\/|$)/, os.homedir()));
    const completed = [];
    let target = destination;
    try {
        // Validate every planned context change before touching either target.
        const plans = planContext(source, destination);
        fs.mkdirSync(destination, {recursive: true, mode: 0o700});
        const directory = fs.lstatSync(destination);
        if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o022)) {
            throw failure(destination, 'expected a non-writable-by-others regular directory');
        }
        for (const plan of plans) {
            target = plan.target;
            const {current, output} = plan;
            const presentDirectory = fs.lstatSync(destination);
            if (!presentDirectory.isDirectory() || presentDirectory.isSymbolicLink() ||
                directory.dev !== presentDirectory.dev || directory.ino !== presentDirectory.ino || (presentDirectory.mode & 0o022)) {
                throw failure(destination, 'context directory changed during deployment');
            }
            if (output !== null && output.equals(current?.content ?? Buffer.alloc(0))) continue;
            const temp = `${target}.${randomUUID()}.tmp`;
            let descriptor;
            let temporaryOwned = false;
            try {
                if (output === null) {
                    assertUnchanged(target, current);
                    fs.unlinkSync(target);
                    completed.push({path: target, action: 'removed'});
                } else {
                    descriptor = fs.openSync(temp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
                    temporaryOwned = true;
                    fs.writeFileSync(descriptor, output);
                    // Keep existing permissions without copying special mode bits.
                    fs.fchmodSync(descriptor, current ? Number(current.stat.mode & 0o777n) : 0o600);
                    fs.fsyncSync(descriptor);
                    fs.closeSync(descriptor);
                    descriptor = undefined;
                    assertUnchanged(target, current);
                    fs.renameSync(temp, target);
                    temporaryOwned = false;
                    completed.push({path: target, action: 'updated'});
                }
            } finally {
                if (descriptor !== undefined) fs.closeSync(descriptor);
                if (temporaryOwned) cleanupTemporary(temp);
            }
        }
        return completed;
    } catch (error) {
        // Never relay file contents or arbitrary filesystem error messages.
        const problem = error instanceof ContextError ? error.message :
            `${JSON.stringify(target)}: context I/O or validation failed (${errorCode(error)})`;
        const progress = completed.length ? ` Completed (not rolled back): ${completed.map(item => `${item.action} ${JSON.stringify(item.path)}`).join(', ')}.` : ' No context changes completed.';
        // eslint-disable-next-line preserve-caught-error -- Causes can contain user context; report sanitized paths/problems only.
        throw new Error(`${problem}.${progress} Correct the problem and retry the same command.`);
    }
}

module.exports = {deployContext};

if (require.main === module) {
    try {
        if (process.argv.length < 3 || process.argv.length > 4) throw new Error('Usage: deploy-context.js CORE_PATH [PI_DIR]');
        for (const item of deployContext(process.argv[2], process.argv[3])) {
            console.log(`Context ${item.action}: ${JSON.stringify(item.path)}`);
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
