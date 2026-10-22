import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {PassThrough, Readable} from 'node:stream';
import test from 'node:test';
import {hostFixture, resultText} from './pi-host-fixture.ts';
import {BrowserCapabilityCache, searchWithBrowser, type BrowserProcess} from '../../packages/prism-core/extensions/web-access/browser.ts';
import {fetchContent} from '../../packages/prism-core/extensions/web-access/fetch.ts';
import {requestPublicText, type RequestFunction} from '../../packages/prism-core/extensions/web-access/http.ts';
import {searchWeb} from '../../packages/prism-core/extensions/web-access/router.ts';
import {searchDuckDuckGoDirect} from '../../packages/prism-core/extensions/web-access/duckduckgo.ts';

const resolvePublicTarget = async (url: URL) => ({url, address: '93.184.216.34', family: 4 as const});

for (const stop of ['abort', 'deadline'] as const) {
    test(`native Codemode ${stop} cancels HTTP and browser work without backend fallback`, {timeout: 15000}, async t => {
        let browserStarted!: () => void;
        let requestStarted!: () => void;
        const browserReady = new Promise<void>(resolve => { browserStarted = resolve; });
        const requestReady = new Promise<void>(resolve => { requestStarted = resolve; });
        const requests: Array<{destroyed: boolean}> = [];
        const request: RequestFunction = () => {
            const client = Object.assign(new EventEmitter(), {
                destroyed: false,
                end() { requestStarted(); },
                destroy(error?: Error) { this.destroyed = true; if (error) queueMicrotask(() => client.emit('error', error)); },
            });
            requests.push(client);
            return client;
        };
        let killed = false;
        let profile = '';
        let root = '';
        let fallbacks = 0;
        const cache = new BrowserCapabilityCache(() => ({status: 'AVAILABLE', family: 'fixture', executable: process.execPath}));
        const browser = Object.assign(new EventEmitter(), {
            stdio: [null, null, new PassThrough(), new PassThrough(), new PassThrough()],
            kill() { killed = true; for (const pipe of this.stdio) pipe?.destroy(); return true; },
        }) satisfies BrowserProcess;
        const target = await hostFixture(t, {
            searchWeb: (params, deps) => searchWeb(params, {
                signal: deps.signal, loadConfig: () => ({browser: 'auto', searxngUrl: null}),
                searchBrowser: (input, signal) => searchWithBrowser(input, {
                    cache, signal, resolvePublicTarget, tmpdir: root, timeoutMs: 10000,
                    spawn: (_command, args) => {
                        profile = args.find(arg => arg.startsWith('--user-data-dir='))?.slice(16) ?? '';
                        browserStarted();
                        return browser;
                    },
                }),
                searchDirect: async () => { fallbacks++; return []; },
            }),
            fetchContent: (params, deps) => fetchContent(params, {signal: deps.signal,
                requestPublicText: (url, options) => requestPublicText(url, {...options, request, resolvePublicTarget, totalTimeoutMs: 10000})}),
        });
        root = target.root;
        const running = target.script(`${stop === 'deadline' ? '// @options: {"timeout_ms": 1200}\n' : ''}
            return await Promise.all([
                tools.web_search({query:"hang"}), tools.fetch_content({url:"https://example.com/hang"})
            ]);
        `);
        await Promise.all([browserReady, requestReady]);
        assert.ok(fs.existsSync(profile));
        if (stop === 'abort') await target.session.abort();
        const result = await running;
        assert.equal(result.isError, true, resultText(result));
        assert.equal(requests.length, 1);
        assert.equal(requests[0].destroyed, true);
        assert.equal(killed, true);
        assert.equal(fs.existsSync(profile), false);
        assert.equal(fallbacks, 0);
    });
}

test('parallel native nested web calls keep independent results and clean up requests', {timeout: 15000}, async t => {
    let active = 0;
    let maximum = 0;
    let destroyed = 0;
    let completed = 0;
    const request: RequestFunction = (options, callback) => {
        const client = Object.assign(new EventEmitter(), {
            end() {
                maximum = Math.max(maximum, ++active);
                setTimeout(() => {
                    const query = new URL(`https://example.com${options.path}`).searchParams.get('q');
                    const body = query ? `<div class="result"><a class="result__a" href="https://example.com/${query}">${query}</a><div class="result__snippet">Snippet</div></div>` : 'Fetch fixture';
                    const response = Object.assign(Readable.from([body]), {statusCode: 200, headers: {'content-type': query ? 'text/html' : 'text/plain'}});
                    response.once('end', () => { completed++; });
                    callback(response);
                    active--;
                }, 20);
            },
            destroy() { destroyed++; },
        });
        return client;
    };
    const transport = (url: string | URL, options = {}) => requestPublicText(url, {...options, request, resolvePublicTarget});
    const target = await hostFixture(t, {
        searchWeb: (params, deps) => searchWeb(params, {
            signal: deps.signal, loadConfig: () => ({browser: 'disabled', searxngUrl: null}),
            searchDirect: (input, signal) => searchDuckDuckGoDirect(input, {signal, requestPublicText: transport}),
        }),
        fetchContent: (params, deps) => fetchContent(params, {...deps, requestPublicText: transport}),
    });
    const result = await target.script(`
        const [a, b, c] = await Promise.all([
            tools.web_search({query:"alpha"}), tools.web_search({query:"beta"}), tools.fetch_content({url:"https://example.com/", mode:"raw"})
        ]);
        if(a.results[0].title !== "alpha" || b.results[0].title !== "beta" || c.text !== "Fetch fixture") throw Error("cross-call corruption");
        return [a.resultCount, b.resultCount, c.status];
    `);
    assert.equal(result.isError, false, resultText(result));
    assert.equal(maximum, 3);
    assert.equal(active, 0);
    assert.equal(completed, 3);
    assert.equal(destroyed, 0); // successful responses ended normally
});
