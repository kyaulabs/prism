// $KYAULabs: web-access-browser.test.ts kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {
    BrowserCapabilityCache,
    searchWithBrowser,
    type BrowserProcess,
    type BrowserSpawnOptions,
} from '../../packages/prism-core/extensions/web-access/browser.ts';
import {CdpPipe} from '../../packages/prism-core/extensions/web-access/cdp.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {PinnedTarget} from '../../packages/prism-core/extensions/web-access/network.ts';
import type {SearchParams} from '../../packages/prism-core/extensions/web-access/search-types.ts';

const PARAMS: SearchParams = {
    query: 'browser search',
    limit: 2,
    recency: 'day',
    domains: [],
};

const HTML = `<html><body><div class="result">
<a class="result__a" href="https://example.com/result">Browser result</a>
<div class="result__snippet">Browser snippet</div>
</div></body></html>`;

interface FakeBrowserOptions {
    documentUrl?: string;
    documentMethod?: string;
    secondDocument?: boolean;
    hang?: boolean;
    hangAtStart?: boolean;
    runtimeError?: boolean;
}

function fakeBrowser(options: FakeBrowserOptions = {}) {
    const commands = new PassThrough();
    const responses = new PassThrough();
    const stderr = new PassThrough();
    const process = new EventEmitter() as BrowserProcess & EventEmitter & {
        killed: boolean;
        killSignals: string[];
    };
    process.pid = 424242;
    process.stdio = [null, null, stderr, commands, responses];
    process.stderr = stderr;
    process.killed = false;
    process.killSignals = [];
    process.kill = (signal?: NodeJS.Signals | number) => {
        process.killed = true;
        process.killSignals.push(String(signal ?? 'SIGTERM'));
        return true;
    };

    const seen: Array<Record<string, unknown>> = [];
    const continued: string[] = [];
    const failed: string[] = [];
    let buffer = Buffer.alloc(0);
    let sessionId = 'session-1';
    const send = (message: Record<string, unknown>) => {
        responses.write(`${JSON.stringify(message)}\u0000`);
    };
    const paused = (requestId: string, url: string, method: string, resourceType: string) => {
        send({
            method: 'Fetch.requestPaused',
            sessionId,
            params: {
                requestId,
                resourceType,
                request: {url, method},
            },
        });
    };
    const handle = (command: Record<string, unknown>) => {
        seen.push(command);
        const id = command.id as number;
        const method = command.method as string;
        if (method === 'Browser.getVersion') {
            if (!options.hangAtStart) send({id, result: {product: 'Brave/151'}});
        }
        else if (method === 'Target.createTarget') send({id, result: {targetId: 'target-1'}});
        else if (method === 'Target.attachToTarget') send({id, result: {sessionId}});
        else if (method === 'Page.enable' || method === 'Fetch.enable') send({id, sessionId, result: {}});
        else if (method === 'Page.navigate') {
            send({id, sessionId, result: {frameId: 'frame-1'}});
            if (options.hang) return;
            const navigationUrl = (command.params as {url?: string} | undefined)?.url ??
                'https://html.duckduckgo.com/html/';
            paused(
                'document-1',
                options.documentUrl ?? navigationUrl,
                options.documentMethod ?? 'GET',
                'Document',
            );
        } else if (method === 'Fetch.continueRequest') {
            continued.push((command.params as {requestId: string}).requestId);
            send({id, sessionId, result: {}});
            paused('subresource-1', 'https://html.duckduckgo.com/image.png', 'GET', 'Image');
            if (options.secondDocument) {
                paused('document-2', 'https://html.duckduckgo.com/redirect', 'GET', 'Document');
            } else {
                send({method: 'Page.loadEventFired', sessionId, params: {timestamp: 1}});
            }
        } else if (method === 'Fetch.failRequest') {
            failed.push((command.params as {requestId: string}).requestId);
            send({id, sessionId, result: {}});
        } else if (method === 'Runtime.evaluate') {
            if (options.runtimeError) send({id, sessionId, error: {message: 'PRIVATE_CDP_CANARY'}});
            else send({id, sessionId, result: {result: {type: 'string', value: HTML}}});
        } else if (method === 'Browser.close') send({id, result: {}});
    };
    commands.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let boundary = buffer.indexOf(0);
        while (boundary >= 0) {
            const raw = buffer.subarray(0, boundary).toString('utf8');
            buffer = buffer.subarray(boundary + 1);
            if (raw) handle(JSON.parse(raw) as Record<string, unknown>);
            boundary = buffer.indexOf(0);
        }
    });
    return {continued, failed, process, seen};
}

function fixture(t: {after(callback: () => void): void}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-browser-test-'));
    const executable = path.join(root, 'brave');
    fs.writeFileSync(executable, '#!/bin/sh\n', {mode: 0o700});
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {executable, root};
}

function publicTarget(url: URL): Promise<PinnedTarget> {
    return Promise.resolve({url, address: '93.184.216.34', family: 4});
}

test('malformed primitive CDP frames reject pending commands without escaping', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const cdp = new CdpPipe(input, output);
    const pending = cdp.send('Browser.getVersion');

    output.write('null\u0000');

    await assert.rejects(pending, (error: unknown) => {
        assert.equal(error instanceof WebAccessError, true);
        assert.equal((error as WebAccessError).code, 'WEB_ACCESS_BROWSER_PROTOCOL');
        return true;
    });
});

test('writable CDP pipe failures reject pending commands through the protocol error', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const cdp = new CdpPipe(input, output);
    const pending = cdp.send('Browser.getVersion');

    assert.doesNotThrow(() => input.emit('error', new Error('PRIVATE_CDP_CANARY')));

    await assert.rejects(pending, (error: unknown) => {
        assert.equal(error instanceof WebAccessError, true);
        assert.equal((error as WebAccessError).code, 'WEB_ACCESS_BROWSER_PROTOCOL');
        assert.doesNotMatch((error as Error).message, /CANARY/);
        return true;
    });
});

test('browser search spawns Brave directly with confinement and disposable state', async (t) => {
    const target = fixture(t);
    const fake = fakeBrowser();
    let command = '';
    let args: string[] = [];
    let spawnOptions: BrowserSpawnOptions | undefined;
    let profile = '';
    const cache = new BrowserCapabilityCache(async () => ({
        status: 'AVAILABLE', family: 'brave', executable: target.executable,
    }));

    const results = await searchWithBrowser(PARAMS, {
        cache,
        resolvePublicTarget: publicTarget,
        spawn: (spawnCommand, spawnArgs, options) => {
            command = spawnCommand;
            args = spawnArgs;
            spawnOptions = options;
            profile = spawnArgs.find((arg) => arg.startsWith('--user-data-dir='))?.slice(16) ?? '';
            assert.equal(fs.statSync(profile).mode & 0o777, 0o700);
            return fake.process;
        },
        timeoutMs: 500,
    });

    assert.deepEqual(results, [{
        title: 'Browser result',
        url: 'https://example.com/result',
        snippet: 'Browser snippet',
    }]);
    assert.equal(command, target.executable);
    assert.equal(spawnOptions?.shell, false);
    assert.equal(spawnOptions?.detached, true);
    assert.deepEqual(spawnOptions?.stdio, ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']);
    assert.equal(args.includes('--remote-debugging-pipe'), true);
    assert.equal(args.some((arg) => arg.includes('MAP html.duckduckgo.com 93.184.216.34')), true);
    assert.equal(args.includes('--no-sandbox'), false);
    assert.equal(args.some((arg) => arg.startsWith('--user-data-dir=')), true);
    assert.equal(fake.continued.includes('document-1'), true);
    assert.equal(fake.failed.includes('subresource-1'), true);
    assert.equal(fs.existsSync(profile), false);
    assert.equal(fake.process.killed, true);
    const methods = fake.seen.map((entry) => entry.method);
    assert.equal(methods.indexOf('Runtime.evaluate') > methods.indexOf('Page.navigate'), true);
});

test('document methods origins IP literals and redirects fail before continuation', async (t) => {
    const target = fixture(t);
    for (const options of [
        {documentMethod: 'POST'},
        {documentUrl: 'https://93.184.216.34/html/'},
        {documentUrl: 'https://example.com/html/'},
        {secondDocument: true},
    ]) {
        const fake = fakeBrowser(options);
        const cache = new BrowserCapabilityCache(async () => ({
            status: 'AVAILABLE', family: 'brave', executable: target.executable,
        }));
        await assert.rejects(
            () => searchWithBrowser(PARAMS, {
                cache,
                resolvePublicTarget: publicTarget,
                spawn: () => fake.process,
                timeoutMs: 50,
            }),
            (error: unknown) => error instanceof WebAccessError &&
                error.code === 'WEB_ACCESS_BROWSER_CONFINEMENT',
        );
        assert.equal(fake.failed.some((id) => id.startsWith('document-')), true);
        if (!options.secondDocument) assert.deepEqual(fake.continued, []);
    }
});

test('runtime failure invalidates the session cache and sanitizes CDP errors', async (t) => {
    const target = fixture(t);
    let resolutions = 0;
    const cache = new BrowserCapabilityCache(async () => {
        resolutions += 1;
        return {status: 'AVAILABLE', family: 'brave', executable: target.executable};
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const fake = fakeBrowser({runtimeError: true});
        await assert.rejects(
            () => searchWithBrowser(PARAMS, {
                cache,
                resolvePublicTarget: publicTarget,
                spawn: () => fake.process,
                timeoutMs: 100,
            }),
            (error: unknown) => {
                assert.ok(error instanceof WebAccessError);
                assert.doesNotMatch(error.message, /PRIVATE_CDP_CANARY/);
                return true;
            },
        );
    }
    assert.equal(resolutions, 2);
});

test('the browser deadline includes initial CDP startup', async (t) => {
    const target = fixture(t);
    const fake = fakeBrowser({hangAtStart: true});
    const pending = searchWithBrowser(PARAMS, {
        cache: new BrowserCapabilityCache(async () => ({
            status: 'AVAILABLE', family: 'brave', executable: target.executable,
        })),
        resolvePublicTarget: publicTarget,
        spawn: () => fake.process,
        timeoutMs: 5,
    });
    await assert.rejects(
        () => Promise.race([
            pending,
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('deadline missing')), 50)),
        ]),
        (error: unknown) => error instanceof WebAccessError &&
            error.code === 'WEB_ACCESS_BROWSER_TIMEOUT',
    );
    assert.equal(fake.process.killed, true);
});

test('timeout and cancellation kill the browser and remove the profile', async (t) => {
    const target = fixture(t);
    for (const cancelled of [false, true]) {
        const fake = fakeBrowser({hang: true});
        let profile = '';
        const controller = new AbortController();
        const pending = searchWithBrowser(PARAMS, {
            cache: new BrowserCapabilityCache(async () => ({
                status: 'AVAILABLE', family: 'brave', executable: target.executable,
            })),
            resolvePublicTarget: publicTarget,
            spawn: (_command, args) => {
                profile = args.find((arg) => arg.startsWith('--user-data-dir='))?.slice(16) ?? '';
                return fake.process;
            },
            signal: controller.signal,
            timeoutMs: cancelled ? 500 : 5,
        });
        if (cancelled) setImmediate(() => controller.abort());
        await assert.rejects(
            () => pending,
            (error: unknown) => error instanceof WebAccessError &&
                error.code === (cancelled ? 'WEB_ACCESS_CANCELLED' : 'WEB_ACCESS_BROWSER_TIMEOUT'),
        );
        assert.equal(fake.process.killed, true);
        assert.equal(fs.existsSync(profile), false);
    }
});

test('unavailable browser capability is fallback eligible and never spawns', async () => {
    let spawned = false;
    await assert.rejects(
        () => searchWithBrowser(PARAMS, {
            cache: new BrowserCapabilityCache(async () => ({status: 'UNAVAILABLE'})),
            resolvePublicTarget: publicTarget,
            spawn: () => { spawned = true; throw new Error(); },
        }),
        (error: unknown) => error instanceof WebAccessError &&
            error.code === 'WEB_ACCESS_BROWSER_UNAVAILABLE' && error.fallbackEligible,
    );
    assert.equal(spawned, false);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
