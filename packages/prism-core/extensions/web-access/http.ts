// $KYAULabs: http.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {Readable} from 'node:stream';
import {TextDecoder} from 'node:util';
import {
    brotliDecompressSync,
    gunzipSync,
    inflateSync,
} from 'node:zlib';
import {WebAccessError} from './errors.ts';
import {
    parsePublicUrl,
    resolvePublicTarget as defaultResolvePublicTarget,
    validateLoopbackUrl as defaultValidateLoopbackUrl,
    type LookupAddress,
    type LookupOptions,
    type NetworkDependencies,
    type PinnedTarget,
} from './network.ts';

const DEFAULT_BODY_LIMIT = 5 * 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT = 10_000;
const DEFAULT_TOTAL_TIMEOUT = 30_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export interface TextResponse {
    finalUrl: string;
    status: number;
    contentType: string;
    body: string;
}

export interface PinnedRequestOptions {
    protocol: string;
    hostname: string;
    port?: number;
    path: string;
    method: 'GET';
    servername?: string;
    family: 4 | 6;
    headers: Record<string, string>;
    lookup: (
        hostname: string,
        options: {all?: boolean},
        callback: (
            error: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number,
        ) => void,
    ) => void;
}

export interface RequestClient {
    once(event: 'error' | 'socket', listener: (...args: unknown[]) => void): this;
    destroy(error?: Error): void;
    end(): void;
}

export type RequestFunction = (
    options: PinnedRequestOptions,
    callback: (response: Readable & {
        statusCode?: number;
        headers: Record<string, string | string[] | undefined>;
        resume(): Readable;
    }) => void,
) => RequestClient;

export interface RequestTextOptions extends NetworkDependencies {
    request?: RequestFunction;
    resolvePublicTarget?: (url: URL, deps: NetworkDependencies) => Promise<PinnedTarget>;
    validateLoopbackUrl?: (url: string, deps: NetworkDependencies) => Promise<PinnedTarget>;
    maxCompressedBytes?: number;
    maxDecodedBytes?: number;
    connectTimeoutMs?: number;
    totalTimeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}

interface RawResponse {
    finalUrl: string;
    status: number;
    contentType: string;
    body?: string;
    redirect?: string;
}

function positiveBound(value: number | undefined, fallback: number): number {
    return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
): string | undefined {
    const value = headers[name];
    return typeof value === 'string' ? value : undefined;
}

function isTextual(contentType: string): boolean {
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    return mediaType.startsWith('text/') ||
        mediaType === 'application/json' ||
        mediaType === 'application/xml' ||
        mediaType === 'application/xhtml+xml' ||
        /^application\/[a-z0-9!#$&^_.+-]+\+(json|xml)$/.test(mediaType);
}

function decodeBody(
    compressed: Buffer,
    encoding: string,
    maxDecodedBytes: number,
): Buffer {
    try {
        let decoded: Buffer;
        if (encoding === '' || encoding === 'identity') decoded = compressed;
        else if (encoding === 'gzip') {
            decoded = gunzipSync(compressed, {maxOutputLength: maxDecodedBytes});
        } else if (encoding === 'deflate') {
            decoded = inflateSync(compressed, {maxOutputLength: maxDecodedBytes});
        } else if (encoding === 'br') {
            decoded = brotliDecompressSync(compressed, {maxOutputLength: maxDecodedBytes});
        } else {
            throw new WebAccessError('WEB_ACCESS_ENCODING_UNSUPPORTED', 'unsupported content encoding');
        }
        if (decoded.length > maxDecodedBytes) {
            throw new WebAccessError('WEB_ACCESS_BODY_TOO_LARGE', 'web response exceeds limit');
        }
        return decoded;
    } catch (error) {
        if (error instanceof WebAccessError) throw error;
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
            throw new WebAccessError('WEB_ACCESS_BODY_TOO_LARGE', 'web response exceeds limit');
        }
        throw new WebAccessError('WEB_ACCESS_DECODE_FAILED', 'web response decoding failed', true);
    }
}

function decodeUtf8(body: Buffer): string {
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(body);
    } catch {
        throw new WebAccessError('WEB_ACCESS_TEXT_INVALID', 'web response text is invalid', true);
    }
}

function nativeRequest(target: PinnedTarget): RequestFunction {
    const request = target.url.protocol === 'https:' ? https.request : http.request;
    return request as unknown as RequestFunction;
}

function pinnedOptions(target: PinnedTarget): PinnedRequestOptions {
    const hostname = target.url.hostname.startsWith('[') && target.url.hostname.endsWith(']')
        ? target.url.hostname.slice(1, -1)
        : target.url.hostname;
    const options: PinnedRequestOptions = {
        protocol: target.url.protocol,
        hostname,
        port: target.url.port === '' ? undefined : Number(target.url.port),
        path: `${target.url.pathname}${target.url.search}`,
        method: 'GET',
        family: target.family,
        headers: {
            accept: 'text/*, application/json, application/xml, application/xhtml+xml',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': 'Prism-Web-Access/1',
        },
        lookup: (_hostname, lookupOptions, callback) => {
            if (lookupOptions.all) {
                callback(null, [{address: target.address, family: target.family}]);
                return;
            }
            callback(null, target.address, target.family);
        },
    };
    if (target.url.protocol === 'https:' && net.isIP(hostname) === 0) options.servername = hostname;
    return options;
}

function performRequest(target: PinnedTarget, options: RequestTextOptions): Promise<RawResponse> {
    const maxCompressedBytes = positiveBound(options.maxCompressedBytes, DEFAULT_BODY_LIMIT);
    const maxDecodedBytes = positiveBound(options.maxDecodedBytes, DEFAULT_BODY_LIMIT);
    const connectTimeoutMs = positiveBound(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT);
    const totalTimeoutMs = positiveBound(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT);
    const requestFunction = options.request ?? nativeRequest(target);

    return new Promise((resolve, reject) => {
        let settled = false;
        let request: RequestClient | undefined;
        let response: (Readable & {destroy(error?: Error): void}) | undefined;
        let connectTimer: NodeJS.Timeout;
        let totalTimer: NodeJS.Timeout;

        const cleanup = () => {
            clearTimeout(connectTimer);
            clearTimeout(totalTimer);
            options.signal?.removeEventListener('abort', cancel);
        };
        const fail = (error: WebAccessError) => {
            if (settled) return;
            settled = true;
            cleanup();
            response?.destroy();
            request?.destroy();
            reject(error);
        };
        const succeed = (result: RawResponse) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        const cancel = () => fail(new WebAccessError('WEB_ACCESS_CANCELLED', 'web request cancelled'));

        if (options.signal?.aborted) {
            cancel();
            return;
        }
        connectTimer = setTimeout(() => {
            fail(new WebAccessError('WEB_ACCESS_TIMEOUT', 'web request timed out', true));
        }, connectTimeoutMs);
        totalTimer = setTimeout(() => {
            fail(new WebAccessError('WEB_ACCESS_TIMEOUT', 'web request timed out', true));
        }, totalTimeoutMs);
        options.signal?.addEventListener('abort', cancel, {once: true});

        try {
            request = requestFunction(pinnedOptions(target), (incoming) => {
                clearTimeout(connectTimer);
                response = incoming;
                const status = incoming.statusCode;
                if (!Number.isInteger(status)) {
                    incoming.resume();
                    fail(new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'web response is invalid', true));
                    return;
                }
                if (REDIRECT_STATUS.has(status as number)) {
                    const location = headerValue(incoming.headers, 'location');
                    incoming.resume();
                    if (!location) {
                        fail(new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'web response is invalid', true));
                        return;
                    }
                    succeed({
                        finalUrl: target.url.href,
                        status: status as number,
                        contentType: '',
                        redirect: location,
                    });
                    return;
                }
                const contentType = headerValue(incoming.headers, 'content-type') ?? '';
                if (!isTextual(contentType)) {
                    incoming.resume();
                    fail(new WebAccessError('WEB_ACCESS_MEDIA_UNSUPPORTED', 'unsupported web response media type'));
                    return;
                }
                const declaredLength = Number(headerValue(incoming.headers, 'content-length'));
                if (Number.isFinite(declaredLength) && declaredLength > maxCompressedBytes) {
                    incoming.resume();
                    fail(new WebAccessError('WEB_ACCESS_BODY_TOO_LARGE', 'web response exceeds limit'));
                    return;
                }
                const chunks: Buffer[] = [];
                let length = 0;
                incoming.on('data', (chunk: Buffer | string) => {
                    if (settled) return;
                    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    length += data.length;
                    if (length > maxCompressedBytes) {
                        fail(new WebAccessError('WEB_ACCESS_BODY_TOO_LARGE', 'web response exceeds limit'));
                        return;
                    }
                    chunks.push(data);
                });
                incoming.once('error', () => {
                    fail(new WebAccessError('WEB_ACCESS_NETWORK_FAILED', 'web response failed', true));
                });
                incoming.once('aborted', () => {
                    fail(new WebAccessError('WEB_ACCESS_NETWORK_FAILED', 'web response failed', true));
                });
                incoming.once('end', () => {
                    if (settled) return;
                    try {
                        const encoding = (headerValue(incoming.headers, 'content-encoding') ?? '')
                            .trim().toLowerCase();
                        const decoded = decodeBody(Buffer.concat(chunks, length), encoding, maxDecodedBytes);
                        succeed({
                            finalUrl: target.url.href,
                            status: status as number,
                            contentType,
                            body: decodeUtf8(decoded),
                        });
                    } catch (error) {
                        fail(error instanceof WebAccessError
                            ? error
                            : new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'web response is invalid', true));
                    }
                });
            });
            request.once('error', () => {
                fail(new WebAccessError('WEB_ACCESS_NETWORK_FAILED', 'web request failed', true));
            });
            request.once('socket', (value) => {
                const socket = value as {
                    connecting?: boolean;
                    encrypted?: boolean;
                    secureConnecting?: boolean;
                    once?: (event: string, listener: () => void) => void;
                };
                const connected = target.url.protocol === 'https:'
                    ? socket.encrypted === true && socket.connecting === false &&
                        socket.secureConnecting !== true
                    : socket.connecting === false;
                if (connected) clearTimeout(connectTimer);
                else socket.once?.(
                    target.url.protocol === 'https:' ? 'secureConnect' : 'connect',
                    () => clearTimeout(connectTimer),
                );
            });
            request.end();
        } catch {
            fail(new WebAccessError('WEB_ACCESS_NETWORK_FAILED', 'web request failed', true));
        }
    });
}

async function publicRequest(
    url: URL,
    options: RequestTextOptions,
    redirectCount: number,
): Promise<TextResponse> {
    const normalized = parsePublicUrl(url.href);
    const resolver = options.resolvePublicTarget ?? defaultResolvePublicTarget;
    const target = await resolver(normalized, {lookup: options.lookup, signal: options.signal});
    const response = await performRequest(target, options);
    if (response.redirect !== undefined) {
        if (redirectCount >= MAX_REDIRECTS) {
            throw new WebAccessError('WEB_ACCESS_REDIRECT_LIMIT', 'web redirect limit exceeded');
        }
        let redirected: URL;
        try { redirected = new URL(response.redirect, target.url); } catch {
            throw new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'web response is invalid', true);
        }
        return publicRequest(redirected, options, redirectCount + 1);
    }
    return response as TextResponse;
}

function boundedOperation<T>(
    options: RequestTextOptions,
    operation: (effective: RequestTextOptions) => Promise<T>,
): Promise<T> {
    const totalTimeoutMs = positiveBound(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT);
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const cleanup = () => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', cancel);
        };
        const finish = (action: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            action();
        };
        const cancel = () => {
            controller.abort();
            finish(() => reject(new WebAccessError('WEB_ACCESS_CANCELLED', 'web request cancelled')));
        };
        if (options.signal?.aborted) {
            cancel();
            return;
        }
        timer = setTimeout(() => {
            controller.abort();
            finish(() => reject(new WebAccessError('WEB_ACCESS_TIMEOUT', 'web request timed out', true)));
        }, totalTimeoutMs);
        options.signal?.addEventListener('abort', cancel, {once: true});
        operation({...options, signal: controller.signal, totalTimeoutMs}).then(
            (value) => finish(() => resolve(value)),
            (error: unknown) => finish(() => reject(error)),
        );
    });
}

export function requestPublicText(
    input: string | URL,
    options: RequestTextOptions = {},
): Promise<TextResponse> {
    return boundedOperation(options, async (effective) => {
        const url = typeof input === 'string' ? parsePublicUrl(input) : parsePublicUrl(input.href);
        return publicRequest(url, effective, 0);
    });
}

export function requestLoopbackJson(
    input: string | URL,
    options: RequestTextOptions = {},
): Promise<unknown> {
    return boundedOperation(options, async (effective) => {
        const value = typeof input === 'string' ? input : input.href;
        const validator = effective.validateLoopbackUrl ?? defaultValidateLoopbackUrl;
        const target = await validator(value, {lookup: effective.lookup, signal: effective.signal});
        const response = await performRequest(target, effective);
        if (response.redirect !== undefined) {
            throw new WebAccessError('WEB_ACCESS_REDIRECT_BLOCKED', 'loopback redirects are not allowed');
        }
        if (response.status < 200 || response.status >= 300 ||
            !response.contentType.toLowerCase().startsWith('application/json')) {
            throw new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'loopback response is invalid', true);
        }
        try {
            return JSON.parse(response.body ?? '');
        } catch {
            throw new WebAccessError('WEB_ACCESS_RESPONSE_INVALID', 'loopback response is invalid', true);
        }
    });
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
