// $KYAULabs: browser.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {spawn as nodeSpawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {Readable, Writable} from 'node:stream';
import {CdpPipe, type CdpEvent} from './cdp.ts';
import {parseDuckDuckGoHtml} from './duckduckgo.ts';
import {WebAccessError} from './errors.ts';
import {
    resolvePublicTarget as defaultResolvePublicTarget,
    type NetworkDependencies,
    type PinnedTarget,
} from './network.ts';
import {
    searchQuery,
    validateSearchParams,
} from './search-filters.ts';
import type {SearchParams, SearchResult} from './search-types.ts';

const SEARCH_ORIGIN = 'https://html.duckduckgo.com';
const RECENCY = Object.freeze({day: 'd', week: 'w', month: 'm', year: 'y'});
const DEFAULT_TIMEOUT_MS = 20_000;
const STDERR_LIMIT = 64 * 1024;

export interface AvailableBrowser {
    status: 'AVAILABLE';
    family: string;
    executable: string;
}

export interface UnavailableBrowser {
    status: 'UNAVAILABLE';
}

export type BrowserCapability = AvailableBrowser | UnavailableBrowser;

export interface BrowserSpawnOptions {
    shell: false;
    detached: true;
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'];
    env: NodeJS.ProcessEnv;
}

export interface BrowserProcess {
    pid?: number;
    stdio: Array<Readable | Writable | null>;
    stderr?: Readable | null;
    once(event: string, listener: (...args: unknown[]) => void): this;
    kill(signal?: NodeJS.Signals | number): boolean;
}

export type BrowserSpawn = (
    command: string,
    args: string[],
    options: BrowserSpawnOptions,
) => BrowserProcess;

export class BrowserCapabilityCache {
    private capability?: AvailableBrowser;
    private readonly resolver: () => Promise<BrowserCapability> | BrowserCapability;

    constructor(resolver: () => Promise<BrowserCapability> | BrowserCapability) {
        this.resolver = resolver;
    }

    async get(): Promise<BrowserCapability> {
        if (this.capability) return this.capability;
        const resolved = await this.resolver();
        if (resolved.status === 'AVAILABLE') this.capability = resolved;
        return resolved;
    }

    invalidate(): void {
        this.capability = undefined;
    }
}

export interface BrowserDependencies extends NetworkDependencies {
    cache: BrowserCapabilityCache;
    resolvePublicTarget?: (url: URL, deps: NetworkDependencies) => Promise<PinnedTarget>;
    spawn?: BrowserSpawn;
    timeoutMs?: number;
    tmpdir?: string;
}

function browserError(code: string, message: string): WebAccessError {
    return new WebAccessError(code, message, true);
}

function record(value: unknown): Record<string, unknown> {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
        throw browserError('WEB_ACCESS_BROWSER_PROTOCOL', 'browser protocol failed');
    }
    return value as Record<string, unknown>;
}

function browserArgs(profile: string, address: string): string[] {
    return [
        '--headless=new',
        '--incognito',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-extensions',
        '--disable-features=AutofillServerCommunication,MediaRouter,OptimizationHints,Translate',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--remote-debugging-pipe',
        `--host-resolver-rules=MAP html.duckduckgo.com ${address}, EXCLUDE localhost`,
        `--user-data-dir=${profile}`,
    ];
}

function browserEnvironment(profile: string): NodeJS.ProcessEnv {
    return {
        HOME: profile,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        TMPDIR: profile,
        XDG_CACHE_HOME: profile,
        XDG_CONFIG_HOME: profile,
    };
}

function validExecutable(value: string): string | null {
    if (!path.isAbsolute(value)) return null;
    try {
        const executable = fs.realpathSync(value);
        const stat = fs.statSync(executable);
        fs.accessSync(executable, fs.constants.X_OK);
        return stat.isFile() ? executable : null;
    } catch {
        return null;
    }
}

interface OwnedProfile {
    path: string;
    dev: number;
    ino: number;
}

function createProfile(root: string): OwnedProfile {
    const profile = fs.mkdtempSync(path.join(root, 'prism-web-browser-'));
    fs.chmodSync(profile, 0o700);
    const stat = fs.lstatSync(profile);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
        throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser confinement is unavailable');
    }
    return {path: profile, dev: stat.dev, ino: stat.ino};
}

function cleanupProfile(profile: OwnedProfile, root: string): boolean {
    const relative = path.relative(root, profile.path);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;
    try {
        const stat = fs.lstatSync(profile.path);
        if (!stat.isDirectory() || stat.isSymbolicLink() ||
            stat.dev !== profile.dev || stat.ino !== profile.ino) return false;
        fs.rmSync(profile.path, {recursive: true, force: false});
        return !fs.existsSync(profile.path);
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT';
    }
}

function terminateBrowser(child: BrowserProcess, native: boolean): void {
    if (native && child.pid && Number.isInteger(child.pid)) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        return;
    }
    try { child.kill('SIGKILL'); } catch { return; }
}

function buildSearchUrl(params: SearchParams): URL {
    const url = new URL('/html/', SEARCH_ORIGIN);
    url.searchParams.set('q', searchQuery(params));
    if (params.recency) url.searchParams.set('df', RECENCY[params.recency]);
    return url;
}

function withBrowserDeadline<T>(
    operation: Promise<T>,
    processFailure: Promise<never>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
): Promise<T> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const finish = (action: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            action();
        };
        const cancel = () => finish(() => reject(new WebAccessError(
            'WEB_ACCESS_CANCELLED',
            'web request cancelled',
        )));
        if (signal?.aborted) {
            cancel();
            return;
        }
        timer = setTimeout(() => finish(() => reject(browserError(
            'WEB_ACCESS_BROWSER_TIMEOUT',
            'browser search timed out',
        ))), timeoutMs);
        signal?.addEventListener('abort', cancel, {once: true});
        Promise.race([operation, processFailure]).then(
            (value) => finish(() => resolve(value)),
            (error: unknown) => finish(() => reject(error)),
        );
    });
}

function processFailure(child: BrowserProcess): Promise<never> {
    return new Promise((_resolve, reject) => {
        child.once('error', () => reject(browserError(
            'WEB_ACCESS_BROWSER_FAILED',
            'browser search failed',
        )));
        child.once('exit', () => reject(browserError(
            'WEB_ACCESS_BROWSER_FAILED',
            'browser search failed',
        )));
    });
}

async function browserSession(
    cdp: CdpPipe,
    url: URL,
    params: SearchParams,
): Promise<SearchResult[]> {
    const version = record(await cdp.send('Browser.getVersion'));
    if (typeof version.product !== 'string' ||
        !/(Chromium|Chrome|HeadlessShell|Brave)/i.test(version.product)) {
        throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser confinement is unavailable');
    }
    const created = record(await cdp.send('Target.createTarget', {url: 'about:blank'}));
    if (typeof created.targetId !== 'string') {
        throw browserError('WEB_ACCESS_BROWSER_PROTOCOL', 'browser protocol failed');
    }
    const attached = record(await cdp.send('Target.attachToTarget', {
        targetId: created.targetId,
        flatten: true,
    }));
    if (typeof attached.sessionId !== 'string') {
        throw browserError('WEB_ACCESS_BROWSER_PROTOCOL', 'browser protocol failed');
    }
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Fetch.enable', {
        patterns: [{urlPattern: '*', requestStage: 'Request'}],
    }, sessionId);

    let loadedResolve: () => void;
    const loaded = new Promise<void>((resolve) => { loadedResolve = resolve; });
    let violationReject: (error: Error) => void;
    const violation = new Promise<never>((_resolve, reject) => { violationReject = reject; });
    let continued = false;
    const removeLoad = cdp.on('Page.loadEventFired', (event) => {
        if (event.sessionId === sessionId) loadedResolve();
    });
    const removePaused = cdp.on('Fetch.requestPaused', async (event: CdpEvent) => {
        if (event.sessionId !== sessionId) return;
        const eventParams = event.params ?? {};
        const request = record(eventParams.request);
        const requestId = eventParams.requestId;
        const resourceType = eventParams.resourceType;
        const method = request.method;
        const requestUrl = request.url;
        let approved = false;
        if (typeof requestUrl === 'string' && typeof method === 'string') {
            try {
                const candidate = new URL(requestUrl);
                approved = !continued && resourceType === 'Document' && method === 'GET' &&
                    candidate.href === url.href && candidate.protocol === 'https:' &&
                    candidate.hostname === 'html.duckduckgo.com' &&
                    net.isIP(candidate.hostname) === 0 && eventParams.redirectedRequestId === undefined;
            } catch { approved = false; }
        }
        if (typeof requestId !== 'string') {
            violationReject(browserError('WEB_ACCESS_BROWSER_CONFINEMENT', 'browser confinement failed'));
            return;
        }
        if (approved) {
            continued = true;
            await cdp.send('Fetch.continueRequest', {requestId}, sessionId);
            return;
        }
        await cdp.send('Fetch.failRequest', {requestId, errorReason: 'Aborted'}, sessionId);
        if (resourceType === 'Document') {
            violationReject(browserError('WEB_ACCESS_BROWSER_CONFINEMENT', 'browser confinement failed'));
        }
    });
    try {
        await cdp.send('Page.navigate', {url: url.href}, sessionId);
        await Promise.race([loaded, violation]);
        const evaluated = record(await cdp.send('Runtime.evaluate', {
            expression: 'document.documentElement.outerHTML',
            returnByValue: true,
        }, sessionId));
        const result = record(evaluated.result);
        if (typeof result.value !== 'string') {
            throw browserError('WEB_ACCESS_BROWSER_PROTOCOL', 'browser protocol failed');
        }
        return parseDuckDuckGoHtml(result.value, params);
    } finally {
        removeLoad();
        removePaused();
    }
}

export async function searchWithBrowser(
    input: SearchParams,
    deps: BrowserDependencies,
): Promise<SearchResult[]> {
    const params = validateSearchParams(input);
    const capability = await deps.cache.get();
    if (capability.status !== 'AVAILABLE') {
        throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser capability is unavailable');
    }
    const executable = validExecutable(capability.executable);
    if (!executable) {
        deps.cache.invalidate();
        throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser capability is unavailable');
    }
    const url = buildSearchUrl(params);
    const resolver = deps.resolvePublicTarget ?? defaultResolvePublicTarget;
    const target = await resolver(new URL(SEARCH_ORIGIN), {
        lookup: deps.lookup,
        signal: deps.signal,
    });
    if (target.url.origin !== SEARCH_ORIGIN || net.isIP(target.address) !== target.family) {
        throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public');
    }
    const root = fs.realpathSync(path.resolve(deps.tmpdir ?? os.tmpdir()));
    if (!fs.statSync(root).isDirectory()) {
        throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser confinement is unavailable');
    }
    let profile: OwnedProfile | undefined;
    let child: BrowserProcess | undefined;
    let cdp: CdpPipe | undefined;
    const nativeSpawn = deps.spawn === undefined;
    let spawned = false;
    try {
        profile = createProfile(root);
        const spawn = deps.spawn ?? nodeSpawn as unknown as BrowserSpawn;
        child = spawn(executable, browserArgs(profile.path, target.address), {
            shell: false,
            detached: true,
            stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
            env: browserEnvironment(profile.path),
        });
        spawned = true;
        const input = child.stdio[3];
        const output = child.stdio[4];
        if (!input || !output || typeof (input as Writable).write !== 'function' ||
            typeof (output as Readable).on !== 'function') {
            throw browserError('WEB_ACCESS_BROWSER_UNAVAILABLE', 'browser confinement is unavailable');
        }
        let stderrBytes = 0;
        child.stderr?.on('data', (chunk: Buffer | string) => {
            stderrBytes += Buffer.byteLength(chunk);
            if (stderrBytes > STDERR_LIMIT) child?.stderr?.destroy();
        });
        cdp = new CdpPipe(input as Writable, output as Readable);
        const timeoutMs = Number.isSafeInteger(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
            ? deps.timeoutMs as number
            : DEFAULT_TIMEOUT_MS;
        return await withBrowserDeadline(
            browserSession(cdp, url, params),
            processFailure(child),
            deps.signal,
            timeoutMs,
        );
    } catch (error) {
        if (spawned) deps.cache.invalidate();
        if (error instanceof WebAccessError) throw error;
        throw browserError('WEB_ACCESS_BROWSER_FAILED', 'browser search failed');
    } finally {
        if (cdp) {
            void cdp.send('Browser.close').catch(() => undefined);
            cdp.close();
        }
        if (child) terminateBrowser(child, nativeSpawn);
        if (profile && !cleanupProfile(profile, root)) {
            deps.cache.invalidate();
            throw browserError('WEB_ACCESS_BROWSER_CONFINEMENT', 'browser cleanup failed');
        }
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
