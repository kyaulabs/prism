// $KYAULabs: source-checkout.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {loadAdditionalSensitivePaths, sensitivePathMatch} = require('../sensitive-path-policy');
const {assertPackageParity, validateContract} = require('./contract');
const {isSafeManagedMode} = require('./managed-file');

const IDENTITY = ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'mtimeMs', 'ctimeMs'];
const same = (left, right) => IDENTITY.every((field) => left[field] === right[field]);

function inspectSourceCheckout({projectRoot}) {
    const absent = {disposition: 'NOT_SOURCE', reason: 'NOT_PRISM_SOURCE'};
    const conflict = {disposition: 'CONFLICT', reason: 'UNSAFE_SOURCE_CHECKOUT'};
    const policy = {home: os.homedir(), extraPaths: loadAdditionalSensitivePaths(process.env.PRISM_SENSITIVE_PATHS)};
    const requirePublic = (logical) => {
        if (sensitivePathMatch(logical, policy) !== null) throw new Error('source evidence is excluded');
    };
    const directories = new Map();
    const files = new Map();
    const descriptors = [];
    const checkKind = (stat, directory, mode) => {
        if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) ||
            stat.uid !== process.getuid() || !isSafeManagedMode(stat.mode, mode)) throw new Error('unsafe source evidence');
    };
    const verifyDirectories = () => {
        for (const {logical, stat, fd} of directories.values()) {
            if (!same(stat, fs.fstatSync(fd)) || !same(stat, fs.lstatSync(logical)) ||
                fs.realpathSync(logical) !== logical) throw new Error('source directory changed');
        }
    };
    const holdDirectory = (relative = '') => {
        verifyDirectories();
        if (directories.has(relative)) return directories.get(relative);
        const logical = relative === '' ? projectRoot : path.join(projectRoot, relative);
        requirePublic(logical);
        const parentName = path.posix.dirname(relative);
        const target = relative === '' ? logical : path.join(
            holdDirectory(parentName === '.' ? '' : parentName).anchor, path.posix.basename(relative));
        const stat = fs.lstatSync(target);
        checkKind(stat, true, 0o755);
        if (!fs.constants.O_DIRECTORY || !fs.constants.O_NOFOLLOW) throw new Error('source containment unavailable');
        const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        descriptors.push(fd);
        if (!same(stat, fs.fstatSync(fd))) throw new Error('source directory changed');
        const anchor = ['/proc/self/fd', '/dev/fd'].map((prefix) => `${prefix}/${fd}`).find((candidate) => {
            try { return same(stat, fs.statSync(candidate)); } catch { return false; }
        });
        if (!anchor) throw new Error('source containment unavailable');
        const entry = {logical, stat, fd, anchor};
        directories.set(relative, entry);
        verifyDirectories();
        return entry;
    };
    const filePath = (relative) => {
        requirePublic(path.join(projectRoot, relative));
        const parent = path.posix.dirname(relative);
        return path.join(holdDirectory(parent === '.' ? '' : parent).anchor, path.posix.basename(relative));
    };
    const inspectFile = (relative, mode = 0o644) => {
        const target = filePath(relative);
        const stat = fs.lstatSync(target);
        checkKind(stat, false, mode);
        files.set(relative, stat);
        return {target, stat};
    };
    const read = (relative) => {
        const {target, stat} = inspectFile(relative);
        if (stat.size > 1048576) throw new Error('source evidence exceeds limit');
        const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        try {
            verifyDirectories();
            if (!same(stat, fs.fstatSync(fd))) throw new Error('source file changed');
            const buffer = Buffer.alloc(stat.size + 1);
            let offset = 0;
            while (offset < buffer.length) {
                const count = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
                if (count === 0) break;
                offset += count;
            }
            verifyDirectories();
            if (offset !== stat.size || !same(stat, fs.fstatSync(fd)) || !same(stat, fs.lstatSync(target))) {
                throw new Error('source file changed');
            }
            return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
        } finally { fs.closeSync(fd); }
    };
    const layoutClaim = () => {
        try {
            const packages = path.join(holdDirectory().anchor, 'packages');
            const stat = fs.lstatSync(packages);
            if (!stat.isDirectory() || stat.isSymbolicLink()) return true;
            return fs.lstatSync(path.join(holdDirectory('packages').anchor, 'prism-core'), {throwIfNoEntry: false}) !== undefined;
        } catch (error) { return error.code !== 'ENOENT'; }
    };
    const classify = () => {
        holdDirectory();
        let manifest;
        try { manifest = read('package.json'); }
        catch { return layoutClaim() ? conflict : absent; }
        if (manifest?.name !== 'prism') return absent;
        if (manifest.private !== true) return conflict;
        holdDirectory('.git');
        const identity = read('packages/prism-core/package.json');
        const contract = validateContract(read('packages/prism-core/toolchain.json'), 'source toolchain');
        if (identity.name !== '@kyaulabs/prism-core' || contract.role !== 'core') return conflict;
        assertPackageParity(contract, identity);
        for (const name of ['prism-tool.js', 'validate-harness.sh']) inspectFile(`packages/prism-core/scripts/${name}`, 0o755);
        for (const name of ['skills', 'prompts']) holdDirectory(`packages/prism-core/${name}`);
        return {disposition: 'SOURCE_CHECKOUT', reason: 'PRISM_SOURCE_CHECKOUT'};
    };
    let result;
    try {
        result = classify();
        if (result.disposition !== 'CONFLICT') {
            verifyDirectories();
            for (const [relative, stat] of files) {
                if (!same(stat, fs.lstatSync(filePath(relative)))) throw new Error('source file changed');
            }
        }
    } catch { result = conflict; }
    finally {
        for (const fd of descriptors.reverse()) {
            try { fs.closeSync(fd); } catch { result = conflict; }
        }
    }
    return result;
}

module.exports = {inspectSourceCheckout};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
