// $KYAULabs: semgrep-workspace.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const {spawn} = require('node:child_process');
const {isUtf8} = require('node:buffer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {setTimeout, clearTimeout, setImmediate} = require('node:timers');
const {loadAdditionalSensitivePaths, sensitivePathMatch} = require('../sensitive-path-policy');

const METADATA_LIMIT = 64 * 1024 * 1024;
const BLOB_LIMIT = 32 * 1024 * 1024;
const BLOB_TOTAL = 256 * 1024 * 1024;
const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const IDENTITY_FIELDS = ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs'];
const PRIVATE_PATHS = ['.pi/prism-tool', '.pi/prism-review', '.pi/npm', '.pi/git',
    '.semgrep/settings.yml', '.semgrep/settings.yaml'];

function checkedId(value) {
    if (!OBJECT_ID.test(value)) throw new Error('semgrep Git identity is invalid');
    return value;
}

function readHeldFile(file, maximum) {
    const before = fs.lstatSync(file);
    const same = (stat) => IDENTITY_FIELDS.every((field) => stat[field] === before[field]);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maximum ||
        before.uid !== process.getuid() || fs.realpathSync(file) !== file) {
        throw new Error('semgrep input file is unsupported');
    }
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        if (!same(fs.fstatSync(descriptor))) throw new Error('semgrep input identity changed');
        const buffer = Buffer.alloc(before.size + 1);
        let offset = 0;
        while (offset < buffer.length) {
            const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
            if (count === 0) break;
            offset += count;
        }
        if (offset !== before.size || !same(fs.fstatSync(descriptor)) ||
            !same(fs.lstatSync(file)) || fs.realpathSync(file) !== file) {
            throw new Error('semgrep input identity changed');
        }
        const bytes = buffer.subarray(0, offset);
        return {bytes, identity: {...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, before[field]])),
            sha256: crypto.createHash('sha256').update(bytes).digest('hex')}};
    } finally {
        fs.closeSync(descriptor);
    }
}

async function makeSemgrepWorkspace({projectRoot, baseline, otherBaseline, configs, targets, probe = false, env, signal, deadline: finalDeadline, workDeadline}) {
    let deadline = workDeadline;
    let finishing = false;
    let steps = 0;
    const checkpoint = async () => {
        if (++steps % 64 === 0) await new Promise(setImmediate);
        if (!finishing && signal?.aborted) throw new Error('semgrep interrupted');
        if (performance.now() >= deadline) throw new Error('semgrep preparation timed out');
    };
    const source = fs.realpathSync(projectRoot);
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const relativeTemporaryRoot = path.relative(source, temporaryRoot);
    if (relativeTemporaryRoot === '' || (relativeTemporaryRoot !== '..' &&
        !relativeTemporaryRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeTemporaryRoot))) {
        throw new Error('semgrep temporary storage must be outside the consumer');
    }
    const root = fs.mkdtempSync(path.join(temporaryRoot, 'prism-semgrep-'));
    const rootStat = fs.lstatSync(root);
    const cleanup = () => {
        const stat = fs.lstatSync(root);
        if (stat.isSymbolicLink() || stat.dev !== rootStat.dev || stat.ino !== rootStat.ino ||
            stat.uid !== rootStat.uid) throw new Error('semgrep workspace identity changed');
        fs.rmSync(root, {recursive: true, force: false});
    };
    try {
        fs.chmodSync(root, 0o700);
        for (const name of ['work', 'home', 'config', 'cache', 'tmp', 'empty-template']) {
            fs.mkdirSync(path.join(root, name), {mode: 0o700});
        }
        const directory = path.join(root, 'work');
        const isolatedEnv = {
            PATH: env.PATH, HOME: path.join(root, 'home'), LC_ALL: 'C',
            XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache'),
            TMPDIR: path.join(root, 'tmp'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1',
            GIT_NO_REPLACE_OBJECTS: '1', SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0',
        };
        if (probe) return {root, directory, env: isolatedEnv, baseline: null, cleanup, verify: async () => {}};
        const policy = {home: os.homedir(), extraPaths: loadAdditionalSensitivePaths(env.PRISM_SENSITIVE_PATHS)};
        const excludedPath = (relative) => PRIVATE_PATHS.some((privatePath) =>
            relative.toLowerCase() === privatePath || relative.toLowerCase().startsWith(`${privatePath}/`)) ||
            sensitivePathMatch(path.join(source, relative), policy) !== null;
        const safePath = (relative) => {
            if (Buffer.byteLength(relative) > 4096 || relative === '' || path.isAbsolute(relative) ||
                /[\\\x00-\x1f\x7f]/.test(relative) || relative.split('/').some((part) =>
                ['', '.', '..', '.git', 'node_modules', 'vendor'].includes(part.toLowerCase())) || excludedPath(relative)) {
                throw new Error('semgrep endpoint contains an excluded path');
            }
        };
        let entriesSeen = 0;
        const administrativeNames = async (file) => {
            const names = [];
            const handle = fs.opendirSync(file, {encoding: 'buffer'});
            try {
                for (let entry; (entry = handle.readSync()) !== null;) {
                    await checkpoint();
                    if (!isUtf8(entry.name)) throw new Error('semgrep administrative path encoding is unsupported');
                    if (names.length >= 100000) throw new Error('semgrep administrative path count exceeds limit');
                    names.push(entry.name.toString('utf8'));
                }
            } finally {
                handle.closeSync();
            }
            return names.sort();
        };
        const checkAdministration = async (file) => {
            await checkpoint();
            if (++entriesSeen > 100000) throw new Error('semgrep preparation exceeds limit');
            const stat = fs.lstatSync(file);
            if (sensitivePathMatch(file, policy) !== null) throw new Error('semgrep Git path is excluded');
            if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
                throw new Error('semgrep Git administration is unsupported');
            }
            if (stat.isDirectory()) {
                for (const name of await administrativeNames(file)) await checkAdministration(path.join(file, name));
            }
        };
        const gitDir = path.join(source, '.git');
        for (const name of ['', 'objects', 'refs']) {
            const target = path.join(gitDir, name);
            if (name === '') {
                const stat = fs.lstatSync(target);
                if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('semgrep requires an independent Git checkout');
            } else if (fs.existsSync(target)) await checkAdministration(target);
        }
        for (const name of ['HEAD', 'config', 'index', 'packed-refs']) {
            const target = path.join(gitDir, name);
            if (fs.existsSync(target)) await checkAdministration(target);
        }
        const verifySupportedAdministration = (checkWorktree = true) => {
            for (const name of ['commondir', 'shallow', 'reftable', 'objects/info/alternates', 'info/grafts',
                ...(checkWorktree ? ['config.worktree'] : [])]) {
                try {
                    fs.lstatSync(path.join(gitDir, name));
                    throw new Error('semgrep Git administration is unsupported');
                } catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                }
            }
        };
        verifySupportedAdministration(false);
        const configPath = path.join(gitDir, 'config');
        const {bytes: configBytes, identity: configIdentity} = readHeldFile(configPath, 1048576);
        const config = configBytes.toString('utf8');
        const verifySourceConfiguration = () => {
            verifySupportedAdministration(worktreeConfigEnabled);
            const observed = fs.lstatSync(configPath);
            if (!IDENTITY_FIELDS.every((field) => observed[field] === configIdentity[field]) ||
                fs.realpathSync(configPath) !== configPath) {
                throw new Error('semgrep consumer Git configuration changed');
            }
        };
        if (Buffer.byteLength(config) > 1048576 || /\\|^\s*\[\s*include/im.test(config)) {
            throw new Error('semgrep repository configuration is unsupported');
        }
        const administrativeState = async () => {
            const inventory = {};
            let total = 2;
            let paths = 0;
            const inspect = async (file) => {
                await checkpoint();
                if (++paths > 100000) throw new Error('semgrep preservation exceeds limit');
                let stat;
                try { stat = fs.lstatSync(file); }
                catch (error) { if (error.code === 'ENOENT') return; throw error; }
                if (stat.isSymbolicLink() || sensitivePathMatch(file, policy) !== null) {
                    throw new Error('semgrep preservation path is unsafe');
                }
                if (stat.isDirectory()) {
                    for (const name of await administrativeNames(file)) await inspect(path.join(file, name));
                } else {
                    const relative = path.relative(gitDir, file);
                    const keyBytes = Buffer.byteLength(JSON.stringify(relative)) + 2;
                    const observed = readHeldFile(file, METADATA_LIMIT - total - keyBytes);
                    total += keyBytes + observed.bytes.length + Buffer.byteLength(JSON.stringify(observed.identity));
                    if (total > METADATA_LIMIT) throw new Error('semgrep preservation metadata exceeds limit');
                    inventory[relative] = observed.identity;
                }
            };
            for (const name of ['HEAD', 'index', 'packed-refs', 'ORIG_HEAD', 'FETCH_HEAD', 'refs', 'logs']) {
                await inspect(path.join(gitDir, name));
            }
            return inventory;
        };
        const administration = await administrativeState();
        let metadataBytes = Buffer.byteLength(config) + Buffer.byteLength(JSON.stringify(administration)) +
            Object.values(administration).reduce((total, entry) => total + entry.size, 0);
        if (metadataBytes > METADATA_LIMIT) throw new Error('semgrep metadata exceeds limit');
        const git = async (cwd, args, {input, maximum = METADATA_LIMIT, statuses = [0]} = {}) => {
            const timeout = Math.min(30000, deadline - performance.now());
            const cancellation = finishing ? undefined : signal;
            if (timeout <= 0) throw new Error('semgrep preparation timed out');
            if (cancellation?.aborted) throw new Error('semgrep interrupted');
            return new Promise((resolve, reject) => {
                const child = spawn('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null',
                    '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null',
                    '-c', 'core.excludesFile=/dev/null', '-c', 'protocol.allow=never', ...args], {
                    cwd, env: isolatedEnv, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
                });
                const chunks = [];
                const sizes = {stdout: 0, stderr: 0};
                let failed = false;
                let timedOut = false;
                const kill = () => {
                    if (!child.pid) return;
                    try { process.kill(-child.pid, 'SIGKILL'); }
                    catch (error) { if (error.code !== 'ESRCH') failed = true; }
                };
                const stop = () => { failed = true; kill(); };
                const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
                cancellation?.addEventListener('abort', stop, {once: true});
                for (const stream of ['stdout', 'stderr']) {
                    child[stream].on('data', (bytes) => {
                        sizes[stream] += bytes.length;
                        if (sizes[stream] > (stream === 'stdout' ? maximum : 1048576)) stop();
                        else if (stream === 'stdout') chunks.push(bytes);
                    });
                }
                child.on('error', stop);
                child.stdin.on('error', stop);
                child.on('exit', kill);
                child.on('close', (status) => {
                    clearTimeout(timer);
                    cancellation?.removeEventListener('abort', stop);
                    if (failed || !statuses.includes(status)) {
                        reject(Object.assign(new Error('semgrep Git preparation failed'), {timedOut}));
                    } else resolve(Buffer.concat(chunks));
                });
                child.stdin.end(input);
            });
        };
        const worktreeConfigEnabled = (await git(directory, [
            'config', '--no-includes', '--file', '-', '--type', 'bool', '--get', 'extensions.worktreeConfig',
        ], {input: configBytes, statuses: [0, 1]})).toString().trim() === 'true';
        verifySourceConfiguration();
        const sourceGit = async (args, options = {}) => {
            verifySourceConfiguration();
            const metadata = args[0] !== 'cat-file' || args[1] !== 'blob';
            const maximum = metadata ? Math.min(options.maximum ?? METADATA_LIMIT, METADATA_LIMIT - metadataBytes)
                : options.maximum ?? BLOB_LIMIT;
            if (maximum < 1) throw new Error('semgrep metadata exceeds limit');
            const bytes = await git(source, args, {...options, maximum});
            verifySourceConfiguration();
            if (metadata) metadataBytes += bytes.length;
            return bytes;
        };
        if ((await sourceGit(['rev-parse', '--show-toplevel'])).toString().trim() !== source) {
            throw new Error('semgrep requires the actual Git working root');
        }
        const head = checkedId((await sourceGit(['rev-parse', '--verify', 'HEAD^{commit}'])).toString().trim());
        const resolveBaseline = async (revision) => checkedId((await sourceGit([
            'rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`,
        ])).toString().trim());
        const base = baseline === null ? null : await resolveBaseline(baseline);
        if (otherBaseline !== null && await resolveBaseline(otherBaseline) !== base) {
            throw new Error('semgrep baseline selectors conflict');
        }
        const mergeBase = base === null ? null : checkedId((await sourceGit(['merge-base', head, base])).toString().trim());
        const format = head.length === 40 ? 'sha1' : 'sha256';
        await git(directory, ['init', '--quiet', `--object-format=${format}`, `--template=${path.join(root, 'empty-template')}`]);
        const objects = new Map();
        const headFiles = new Map();
        for (const endpoint of new Set([head, base, mergeBase].filter(Boolean))) {
            const listing = await sourceGit(['ls-tree', '-r', '-t', '-z', endpoint]);
            if (!isUtf8(listing)) throw new Error('semgrep tree path encoding is unsupported');
            const rootTree = checkedId((await sourceGit(['rev-parse', `${endpoint}^{tree}`])).toString().trim());
            objects.set(rootTree, 'tree');
            for (const row of listing.toString('utf8').split('\0').filter(Boolean)) {
                await checkpoint();
                if (++entriesSeen > 100000) throw new Error('semgrep path preparation exceeds limit');
                const match = /^(040000|100644|100755|160000) (tree|blob|commit) ([a-f0-9]+)\t(.+)$/.exec(row);
                if (!match) throw new Error('semgrep endpoint type is unsupported');
                const [, mode, type, id, relative] = match;
                safePath(relative);
                checkedId(id);
                if (mode !== '160000') objects.set(id, type);
                if (endpoint === head && type !== 'tree') headFiles.set(relative, {id, mode});
            }
        }
        const trackedDirectories = new Set();
        for (const relative of headFiles.keys()) {
            await checkpoint();
            for (let parent = path.posix.dirname(relative); parent !== '.' && !trackedDirectories.has(parent); parent = path.posix.dirname(parent)) {
                trackedDirectories.add(parent);
            }
        }
        for (const selected of [...configs, ...targets]) {
            await checkpoint();
            if (selected !== '.' && !headFiles.has(selected) && !trackedDirectories.has(selected)) {
                throw new Error('semgrep selected path is not tracked');
            }
        }
        const indexBytes = await sourceGit(['ls-files', '--stage', '-z']);
        if (!isUtf8(indexBytes)) throw new Error('semgrep index path encoding is unsupported');
        const index = indexBytes.toString('utf8').split('\0').filter(Boolean);
        if (index.length !== headFiles.size || index.some((row) => {
            const match = /^(100644|100755|160000) ([a-f0-9]+) 0\t(.+)$/.exec(row);
            return !match || headFiles.get(match[3])?.id !== match[2] || headFiles.get(match[3])?.mode !== match[1];
        })) throw new Error('semgrep requires a clean index');
        const originalFiles = new Map();
        let workingBytes = 0;
        for (const [relative, entry] of headFiles) {
            await checkpoint();
            const file = path.join(source, relative);
            if (entry.mode === '160000') {
                let stat;
                try { stat = fs.lstatSync(file); }
                catch (error) { if (error.code === 'ENOENT') continue; throw error; }
                if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(file) !== file) {
                    throw new Error('semgrep Gitlink working state is unsupported');
                }
                continue;
            }
            const stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file || stat.size > BLOB_LIMIT ||
                Boolean(stat.mode & 0o100) !== (entry.mode === '100755')) {
                throw new Error('semgrep working file is unsupported');
            }
            const {bytes, identity} = readHeldFile(file, Math.min(BLOB_LIMIT, BLOB_TOTAL - workingBytes));
            workingBytes += bytes.length;
            originalFiles.set(relative, identity);
            const id = crypto.createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
            if (id !== entry.id) throw new Error('semgrep requires unchanged working files');
        }
        const commits = (await sourceGit(['rev-list', ...[head, base].filter(Boolean)])).toString().trim().split('\n');
        for (const id of commits) {
            await checkpoint();
            objects.set(checkedId(id), 'commit');
        }
        let blobBytes = 0;
        for (const [id, type] of objects) {
            const bytes = await sourceGit(['cat-file', type, id], {
                maximum: type === 'blob' ? Math.min(BLOB_LIMIT, BLOB_TOTAL - blobBytes) : METADATA_LIMIT,
            });
            if (type === 'blob') blobBytes += bytes.length;
            if (blobBytes > BLOB_TOTAL) throw new Error('semgrep objects exceed limit');
            const copied = (await git(directory, ['hash-object', '-w', '-t', type, '--stdin'], {input: bytes})).toString().trim();
            if (copied !== id) throw new Error('semgrep object identity changed');
        }
        await git(directory, ['update-ref', '--no-deref', 'HEAD', head]);
        await git(directory, ['read-tree', head]);
        for (const [relative, entry] of headFiles) {
            await checkpoint();
            const target = path.join(directory, relative);
            fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o700});
            if (entry.mode === '160000') {
                fs.mkdirSync(target, {mode: 0o700});
                continue;
            }
            fs.writeFileSync(target, await git(directory, ['cat-file', 'blob', entry.id], {maximum: BLOB_LIMIT}),
                {flag: 'wx', mode: entry.mode === '100755' ? 0o700 : 0o600});
        }
        const privatize = async (file) => {
            await checkpoint();
            const stat = fs.lstatSync(file);
            fs.chmodSync(file, stat.isDirectory() ? 0o700 : 0o600);
            if (stat.isDirectory()) for (const name of fs.readdirSync(file)) await privatize(path.join(file, name));
        };
        await privatize(path.join(directory, '.git'));
        const verifyWorkingInventory = async () => {
            let count = 0;
            const inspect = async (relative = '') => {
                const handle = fs.opendirSync(path.join(source, relative), {encoding: 'buffer'});
                try {
                    for (let entry; (entry = handle.readSync()) !== null;) {
                        await checkpoint();
                        if (++count > 100000) throw new Error('semgrep inventory exceeds limit');
                        if (!isUtf8(entry.name)) throw new Error('semgrep working path encoding is unsupported');
                        const name = entry.name.toString('utf8');
                        const candidate = relative === '' ? name : `${relative}/${name}`;
                        if (candidate === '.git' || excludedPath(candidate)) continue;
                        if (headFiles.get(candidate)?.mode === '160000') {
                            if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('semgrep Gitlink working state changed');
                            continue;
                        }
                        if (!headFiles.has(candidate) && !trackedDirectories.has(candidate)) {
                            const ignored = await git(directory, ['check-ignore', '--no-index', '-z', '--stdin'], {
                                input: `${candidate}${entry.isDirectory() ? '/' : ''}\0`, statuses: [0, 1],
                            });
                            if (ignored.length > 0) continue;
                        }
                        safePath(candidate);
                        if (entry.isDirectory()) await inspect(candidate);
                        else if (!headFiles.has(candidate) || entry.isSymbolicLink()) {
                            throw new Error('semgrep requires a clean working inventory');
                        }
                    }
                } finally {
                    handle.closeSync();
                }
            };
            await inspect();
        };
        const verify = async (finalizing = false) => {
            finishing = finalizing;
            deadline = finishing ? finalDeadline : workDeadline;
            await verifyWorkingInventory();
            if (JSON.stringify(administration) !== JSON.stringify(await administrativeState()) ||
                (await sourceGit(['rev-parse', '--verify', 'HEAD^{commit}'])).toString().trim() !== head) {
                throw new Error('semgrep consumer Git state changed');
            }
            for (const [relative, expected] of originalFiles) {
                await checkpoint();
                safePath(relative);
                const observed = readHeldFile(path.join(source, relative), BLOB_LIMIT).identity;
                if (JSON.stringify(observed) !== JSON.stringify(expected)) {
                    throw new Error('semgrep consumer file changed');
                }
            }
        };
        await verify();
        return {root, directory, env: isolatedEnv, head, baseline: base, cleanup, verify};
    } catch (error) {
        cleanup();
        throw error;
    }
}

module.exports = {makeSemgrepWorkspace};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
