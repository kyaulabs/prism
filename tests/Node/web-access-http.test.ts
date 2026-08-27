// $KYAULabs: web-access-http.test.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import test from 'node:test';
import {brotliCompressSync, deflateSync, gzipSync} from 'node:zlib';
import {
    requestLoopbackJson,
    requestPublicText,
    type PinnedRequestOptions,
} from '../../packages/prism-core/extensions/web-access/http.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {PinnedTarget} from '../../packages/prism-core/extensions/web-access/network.ts';

interface ResponseFixture {
    status?: number;
    headers?: Record<string, string>;
    chunks?: Buffer[];
    error?: Error;
    hang?: boolean;
    emitConnectingSocket?: boolean;
}

interface FakeRequest extends EventEmitter {
    destroyed: boolean;
    destroy(error?: Error): void;
    end(): void;
}

function requestSequence(fixtures: ResponseFixture[], captured: PinnedRequestOptions[] = []) {
    const requests: FakeRequest[] = [];
    const request = (options: PinnedRequestOptions, callback: (response: Readable & {
        statusCode?: number;
        headers: Record<string, string>;
    }) => void) => {
        captured.push(options);
        const fixture = fixtures.shift() ?? {hang: true};
        const client = new EventEmitter() as FakeRequest;
        client.destroyed = false;
        client.destroy = (error?: Error) => {
            if (client.destroyed) return;
            client.destroyed = true;
            if (error) queueMicrotask(() => client.emit('error', error));
        };
        client.end = () => {
            if (fixture.emitConnectingSocket) {
                const socket = new EventEmitter() as EventEmitter & {connecting: boolean};
                socket.connecting = true;
                client.emit('socket', socket);
            }
            if (fixture.hang) return;
            queueMicrotask(() => {
                if (fixture.error) {
                    client.emit('error', fixture.error);
                    return;
                }
                const response = Readable.from(fixture.chunks ?? [Buffer.from('ok')]) as Readable & {
                    statusCode?: number;
                    headers: Record<string, string>;
                };
                response.statusCode = fixture.status ?? 200;
                response.headers = fixture.headers ?? {'content-type': 'text/plain; charset=utf-8'};
                callback(response);
            });
        };
        requests.push(client);
        return client;
    };
    return {request, requests};
}

function publicResolver(calls: string[] = []) {
    return async (url: URL): Promise<PinnedTarget> => {
        calls.push(url.href);
        return {url, address: '93.184.216.34', family: 4};
    };
}

function loopbackResolver(url: string): Promise<PinnedTarget> {
    return Promise.resolve({url: new URL(url), address: '127.0.0.1', family: 4});
}

test('public requests preserve hostname and SNI while pinning lookup and ignoring proxies', async () => {
    const captured: PinnedRequestOptions[] = [];
    const fake = requestSequence([{
        headers: {'content-type': 'text/plain'},
        chunks: [Buffer.from('hello')],
    }], captured);
    const response = await requestPublicText('https://example.com/path?q=1', {
        request: fake.request,
        resolvePublicTarget: publicResolver(),
        env: {
            HTTPS_PROXY: 'http://PRIVATE_PROXY_CANARY',
            NO_PROXY: '*',
        },
    });

    assert.equal(response.body, 'hello');
    assert.equal(captured[0].hostname, 'example.com');
    assert.equal(captured[0].servername, 'example.com');
    assert.equal(captured[0].path, '/path?q=1');
    assert.equal(captured[0].method, 'GET');
    assert.equal('agent' in captured[0], false);
    assert.equal('proxy' in captured[0], false);
    await new Promise<void>((resolve, reject) => {
        captured[0].lookup('ignored.example', {all: false}, (error, address, family) => {
            if (error) reject(error);
            else {
                assert.equal(address, '93.184.216.34');
                assert.equal(family, 4);
                resolve();
            }
        });
    });
    assert.doesNotMatch(JSON.stringify(captured[0]), /PRIVATE_PROXY_CANARY/);
});

test('redirects are manual bounded and freshly resolved without forwarding metadata', async () => {
    const captured: PinnedRequestOptions[] = [];
    const resolved: string[] = [];
    const fake = requestSequence([
        {status: 302, headers: {location: 'https://other.example/final'}},
        {status: 200, headers: {'content-type': 'application/json'}, chunks: [Buffer.from('{"ok":true}')]},
    ], captured);
    const response = await requestPublicText('https://start.example/PRIVATE_PATH_CANARY', {
        request: fake.request,
        resolvePublicTarget: publicResolver(resolved),
    });

    assert.equal(response.finalUrl, 'https://other.example/final');
    assert.deepEqual(resolved, [
        'https://start.example/PRIVATE_PATH_CANARY',
        'https://other.example/final',
    ]);
    assert.equal(captured.length, 2);
    assert.equal(captured[1].hostname, 'other.example');
    assert.equal(captured[1].headers?.authorization, undefined);
    assert.equal(captured[1].headers?.cookie, undefined);
    assert.equal(captured[1].headers?.referer, undefined);
});

test('redirect limits and malformed redirects fail with sanitized errors', async () => {
    const fake = requestSequence(Array.from({length: 6}, () => ({
        status: 302,
        headers: {location: '/PRIVATE_REDIRECT_CANARY'},
    })));
    await assert.rejects(
        () => requestPublicText('https://example.com/', {
            request: fake.request,
            resolvePublicTarget: publicResolver(),
        }),
        (error: unknown) => {
            assert.ok(error instanceof WebAccessError);
            assert.equal(error.code, 'WEB_ACCESS_REDIRECT_LIMIT');
            assert.doesNotMatch(error.message, /PRIVATE_REDIRECT_CANARY/);
            return true;
        },
    );
});

test('gzip deflate and brotli decoding remain independently bounded', async () => {
    for (const [encoding, body] of [
        ['gzip', gzipSync('gzip text')],
        ['deflate', deflateSync('deflate text')],
        ['br', brotliCompressSync('brotli text')],
    ] as const) {
        const fake = requestSequence([{
            headers: {'content-type': 'text/plain', 'content-encoding': encoding},
            chunks: [body],
        }]);
        const response = await requestPublicText('https://example.com/', {
            request: fake.request,
            resolvePublicTarget: publicResolver(),
        });
        assert.match(response.body, /text$/);
    }

    const compressed = requestSequence([{
        headers: {'content-type': 'text/plain'},
        chunks: [Buffer.alloc(9)],
    }]);
    await assert.rejects(
        () => requestPublicText('https://example.com/', {
            request: compressed.request,
            resolvePublicTarget: publicResolver(),
            maxCompressedBytes: 8,
        }),
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_BODY_TOO_LARGE',
    );

    const expanded = requestSequence([{
        headers: {'content-type': 'text/plain', 'content-encoding': 'gzip'},
        chunks: [gzipSync('expanded body')],
    }]);
    await assert.rejects(
        () => requestPublicText('https://example.com/', {
            request: expanded.request,
            resolvePublicTarget: publicResolver(),
            maxCompressedBytes: 1024,
            maxDecodedBytes: 8,
        }),
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_BODY_TOO_LARGE',
    );
});

test('textual MIME types pass while binary and malformed UTF-8 fail', async () => {
    for (const contentType of [
        'text/html',
        'application/json',
        'application/xml',
        'application/xhtml+xml',
        'application/problem+json',
        'application/atom+xml',
    ]) {
        const fake = requestSequence([{headers: {'content-type': contentType}}]);
        assert.equal((await requestPublicText('https://example.com/', {
            request: fake.request,
            resolvePublicTarget: publicResolver(),
        })).body, 'ok');
    }
    for (const fixture of [
        {headers: {'content-type': 'application/octet-stream'}, chunks: [Buffer.from('PRIVATE_BODY_CANARY')]},
        {headers: {'content-type': 'text/plain'}, chunks: [Buffer.from([0xc3, 0x28])]},
    ]) {
        const fake = requestSequence([fixture]);
        await assert.rejects(
            () => requestPublicText('https://example.com/PRIVATE_PATH_CANARY', {
                request: fake.request,
                resolvePublicTarget: publicResolver(),
            }),
            (error: unknown) => {
                assert.ok(error instanceof WebAccessError);
                assert.doesNotMatch(error.message, /PRIVATE_BODY_CANARY|PRIVATE_PATH_CANARY/);
                return true;
            },
        );
    }
});

test('connect timeout remains active until an assigned socket connects', async () => {
    const fake = requestSequence([{hang: true, emitConnectingSocket: true}]);
    const started = Date.now();
    await assert.rejects(
        () => requestPublicText('https://example.com/', {
            request: fake.request,
            resolvePublicTarget: publicResolver(),
            connectTimeoutMs: 5,
            totalTimeoutMs: 100,
        }),
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_TIMEOUT',
    );
    assert.equal(Date.now() - started < 50, true);
    assert.equal(fake.requests[0].destroyed, true);
});

test('total timeout includes target resolution', async () => {
    const fake = requestSequence([{}]);
    await assert.rejects(
        () => requestPublicText('https://example.com/', {
            request: fake.request,
            resolvePublicTarget: async (url) => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                return {url, address: '93.184.216.34', family: 4};
            },
            connectTimeoutMs: 100,
            totalTimeoutMs: 5,
        }),
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_TIMEOUT',
    );
    assert.equal(fake.requests.length, 0);
});

test('connect total timeout and cancellation destroy the request', async () => {
    for (const options of [
        {connectTimeoutMs: 5, totalTimeoutMs: 50},
        {connectTimeoutMs: 50, totalTimeoutMs: 5},
    ]) {
        const fake = requestSequence([{hang: true}]);
        await assert.rejects(
            () => requestPublicText('https://example.com/', {
                request: fake.request,
                resolvePublicTarget: publicResolver(),
                ...options,
            }),
            (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_TIMEOUT',
        );
        assert.equal(fake.requests[0].destroyed, true);
    }

    const controller = new AbortController();
    const fake = requestSequence([{hang: true}]);
    const pending = requestPublicText('https://example.com/', {
        request: fake.request,
        resolvePublicTarget: publicResolver(),
        signal: controller.signal,
        connectTimeoutMs: 100,
        totalTimeoutMs: 100,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(
        () => pending,
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_CANCELLED',
    );
    assert.equal(fake.requests[0].destroyed, true);
});

test('loopback JSON is parsed and redirects are forbidden', async () => {
    const valid = requestSequence([{
        headers: {'content-type': 'application/json'},
        chunks: [Buffer.from('{"results":[1]}')],
    }]);
    assert.deepEqual(await requestLoopbackJson('http://localhost:8080/search', {
        request: valid.request,
        validateLoopbackUrl: loopbackResolver,
    }), {results: [1]});

    const redirect = requestSequence([{
        status: 302,
        headers: {location: 'http://localhost:8080/other'},
    }]);
    await assert.rejects(
        () => requestLoopbackJson('http://localhost:8080/search', {
            request: redirect.request,
            validateLoopbackUrl: loopbackResolver,
        }),
        (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_REDIRECT_BLOCKED',
    );
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
